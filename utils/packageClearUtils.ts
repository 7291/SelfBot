/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { RestAPI, showToast, Toasts } from "@webpack/common";

import { PackageMessage, ParsedPackage } from "./packageParserUtils";
import { createDefaultMetrics, taskManager } from "./taskManager";

// Delay helper
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function deleteMessageWithRetry(
    channelId: string,
    messageId: string,
    maxRetries: number = 5
): Promise<{ success: boolean; rateLimitWait?: number; notFound?: boolean }> {
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

            // Message already deleted or no permission - treat as success (with flag)
            if (error.status === 404 || error.status === 403) {
                return { success: true, notFound: true };
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

export interface PackageClearOptions {
    delayMs: number;
    newestFirst: boolean;
    excludedChannelIds?: string[];
    onLog?: (message: string) => void;
    onProgress?: (current: number, total: number, status: string) => void;
}

export class PackageClearController {
    private messages: PackageMessage[];
    private options: PackageClearOptions;
    private isPaused: boolean = false;
    private isStopped: boolean = false;
    private taskId: string | null = null;

    constructor(
        parsedPackage: ParsedPackage,
        options: PackageClearOptions
    ) {
        // Flatten all messages and sort
        this.messages = [];
        const excluded = new Set(options.excludedChannelIds || []);

        for (const channel of parsedPackage.channels) {
            if (excluded.has(channel.id)) continue;
            this.messages.push(...channel.messages);
        }

        // Sort by timestamp
        this.messages.sort((a, b) => {
            const diff = b.timestamp.getTime() - a.timestamp.getTime();
            return options.newestFirst ? diff : -diff;
        });

        this.options = options;
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
            }, 5000);
        }
    }

    async start(): Promise<void> {
        const log = this.options.onLog || (() => { });
        const onProgress = this.options.onProgress || (() => { });
        const totalMessages = this.messages.length;

        if (totalMessages === 0) {
            showToast("No messages to delete in package", Toasts.Type.MESSAGE);
            log("[Complete] No messages found in package.");
            return;
        }

        // Register Task with metrics
        this.taskId = taskManager.registerTask({
            id: `pkg-clear-${Date.now()}`,
            type: "PACKAGE_CLEAR",
            description: `Deleting ${totalMessages.toLocaleString()} messages from package`,
            status: "RUNNING",
            progress: "Starting...",
            timestamp: Date.now(),
            metrics: {
                ...createDefaultMetrics(),
                total: totalMessages
            },
            actions: {
                pause: () => this.pause(),
                resume: () => this.resume(),
                stop: () => this.stop()
            }
        });

        log(`[Starting] Deleting ${totalMessages.toLocaleString()} messages...`);
        showToast(`Starting package deletion: ${totalMessages.toLocaleString()} messages`, Toasts.Type.MESSAGE);

        let deleted = 0;
        let failed = 0;
        let skipped = 0;
        let currentChannelId = "";

        for (let i = 0; i < this.messages.length; i++) {
            // Check if stopped
            if (this.isStopped) {
                log(`[Stopped] Deleted ${deleted}/${totalMessages} messages.`);
                showToast(`Stopped. Deleted ${deleted} messages.`, Toasts.Type.MESSAGE);
                onProgress(deleted, totalMessages, "stopped");
                return;
            }

            // Handle pause
            while (this.isPaused && !this.isStopped) {
                onProgress(deleted, totalMessages, "paused");
                if (this.taskId) {
                    taskManager.updateTask(this.taskId, {
                        progress: `Paused (${deleted}/${totalMessages})`
                    });
                }
                await delay(500);
            }

            if (this.isStopped) break;

            const message = this.messages[i];

            // Log channel change
            if (message.channelId !== currentChannelId) {
                currentChannelId = message.channelId;
                log(`[Channel] ${message.channelName}`);
            }

            // Try to delete with retry loop for rate limits
            let deleteSuccess = false;
            let retryCount = 0;
            const maxLoopRetries = 10;

            while (!deleteSuccess && retryCount < maxLoopRetries && !this.isStopped) {
                const result = await deleteMessageWithRetry(message.channelId, message.id);

                if (result.success) {
                    if (!result.notFound) {
                        deleted++;
                        if (this.taskId) taskManager.recordDelete(this.taskId);
                        const preview = message.content.substring(0, 40) + (message.content.length > 40 ? "..." : "");
                        log(`[${deleted}/${totalMessages}] ${preview || "(no text)"}`);
                    } else {
                        skipped++;
                    }
                    deleteSuccess = true;
                } else if (result.rateLimitWait) {
                    if (this.taskId) taskManager.recordRateLimit(this.taskId);
                    log(`[Rate Limit] Waiting ${result.rateLimitWait}s...`);
                    onProgress(deleted, totalMessages, "rate-limited");

                    if (this.taskId) {
                        taskManager.updateTask(this.taskId, {
                            progress: `Rate limited (${result.rateLimitWait}s)`
                        });
                    }

                    await delay(result.rateLimitWait * 1000 + 1500);
                    retryCount++;
                } else {
                    failed++;
                    log(`[Failed] Could not delete message ${message.id}`);
                    deleteSuccess = true; // Move on
                }
            }

            // Update progress
            onProgress(deleted, totalMessages, "deleting");
            if (this.taskId) {
                taskManager.updateTask(this.taskId, {
                    progress: `${deleted}/${totalMessages}`
                });
                taskManager.updateMetrics(this.taskId, { failed });
            }

            // Progress toast every 50 messages
            if (deleted > 0 && deleted % 50 === 0) {
                showToast(`Progress: ${deleted}/${totalMessages} deleted`, Toasts.Type.MESSAGE);
            }

            // Delay between deletes
            await delay(this.options.delayMs);
        }

        // Completed
        log(`[Complete] Deleted ${deleted} messages. Skipped ${skipped}. Failed ${failed}.`);
        showToast(`Package clear complete! Deleted ${deleted} messages.`, Toasts.Type.SUCCESS);
        onProgress(deleted, totalMessages, "complete");

        if (this.taskId) {
            taskManager.updateTask(this.taskId, {
                status: "COMPLETED",
                progress: `Done! ${deleted} deleted`
            });
            setTimeout(() => {
                if (this.taskId) taskManager.removeTask(this.taskId);
            }, 10000);
        }
    }
}

// Start background package deletion
export function startPackageDeletion(
    parsedPackage: ParsedPackage,
    options: PackageClearOptions
): PackageClearController {
    const controller = new PackageClearController(parsedPackage, options);

    controller.start().catch(err => {
        console.error("Package Clear Error:", err);
    });

    return controller;
}
