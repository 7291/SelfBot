/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findByPropsLazy } from "@webpack";
import { ChannelStore, PermissionsBits, PermissionStore, showToast, Toasts, UserStore, VoiceStateStore } from "@webpack/common";

import { accountManager } from "./accountManagerUtils";
import { discordApi } from "./discordApiUtils";
import { followUser } from "./followUser";
import { settingsManager } from "./settingsManager";
import { taskManager } from "./taskManager";

// Channel actions for joining voice channels
const ChannelActions = findByPropsLazy("selectVoiceChannel");

// State for follow pull integration
let followPullInterval: ReturnType<typeof setInterval> | null = null;
let lastPullAttempt = 0;
let currentTaskId: string | null = null;
let isMonitorPaused = false;
const PULL_COOLDOWN = 3000; // 3 seconds between pull attempts

// Get the followed user ID from followUser module
export function getTrackedFollowUserId(): string | null {
    const followedId = followUser.getFollowedUserId();
    return followedId || null;
}

// Set who to track - uses followUser module
export function setTrackedFollowUser(userId: string | null) {
    if (userId) {
        followUser.setFollowedUserId(userId);
        isMonitorPaused = false;

        const user = UserStore.getUser(userId);

        // Register/update task
        if (!currentTaskId) {
            currentTaskId = `follow-pull-${Date.now()}`;
            taskManager.registerTask({
                id: currentTaskId,
                type: "FOLLOW_PULL",
                description: `Following ${user?.username || userId}`,
                status: "RUNNING",
                progress: "Monitoring...",
                timestamp: Date.now(),
                metadata: { userId },
                actions: {
                    pause: () => {
                        isMonitorPaused = true;
                        if (currentTaskId) taskManager.updateTask(currentTaskId, { status: "PAUSED" });
                    },
                    resume: () => {
                        isMonitorPaused = false;
                        if (currentTaskId) taskManager.updateTask(currentTaskId, { status: "RUNNING" });
                    },
                    stop: () => stopFollowing()
                }
            });
        } else {
            taskManager.updateTask(currentTaskId, {
                description: `Following ${user?.username || userId}`,
                status: "RUNNING",
                progress: "Monitoring...",
                metadata: { userId }
            });
            isMonitorPaused = false;
        }

        // Start monitor if not running
        startFollowPullMonitor();
    } else {
        followUser.stopFollowing();
        // Remove task
        if (currentTaskId) {
            taskManager.removeTask(currentTaskId);
            currentTaskId = null;
        }
        isMonitorPaused = false;
    }
}

// Stop following
export function stopFollowing() {
    followUser.stopFollowing();
    if (currentTaskId) {
        taskManager.removeTask(currentTaskId);
        currentTaskId = null;
    }
    isMonitorPaused = false;
    showToast("Stopped following", Toasts.Type.MESSAGE);
}

// Get channel ID where a user is
export function getUserVoiceChannelId(userId: string): string | null {
    return followUser.getFollowUserChannelId(userId);
}

// Check if channel is full
export function isChannelFull(channelId: string): boolean {
    try {
        const channel = ChannelStore.getChannel(channelId);
        if (!channel || channel.userLimit === 0) return false;

        const voiceStates = VoiceStateStore.getVoiceStatesForChannel(channelId);
        const memberCount = voiceStates ? Object.keys(voiceStates).length : 0;

        return memberCount >= channel.userLimit;
    } catch (e) {
        return false;
    }
}

// Check if current user is in a voice channel in the specified guild
export function isInGuildVoice(guildId: string): boolean {
    try {
        const currentUserId = UserStore.getCurrentUser()?.id;
        if (!currentUserId) return false;

        const myVoiceState = VoiceStateStore.getVoiceStateForUser(currentUserId);
        if (!myVoiceState?.channelId) return false;

        const myChannel = ChannelStore.getChannel(myVoiceState.channelId);
        return myChannel?.guild_id === guildId;
    } catch (e) {
        return false;
    }
}

// Check if current user is in the same guild as target channel
export function isInSameGuild(channelId: string): boolean {
    try {
        const targetChannel = ChannelStore.getChannel(channelId);
        if (!targetChannel?.guild_id) return false;

        return isInGuildVoice(targetChannel.guild_id);
    } catch (e) {
        return false;
    }
}

// Find an accessible voice channel in a guild (preferably empty)
export function findAccessibleVoiceChannel(guildId: string): string | null {
    try {
        const voiceChannels: any[] = [];

        // Get all voice channels from the guild
        Object.values(ChannelStore.getMutableGuildChannelsForGuild(guildId) || {}).forEach((channel: any) => {
            // Type 2 = Voice, Type 13 = Stage
            if (channel.type === 2 || channel.type === 13) {
                voiceChannels.push(channel);
            }
        });

        // Sort by preference: empty channels first, then by member count
        const sortedChannels = voiceChannels
            .filter(channel => {
                // Check if we can connect
                return PermissionStore.can(PermissionsBits.CONNECT, channel);
            })
            .map(channel => {
                const voiceStates = VoiceStateStore.getVoiceStatesForChannel(channel.id);
                const memberCount = voiceStates ? Object.keys(voiceStates).length : 0;
                const isFull = channel.userLimit > 0 && memberCount >= channel.userLimit;
                return { channel, memberCount, isFull };
            })
            .filter(({ isFull }) => !isFull)
            .sort((a, b) => a.memberCount - b.memberCount);

        if (sortedChannels.length > 0) {
            return sortedChannels[0].channel.id;
        }

        return null;
    } catch (e) {
        console.error("[FollowPull] Error finding accessible channel:", e);
        return null;
    }
}

