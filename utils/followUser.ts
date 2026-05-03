/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findByPropsLazy, findStoreLazy } from "@webpack";
import { ChannelStore, PermissionsBits, PermissionStore, Toasts, UserStore } from "@webpack/common";

import { settingsManager } from "./settingsManager";

// ═══════════════════════════════════════════════════════════════════════════
// FOLLOW USER - Integrated from vc-followUser
// Uses settingsManager for persistence (not definePluginSettings)
// ═══════════════════════════════════════════════════════════════════════════

interface VoiceState {
    userId: string;
    channelId?: string;
    oldChannelId?: string;
    deaf: boolean;
    mute: boolean;
    selfDeaf: boolean;
    selfMute: boolean;
    selfStream: boolean;
    selfVideo: boolean;
    sessionId: string;
    suppress: boolean;
    requestToSpeakTimestamp: string | null;
}

interface VoiceStateStore {
    getAllVoiceStates(): VoiceStateEntry;
    getVoiceStatesForChannel(channelId: string): VoiceStateMember;
}

interface VoiceStateEntry {
    [guildIdOrMe: string]: VoiceStateMember;
}

interface VoiceStateMember {
    [userId: string]: VoiceState;
}

const ChannelActions: {
    disconnect: () => void;
    selectVoiceChannel: (channelId: string | null) => void;
} = findByPropsLazy("disconnect", "selectVoiceChannel");

const VoiceStateStoreLazy: VoiceStateStore = findStoreLazy("VoiceStateStore");
const SelectedChannelStore = findStoreLazy("SelectedChannelStore");
const CONNECT = 1n << 20n;

// Settings keys in settingsManager
const FOLLOW_USER_SETTINGS_KEY = "followUserSettings";

// Default settings
const DEFAULT_FOLLOW_SETTINGS = {
    executeOnFollow: true,
    onlyManualTrigger: false,
    followLeave: false,
    autoMoveBack: false,
    channelFull: true,
    followUserId: ""
};

// Get all follow user settings
function getFollowSettings(): typeof DEFAULT_FOLLOW_SETTINGS {
    try {
        const saved = settingsManager.getSetting(FOLLOW_USER_SETTINGS_KEY);
        if (saved && typeof saved === "object") {
            return { ...DEFAULT_FOLLOW_SETTINGS, ...saved };
        }
    } catch (e) {
        // Ignore errors during early initialization
    }
    return { ...DEFAULT_FOLLOW_SETTINGS };
}

// Save all follow user settings
function saveFollowSettings(settings: typeof DEFAULT_FOLLOW_SETTINGS) {
    try {
        settingsManager.setSetting(FOLLOW_USER_SETTINGS_KEY, settings);
    } catch (e) {
        console.error("[FollowUser] Error saving settings:", e);
    }
}

// Get channel ID where a user is
export function getFollowUserChannelId(userId: string): string | null {
    if (!userId) return null;
    try {
        const states = VoiceStateStoreLazy.getAllVoiceStates();
        for (const users of Object.values(states)) {
            if (users[userId]) {
                return users[userId].channelId ?? null;
            }
        }
    } catch (e) { }
    return null;
}

// Get who is being followed
export function getFollowedUserId(): string {
    return getFollowSettings().followUserId || "";
}

// Set who to follow
export function setFollowedUserId(userId: string) {
    const settings = getFollowSettings();
    settings.followUserId = userId;
    saveFollowSettings(settings);
}

// Stop following
export function stopFollowing() {
    const settings = getFollowSettings();
    settings.followUserId = "";
    saveFollowSettings(settings);
}

