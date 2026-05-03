/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChannelStore, PermissionsBits, PermissionStore, showToast, Toasts, UserStore, VoiceStateStore } from "@webpack/common";

import { isUsingAlternateAccount } from "./accountManagerUtils";
import { setServerDeaf } from "./discordApiUtils";
import { settingsManager } from "./settingsManager";

// ═══════════════════════════════════════════════════════════════════════════
// AUTO DEAFEN STATE
// ═══════════════════════════════════════════════════════════════════════════

interface AutoDeafenState {
    enabled: boolean;
    channelId: string | null;
    guildId: string | null;
}

export const autoDeafenState: AutoDeafenState = {
    enabled: false,
    channelId: null,
    guildId: null
};

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the current user's voice channel info
 */
export function getCurrentVoiceChannel(): { channelId: string; guildId: string; } | null {
    const userId = UserStore.getCurrentUser()?.id;
    if (!userId) return null;

    const voiceState = VoiceStateStore.getVoiceStateForUser(userId);
    if (!voiceState?.channelId) return null;

    const channel = ChannelStore.getChannel(voiceState.channelId);
    if (!channel?.guild_id) return null; // DM calls don't have server deafen

    return {
        channelId: voiceState.channelId,
        guildId: channel.guild_id
    };
}

/**
 * Check if user has permission to deafen members in the channel
 */
export function canDeafenInChannel(channelId: string): boolean {
    if (isUsingAlternateAccount()) return true;

    const channel = ChannelStore.getChannel(channelId);
    if (!channel) return false;

    return PermissionStore.can(PermissionsBits.DEAFEN_MEMBERS, channel);
}

/**
 * Get all users in a voice channel (excluding the current user)
 */
export function getOtherUsersInChannel(channelId: string): string[] {
    const currentUserId = UserStore.getCurrentUser()?.id;
    if (!currentUserId) return [];

    const voiceStates = VoiceStateStore.getVoiceStatesForChannel(channelId) as Record<string, { userId: string; deaf?: boolean; }>;

    return Object.values(voiceStates)
        .filter(state => state.userId !== currentUserId)
        .map(state => state.userId);
}

/**
 * Deafen a single user (server deafen) - uses alternate account if available
 */
export function deafenUser(guildId: string, userId: string): void {
    setServerDeaf(guildId, userId, true);
}

/**
 * Deafen all users in the current voice channel
 */
export function deafenAllUsersInChannel(): number {
    if (!autoDeafenState.channelId || !autoDeafenState.guildId) return 0;

    const userIds = getOtherUsersInChannel(autoDeafenState.channelId);

    for (const userId of userIds) {
        if (settingsManager.isFriend(userId)) continue;
        deafenUser(autoDeafenState.guildId, userId);
    }

    return userIds.length;
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTO DEAFEN CONTROL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Start auto deafen - deafens all current users and enables monitoring
 */
export function startAutoDeafen(): boolean {
    const vcInfo = getCurrentVoiceChannel();

    if (!vcInfo) {
        showToast("Join a voice channel first!", Toasts.Type.FAILURE);
        return false;
    }

    if (!canDeafenInChannel(vcInfo.channelId)) {
        showToast("You don't have permission to deafen members!", Toasts.Type.FAILURE);
        return false;
    }

    // Set state
    autoDeafenState.enabled = true;
    autoDeafenState.channelId = vcInfo.channelId;
    autoDeafenState.guildId = vcInfo.guildId;

    // Deafen all current users
    const deafenedCount = deafenAllUsersInChannel();

    showToast(`Auto Deafen enabled! Deafened ${deafenedCount} user(s)`, Toasts.Type.SUCCESS);
    return true;
}

/**
 * Stop auto deafen
 */
export function stopAutoDeafen(): void {
    autoDeafenState.enabled = false;
    autoDeafenState.channelId = null;
    autoDeafenState.guildId = null;

    showToast("Auto Deafen disabled", Toasts.Type.MESSAGE);
}

/**
 * Handle voice state updates - re-deafen anyone who gets undeafened
 */
export function handleVoiceStateUpdateDeafen(voiceStates: Array<{ userId: string; channelId?: string; deaf?: boolean; }>): void {
    if (!autoDeafenState.enabled || !autoDeafenState.channelId || !autoDeafenState.guildId) return;

    const currentUserId = UserStore.getCurrentUser()?.id;
    if (!currentUserId) return;

    for (const state of voiceStates) {
        // Check if current user left the channel
        if (state.userId === currentUserId) {
            if (!state.channelId || state.channelId !== autoDeafenState.channelId) {
                // User left the VC, disable auto deafen
                autoDeafenState.enabled = false;
                autoDeafenState.channelId = null;
                autoDeafenState.guildId = null;
                showToast("Auto Deafen disabled - you left the voice channel", Toasts.Type.FAILURE);
                return;
            }
        }

        // Re-deafen anyone who is undeafened in our channel
        if (state.channelId === autoDeafenState.channelId && state.userId !== currentUserId) {
            // Check if user is not deafened and Not a friend
            const userVoiceState = VoiceStateStore.getVoiceStateForUser(state.userId);
            if (userVoiceState && !userVoiceState.deaf) {
                if (!settingsManager.isFriend(state.userId)) {
                    deafenUser(autoDeafenState.guildId, state.userId);
                }
            }
        }

        // Deafen anyone who joins our channel
        if (state.channelId === autoDeafenState.channelId && state.userId !== currentUserId) {
            // Small delay to ensure the user is fully in the channel
            setTimeout(() => {
                if (autoDeafenState.enabled && autoDeafenState.guildId) {
                    const userVoiceState = VoiceStateStore.getVoiceStateForUser(state.userId);
                    if (userVoiceState && userVoiceState.channelId === autoDeafenState.channelId && !userVoiceState.deaf) {
                        if (!settingsManager.isFriend(state.userId)) {
                            deafenUser(autoDeafenState.guildId, state.userId);
                        }
                    }
                }
            }, 500);
        }
    }
}

/**
 * Check if auto deafen is currently enabled
 */
export function isAutoDeafenEnabled(): boolean {
    return autoDeafenState.enabled;
}

/**
 * Cleanup on plugin stop
 */
export function cleanupDeafen(): void {
    if (autoDeafenState.enabled) {
        stopAutoDeafen();
    }
}