// Join a voice channel (using client, not alt)
export function joinVoiceChannel(channelId: string): boolean {
    try {
        if (ChannelActions?.selectVoiceChannel) {
            ChannelActions.selectVoiceChannel(channelId);
            return true;
        }
        return false;
    } catch (e) {
        console.error("[FollowPull] Error joining channel:", e);
        return false;
    }
}

// Pull current user to a channel using alt account
// If user is not in a call, join an accessible channel first
export async function pullMeToChannel(targetChannelId: string): Promise<boolean> {
    const currentUserId = UserStore.getCurrentUser()?.id;
    if (!currentUserId) {
        return false;
    }

    const activeAccount = accountManager.getActiveAccount();
    if (!activeAccount?.token) {
        showToast("No alt account configured", Toasts.Type.FAILURE);
        return false;
    }

    const targetChannel = ChannelStore.getChannel(targetChannelId);
    if (!targetChannel) {
        return false;
    }

    const guildId = targetChannel.guild_id;
    if (!guildId) {
        return false;
    }

    // Check if we're in a voice channel in this guild
    const myVoiceState = VoiceStateStore.getVoiceStateForUser(currentUserId);

    if (!myVoiceState?.channelId || !isInGuildVoice(guildId)) {
        // Not in a call in this guild - need to join one first
        showToast("Joining an accessible channel first...", Toasts.Type.MESSAGE);

        const accessibleChannelId = findAccessibleVoiceChannel(guildId);
        if (!accessibleChannelId) {
            showToast("No accessible voice channel found", Toasts.Type.FAILURE);
            return false;
        }

        // Join the accessible channel
        const joined = joinVoiceChannel(accessibleChannelId);
        if (!joined) {
            showToast("Failed to join voice channel", Toasts.Type.FAILURE);
            return false;
        }

        // Wait a bit for the connection to establish
        await new Promise(resolve => setTimeout(resolve, 1500));
    }

    try {
        const success = await discordApi.setChannel(guildId, currentUserId, targetChannelId);
        return success;
    } catch (e) {
        console.error("[FollowPull] Pull error:", e);
        return false;
    }
}

export function isFollowPullEnabled(): boolean {
    return settingsManager.getToggle("followPullAssist");
}

// Handle voice state updates to detect when followed user moves to a full channel
export function handleVoiceStateForFollowPull(voiceStates: Array<{ userId: string; channelId?: string; oldChannelId?: string; }>) {
    if (!isFollowPullEnabled()) return;

    const trackedFollowUserId = getTrackedFollowUserId();
    if (!trackedFollowUserId) return;

    const activeAccount = accountManager.getActiveAccount();
    if (!activeAccount?.token) return;

    const currentUserId = UserStore.getCurrentUser()?.id;
    if (!currentUserId) return;

    // Check if the followed user moved to a new channel
    for (const { userId, channelId, oldChannelId } of voiceStates) {
        if (userId !== trackedFollowUserId) continue;
        if (!channelId || channelId === oldChannelId) continue;

        // Followed user moved to a new channel
        const myVoiceState = VoiceStateStore.getVoiceStateForUser(currentUserId);

        // Already in the same channel
        if (myVoiceState?.channelId === channelId) continue;

        // Get target channel info
        const targetChannel = ChannelStore.getChannel(channelId);
        if (!targetChannel?.guild_id) continue;

        // Check if channel is full
        if (!isChannelFull(channelId)) continue;

        // Cooldown check
        const now = Date.now();
        if (now - lastPullAttempt < PULL_COOLDOWN) continue;
        lastPullAttempt = now;

        // Update task
        if (currentTaskId) {
            taskManager.updateTask(currentTaskId, {
                progress: "Channel full, pulling..."
            });
        }

        // Try to pull (will auto-join if not in a call)
        console.log("[FollowPull] Channel is full, attempting to pull...");
        pullMeToChannel(channelId).then(success => {
            if (success) {
                showToast("Pulled to full channel!", Toasts.Type.SUCCESS);
                if (currentTaskId) {
                    taskManager.updateTask(currentTaskId, {
                        progress: "Pulled successfully"
                    });
                }
            } else {
                if (currentTaskId) {
                    taskManager.updateTask(currentTaskId, {
                        progress: "Pull failed (alt lacks permission?)"
                    });
                }
            }
        });
    }
}

