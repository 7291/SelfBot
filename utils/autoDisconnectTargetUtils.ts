/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showToast, Toasts, VoiceStateStore } from "@webpack/common";

import { getCurrentVoiceChannel } from "./autoMuteUtils";
import { setChannel } from "./discordApiUtils";
import { settingsManager } from "./settingsManager";

interface AutoDisconnectTargetState {
    enabled: boolean;
    intervalId?: number | NodeJS.Timeout;
}

export const autoDisconnectTargetState: AutoDisconnectTargetState = {
    enabled: false
};

// Disconnects targets in the specified guild
export function disconnectTargetsInGuild(guildId: string): number {
    const targets = settingsManager.getTargets();
    if (targets.length === 0) return 0;

    const activeTargetIds = new Set(
        targets.filter(t => t.enabled).map(t => t.id)
    );

    if (activeTargetIds.size === 0) return 0;

    const voiceStates = VoiceStateStore.getVoiceStates(guildId);
    if (!voiceStates) return 0;

    let disconnectedCount = 0;

    for (const [userId, state] of Object.entries(voiceStates as Record<string, { channelId: string; }>)) {
        if (activeTargetIds.has(userId) && state.channelId) {
            setChannel(guildId, userId, null);
            disconnectedCount++;
        }
    }

    return disconnectedCount;
}

export function startAutoDisconnectTarget(): boolean {
    autoDisconnectTargetState.enabled = true;

    // Initial run
    const vcInfo = getCurrentVoiceChannel();
    if (vcInfo) {
        disconnectTargetsInGuild(vcInfo.guildId);
    }

    // Start persistence loop
    autoDisconnectTargetState.intervalId = setInterval(() => {
        if (!autoDisconnectTargetState.enabled) {
            clearInterval(autoDisconnectTargetState.intervalId);
            return;
        }
        const currentVc = getCurrentVoiceChannel();
        if (currentVc) {
            disconnectTargetsInGuild(currentVc.guildId);
        }
    }, 3000);

    showToast("Auto Disconnect Target enabled", Toasts.Type.SUCCESS);
    return true;
}

export function stopAutoDisconnectTarget(): void {
    autoDisconnectTargetState.enabled = false;
    if (autoDisconnectTargetState.intervalId) {
        clearInterval(autoDisconnectTargetState.intervalId);
        autoDisconnectTargetState.intervalId = undefined;
    }
    showToast("Auto Disconnect Target disabled", Toasts.Type.MESSAGE);
}

export function isAutoDisconnectTargetEnabled(): boolean {
    return autoDisconnectTargetState.enabled;
}

export function handleVoiceStateUpdateAutoDisconnectTarget(voiceStates: Array<{ userId: string; channelId?: string; guildId?: string; }>): void {
    if (!autoDisconnectTargetState.enabled) return;

    const targets = settingsManager.getTargets();
    const activeTargetIds = new Set(targets.filter(t => t.enabled).map(t => t.id));

    for (const state of voiceStates) {
        if (activeTargetIds.has(state.userId)) {
            let currentState: any = state;
            if (!state.channelId || !state.guildId) {
                const fullState = VoiceStateStore.getVoiceStateForUser(state.userId);
                if (fullState) {
                    currentState = { ...state, ...fullState };
                }
            }

            if (currentState.channelId && currentState.guildId) {
                setChannel(currentState.guildId, currentState.userId, null);
            }
        }
    }
}
