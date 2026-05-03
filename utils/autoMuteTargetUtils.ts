/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showToast, Toasts, VoiceStateStore } from "@webpack/common";

import { getCurrentVoiceChannel } from "./autoMuteUtils";
import { setServerMute } from "./discordApiUtils";
import { settingsManager } from "./settingsManager";

interface AutoMuteTargetState {
    enabled: boolean;
    intervalId?: number | NodeJS.Timeout;
}

export const autoMuteTargetState: AutoMuteTargetState = {
    enabled: false
};

// Mutes targets in the specified guild
export function muteTargetsInGuild(guildId: string): number {
    const targets = settingsManager.getTargets();
    if (targets.length === 0) return 0;

    const activeTargetIds = new Set(
        targets.filter(t => t.enabled).map(t => t.id)
    );

    if (activeTargetIds.size === 0) return 0;

    const voiceStates = VoiceStateStore.getVoiceStates(guildId);
    if (!voiceStates) return 0;

    let mutedCount = 0;

    for (const [userId, state] of Object.entries(voiceStates as Record<string, { mute: boolean; }>)) {
        if (activeTargetIds.has(userId) && !state.mute) {
            setServerMute(guildId, userId, true);
            mutedCount++;
        }
    }

    return mutedCount;
}

export function startAutoMuteTarget(): boolean {
    autoMuteTargetState.enabled = true;

    // Initial run
    const vcInfo = getCurrentVoiceChannel();
    if (vcInfo) {
        muteTargetsInGuild(vcInfo.guildId);
    }

    // Start persistence loop to handle rate limits / missed packets
    // Re-check every 3 seconds
    autoMuteTargetState.intervalId = setInterval(() => {
        if (!autoMuteTargetState.enabled) {
            clearInterval(autoMuteTargetState.intervalId);
            return;
        }
        const currentVc = getCurrentVoiceChannel();
        if (currentVc) {
            muteTargetsInGuild(currentVc.guildId);
        }
    }, 3000);

    showToast("Auto Mute Target enabled (Guild-wide)", Toasts.Type.SUCCESS);
    return true;
}

export function stopAutoMuteTarget(): void {
    autoMuteTargetState.enabled = false;
    if (autoMuteTargetState.intervalId) {
        clearInterval(autoMuteTargetState.intervalId);
        autoMuteTargetState.intervalId = undefined;
    }
    showToast("Auto Mute Target disabled", Toasts.Type.MESSAGE);
}

export function isAutoMuteTargetEnabled(): boolean {
    return autoMuteTargetState.enabled;
}

export function handleVoiceStateUpdateAutoMuteTarget(voiceStates: Array<{ userId: string; channelId?: string; guildId?: string; mute?: boolean; }>): void {
    if (!autoMuteTargetState.enabled) return;

    const targets = settingsManager.getTargets();
    const activeTargetIds = new Set(targets.filter(t => t.enabled).map(t => t.id));

    for (const state of voiceStates) {
        if (activeTargetIds.has(state.userId)) {
            // Fetch comprehensive state if partial
            let currentState: any = state;
            if (!state.channelId || !state.guildId) {
                const fullState = VoiceStateStore.getVoiceStateForUser(state.userId);
                if (fullState) {
                    currentState = { ...state, ...fullState };
                }
            }

            if (currentState.channelId && currentState.guildId) {
                // Ensure we check the current state from store to determine mute status accurately
                const realState = VoiceStateStore.getVoiceState(currentState.guildId, currentState.userId);
                if (realState && !realState.mute) {
                    setServerMute(currentState.guildId, currentState.userId, true);
                }
            }
        }
    }
}
