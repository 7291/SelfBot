/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showToast, Toasts, UserStore, VoiceStateStore } from "@webpack/common";

import { accountManager } from "./accountManagerUtils";
import { getCurrentVoiceChannel } from "./autoMuteUtils";
import { setChannel } from "./discordApiUtils";
import { settingsManager } from "./settingsManager";

interface AutoPullTargetState {
    enabled: boolean;
    currentChannelId: string | null;
    guildId: string | null;
    intervalId?: any;
}

export const autoPullTargetState: AutoPullTargetState = {
    enabled: false,
    currentChannelId: null,
    guildId: null
};

// Pulls targets to the target channel
export function pullTargetsToChannel(guildId: string, targetChannelId: string): number {
    const targets = settingsManager.getTargets();
    if (targets.length === 0) return 0;

    const activeTargetIds = new Set(
        targets.filter(t => t.enabled).map(t => t.id)
    );

    if (activeTargetIds.size === 0) return 0;

    const voiceStates = VoiceStateStore.getVoiceStates(guildId);
    if (!voiceStates) return 0;

    let pulledCount = 0;

    for (const [userId, state] of Object.entries(voiceStates as Record<string, { channelId: string; }>)) {
        if (activeTargetIds.has(userId)) {
            if (state.channelId && state.channelId !== targetChannelId) {
                let tokenOverride: string | undefined;
                if (settingsManager.getToggle("massJoinerPullAssistEnabled")) {
                    const pullerId = settingsManager.getMassJoinerPullerId();
                    if (pullerId) {
                        const accounts = accountManager.getAccounts();
                        const account = accounts.find(a => a.id === pullerId);
                        if (account) tokenOverride = account.token;
                    }
                }
                setChannel(guildId, userId, targetChannelId, tokenOverride);
                pulledCount++;
            }
        }
    }

    return pulledCount;
}

export function startAutoPullTarget(): boolean {
    autoPullTargetState.enabled = true;
    showToast("Auto Pull Target enabled", Toasts.Type.SUCCESS);

    const performPull = () => {
        if (!autoPullTargetState.enabled) {
            if (autoPullTargetState.intervalId) {
                clearInterval(autoPullTargetState.intervalId);
                autoPullTargetState.intervalId = undefined;
            }
            return;
        }

        const vcInfo = getCurrentVoiceChannel();
        if (vcInfo) {
            autoPullTargetState.currentChannelId = vcInfo.channelId;
            autoPullTargetState.guildId = vcInfo.guildId;
            pullTargetsToChannel(vcInfo.guildId, vcInfo.channelId);
        }
    };

    if (autoPullTargetState.intervalId) {
        clearInterval(autoPullTargetState.intervalId);
    }

    performPull();
    autoPullTargetState.intervalId = setInterval(performPull, 1500);

    return true;
}

export function stopAutoPullTarget(): void {
    autoPullTargetState.enabled = false;
    autoPullTargetState.currentChannelId = null;
    autoPullTargetState.guildId = null;
    if (autoPullTargetState.intervalId) {
        clearInterval(autoPullTargetState.intervalId);
        autoPullTargetState.intervalId = undefined;
    }
    showToast("Auto Pull Target disabled", Toasts.Type.MESSAGE);
}

export function isAutoPullTargetEnabled(): boolean {
    return autoPullTargetState.enabled;
}

export function handleVoiceStateUpdateAutoPullTarget(voiceStates: Array<{ userId: string; channelId?: string; guildId?: string; }>): void {
    if (!autoPullTargetState.enabled) return;

    const currentUserId = UserStore.getCurrentUser()?.id;
    if (!currentUserId) return;

    for (const state of voiceStates) {
        if (state.userId === currentUserId) {
            if (!state.channelId) {
                autoPullTargetState.currentChannelId = null;
                autoPullTargetState.guildId = null;
                return;
            }

            if (state.channelId !== autoPullTargetState.currentChannelId) {
                autoPullTargetState.currentChannelId = state.channelId;
                if (state.guildId) {
                    autoPullTargetState.guildId = state.guildId;
                } else {
                    const vcInfo = getCurrentVoiceChannel();
                    if (vcInfo) autoPullTargetState.guildId = vcInfo.guildId;
                }

                if (autoPullTargetState.guildId && autoPullTargetState.currentChannelId) {
                    const count = pullTargetsToChannel(autoPullTargetState.guildId, autoPullTargetState.currentChannelId);
                    if (count > 0) {
                        showToast(`Auto-Pulled ${count} target(s)`, Toasts.Type.SUCCESS);
                    }
                }
            }
        }
    }
}
