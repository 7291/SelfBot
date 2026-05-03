/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChannelStore, PermissionsBits, PermissionStore, showToast, Toasts, UserStore, VoiceStateStore } from "@webpack/common";

import { isUsingAlternateAccount } from "./accountManagerUtils";
import { setServerDeaf } from "./discordApiUtils";

// ═══════════════════════════════════════════════════════════════════════════
// AUTO UNDEAFEN STATE
// ═══════════════════════════════════════════════════════════════════════════

interface AutoUndeafenState {
    enabled: boolean;
    channelId: string | null;
    guildId: string | null;
}

export const autoUndeafenState: AutoUndeafenState = {
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
    if (!channel?.guild_id) return null;

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
 * Undeafen a single user (server undeafen) - uses alternate account if available
 */
export function undeafenUser(guildId: string, userId: string): void {
    setServerDeaf(guildId, userId, false);
}

/**
 * Undeafen all users in the current voice channel
 */
export function undeafenAllUsersInChannel(): number {
    if (!autoUndeafenState.channelId || !autoUndeafenState.guildId) return 0;

    const userIds = getOtherUsersInChannel(autoUndeafenState.channelId);
    let undeafenedCount = 0;

    for (const userId of userIds) {
        const userVoiceState = VoiceStateStore.getVoiceStateForUser(userId);
        if (userVoiceState?.deaf) {
            undeafenUser(autoUndeafenState.guildId, userId);
            undeafenedCount++;
        }
    }

    return undeafenedCount;
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTO UNDEAFEN CONTROL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Start auto undeafen - undeafens all current users and enables monitoring
 */
export function startAutoUndeafen(): boolean {
    const vcInfo = getCurrentVoiceChannel();

    if (!vcInfo) {
        showToast("Join a voice channel first!", Toasts.Type.FAILURE);
        return false;
    }

    if (!canDeafenInChannel(vcInfo.channelId)) {
        showToast("You don't have permission to undeafen members!", Toasts.Type.FAILURE);
        return false;
    }

    // Set state
    autoUndeafenState.enabled = true;
    autoUndeafenState.channelId = vcInfo.channelId;
    autoUndeafenState.guildId = vcInfo.guildId;

    // Undeafen all current users
    const undeafenedCount = undeafenAllUsersInChannel();

    showToast(`Auto Undeafen enabled! Undeafened ${undeafenedCount} user(s)`, Toasts.Type.SUCCESS);
    return true;
}

/**
 * Stop auto undeafen
 */
export function stopAutoUndeafen(): void {
    autoUndeafenState.enabled = false;
    autoUndeafenState.channelId = null;
    autoUndeafenState.guildId = null;

    showToast("Auto Undeafen disabled", Toasts.Type.MESSAGE);
}

/**
 * Handle voice state updates - re-undeafen anyone who gets deafened
 */
export function handleVoiceStateUpdateUndeafen(voiceStates: Array<{ userId: string; channelId?: string; deaf?: boolean; }>): void {
    if (!autoUndeafenState.enabled || !autoUndeafenState.channelId || !autoUndeafenState.guildId) return;

    const currentUserId = UserStore.getCurrentUser()?.id;
    if (!currentUserId) return;

    for (const state of voiceStates) {
        // Check if current user left the channel
        if (state.userId === currentUserId) {
            if (!state.channelId || state.channelId !== autoUndeafenState.channelId) {
                autoUndeafenState.enabled = false;
                autoUndeafenState.channelId = null;
                autoUndeafenState.guildId = null;
                showToast("Auto Undeafen disabled - you left the voice channel", Toasts.Type.FAILURE);
                return;
            }
        }

        // Re-undeafen anyone who is deafened in our channel
        if (state.channelId === autoUndeafenState.channelId && state.userId !== currentUserId) {
            const userVoiceState = VoiceStateStore.getVoiceStateForUser(state.userId);
            if (userVoiceState?.deaf) {
                undeafenUser(autoUndeafenState.guildId, state.userId);
            }
        }

        // Undeafen anyone who joins our channel (if they're deafened)
        if (state.channelId === autoUndeafenState.channelId && state.userId !== currentUserId) {
            setTimeout(() => {
                if (autoUndeafenState.enabled && autoUndeafenState.guildId) {
                    const userVoiceState = VoiceStateStore.getVoiceStateForUser(state.userId);
                    if (userVoiceState && userVoiceState.channelId === autoUndeafenState.channelId && userVoiceState.deaf) {
                        undeafenUser(autoUndeafenState.guildId, state.userId);
                    }
                }
            }, 500);
        }
    }
}

/**
 * Check if auto undeafen is currently enabled
 */
export function isAutoUndeafenEnabled(): boolean {
    return autoUndeafenState.enabled;
}

/**
 * Cleanup on plugin stop
 */
export function cleanupUndeafen(): void {
    if (autoUndeafenState.enabled) {
        stopAutoUndeafen();
    }
}
