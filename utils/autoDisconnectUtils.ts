/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showToast, Toasts, UserStore, VoiceStateStore } from "@webpack/common";

import { getCurrentVoiceChannel, getOtherUsersInChannel } from "./autoMuteUtils";
import { setChannel } from "./discordApiUtils";
import { settingsManager } from "./settingsManager";

// ═══════════════════════════════════════════════════════════════════════════
// AUTO DISCONNECT STATE
// ═══════════════════════════════════════════════════════════════════════════

interface AutoDisconnectState {
    enabled: boolean;
    channelId: string | null;
    guildId: string | null;
}

export const autoDisconnectState: AutoDisconnectState = {
    enabled: false,
    channelId: null,
    guildId: null
};

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Disconnect a single user - uses alternate account if available
 */
export function disconnectUser(guildId: string, userId: string): void {
    setChannel(guildId, userId, null);
}

/**
 * Disconnect all users in the current voice channel
 */
export function disconnectAllUsersInChannel(): number {
    if (!autoDisconnectState.channelId || !autoDisconnectState.guildId) return 0;

    const userIds = getOtherUsersInChannel(autoDisconnectState.channelId);
    let count = 0;

    for (const userId of userIds) {
        if (settingsManager.isFriend(userId)) continue;
        disconnectUser(autoDisconnectState.guildId, userId);
        count++;
    }

    return count;
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTO DISCONNECT CONTROL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Start auto disconnect
 */
export function startAutoDisconnect(): boolean {
    const vcInfo = getCurrentVoiceChannel();

    if (!vcInfo) {
        showToast("Join a voice channel first!", Toasts.Type.FAILURE);
        return false;
    }

    // Set state
    autoDisconnectState.enabled = true;
    autoDisconnectState.channelId = vcInfo.channelId;
    autoDisconnectState.guildId = vcInfo.guildId;

    // Disconnect all current users
    const count = disconnectAllUsersInChannel();

    showToast(`Auto Disconnect enabled! Disconnected ${count} user(s)`, Toasts.Type.SUCCESS);
    return true;
}

/**
 * Stop auto disconnect
 */
export function stopAutoDisconnect(): void {
    autoDisconnectState.enabled = false;
    autoDisconnectState.channelId = null;
    autoDisconnectState.guildId = null;

    showToast("Auto Disconnect disabled", Toasts.Type.MESSAGE);
}

/**
 * Handle voice state updates
 */
export function handleVoiceStateUpdateAutoDisconnect(voiceStates: Array<{ userId: string; channelId?: string; guildId?: string; }>): void {
    if (!autoDisconnectState.enabled || !autoDisconnectState.channelId || !autoDisconnectState.guildId) return;

    const currentUserId = UserStore.getCurrentUser()?.id;
    if (!currentUserId) return;

    for (const state of voiceStates) {
        // Check if current user left the channel
        if (state.userId === currentUserId) {
            if (!state.channelId || state.channelId !== autoDisconnectState.channelId) {
                // User left the VC, disable auto disconnect
                stopAutoDisconnect();
                showToast("Auto Disconnect disabled - you left the voice channel", Toasts.Type.FAILURE);
                return;
            }
        }

        // Disconnect anyone who joins our channel
        if (state.channelId === autoDisconnectState.channelId && state.userId !== currentUserId) {
            // Small delay to ensure the user is fully in the channel
            setTimeout(() => {
                if (autoDisconnectState.enabled && autoDisconnectState.guildId) {
                    const userVoiceState = VoiceStateStore.getVoiceStateForUser(state.userId);
                    if (userVoiceState && userVoiceState.channelId === autoDisconnectState.channelId) {
                        if (!settingsManager.isFriend(state.userId)) {
                            disconnectUser(autoDisconnectState.guildId!, state.userId);
                        }
                    }
                }
            }, 500);
        }
    }
}

/**
 * Check if auto disconnect is currently enabled
 */
export function isAutoDisconnectEnabled(): boolean {
    return autoDisconnectState.enabled;
}

/**
 * Cleanup on plugin stop
 */
export function cleanupAutoDisconnect(): void {
    if (autoDisconnectState.enabled) {
        stopAutoDisconnect();
    }
}
