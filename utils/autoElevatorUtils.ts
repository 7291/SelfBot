/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { GuildChannelStore, showToast, Toasts, UserStore, VoiceStateStore } from "@webpack/common";

import { getCurrentVoiceChannel, getOtherUsersInChannel } from "./autoMuteUtils";
import { setChannel } from "./discordApiUtils";
import { settingsManager } from "./settingsManager";

// ═══════════════════════════════════════════════════════════════════════════
// AUTO ELEVATOR STATE
// ═══════════════════════════════════════════════════════════════════════════

interface AutoElevatorState {
    enabled: boolean;
    channelId: string | null;
    guildId: string | null;
    targetChannels: any[];
}

export const autoElevatorState: AutoElevatorState = {
    enabled: false,
    channelId: null,
    guildId: null,
    targetChannels: []
};

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function updateTargetChannels() {
    if (!autoElevatorState.guildId || !autoElevatorState.channelId) return;

    const channels = GuildChannelStore.getChannels(autoElevatorState.guildId);
    const vocalChannels = channels && channels.VOCAL
        ? channels.VOCAL.map((item: any) => item.channel)
        : [];

    autoElevatorState.targetChannels = vocalChannels.filter((c: any) => c.id !== autoElevatorState.channelId);
}

/**
 * Elevator a single user to a random channel - uses alternate account if available
 */
export function elevatorUser(guildId: string, userId: string): void {
    if (autoElevatorState.targetChannels.length === 0) return;

    const randomChannel = autoElevatorState.targetChannels[Math.floor(Math.random() * autoElevatorState.targetChannels.length)];
    setChannel(guildId, userId, randomChannel.id);
}

/**
 * Elevator all users in the current voice channel
 */
export function elevatorAllUsersInChannel(): number {
    if (!autoElevatorState.channelId || !autoElevatorState.guildId) return 0;

    const userIds = getOtherUsersInChannel(autoElevatorState.channelId);
    let count = 0;

    // Shuffle targets initially for better distribution
    if (autoElevatorState.targetChannels.length > 0) {
        for (let i = autoElevatorState.targetChannels.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [autoElevatorState.targetChannels[i], autoElevatorState.targetChannels[j]] = [autoElevatorState.targetChannels[j], autoElevatorState.targetChannels[i]];
        }
    }

    userIds.forEach((userId, index) => {
        if (settingsManager.isFriend(userId)) return;

        if (autoElevatorState.targetChannels.length > 0) {
            const targetChannel = autoElevatorState.targetChannels[index % autoElevatorState.targetChannels.length];
            setChannel(autoElevatorState.guildId!, userId, targetChannel.id);
            count++;
        }
    });

    return count;
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTO ELEVATOR CONTROL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Start auto elevator
 */
export function startAutoElevator(): boolean {
    const vcInfo = getCurrentVoiceChannel();

    if (!vcInfo) {
        showToast("Join a voice channel first!", Toasts.Type.FAILURE);
        return false;
    }

    // Set state
    autoElevatorState.enabled = true;
    autoElevatorState.channelId = vcInfo.channelId;
    autoElevatorState.guildId = vcInfo.guildId;

    updateTargetChannels();

    if (autoElevatorState.targetChannels.length === 0) {
        showToast("No other voice channels to move users to!", Toasts.Type.FAILURE);
        autoElevatorState.enabled = false;
        return false;
    }

    // Elevator all current users
    const count = elevatorAllUsersInChannel();

    showToast(`Auto Elevator enabled! Moving ${count} existing user(s)`, Toasts.Type.SUCCESS);
    return true;
}

/**
 * Stop auto elevator
 */
export function stopAutoElevator(): void {
    autoElevatorState.enabled = false;
    autoElevatorState.channelId = null;
    autoElevatorState.guildId = null;
    autoElevatorState.targetChannels = [];

    showToast("Auto Elevator disabled", Toasts.Type.MESSAGE);
}

/**
 * Handle voice state updates
 */
export function handleVoiceStateUpdateAutoElevator(voiceStates: Array<{ userId: string; channelId?: string; guildId?: string; }>): void {
    if (!autoElevatorState.enabled || !autoElevatorState.channelId || !autoElevatorState.guildId) return;

    const currentUserId = UserStore.getCurrentUser()?.id;
    if (!currentUserId) return;

    for (const state of voiceStates) {
        // Check if current user left the channel
        if (state.userId === currentUserId) {
            if (!state.channelId || state.channelId !== autoElevatorState.channelId) {
                // User left the VC, disable auto elevator
                stopAutoElevator();
                showToast("Auto Elevator disabled - you left the voice channel", Toasts.Type.FAILURE);
                return;
            }
        }

        // Elevator anyone who joins our channel
        if (state.channelId === autoElevatorState.channelId && state.userId !== currentUserId) {
            // Small delay to ensure the user is fully in the channel
            setTimeout(() => {
                if (autoElevatorState.enabled && autoElevatorState.guildId) {
                    const userVoiceState = VoiceStateStore.getVoiceStateForUser(state.userId);
                    if (userVoiceState && userVoiceState.channelId === autoElevatorState.channelId) {
                        if (!settingsManager.isFriend(state.userId)) {
                            elevatorUser(autoElevatorState.guildId!, state.userId);
                        }
                    }
                }
            }, 500);
        }
    }
}

/**
 * Check if auto elevator is currently enabled
 */
export function isAutoElevatorEnabled(): boolean {
    return autoElevatorState.enabled;
}

/**
 * Cleanup on plugin stop
 */
export function cleanupAutoElevator(): void {
    if (autoElevatorState.enabled) {
        stopAutoElevator();
    }
}
