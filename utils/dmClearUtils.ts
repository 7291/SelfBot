/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChannelType } from "@vencord/discord-types/enums";
import { ChannelStore, MessageStore, RestAPI, showToast, Toasts, UserStore } from "@webpack/common";

import { createDefaultMetrics, taskManager } from "./taskManager";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════
export interface DmConversation {
    id: string; // User ID for DM, Channel ID for Group
    channelId: string;
    name: string;
    subtext: string; // Handle/Tag for DM, Member count for Group
    avatarUrl: string;
    type: "DM" | "GROUP";
}

export interface DmClearProgress {
    current: number;
    total: number;
    status: "idle" | "fetching" | "deleting" | "paused" | "rate-limited" | "complete" | "stopped";
    rateLimitRetryAfter?: number;
}

export interface DmClearOptions {
    delay: number;
    newestFirst: boolean;
    filterText?: string;
    filterCaseSensitive?: boolean;
    beforeDate?: Date | null;
    afterDate?: Date | null;
    maxMessages?: number;
    onLog?: (message: string) => void;
}

export interface MessageInfo {
    id: string;
    content: string;
    timestamp: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
// GET DM CONVERSATIONS
// ═══════════════════════════════════════════════════════════════════════════
export function getDmConversations(): DmConversation[] {
    const privateChannels = ChannelStore.getSortedPrivateChannels();
    const currentUser = UserStore.getCurrentUser();
    const conversations: DmConversation[] = [];

    if (!currentUser) return conversations;

    for (const channel of privateChannels) {
        // Allow both DM and GROUP_DM
        if (channel.type !== ChannelType.DM && channel.type !== ChannelType.GROUP_DM) continue;

        // Check availability of messages to delete - any message from user is deletable
        const cachedMessages = MessageStore.getMessages(channel.id);
        const hasMyMessages = cachedMessages?._array?.some(
            (msg: any) => msg.author?.id === currentUser.id
        );

        if (cachedMessages?._array?.length > 0 && !hasMyMessages) {
            continue;
        }

        if (channel.type === ChannelType.DM) {
            const recipientIds = channel.recipients as string[];
            if (!recipientIds || recipientIds.length === 0) continue;
            const recipientId = recipientIds[0];
            const user = UserStore.getUser(recipientId);
            if (!user) continue;

            conversations.push({
                id: user.id,
                channelId: channel.id,
                name: (user as any).globalName || user.username,
                subtext: `@${user.username}`,
                avatarUrl: user.avatar
                    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`
                    : `https://cdn.discordapp.com/embed/avatars/${(BigInt(user.id) >> 22n) % 6n}.png`,
                type: "DM"
            });
        } else if (channel.type === ChannelType.GROUP_DM) {
            // For Group DMs
            const name = channel.name || channel.recipients.map((id: string) => UserStore.getUser(id)?.username).filter(Boolean).join(", ") || "Unnamed Group";
            const memberCount = channel.recipients.length + 1; // +1 for self

            conversations.push({
                id: channel.id,
                channelId: channel.id,
                name: name,
                subtext: `${memberCount} members`,
                avatarUrl: channel.icon
                    ? `https://cdn.discordapp.com/channel-icons/${channel.id}/${channel.icon}.png?size=64`
                    : "https://cdn.discordapp.com/embed/avatars/0.png",
                type: "GROUP"
            });
        }
    }

    return conversations;
}

// ═══════════════════════════════════════════════════════════════════════════
// FILTER CONVERSATIONS
// ═══════════════════════════════════════════════════════════════════════════
export function filterDmConversations(conversations: DmConversation[], query: string): DmConversation[] {
    if (!query.trim()) return conversations;
    const lowerQuery = query.toLowerCase().trim();

    return conversations.filter(c =>
        c.name.toLowerCase().includes(lowerQuery) ||
        c.subtext.toLowerCase().includes(lowerQuery) ||
        c.id.includes(lowerQuery)
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// DELAY HELPER
// ═══════════════════════════════════════════════════════════════════════════
export function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ═══════════════════════════════════════════════════════════════════════════
// DELETE MESSAGE WITH RETRY
// ═══════════════════════════════════════════════════════════════════════════
async function deleteMessageWithRetry(
    channelId: string,
    messageId: string,
    maxRetries: number = 5
): Promise<{ success: boolean; rateLimitWait?: number }> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            await RestAPI.del({
                url: `/channels/${channelId}/messages/${messageId}`
            });
            return { success: true };
        } catch (error: any) {
            if (error.status === 429) {
                const retryAfter = error.body?.retry_after || 5;
                return { success: false, rateLimitWait: retryAfter };
            }

            // Message already deleted or no permission - treat as success
            if (error.status === 404 || error.status === 403) {
                return { success: true };
            }

            // Server error or temporary issue - retry after delay
            if (error.status >= 500 || error.status === 0) {
                await delay(2000 * (attempt + 1));
                continue;
            }

            // Unknown error on last attempt
            if (attempt === maxRetries - 1) {
                return { success: false };
            }

            await delay(1500);
        }
    }

