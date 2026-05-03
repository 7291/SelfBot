/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { RestAPI, showToast, Toasts } from "@webpack/common";

const TYPING_INTERVAL = 9000; // 9 seconds (Discord timeout is 10s)
const activeTypingIntervals: Map<string, number> = new Map();

/**
 * Start Eternal Typing in a specific channel
 */
export function startTypingEternal(channelId: string, channelName: string): boolean {
    if (activeTypingIntervals.has(channelId)) {
        showToast(`Already typing in ${channelName}`, Toasts.Type.FAILURE);
        return false;
    }

    // Initial trigger
    triggerTyping(channelId);

    // Loop
    const interval = window.setInterval(() => {
        triggerTyping(channelId);
    }, TYPING_INTERVAL);

    activeTypingIntervals.set(channelId, interval);
    showToast(`Eternal Typing started in ${channelName}`, Toasts.Type.SUCCESS);
    return true;
}

/**
 * Stop Eternal Typing in a specific channel
 */
export function stopTypingEternal(channelId: string): void {
    const interval = activeTypingIntervals.get(channelId);
    if (interval) {
        clearInterval(interval);
        activeTypingIntervals.delete(channelId);
        showToast("Stopped Eternal Typing", Toasts.Type.MESSAGE);
    }
}

/**
 * Stop ALL Eternal Typing instances
 */
export function stopAllTypingEternal(): void {
    activeTypingIntervals.forEach(interval => clearInterval(interval));
    activeTypingIntervals.clear();
}

/**
 * Check if typing is active in a channel
 */
export function isTypingEternalActive(channelId: string): boolean {
    return activeTypingIntervals.has(channelId);
}

/**
 * Internal: Send the typing request
 */
async function triggerTyping(channelId: string) {
    try {
        await RestAPI.post({
            url: `/channels/${channelId}/typing`
        });
    } catch (err) {
        console.error(`[TypingEternal] Failed to trigger typing in ${channelId}`, err);
        // Don't stop on error, might be temporary network issue
    }
}