// Trigger follow - move to the followed user's channel
export function triggerFollow(userChannelId: string | null = null) {
    const settings = getFollowSettings();
    if (!settings.followUserId) return;

    const targetChannelId = userChannelId ?? getFollowUserChannelId(settings.followUserId);
    const myChanId = SelectedChannelStore?.getVoiceChannelId?.() || null;

    if (targetChannelId) {
        // join when not already in the same channel
        if (targetChannelId !== myChanId) {
            const channel = ChannelStore.getChannel(targetChannelId);
            if (!channel) return;

            const voiceStates = VoiceStateStoreLazy.getVoiceStatesForChannel(targetChannelId);
            const memberCount = voiceStates ? Object.keys(voiceStates).length : null;

            if (channel.type === 1 || PermissionStore.can(CONNECT, channel)) {
                if (channel.userLimit !== 0 && memberCount !== null && memberCount >= channel.userLimit && !PermissionStore.can(PermissionsBits.MOVE_MEMBERS, channel)) {
                    Toasts.show({
                        message: "Channel is full",
                        id: Toasts.genId(),
                        type: Toasts.Type.FAILURE
                    });
                    return;
                }
                ChannelActions.selectVoiceChannel(targetChannelId);
                Toasts.show({
                    message: "Followed user into voice channel",
                    id: Toasts.genId(),
                    type: Toasts.Type.SUCCESS
                });
            } else {
                Toasts.show({
                    message: "Insufficient permissions to enter the voice channel",
                    id: Toasts.genId(),
                    type: Toasts.Type.FAILURE
                });
            }
        }
    } else if (myChanId) {
        // if not in a voice channel and the setting is on disconnect
        if (settings.followLeave) {
            ChannelActions.disconnect();
            Toasts.show({
                message: "Followed user left, disconnected",
                id: Toasts.genId(),
                type: Toasts.Type.SUCCESS
            });
        }
    }
}

// Toggle follow for a user
export function toggleFollow(userId: string) {
    const settings = getFollowSettings();

    if (settings.followUserId === userId) {
        settings.followUserId = "";
        saveFollowSettings(settings);
        Toasts.show({
            message: "Stopped following user",
            id: Toasts.genId(),
            type: Toasts.Type.MESSAGE
        });
    } else {
        settings.followUserId = userId;
        saveFollowSettings(settings);
        Toasts.show({
            message: "Now following user",
            id: Toasts.genId(),
            type: Toasts.Type.SUCCESS
        });
        if (settings.executeOnFollow) {
            triggerFollow();
        }
    }
}

// Handle voice state updates for follow user
export function handleFollowUserVoiceStateUpdates(voiceStates: VoiceState[]) {
    const currentUserId = UserStore.getCurrentUser()?.id;
    if (!currentUserId) return;

    const settings = getFollowSettings();
    if (!settings.followUserId) return;

    for (const { userId, channelId, oldChannelId } of voiceStates) {
        if (channelId !== oldChannelId) {
            const isMe = userId === currentUserId;

            if (settings.onlyManualTrigger) {
                continue;
            }

            // move back if the setting is on and you were moved
            if (settings.autoMoveBack && isMe && channelId && oldChannelId) {
                triggerFollow();
                continue;
            }

            // if you're not in the channel of the followed user and it is no longer full, join
            if (settings.channelFull && !isMe && !channelId && oldChannelId) {
                const myCurrentChannel = SelectedChannelStore?.getVoiceChannelId?.() || null;
                if (oldChannelId !== myCurrentChannel) {
                    const channel = ChannelStore.getChannel(oldChannelId);
                    if (channel) {
                        const channelVoiceStates = VoiceStateStoreLazy.getVoiceStatesForChannel(oldChannelId);
                        const memberCount = channelVoiceStates ? Object.keys(channelVoiceStates).length : null;
                        if (channel.userLimit !== 0 && memberCount !== null && memberCount === (channel.userLimit - 1) && !PermissionStore.can(PermissionsBits.MOVE_MEMBERS, channel)) {
                            const users = Object.values(channelVoiceStates).map(x => x.userId);
                            if (users.includes(settings.followUserId)) {
                                triggerFollow(oldChannelId);
                                continue;
                            }
                        }
                    }
                }
            }

            const isFollowed = settings.followUserId === userId;
            if (!isFollowed) {
                continue;
            }

            if (channelId) {
                // move or join new channel -> also join
                triggerFollow(channelId);
            } else if (oldChannelId) {
                // leave -> disconnect
                triggerFollow(null);
            }
        }
    }
}

// Get/Set settings functions for UI
export function getFollowUserSetting(key: keyof typeof DEFAULT_FOLLOW_SETTINGS): boolean | string {
    const settings = getFollowSettings();
    return settings[key];
}

export function setFollowUserSetting(key: keyof typeof DEFAULT_FOLLOW_SETTINGS, value: boolean | string) {
    const settings = getFollowSettings();
    (settings as any)[key] = value;
    saveFollowSettings(settings);
}

// Export the follow user module
export const followUser = {
    getFollowUserChannelId,
    getFollowedUserId,
    setFollowedUserId,
    stopFollowing,
    triggerFollow,
    toggleFollow,
    handleFollowUserVoiceStateUpdates,
    getFollowUserSetting,
    setFollowUserSetting
};