    return { success: false };
}

// ═══════════════════════════════════════════════════════════════════════════
// DM CLEAR CONTROLLER - Streaming deletion (no pre-counting, instant start)
// ═══════════════════════════════════════════════════════════════════════════
export class DmClearController {
    private channelId: string;
    private userName: string;
    private options: DmClearOptions;
    private isPaused: boolean = false;
    private isStopped: boolean = false;
    private progressCallback: (progress: DmClearProgress) => void;
    private taskId: string | null = null;

    constructor(
        channelId: string,
        userName: string,
        options: DmClearOptions,
        onProgress: (progress: DmClearProgress) => void
    ) {
        this.channelId = channelId;
        this.userName = userName;
        this.options = options;
        this.progressCallback = onProgress || (() => { });
    }

    pause() {
        this.isPaused = true;
        if (this.taskId) {
            taskManager.updateTask(this.taskId, { status: "PAUSED" });
        }
    }

    resume() {
        this.isPaused = false;
        if (this.taskId) {
            taskManager.updateTask(this.taskId, { status: "RUNNING" });
        }
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

    updateTaskProgress(status: string) {
        if (this.taskId) {
            taskManager.updateTask(this.taskId, { progress: status });
        }
    }

    // Check if message passes filters
    private messagePassesFilters(msg: { content: string; timestamp: string }): boolean {
        const msgTimestamp = new Date(msg.timestamp);

        if (this.options.beforeDate && msgTimestamp >= this.options.beforeDate) return false;
        if (this.options.afterDate && msgTimestamp <= this.options.afterDate) return false;

        if (this.options.filterText) {
            const searchText = this.options.filterCaseSensitive ? msg.content : msg.content.toLowerCase();
            const filterText = this.options.filterCaseSensitive ? this.options.filterText : this.options.filterText.toLowerCase();
            if (!searchText.includes(filterText)) return false;
        }

        return true;
    }

    async start(): Promise<void> {
        const log = this.options.onLog || (() => { });
        const currentUser = UserStore.getCurrentUser();

        if (!currentUser) {
            showToast("Not logged in", Toasts.Type.FAILURE);
            return;
        }

        // Register Task
        this.taskId = taskManager.registerTask({
            id: `dm-clear-${Date.now()}`,
            type: "DM_CLEAR",
            description: `Clearing DM with ${this.userName}`,
            status: "RUNNING",
            progress: "Starting...",
            timestamp: Date.now(),
            metrics: createDefaultMetrics(),
            actions: {
                pause: () => this.pause(),
                resume: () => this.resume(),
                stop: () => this.stop()
            }
        });

        let totalDeleted = 0;
        let lastMessageId: string | undefined;
        let hasMore = true;

        log(`[Starting] Deleting messages from ${this.userName}...`);
        showToast(`Starting deletion in DM with ${this.userName}...`, Toasts.Type.MESSAGE);
        this.progressCallback({ current: 0, total: 0, status: "deleting" });

        if (this.options.newestFirst) {
            // Stream: Fetch batch -> Delete matching -> Repeat
            while (hasMore && !this.isStopped) {
                // Handle pause
                while (this.isPaused && !this.isStopped) {
                    this.progressCallback({ current: totalDeleted, total: 0, status: "paused" });
                    this.updateTaskProgress(`Paused (${totalDeleted} deleted)`);
                    await delay(500);
                }

                if (this.isStopped) break;

                try {
                    // Fetch batch of messages
                    const query: any = { limit: 100 };
                    if (lastMessageId) {
                        query.before = lastMessageId;
                    }

                    const response = await RestAPI.get({
                        url: `/channels/${this.channelId}/messages`,
                        query
                    });

                    const messages = response.body as Array<{
                        id: string;
                        author: { id: string };
                        content: string;
                        timestamp: string;
                    }>;

                    if (!messages || messages.length === 0) {
                        hasMore = false;
                        break;
                    }

                    // Process each message in batch
                    for (const msg of messages) {
                        if (this.isStopped) break;

                        while (this.isPaused && !this.isStopped) {
                            await delay(500);
                        }

                        if (this.isStopped) break;

                        // Skip if not my message
                        if (msg.author.id !== currentUser.id) continue;

                        // Skip if doesn't pass filters
                        if (!this.messagePassesFilters(msg)) continue;

                        // Check max messages limit
                        if (this.options.maxMessages && totalDeleted >= this.options.maxMessages) {
                            log(`[Limit] Reached limit of ${this.options.maxMessages} messages`);
                            hasMore = false;
                            break;
                        }

                        // Delete this message
                        let deleted = false;
                        let retryCount = 0;

                        while (!deleted && retryCount < 10 && !this.isStopped) {
                            const result = await deleteMessageWithRetry(this.channelId, msg.id);

                            if (result.success) {
                                totalDeleted++;
                                deleted = true;
                                if (this.taskId) taskManager.recordDelete(this.taskId);
                                const preview = msg.content.substring(0, 40) + (msg.content.length > 40 ? "..." : "");
                                log(`[${totalDeleted}] ${preview || "(no text)"}`);
                            } else if (result.rateLimitWait) {
                                if (this.taskId) taskManager.recordRateLimit(this.taskId);
                                log(`[Rate Limited] Waiting ${result.rateLimitWait}s...`);
                                this.updateTaskProgress(`Rate limited (${result.rateLimitWait}s)`);
                                this.progressCallback({
                                    current: totalDeleted,
                                    total: 0,
                                    status: "rate-limited",
                                    rateLimitRetryAfter: result.rateLimitWait
                                });
                                await delay(result.rateLimitWait * 1000 + 1500);
                                retryCount++;
                            } else {
                                deleted = true;
                            }
                        }

                        this.progressCallback({ current: totalDeleted, total: 0, status: "deleting" });
                        this.updateTaskProgress(`${totalDeleted} deleted`);

                        await delay(this.options.delay);
                    }

                    lastMessageId = messages[messages.length - 1].id;

                    if (messages.length < 100) {
                        hasMore = false;
                    }

                } catch (error: any) {
                    if (error.status === 429) {
                        const retryAfter = error.body?.retry_after || 5;
                        log(`[Rate Limited] Waiting ${retryAfter}s...`);
                        await delay(retryAfter * 1000 + 500);
                    } else {
                        console.error("[DM Clear] Error:", error);
                        log(`[Error] ${error.message || "Unknown error"}`);
                        break;
                    }
                }
            }
        } else {
            // Oldest First mode: Fetch all messages first, then delete them in reverse order
            log(`[Fetching] Loading all messages...`);
            this.progressCallback({ current: 0, total: 0, status: "fetching" });
            this.updateTaskProgress(`Fetching messages...`);

            const messagesToDelete: Array<{id: string, content: string}> = [];
            
            while (hasMore && !this.isStopped) {
                while (this.isPaused && !this.isStopped) await delay(500);
                if (this.isStopped) break;

                try {
                    const query: any = { limit: 100 };
                    if (lastMessageId) query.before = lastMessageId;

                    const response = await RestAPI.get({
                        url: `/channels/${this.channelId}/messages`,
                        query
                    });

                    const messages = response.body as Array<{
                        id: string;
                        author: { id: string };
                        content: string;
                        timestamp: string;
                    }>;

                    if (!messages || messages.length === 0) {
                        hasMore = false;
                        break;
                    }

                    for (const msg of messages) {
                        if (msg.author.id !== currentUser.id) continue;
                        if (!this.messagePassesFilters(msg)) continue;
                        messagesToDelete.push({ id: msg.id, content: msg.content });

                        if (this.options.maxMessages && messagesToDelete.length >= this.options.maxMessages) {
                            hasMore = false;
                            break;
                        }
                    }

                    lastMessageId = messages[messages.length - 1].id;
                    if (messages.length < 100) hasMore = false;
                    
                    this.updateTaskProgress(`Fetching... found ${messagesToDelete.length}`);
                    
                    // Small delay to prevent rate limiting during fetch
                    await delay(50);
                } catch (error: any) {
                    if (error.status === 429) {
                        const retryAfter = error.body?.retry_after || 5;
                        await delay(retryAfter * 1000 + 500);
                    } else {
                        console.error("[DM Clear Fetch Error]:", error);
                        break;
                    }
                }
            }

            if (!this.isStopped) {
                log(`[Fetched] Found ${messagesToDelete.length} messages. Deleting from oldest first...`);
                
                // Reverse to get oldest first
                messagesToDelete.reverse();

                const totalToDel = messagesToDelete.length;
                this.progressCallback({ current: 0, total: totalToDel, status: "deleting" });

                for (const msg of messagesToDelete) {
                    while (this.isPaused && !this.isStopped) await delay(500);
                    if (this.isStopped) break;

                    let deleted = false;
                    let retryCount = 0;

                    while (!deleted && retryCount < 10 && !this.isStopped) {
                        const result = await deleteMessageWithRetry(this.channelId, msg.id);
                        if (result.success) {
                            totalDeleted++;
                            deleted = true;
                            if (this.taskId) taskManager.recordDelete(this.taskId);
                            const preview = msg.content.substring(0, 40) + (msg.content.length > 40 ? "..." : "");
                            log(`[${totalDeleted}/${totalToDel}] ${preview || "(no text)"}`);
                        } else if (result.rateLimitWait) {
                            if (this.taskId) taskManager.recordRateLimit(this.taskId);
                            this.updateTaskProgress(`Rate limited (${result.rateLimitWait}s)`);
                            this.progressCallback({
                                current: totalDeleted,
                                total: totalToDel,
                                status: "rate-limited",
                                rateLimitRetryAfter: result.rateLimitWait
                            });
                            await delay(result.rateLimitWait * 1000 + 1500);
                            retryCount++;
                        } else {
                            deleted = true;
                        }
                    }

                    this.progressCallback({ current: totalDeleted, total: totalToDel, status: "deleting" });
                    this.updateTaskProgress(`${totalDeleted}/${totalToDel} deleted`);
                    await delay(this.options.delay);
                }
            }
        }

        // Completed or stopped
        if (this.isStopped) {
            showToast(`Stopped. Deleted ${totalDeleted} messages.`, Toasts.Type.MESSAGE);
            log(`[Stopped] Deleted ${totalDeleted} messages.`);
            this.progressCallback({ current: totalDeleted, total: totalDeleted, status: "stopped" });
        } else {
            showToast(`Completed! Deleted ${totalDeleted} messages from DM with ${this.userName}`, Toasts.Type.SUCCESS);
            log(`[Complete] Deleted ${totalDeleted} messages!`);
            this.progressCallback({ current: totalDeleted, total: totalDeleted, status: "complete" });

            if (this.taskId) {
                taskManager.updateTask(this.taskId, {
                    status: "COMPLETED",
                    progress: `Done! ${totalDeleted} deleted`
                });
                setTimeout(() => {
                    if (this.taskId) taskManager.removeTask(this.taskId);
                }, 5000);
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// START BACKGROUND DELETION
// ═══════════════════════════════════════════════════════════════════════════
export function startBackgroundDeletion(
    target: DmConversation,
    options: DmClearOptions,
    onProgress?: (progress: DmClearProgress) => void
): DmClearController {
    const controller = new DmClearController(
        target.channelId,
        target.name,
        options,
        onProgress || (() => { })
    );

    controller.start().catch(err => {
        console.error("DM Clear Error:", err);
    });

    return controller;
}
