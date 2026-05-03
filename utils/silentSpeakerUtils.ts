/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { MediaEngineStore, showToast, Toasts } from "@webpack/common";

import { getCurrentVoiceChannelInfo } from "./autoMuteUtils";
import { settingsManager } from "./settingsManager";

// Note: MediaEngineActionCreators might be needed if not exposed directly.
// We'll try to access MediaEngineStore actions or similar.
// If not available, we might need to find the module.

// Stores original settings to restore on stop
// Stores original settings to restore on stop
let originalInputVolume: number = 100;

/**
 * Start Silent Speaker
 */
export function startSilentSpeaker(): boolean {
    const vcInfo = getCurrentVoiceChannelInfo();
    if (!vcInfo) {
        showToast("Join a voice channel first!", Toasts.Type.FAILURE);
        settingsManager.setToggle("silentSpeaker", false);
        return false;
    }

    if (!MediaEngineStore) {
        showToast("MediaEngine not found. Feature unavailable.", Toasts.Type.FAILURE);
        settingsManager.setToggle("silentSpeaker", false);
        return false;
    }

    try {
        const mediaEngine = MediaEngineStore.getMediaEngine();
        if (!mediaEngine) throw new Error("No MediaEngine instance");

        // Save original values
        originalInputVolume = MediaEngineStore.getInputVolume();
        // Sensitivity is tricky, might not be exposed directly on store but on engine or settings
        // We'll try to set it on the engine directly if possible, or assume defaults
        // For now, let's just try setting them.

        // 1. Set Input Volume to 0 (Silence)
        mediaEngine.setInputVolume(0);

        // 2. Set Sensitivity to -100dB (Always Transmit / Green Circle)
        // or equivalent method.
        // Some engines use `setMode` with threshold.
        // We will try `setMode` if available or `setVadSensitivity`.

        // Note: Specific method names might vary. Common Electron Discord:
        // mediaEngine.setMode('VOICE_ACTIVITY', { threshold: -100 })

        // Let's safe-check common known methods
        const engine = mediaEngine as any;
        if (engine.setAudioInputSensitivity) {
            engine.setAudioInputSensitivity(-100);
        }

        showToast("Silent Speaker Active", Toasts.Type.SUCCESS);
        settingsManager.setToggle("silentSpeaker", true);
        return true;

    } catch (e) {
        console.error("[SilentSpeaker] Failed to start:", e);
        showToast("Failed to access Audio settings", Toasts.Type.FAILURE);
        settingsManager.setToggle("silentSpeaker", false);
        return false;
    }
}

/**
 * Stop Silent Speaker
 */
export function stopSilentSpeaker(): void {
    settingsManager.setToggle("silentSpeaker", false);

    try {
        const mediaEngine = MediaEngineStore?.getMediaEngine();
        if (mediaEngine) {
            // Restore Volume
            mediaEngine.setInputVolume(originalInputVolume);

            // Restore Sensitivity (Assuming default or saved if we could read it)
            // If we didn't read it, we'll set to a sane default
            const engine = mediaEngine as any;
            if (engine.setAudioInputSensitivity) {
                engine.setAudioInputSensitivity(-60); // Default-ish
            }
        }
    } catch (e) {
        console.error("[SilentSpeaker] Failed to stop:", e);
    }

    showToast("Silent Speaker Disabled", Toasts.Type.MESSAGE);
}
