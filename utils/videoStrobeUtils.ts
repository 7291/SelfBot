/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showToast, Toasts, UserStore, VoiceActions, VoiceStateStore } from "@webpack/common";

import { getCurrentVoiceChannelInfo } from "./autoMuteUtils";
import { settingsManager } from "./settingsManager";

let strobeInterval: number | null = null;
const STROBE_DELAY = 200; // ms

/**
 * Start Video Strobe
 */
export function startVideoStrobe(): boolean {
    if (strobeInterval) return false;

    const vcInfo = getCurrentVoiceChannelInfo();
    if (!vcInfo) {
        showToast("Not in a voice channel", Toasts.Type.FAILURE);
        return false;
    }

    settingsManager.setToggle("videoStrobe", true);

    // Initial state check
    const currentUserId = UserStore.getCurrentUser()?.id;
    // We don't strictly *need* the current state because toggle will just flip it.
    // But for "Strobe" we might want to ensure we don't leave it ON when stopping.
    // We'll handle cleanup in stop.

    strobeInterval = window.setInterval(() => {
        // Stop if user left voice
        if (!getCurrentVoiceChannelInfo()) {
            stopVideoStrobe();
            return;
        }
        VoiceActions.toggleSelfVideo();
    }, STROBE_DELAY);

    showToast("Video Strobe ENABLED", Toasts.Type.SUCCESS);
    return true;
}

/**
 * Stop Video Strobe
 */
export function stopVideoStrobe(): void {
    if (strobeInterval) {
        clearInterval(strobeInterval);
        strobeInterval = null;
    }

    settingsManager.setToggle("videoStrobe", false);

    // Try to ensure video is OFF when stopping?
    const currentUserId = UserStore.getCurrentUser()?.id;
    if (currentUserId) {
        const voiceState = VoiceStateStore.getVoiceStateForUser(currentUserId);
        if (voiceState && voiceState.selfVideo) {
            // If left ON, turn it OFF
            VoiceActions.toggleSelfVideo();
        }
    }

    showToast("Video Strobe DISABLED", Toasts.Type.MESSAGE);
}

/**
 * Check if Video Strobe is running
 */
export function isVideoStrobeEnabled(): boolean {
    return !!strobeInterval;
}