// Start monitoring for follow pull (background interval check)
export function startFollowPullMonitor() {
    if (followPullInterval) return;

    console.log("[FollowPull] Starting monitor...");

    followPullInterval = setInterval(async () => {
        if (!isFollowPullEnabled()) return;

        // If paused, just maintain paused status and return
        if (isMonitorPaused) {
            if (currentTaskId) {
                // Ensure status is definitely PAUSED in UI
                // We don't need to spam updates, usually the action sets it.
            }
            return;
        }

        const trackedFollowUserId = getTrackedFollowUserId();
        if (!trackedFollowUserId) {
            // No one being followed - remove task if exists
            if (currentTaskId) {
                taskManager.removeTask(currentTaskId);
                currentTaskId = null;
            }
            return;
        }

        const user = UserStore.getUser(trackedFollowUserId);
        const targetChannelId = getUserVoiceChannelId(trackedFollowUserId);
        const currentUserId = UserStore.getCurrentUser()?.id;

        if (!currentUserId) return;

        const myVoiceState = VoiceStateStore.getVoiceStateForUser(currentUserId);

        // Create task if not exists (resilience)
        if (!currentTaskId) {
            currentTaskId = `follow-pull-${Date.now()}`;
            taskManager.registerTask({
                id: currentTaskId,
                type: "FOLLOW_PULL",
                description: `Following ${user?.username || trackedFollowUserId}`,
                status: "RUNNING",
                progress: "Monitoring...",
                timestamp: Date.now(),
                metadata: { userId: trackedFollowUserId },
                actions: {
                    pause: () => {
                        isMonitorPaused = true;
                        if (currentTaskId) taskManager.updateTask(currentTaskId, { status: "PAUSED" });
                    },
                    resume: () => {
                        isMonitorPaused = false;
                        if (currentTaskId) taskManager.updateTask(currentTaskId, { status: "RUNNING" });
                    },
                    stop: () => stopFollowing()
                }
            });
        }

        // Update progress based on state
        // Use clean strings without emojis for cleaner UI (UI will handle icons if needed)
        if (!targetChannelId) {
            taskManager.updateTask(currentTaskId, {
                description: `Following ${user?.username || trackedFollowUserId}`,
                progress: "Target not in a call"
            });
        } else {
            const channelFull = isChannelFull(targetChannelId);

            if (myVoiceState?.channelId === targetChannelId) {
                taskManager.updateTask(currentTaskId, {
                    description: `Following ${user?.username || trackedFollowUserId}`,
                    progress: "Already in same channel"
                });
            } else if (!channelFull) {
                taskManager.updateTask(currentTaskId, {
                    description: `Following ${user?.username || trackedFollowUserId}`,
                    progress: "Channel not full (join manually)"
                });
            } else {
                // Channel is full - attempt pull
                const now = Date.now();
                if (now - lastPullAttempt >= PULL_COOLDOWN) {
                    lastPullAttempt = now;

                    taskManager.updateTask(currentTaskId, {
                        description: `Following ${user?.username || trackedFollowUserId}`,
                        progress: "Channel full, pulling..."
                    });

                    const success = await pullMeToChannel(targetChannelId);
                    if (success) {
                        showToast("Pulled to full channel!", Toasts.Type.SUCCESS);
                        if (currentTaskId) {
                            taskManager.updateTask(currentTaskId, {
                                progress: "Pulled successfully"
                            });
                        }
                    }
                }
            }
        }
    }, 1000);
}

export function stopFollowPullMonitor() {
    if (followPullInterval) {
        clearInterval(followPullInterval);
        followPullInterval = null;
    }
    if (currentTaskId) {
        taskManager.removeTask(currentTaskId);
        currentTaskId = null;
    }
    isMonitorPaused = false;
    console.log("[FollowPull] Monitor stopped");
}

export function isFollowPullMonitorActive(): boolean {
    return followPullInterval !== null;
}

// Get follow pull status for UI
export function getFollowPullStatus(): { active: boolean; targetUserId: string | null; targetUsername: string | null } {
    const trackedFollowUserId = getTrackedFollowUserId();
    if (!trackedFollowUserId) {
        return { active: false, targetUserId: null, targetUsername: null };
    }

    const user = UserStore.getUser(trackedFollowUserId);
    return {
        active: followPullInterval !== null,
        targetUserId: trackedFollowUserId,
        targetUsername: user?.username ?? null
    };
}

// Export integration object
export const followPullIntegration = {
    getTrackedFollowUserId,
    setTrackedFollowUser,
    stopFollowing,
    getUserVoiceChannelId,
    isChannelFull,
    isInSameGuild,
    isInGuildVoice,
    findAccessibleVoiceChannel,
    joinVoiceChannel,
    pullMeToChannel,
    isFollowPullEnabled,
    handleVoiceStateForFollowPull,
    startFollowPullMonitor,
    stopFollowPullMonitor,
    isFollowPullMonitorActive,
    getFollowPullStatus
};
