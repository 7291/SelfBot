/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showToast, Toasts, UserStore, VoiceActions, VoiceStateStore } from "@webpack/common";

import { getCurrentVoiceChannelInfo } from "./autoMuteUtils";
import { settingsManager } from "./settingsManager";

let badMicInterval: number | null = null;

// Probabilistic Packet Loss
// We tick rapidly (50ms) and decide whether to be 'muted' (dropped packet) or 'unmuted' (sent packet)
// based on the percentage level.

const TICK_RATE = 50;

/**
 * Start Bad Mic Simulator
 */
export function startBadMic(): boolean {
    if (badMicInterval) return false;

    const vcInfo = getCurrentVoiceChannelInfo();
    if (!vcInfo) {
        showToast("Not in a voice channel", Toasts.Type.FAILURE);
        settingsManager.setToggle("badMic", false);
        return false;
    }

    const level = settingsManager.getSettings().badMicLevel || 50;
    settingsManager.setToggle("badMic", true);

    badMicInterval = window.setInterval(() => {
        const currentUserId = UserStore.getCurrentUser()?.id;
        if (!currentUserId) return;

        // Stop if left voice
        if (!getCurrentVoiceChannelInfo()) {
            stopBadMic();
            return;
        }

        const voiceState = VoiceStateStore.getVoiceStateForUser(currentUserId);
        const isMuted = voiceState?.selfMute || false;

        // Current Level (can change live)
        const currentLevel = settingsManager.getSettings().badMicLevel || 50;
        const dropChance = currentLevel / 100;

        // Determine desired state for this tick
        const shouldDrop = Math.random() < dropChance;

        if (shouldDrop && !isMuted) {
            VoiceActions.toggleSelfMute();
        } else if (!shouldDrop && isMuted) {
            VoiceActions.toggleSelfMute();
        }
    }, TICK_RATE);

    showToast(`Bad Mic Active (Simulating ${level}% packet loss)`, Toasts.Type.SUCCESS);
    return true;
}

/**
 * Stop Bad Mic Simulator
 */
export function stopBadMic(): void {
    if (badMicInterval) {
        clearInterval(badMicInterval);
        badMicInterval = null;
    }

    settingsManager.setToggle("badMic", false);

    // Ensure we don't leave the user muted
    const userId = UserStore.getCurrentUser()?.id;
    if (userId) {
        const voiceState = VoiceStateStore.getVoiceStateForUser(userId);
        if (voiceState && voiceState.selfMute) {
            VoiceActions.toggleSelfMute();
        }
    }

    showToast("Bad Mic Stopped", Toasts.Type.MESSAGE);
}

/**
 * Update Bad Mic Level while running
 */
export function updateBadMicLevel(newLevel: number) {
    settingsManager.setBadMicLevel(newLevel);
    // Interval picks up new level automatically on next tick
}
