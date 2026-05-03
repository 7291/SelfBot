/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChannelStore, PermissionsBits, PermissionStore, showToast, Toasts, UserStore, VoiceStateStore } from "@webpack/common";

import { isUsingAlternateAccount } from "./accountManagerUtils";
import { setServerMute } from "./discordApiUtils";

// ═══════════════════════════════════════════════════════════════════════════
// AUTO UNMUTE STATE
// ═══════════════════════════════════════════════════════════════════════════

interface AutoUnmuteState {
    enabled: boolean;
    channelId: string | null;
    guildId: string | null;
}

export const autoUnmuteState: AutoUnmuteState = {
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
 * Check if user has permission to mute members in the channel
 */
export function canMuteInChannel(channelId: string): boolean {
    if (isUsingAlternateAccount()) return true;

    const channel = ChannelStore.getChannel(channelId);
    if (!channel) return false;

    return PermissionStore.can(PermissionsBits.MUTE_MEMBERS, channel);
}

/**
 * Get all users in a voice channel (excluding the current user)
 */
export function getOtherUsersInChannel(channelId: string): string[] {
    const currentUserId = UserStore.getCurrentUser()?.id;
    if (!currentUserId) return [];

    const voiceStates = VoiceStateStore.getVoiceStatesForChannel(channelId) as Record<string, { userId: string; mute?: boolean; }>;

    return Object.values(voiceStates)
        .filter(state => state.userId !== currentUserId)
        .map(state => state.userId);
}

/**
 * Unmute a single user (server unmute) - uses alternate account if available
 */
export function unmuteUser(guildId: string, userId: string): void {
    setServerMute(guildId, userId, false);
}

/**
 * Unmute all users in the current voice channel
 */
export function unmuteAllUsersInChannel(): number {
    if (!autoUnmuteState.channelId || !autoUnmuteState.guildId) return 0;

    const userIds = getOtherUsersInChannel(autoUnmuteState.channelId);
    let unmutedCount = 0;

    for (const userId of userIds) {
        const userVoiceState = VoiceStateStore.getVoiceStateForUser(userId);
        if (userVoiceState?.mute) {
            unmuteUser(autoUnmuteState.guildId, userId);
            unmutedCount++;
        }
    }

    return unmutedCount;
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTO UNMUTE CONTROL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Start auto unmute - unmutes all current users and enables monitoring
 */
export function startAutoUnmute(): boolean {
    const vcInfo = getCurrentVoiceChannel();

    if (!vcInfo) {
        showToast("Join a voice channel first!", Toasts.Type.FAILURE);
        return false;
    }

    if (!canMuteInChannel(vcInfo.channelId)) {
        showToast("You don't have permission to unmute members!", Toasts.Type.FAILURE);
        return false;
    }

    // Set state
    autoUnmuteState.enabled = true;
    autoUnmuteState.channelId = vcInfo.channelId;
    autoUnmuteState.guildId = vcInfo.guildId;

    // Unmute all current users
    const unmutedCount = unmuteAllUsersInChannel();

    showToast(`Auto Unmute enabled! Unmuted ${unmutedCount} user(s)`, Toasts.Type.SUCCESS);
    return true;
}

/**
 * Stop auto unmute
 */
export function stopAutoUnmute(): void {
    autoUnmuteState.enabled = false;
    autoUnmuteState.channelId = null;
    autoUnmuteState.guildId = null;

    showToast("Auto Unmute disabled", Toasts.Type.MESSAGE);
}

/**
 * Handle voice state updates - re-unmute anyone who gets muted
 */
export function handleVoiceStateUpdateUnmute(voiceStates: Array<{ userId: string; channelId?: string; mute?: boolean; }>): void {
    if (!autoUnmuteState.enabled || !autoUnmuteState.channelId || !autoUnmuteState.guildId) return;

    const currentUserId = UserStore.getCurrentUser()?.id;
    if (!currentUserId) return;

    for (const state of voiceStates) {
        // Check if current user left the channel
        if (state.userId === currentUserId) {
            if (!state.channelId || state.channelId !== autoUnmuteState.channelId) {
                autoUnmuteState.enabled = false;
                autoUnmuteState.channelId = null;
                autoUnmuteState.guildId = null;
                showToast("Auto Unmute disabled - you left the voice channel", Toasts.Type.FAILURE);
                return;
            }
        }

        // Re-unmute anyone who is muted in our channel
        if (state.channelId === autoUnmuteState.channelId && state.userId !== currentUserId) {
            const userVoiceState = VoiceStateStore.getVoiceStateForUser(state.userId);
            if (userVoiceState?.mute) {
                unmuteUser(autoUnmuteState.guildId, state.userId);
            }
        }

        // Unmute anyone who joins our channel (if they're muted)
        if (state.channelId === autoUnmuteState.channelId && state.userId !== currentUserId) {
            setTimeout(() => {
                if (autoUnmuteState.enabled && autoUnmuteState.guildId) {
                    const userVoiceState = VoiceStateStore.getVoiceStateForUser(state.userId);
                    if (userVoiceState && userVoiceState.channelId === autoUnmuteState.channelId && userVoiceState.mute) {
                        unmuteUser(autoUnmuteState.guildId, state.userId);
                    }
                }
            }, 500);
        }
    }
}

/**
 * Check if auto unmute is currently enabled
 */
export function isAutoUnmuteEnabled(): boolean {
    return autoUnmuteState.enabled;
}

/**
 * Cleanup on plugin stop
 */
export function cleanupUnmute(): void {
    if (autoUnmuteState.enabled) {
        stopAutoUnmute();
    }
}
