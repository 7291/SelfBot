/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showToast, Toasts, VoiceStateStore } from "@webpack/common";

import { getCurrentVoiceChannel } from "./autoMuteUtils";
import { setServerDeaf } from "./discordApiUtils";
import { settingsManager } from "./settingsManager";

interface AutoDeafenTargetState {
    enabled: boolean;
    intervalId?: number | NodeJS.Timeout;
}

export const autoDeafenTargetState: AutoDeafenTargetState = {
    enabled: false
};

// Deafens targets in the specified guild
export function deafenTargetsInGuild(guildId: string): number {
    const targets = settingsManager.getTargets();
    if (targets.length === 0) return 0;

    const activeTargetIds = new Set(
        targets.filter(t => t.enabled).map(t => t.id)
    );

    if (activeTargetIds.size === 0) return 0;

    const voiceStates = VoiceStateStore.getVoiceStates(guildId);
    if (!voiceStates) return 0;

    let deafenedCount = 0;

    for (const [userId, state] of Object.entries(voiceStates as Record<string, { deaf: boolean; }>)) {
        if (activeTargetIds.has(userId) && !state.deaf) {
            setServerDeaf(guildId, userId, true);
            deafenedCount++;
        }
    }

    return deafenedCount;
}

export function startAutoDeafenTarget(): boolean {
    autoDeafenTargetState.enabled = true;

    // Initial run
    const vcInfo = getCurrentVoiceChannel();
    if (vcInfo) {
        deafenTargetsInGuild(vcInfo.guildId);
    }

    // Start persistence loop
    autoDeafenTargetState.intervalId = setInterval(() => {
        if (!autoDeafenTargetState.enabled) {
            clearInterval(autoDeafenTargetState.intervalId);
            return;
        }
        const currentVc = getCurrentVoiceChannel();
        if (currentVc) {
            deafenTargetsInGuild(currentVc.guildId);
        }
    }, 3000);

    showToast("Auto Deafen Target enabled (Guild-wide)", Toasts.Type.SUCCESS);
    return true;
}

export function stopAutoDeafenTarget(): void {
    autoDeafenTargetState.enabled = false;
    if (autoDeafenTargetState.intervalId) {
        clearInterval(autoDeafenTargetState.intervalId);
        autoDeafenTargetState.intervalId = undefined;
    }
    showToast("Auto Deafen Target disabled", Toasts.Type.MESSAGE);
}

export function isAutoDeafenTargetEnabled(): boolean {
    return autoDeafenTargetState.enabled;
}

export function handleVoiceStateUpdateAutoDeafenTarget(voiceStates: Array<{ userId: string; channelId?: string; guildId?: string; deaf?: boolean; }>): void {
    if (!autoDeafenTargetState.enabled) return;

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
                const realState = VoiceStateStore.getVoiceState(currentState.guildId, currentState.userId);
                if (realState && !realState.deaf) {
                    setServerDeaf(currentState.guildId, currentState.userId, true);
                }
            }
        }
    }
}
