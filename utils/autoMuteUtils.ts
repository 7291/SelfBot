/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChannelStore, PermissionsBits, PermissionStore, SelectedChannelStore, showToast, Toasts, UserStore, VoiceStateStore } from "@webpack/common";

import { isUsingAlternateAccount } from "./accountManagerUtils";
import { setServerMute } from "./discordApiUtils";
import { settingsManager } from "./settingsManager";

// ═══════════════════════════════════════════════════════════════════════════
// AUTO MUTE STATE
// ═══════════════════════════════════════════════════════════════════════════

interface AutoMuteState {
    enabled: boolean;
    channelId: string | null;
    guildId: string | null;
}

export const autoMuteState: AutoMuteState = {
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

    let channelId = SelectedChannelStore.getVoiceChannelId();
    if (!channelId) {
        const voiceState = VoiceStateStore.getVoiceStateForUser(userId);
        channelId = voiceState?.channelId;
    }

    if (!channelId) return null;

    const channel = ChannelStore.getChannel(channelId);
    if (!channel?.guild_id) return null; // DM calls don't have server mute

    return {
        channelId: channelId,
        guildId: channel.guild_id
    };
}

/**
 * Get current voice channel info (Relaxed - works for DMs too)
 */
export function getCurrentVoiceChannelInfo(): { channelId: string; guildId?: string; } | null {
    const userId = UserStore.getCurrentUser()?.id;
    if (!userId) return null;

    let channelId = SelectedChannelStore.getVoiceChannelId();
    if (!channelId) {
        const voiceState = VoiceStateStore.getVoiceStateForUser(userId);
        channelId = voiceState?.channelId;
    }

    if (!channelId) return null;

    const channel = ChannelStore.getChannel(channelId);

    return {
        channelId: channelId,
        guildId: channel?.guild_id
    };
}

/**
 * Check if user has permission to mute members in the channel
 */
export function canMuteInChannel(channelId: string): boolean {
    // If using an alternate account, we assume it has permissions (logic handled by the user/proxy)
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
 * Mute a single user (server mute) - uses alternate account if available
 */
export function muteUser(guildId: string, userId: string): void {
    setServerMute(guildId, userId, true);
}

/**
 * Mute all users in the current voice channel
 */
export function muteAllUsersInChannel(): number {
    if (!autoMuteState.channelId || !autoMuteState.guildId) return 0;

    const userIds = getOtherUsersInChannel(autoMuteState.channelId);

    for (const userId of userIds) {
        if (settingsManager.isFriend(userId)) continue;
        muteUser(autoMuteState.guildId, userId);
    }

    return userIds.length;
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTO MUTE CONTROL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Start auto mute - mutes all current users and enables monitoring
 */
export function startAutoMute(): boolean {
    const vcInfo = getCurrentVoiceChannel();

    if (!vcInfo) {
        showToast("Join a voice channel first!", Toasts.Type.FAILURE);
        return false;
    }

    if (!canMuteInChannel(vcInfo.channelId)) {
        showToast("You don't have permission to mute members!", Toasts.Type.FAILURE);
        return false;
    }

    // Set state
    autoMuteState.enabled = true;
    autoMuteState.channelId = vcInfo.channelId;
    autoMuteState.guildId = vcInfo.guildId;

    // Mute all current users
    const mutedCount = muteAllUsersInChannel();

    showToast(`Auto Mute enabled! Muted ${mutedCount} user(s)`, Toasts.Type.SUCCESS);
    return true;
}

/**
 * Stop auto mute
 */
export function stopAutoMute(): void {
    autoMuteState.enabled = false;
    autoMuteState.channelId = null;
    autoMuteState.guildId = null;

    showToast("Auto Mute disabled", Toasts.Type.MESSAGE);
}

/**
 * Handle voice state updates - re-mute anyone who gets unmuted
 */
export function handleVoiceStateUpdate(voiceStates: Array<{ userId: string; channelId?: string; mute?: boolean; }>): void {
    if (!autoMuteState.enabled || !autoMuteState.channelId || !autoMuteState.guildId) return;

    const currentUserId = UserStore.getCurrentUser()?.id;
    if (!currentUserId) return;

    for (const state of voiceStates) {
        // Check if current user left the channel
        if (state.userId === currentUserId) {
            if (!state.channelId || state.channelId !== autoMuteState.channelId) {
                // User left the VC, disable auto mute
                autoMuteState.enabled = false;
                autoMuteState.channelId = null;
                autoMuteState.guildId = null;
                showToast("Auto Mute disabled - you left the voice channel", Toasts.Type.FAILURE);
                return;
            }
        }

        // Re-mute anyone who is unmuted in our channel
        if (state.channelId === autoMuteState.channelId && state.userId !== currentUserId) {
            // Check if user is not muted and Not a friend
            const userVoiceState = VoiceStateStore.getVoiceStateForUser(state.userId);
            if (userVoiceState && !userVoiceState.mute) {
                if (!settingsManager.isFriend(state.userId)) {
                    muteUser(autoMuteState.guildId, state.userId);
                }
            }
        }

        // Mute anyone who joins our channel
        if (state.channelId === autoMuteState.channelId && state.userId !== currentUserId) {
            // Small delay to ensure the user is fully in the channel
            setTimeout(() => {
                if (autoMuteState.enabled && autoMuteState.guildId) {
                    const userVoiceState = VoiceStateStore.getVoiceStateForUser(state.userId);
                    if (userVoiceState && userVoiceState.channelId === autoMuteState.channelId && !userVoiceState.mute) {
                        if (!settingsManager.isFriend(state.userId)) {
                            muteUser(autoMuteState.guildId, state.userId);
                        }
                    }
                }
            }, 500);
        }
    }
}

/**
 * Check if auto mute is currently enabled
 */
export function isAutoMuteEnabled(): boolean {
    return autoMuteState.enabled;
}

/**
 * Cleanup on plugin stop
 */
export function cleanup(): void {
    if (autoMuteState.enabled) {
        stopAutoMute();
    }
}
