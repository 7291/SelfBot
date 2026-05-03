/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { RestAPI } from "@webpack/common";
import { settingsManager } from "./settingsManager";

let autoStatusInterval: ReturnType<typeof setInterval> | null = null;
let currentMessageIndex = 0;

async function setCustomStatus(text: string) {
    try {
        await RestAPI.patch({
            url: "/users/@me/settings",
            body: {
                custom_status: { text }
            }
        });
        return true;
    } catch (e) {
        console.error("[Auto Status] Failed to set status", e);
        return false;
    }
}

export function startAutoStatus() {
    if (autoStatusInterval) {
        clearInterval(autoStatusInterval);
    }
    const settings = settingsManager.getSettings().autoStatusSettings;
    const messages = settings.messages;
    
    if (messages.length === 0) return false;

    currentMessageIndex = 0;
    
    const rotate = async () => {
        if (!settingsManager.getToggle("autoStatus")) return stopAutoStatus();
        const settings = settingsManager.getSettings().autoStatusSettings;
        if (settings.messages.length === 0) return;
        
        await setCustomStatus(settings.messages[currentMessageIndex % settings.messages.length]);
        currentMessageIndex++;
    };

    rotate(); // Run immediately
    autoStatusInterval = setInterval(rotate, Math.max(settings.intervalMs, 5000)); // Minimum 5s
    
    return true;
}

export function stopAutoStatus() {
    if (autoStatusInterval) {
        clearInterval(autoStatusInterval);
        autoStatusInterval = null;
    }
    
    // Clear status
    setCustomStatus("");
}

export function isAutoStatusEnabled(): boolean {
    return autoStatusInterval !== null;
}
