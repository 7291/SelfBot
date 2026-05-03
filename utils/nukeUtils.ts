/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChannelType } from "@vencord/discord-types/enums";
import { ChannelStore, GuildStore, RelationshipStore, RestAPI, UserStore } from "@webpack/common";

import { taskManager } from "./taskManager";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface NukeProgress {
    phase: "idle" | "messages" | "closingDms" | "servers" | "friends" | "complete" | "stopped";
    messages: { current: number; currentUser?: string; };
    dmsClosed: { current: number; currentDm?: string; };
    servers: { current: number; currentServer?: string; };
    friends: { current: number; currentFriend?: string; };
    error?: string;
}

export interface NukeOptions {
    deleteMessages: boolean;
    closeDms: boolean;
    leaveServers: boolean;
    removeFriends: boolean;
    messageDelay: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// DELAY HELPER
// ═══════════════════════════════════════════════════════════════════════════
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ═══════════════════════════════════════════════════════════════════════════
// GET OPEN DM CHANNELS
// ═══════════════════════════════════════════════════════════════════════════
function getDmChannels(): { channelId: string; userId: string; userName: string; }[] {
    const privateChannels = ChannelStore.getSortedPrivateChannels();
    const dmChannels: { channelId: string; userId: string; userName: string; }[] = [];

    for (const channel of privateChannels) {
        if (channel.type !== ChannelType.DM) continue;

        const recipientIds = channel.recipients as string[];
        if (!recipientIds || recipientIds.length === 0) continue;

        const recipientId = recipientIds[0];
        if (!recipientId) continue;

        const user = UserStore.getUser(recipientId);
        if (!user) continue;

        dmChannels.push({
            channelId: channel.id,
            userId: user.id,
            userName: (user as any).globalName || user.username
        });
    }

    return dmChannels;
}

// ═══════════════════════════════════════════════════════════════════════════
// DELETABLE MESSAGE TYPES
// Only these message types can be deleted by users
// Type 0 = Default message, Type 19 = Reply
// All other types are system messages (calls, pins, joins, etc.)
// ═══════════════════════════════════════════════════════════════════════════
const DELETABLE_MESSAGE_TYPES: readonly number[] = [0, 19];

// ═══════════════════════════════════════════════════════════════════════════
// DELETE ALL MESSAGES IN A DM (QUEUE STREAMING)
// ═══════════════════════════════════════════════════════════════════════════
async function deleteAllMessagesInDm(
    channelId: string,
    delayMs: number,
    onMessageDeleted: () => void,
    shouldStop: () => boolean
): Promise<void> {
    const currentUser = UserStore.getCurrentUser();
    if (!currentUser) return;

    let lastMessageId: string | undefined;
    let hasMore = true;
    const messagesToDelete: string[] = [];

    // Phase 1: Fetch all messages
    while (hasMore && !shouldStop()) {
        try {
            const query: any = { limit: 100 };
            if (lastMessageId) query.before = lastMessageId;

            const response = await RestAPI.get({
                url: `/channels/${channelId}/messages`,
                query
            });

            const messages = response.body as Array<{ id: string; author: { id: string; }; type: number; }>;
            if (!messages || messages.length === 0) {
                hasMore = false;
                break;
            }

            // Only include deletable message types
            const myMessages = messages.filter(m =>
                m.author.id === currentUser.id && DELETABLE_MESSAGE_TYPES.includes(m.type)
            );

            for (const msg of myMessages) {
                messagesToDelete.push(msg.id);
            }

            lastMessageId = messages[messages.length - 1].id;
            if (messages.length < 100) {
                hasMore = false;
            }

            await delay(50); // Small delay to prevent rate limiting during fetch
        } catch (error: any) {
            if (error.status === 429) {
                const retryAfter = error.body?.retry_after || 5;
                await delay(retryAfter * 1000 + 500);
            } else if (error.status === 403 || error.status === 404) {
                // Blocked or no access
                break;
            } else {
                console.error("[Nuke] Failed to fetch DM messages:", error);
                break;
            }
        }
    }

    if (shouldStop() || messagesToDelete.length === 0) return;

    // Reverse to get oldest first
    messagesToDelete.reverse();

    // Phase 2: Delete messages from oldest to newest
    for (const msgId of messagesToDelete) {
        if (shouldStop()) break;

        let deleted = false;
        let retryCount = 0;

        while (!deleted && retryCount < 10 && !shouldStop()) {
            try {
                await RestAPI.del({
                    url: `/channels/${channelId}/messages/${msgId}`
                });
                deleted = true;
                onMessageDeleted();
            } catch (error: any) {
                if (error.status === 429) {
                    const retryAfter = error.body?.retry_after || 5;
                    await delay(retryAfter * 1000 + 500);
                    retryCount++;
                } else if (error.status === 404 || error.status === 403) {
                    // Message already deleted or no permission
                    deleted = true;
                } else {
                    if (retryCount >= 9) deleted = true; // Give up
                    await delay(1500);
                    retryCount++;
                }
            }
        }

        await delay(delayMs);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// LEAVE SERVER
// ═══════════════════════════════════════════════════════════════════════════
async function leaveServer(guildId: string): Promise<boolean> {
    try {
        await RestAPI.del({
            url: `/users/@me/guilds/${guildId}`
        });
        return true;
    } catch (error: any) {
        if (error.status === 429) {
            const retryAfter = error.body?.retry_after || 5;
            await delay(retryAfter * 1000 + 500);
            try {
                await RestAPI.del({
                    url: `/users/@me/guilds/${guildId}`
                });
                return true;
            } catch {
                return false;
            }
        }
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// REMOVE FRIEND
// ═══════════════════════════════════════════════════════════════════════════
async function removeFriend(userId: string): Promise<boolean> {
    try {
        await RestAPI.del({
            url: `/users/@me/relationships/${userId}`
        });
        return true;
    } catch (error: any) {
        if (error.status === 429) {
            const retryAfter = error.body?.retry_after || 5;
            await delay(retryAfter * 1000 + 500);
            try {
                await RestAPI.del({
                    url: `/users/@me/relationships/${userId}`
                });
                return true;
            } catch {
                return false;
            }
        }
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// CLOSE DM
// ═══════════════════════════════════════════════════════════════════════════
async function closeDm(channelId: string): Promise<boolean> {
    try {
        await RestAPI.del({
            url: `/channels/${channelId}`
        });
        return true;
    } catch (error: any) {
        if (error.status === 429) {
            const retryAfter = error.body?.retry_after || 5;
            await delay(retryAfter * 1000 + 500);
            try {
                await RestAPI.del({
                    url: `/channels/${channelId}`
                });
                return true;
            } catch {
                return false;
            }
        }
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// NUKE CONTROLLER
// ═══════════════════════════════════════════════════════════════════════════
export class NukeController {
    private options: NukeOptions;
    private isStopped: boolean = false;
    private isPaused: boolean = false;
    private onProgress: (progress: NukeProgress) => void;
    private progress: NukeProgress;
    private taskId: string | null = null;

    constructor(
        options: NukeOptions,
        onProgress: (progress: NukeProgress) => void
    ) {
        this.options = options;
        this.onProgress = onProgress;
        this.progress = {
            phase: "idle",
            messages: { current: 0 },
            dmsClosed: { current: 0 },
            servers: { current: 0 },
            friends: { current: 0 }
        };
    }

    pause() {
        this.isPaused = true;
        if (this.taskId) taskManager.updateTask(this.taskId, { status: "PAUSED" });
    }

    resume() {
        this.isPaused = false;
        if (this.taskId) taskManager.updateTask(this.taskId, { status: "RUNNING" });
    }

    stop() {
        this.isStopped = true;
        if (this.taskId) {
            taskManager.updateTask(this.taskId, { status: "STOPPED" });
            setTimeout(() => {
                if (this.taskId) taskManager.removeTask(this.taskId);
            }, 3000);
        }
    }

    private updateProgress(updates: Partial<NukeProgress>) {
        this.progress = { ...this.progress, ...updates };
        this.onProgress(this.progress);

        if (this.taskId) {
            let statusText = "";
            switch (this.progress.phase) {
                case "messages":
                    statusText = `Deleting messages: ${this.progress.messages.current}`;
                    break;
                case "closingDms":
                    statusText = `Closing DMs: ${this.progress.dmsClosed.current}`;
                    break;
                case "servers":
                    statusText = `Leaving servers: ${this.progress.servers.current}`;
                    break;
                case "friends":
                    statusText = `Removing friends: ${this.progress.friends.current}`;
                    break;
                case "complete":
                    statusText = "Nuke completed!";
                    break;
                case "stopped":
                    statusText = "Nuke stopped.";
                    break;
                default:
                    statusText = "Running...";
            }
            taskManager.updateTask(this.taskId, { progress: statusText });
        }
    }

    async execute(): Promise<void> {
        this.taskId = taskManager.registerTask({
            id: `nuke-${Date.now()}`,
            type: "NUKE",
            description: "Nuking Account Data",
            status: "RUNNING",
            progress: "Starting...",
            timestamp: Date.now(),
            actions: {
                pause: () => this.pause(),
                resume: () => this.resume(),
                stop: () => this.stop()
            }
        });

        const checkPause = async () => {
            while (this.isPaused && !this.isStopped) {
                await delay(500);
            }
        };

        // Gather all DMs directly & fetch history
        if (this.options.deleteMessages || this.options.closeDms) {
            this.updateProgress({ phase: "messages" });

            // Start with currently open DMs
            const openChannels = getDmChannels();
            const channelsToProcess = [...openChannels];
            const processedUserIds = new Set<string>();
            for (const ch of openChannels) processedUserIds.add(ch.userId);

            // Fetch relations
            let relationshipIds: string[] = [];
            try {
                const rels = await RestAPI.get({ url: "/users/@me/relationships" }).then(r => r.body);
                if (Array.isArray(rels)) relationshipIds = rels.map((r: any) => r.id);
            } catch (e) {
                relationshipIds = RelationshipStore.getFriendIDs();
            }

            for (const userId of relationshipIds) {
                if (this.isStopped) break;
                if (processedUserIds.has(userId)) continue;

                try {
                    await delay(350);
                    const channelData = await RestAPI.post({
                        url: "/users/@me/channels",
                        body: { recipient_id: userId }
                    }).then(r => r.body).catch(() => null);

                    if (channelData && channelData.id) {
                        let userName = "Unknown User";
                        if (channelData.recipients && channelData.recipients[0]) {
                            userName = channelData.recipients[0].global_name || channelData.recipients[0].username;
                        } else {
                            const user = UserStore.getUser(userId);
                            if (user) userName = (user as any).globalName || user.username;
                        }

                        channelsToProcess.push({
                            channelId: channelData.id,
                            userId: userId,
                            userName: userName
                        });
                        processedUserIds.add(userId);
                    }
                } catch (e) {
                    // Ignore failures completely
                }
            }

            // Phase 1: Delete Messages and phase 1.5: Close DM (Interleaved loop on the fly)
            for (const dm of channelsToProcess) {
                if (this.isStopped) break;
                await checkPause();

                if (this.options.deleteMessages) {
                    this.updateProgress({
                        phase: "messages",
                        messages: {
                            ...this.progress.messages,
                            currentUser: dm.userName
                        }
                    });

                    await deleteAllMessagesInDm(
                        dm.channelId,
                        this.options.messageDelay,
                        async () => {
                            this.progress.messages.current++;
                            this.updateProgress({});
                            await checkPause();
                        },
                        () => this.isStopped
                    );
                }

                if (this.options.closeDms) {
                    this.updateProgress({
                        phase: "closingDms",
                        dmsClosed: {
                            ...this.progress.dmsClosed,
                            currentDm: dm.userName
                        }
                    });

                    await closeDm(dm.channelId);
                    this.progress.dmsClosed.current++;
                    this.updateProgress({});
                    await delay(500);
                }
            }
        }

        if (this.isStopped) {
            this.updateProgress({ phase: "stopped" });
            return;
        }

        // Phase 2: Leave servers
        if (this.options.leaveServers) {
            this.updateProgress({ phase: "servers" });
            const guilds = Object.values(GuildStore.getGuilds());
            const serversToLeave: { id: string, name: string }[] = [];

            for (const guild of guilds) {
                if ((guild as any).ownerId !== UserStore.getCurrentUser()?.id) {
                    serversToLeave.push({ id: (guild as any).id, name: (guild as any).name });
                }
            }

            for (const guild of serversToLeave) {
                if (this.isStopped) break;
                await checkPause();

                this.updateProgress({
                    servers: {
                        ...this.progress.servers,
                        currentServer: guild.name
                    }
                });

                await leaveServer(guild.id);
                this.progress.servers.current++;
                this.updateProgress({});

                await delay(1000); // Rate limit protection
            }
        }

        if (this.isStopped) {
            this.updateProgress({ phase: "stopped" });
            return;
        }

        // Phase 3: Remove friends
        if (this.options.removeFriends) {
            this.updateProgress({ phase: "friends" });
            const friendIds = RelationshipStore.getFriendIDs();
            const friendsToRemove: { id: string, displayName: string }[] = [];

            for (const id of friendIds) {
                const user = UserStore.getUser(id);
                if (user) {
                    friendsToRemove.push({
                        id: user.id,
                        displayName: (user as any).globalName || user.username
                    });
                }
            }

            for (const friend of friendsToRemove) {
                if (this.isStopped) break;
                await checkPause();

                this.updateProgress({
                    friends: {
                        ...this.progress.friends,
                        currentFriend: friend.displayName
                    }
                });

                await removeFriend(friend.id);
                this.progress.friends.current++;
                this.updateProgress({});

                await delay(500); // Rate limit protection
            }
        }

        this.updateProgress({
            phase: this.isStopped ? "stopped" : "complete"
        });

        if (this.taskId && !this.isStopped) {
            taskManager.updateTask(this.taskId, { status: "COMPLETED", progress: "Nuke Complete!" });
            setTimeout(() => {
                if (this.taskId) taskManager.removeTask(this.taskId);
            }, 10000);
        }
    }
}

export function startBackgroundNuke(
    options: NukeOptions,
    onProgress?: (progress: NukeProgress) => void
): NukeController {
    const controller = new NukeController(options, onProgress || (() => { }));
    controller.execute().catch(console.error);
    return controller;
}
