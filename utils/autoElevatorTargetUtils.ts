/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { GuildChannelStore, showToast, Toasts, VoiceStateStore } from "@webpack/common";

import { getCurrentVoiceChannel } from "./autoMuteUtils";
import { setChannel } from "./discordApiUtils";
import { settingsManager } from "./settingsManager";

interface AutoElevatorTargetState {
    enabled: boolean;
    intervalId?: any;
}

export const autoElevatorTargetState: AutoElevatorTargetState = {
    enabled: false
};

// Elevators targets in the specified guild (moves them to random channel)
// Note: This function performs a single move. "Auto" implies doing it when they join/move.
// The "Elevator Button" (manual) typically does a loop (iterations). We use targetElevator.ts for that.
// This utility handles the event-driven single move.
export function elevatorTargetUser(guildId: string, userId: string) {
    const channels = GuildChannelStore.getChannels(guildId);
    const vocalChannels = channels && channels.VOCAL
        ? channels.VOCAL.map((item: any) => item.channel)
        : [];

    // We don't necessarily care which channel we are in, just move them to ANY other valid channel
    // But to be annoying, we should probably keep them moving.
    // However, for "Auto Elevator on Join", it usually means "When they join, move them somewhere else".

    // Let's filter out the channel they are currently in if possible, but the event gives us their new channel.
    const userState = VoiceStateStore.getVoiceStateForUser(userId);
    const currentChannelId = userState?.channelId;

    const validChannels = vocalChannels.filter((c: any) => c.id !== currentChannelId);

    if (validChannels.length === 0) return;

    const randomChannel = validChannels[Math.floor(Math.random() * validChannels.length)];
    setChannel(guildId, userId, randomChannel.id);
}

export function startAutoElevatorTarget(): boolean {
    autoElevatorTargetState.enabled = true;
    showToast("Auto Elevator Target enabled", Toasts.Type.SUCCESS);

    const performElevator = () => {
        if (!autoElevatorTargetState.enabled) {
            if (autoElevatorTargetState.intervalId) {
                clearInterval(autoElevatorTargetState.intervalId);
                autoElevatorTargetState.intervalId = undefined;
            }
            return;
        }

        const vcInfo = getCurrentVoiceChannel();
        if (vcInfo) {
            const targets = settingsManager.getTargets();
            const activeTargetIds = new Set(targets.filter(t => t.enabled).map(t => t.id));
            if (activeTargetIds.size === 0) return;

            const voiceStates = VoiceStateStore.getVoiceStates(vcInfo.guildId);
            if (voiceStates) {
                for (const [userId, state] of Object.entries(voiceStates as Record<string, { channelId: string; }>)) {
                    if (activeTargetIds.has(userId) && state.channelId) {
                        elevatorTargetUser(vcInfo.guildId, userId);
                    }
                }
            }
        }
    };

    if (autoElevatorTargetState.intervalId) {
        clearInterval(autoElevatorTargetState.intervalId);
    }

    performElevator();
    autoElevatorTargetState.intervalId = setInterval(performElevator, 1500);

    return true;
}

export function stopAutoElevatorTarget(): void {
    autoElevatorTargetState.enabled = false;
    if (autoElevatorTargetState.intervalId) {
        clearInterval(autoElevatorTargetState.intervalId);
        autoElevatorTargetState.intervalId = undefined;
    }
    showToast("Auto Elevator Target disabled", Toasts.Type.MESSAGE);
}

export function isAutoElevatorTargetEnabled(): boolean {
    return autoElevatorTargetState.enabled;
}

export function handleVoiceStateUpdateAutoElevatorTarget(voiceStates: Array<{ userId: string; channelId?: string; guildId?: string; }>): void {
    if (!autoElevatorTargetState.enabled) return;

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
                setTimeout(() => {
                    if (autoElevatorTargetState.enabled) {
                        elevatorTargetUser(currentState.guildId!, currentState.userId);
                    }
                }, 500);
            }
        }
    }
}
