/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { RestAPI, UserStore } from "@webpack/common";

import { settingsManager } from "./settingsManager";

const DELAY_BETWEEN_REACTIONS = 500;

interface ReactionTask {
    channelId: string;
    messageId: string;
    chars: string[];
}

const queue: ReactionTask[] = [];
let isProcessing = false;

/**
 * Handle incoming messages for Reaction Speller
 */
export function handleReactionSpeller(msg: any) {
    if (!msg || !msg.author) return;

    // Ignore self
    const currentUser = UserStore.getCurrentUser();
    if (currentUser && msg.author.id === currentUser.id) return;

    // Check if target
    if (!settingsManager.isTarget(msg.author.id)) return;

    const targets = settingsManager.getTargets();
    const target = targets.find(t => t.id === msg.author.id);

    if (!target || !target.enabled || !target.reactionSpeller) return;

    // Get Text
    let text = settingsManager.getSettings().reactionSpellerText || "LMAO";
    text = text.toUpperCase().replace(/[^A-Z]/g, ""); // Only A-Z

    if (!text) return;

    // Filter duplicates (Discord allows only 1 unique reaction per emoji)
    // "HELLO" -> "HELO"
    const uniqueChars = new Set<string>();
    const charsToReact: string[] = [];

    for (const char of text) {
        if (!uniqueChars.has(char)) {
            uniqueChars.add(char);
            charsToReact.push(char);
        }
    }

    if (charsToReact.length === 0) return;

    // Add to queue instead of processing immediately
    queue.push({
        channelId: msg.channel_id,
        messageId: msg.id,
        chars: charsToReact
    });

    processQueue();
}

async function processQueue() {
    if (isProcessing) return;
    isProcessing = true;

    while (queue.length > 0) {
        const task = queue.shift();
        if (task) {
            await processReactions(task.channelId, task.messageId, task.chars);
        }
    }

    isProcessing = false;
}

async function processReactions(channelId: string, messageId: string, chars: string[]) {
    // We react sequentially to maintain order and avoid rate limits
    for (const char of chars) {
        const emoji = getRegionalIndicator(char);
        if (!emoji) continue;

        try {
            await RestAPI.put({
                url: `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`
            });
        } catch (err) {
            console.error("[ReactionSpeller] Failed to react", err);
            // Continue to next char even if one fails? Yes.
        }

        // Wait
        await new Promise(r => setTimeout(r, DELAY_BETWEEN_REACTIONS));
    }
}

function getRegionalIndicator(char: string): string | null {
    const code = char.toUpperCase().charCodeAt(0);
    if (code >= 65 && code <= 90) { // A-Z
        // 0x1F1E6 is Regional Indicator Symbol Letter A
        // 'A' is 65. Difference is 127397.
        return String.fromCodePoint(code + 127397);
    }
    return null;
}
