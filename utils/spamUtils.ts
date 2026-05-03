/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChannelStore } from "@webpack/common";

import { discordApi } from "./discordApiUtils";
import { ActiveTask, createDefaultMetrics, taskManager } from "./taskManager";

export interface SpamMessage {
    id: string;
    content: string;
    attachments?: File[];
}

export interface SpamOptions {
    channelIds: string[];
    messages: SpamMessage[];
    amount: number; // -1 for infinite
    delayMs: number;
    instant: boolean; // if true, ignores delay (except for rate limits/slowmode)
    waitForSlowmode: boolean;
}

const activeSpamTasks = new Set<string>();

export function isSpamming(channelId: string): boolean {
    // This is a rough check, ideally we check if any task targets this channel
    // But since one task can target multiple channels, we rely on task IDs mainly
    return false;
}

export function startSpamTask(options: SpamOptions): string {
    const taskId = `spam-${Date.now()}`;
    const task: ActiveTask = {
        id: taskId,
        type: "SPAM",
        description: `Spamming ${options.channelIds.length} channels`,
        status: "RUNNING",
        progress: "Starting...",
        timestamp: Date.now(),
        metrics: createDefaultMetrics(),
        actions: {
            pause: () => {
                const t = taskManager.getTasks().find(x => x.id === taskId);
                if (t) taskManager.updateTask(taskId, { status: "PAUSED" });
            },
            resume: () => {
                const t = taskManager.getTasks().find(x => x.id === taskId);
                if (t) taskManager.updateTask(taskId, { status: "RUNNING" });
            },
            stop: () => {
                activeSpamTasks.delete(taskId);
                taskManager.updateTask(taskId, { status: "STOPPED", progress: "Stopped by user" });
                taskManager.removeTask(taskId);
            }
        }
    };

    // Initialize metrics total
    if (options.amount > 0) {
        task.metrics!.total = options.amount * options.messages.length * options.channelIds.length;
    } else {
        task.metrics!.total = 0; // Infinite
    }

    taskManager.registerTask(task);
    activeSpamTasks.add(taskId);

    // Start background process
    runSpamLoop(taskId, options);

    return taskId;
}

async function runSpamLoop(taskId: string, options: SpamOptions) {
    let sentCount = 0;
    let messageIndex = 0;

    // We loop until amount is reached OR stopped
    // Inner loop iterates channels
    // Outer loop counts "rounds"

    // Flatten the work: We want to send (Amount) messages per channel preferably, or total?
    // User request: "Times the user wants to spam" -> typically means X messages per channel or X rounds.
    // Let's assume X total messages PER CHANNEL for consistency.

    let rounds = 0;

    while (activeSpamTasks.has(taskId)) {
        // Check Task Status
        const task = taskManager.getTasks().find(t => t.id === taskId);
        if (!task || task.status === "STOPPED" || task.status === "ERROR") {
            break;
        }

        if (task.status === "PAUSED") {
            await new Promise(r => setTimeout(r, 500));
            continue;
        }

        // Check completion (if finite)
        if (options.amount !== -1 && rounds >= options.amount) {
            taskManager.updateTask(taskId, { status: "COMPLETED", progress: "Done!" });
            activeSpamTasks.delete(taskId);
            setTimeout(() => taskManager.removeTask(taskId), 3000);
            break;
        }

        const messageToSend = options.messages[messageIndex % options.messages.length];

        // Iterate all targeted channels
        for (const channelId of options.channelIds) {
            // Check paused/stopped inside inner loop too
            const currentTask = taskManager.getTasks().find(t => t.id === taskId);
            if (!currentTask || currentTask.status !== "RUNNING") break;

            // Handle Slowmode if requested
            if (options.waitForSlowmode) {
                const channel = ChannelStore.getChannel(channelId);
                if (channel && channel.rateLimitPerUser > 0) {
                    // We should technically track last message time per channel,
                    // but for simplicity we just assume we need to wait at least the slowmode duration
                    // if it's larger than our delay.
                    // However, avoiding complex tracking: if delay is short, we might hit 429 or slowmode error.
                    // Discord client usually prevents sending if slowmode is active.
                    // Let's wait the slowmode amount if delay is less than slowmode
                    if (options.delayMs < channel.rateLimitPerUser * 1000) {
                        await new Promise(r => setTimeout(r, channel.rateLimitPerUser * 1000));
                    }
                }
            }

            // Send Message
            const success = await discordApi.sendMessage(channelId, messageToSend.content, messageToSend.attachments);

            if (success) {
                sentCount++;
                taskManager.recordDelete(taskId); // Re-using recordDelete for "recordSent" effectively
                taskManager.updateTask(taskId, {
                    progress: `Sent ${sentCount} msgs (${messageToSend.content.substring(0, 20)}...)`
                });
            } else {
                taskManager.recordRateLimit(taskId);
                // If failed, maybe wait a bit more?
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        rounds++;
        messageIndex++;

        // Wait Delay
        if (!options.instant) {
            await new Promise(r => setTimeout(r, options.delayMs));
        } else {
            // Even "instant" needs a tiny breathing room to not freeze UI
            await new Promise(r => setTimeout(r, 50));
        }
    }
}
