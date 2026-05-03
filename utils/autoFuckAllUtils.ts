/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChannelStore, GuildActions, GuildChannelStore, PermissionsBits, PermissionStore, showToast, Toasts, UserStore, VoiceStateStore } from "@webpack/common";

import { getCurrentVoiceChannel, getOtherUsersInChannel } from "./autoMuteUtils";
import { settingsManager } from "./settingsManager";

// ═══════════════════════════════════════════════════════════════════════════
// AUTO FUCK ALL STATE
// ═══════════════════════════════════════════════════════════════════════════

interface AutoFuckAllState {
    enabled: boolean;
    channelId: string | null;
    guildId: string | null;
    targetChannels: any[];
    permissions: {
        canMute: boolean;
        canDeafen: boolean;
        canMove: boolean;
    };
}

export const autoFuckAllState: AutoFuckAllState = {
    enabled: false,
    channelId: null,
    guildId: null,
    targetChannels: [],
    permissions: {
        canMute: false,
        canDeafen: false,
        canMove: false
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function updateContext() {
    if (!autoFuckAllState.channelId || !autoFuckAllState.guildId) return;

    const channel = ChannelStore.getChannel(autoFuckAllState.channelId);
    if (!channel) return;

    // Update permissions
    autoFuckAllState.permissions.canMute = PermissionStore.can(PermissionsBits.MUTE_MEMBERS, channel);
    autoFuckAllState.permissions.canDeafen = PermissionStore.can(PermissionsBits.DEAFEN_MEMBERS, channel);
    autoFuckAllState.permissions.canMove = PermissionStore.can(PermissionsBits.MOVE_MEMBERS, channel);

    // Update target channels for elevator
    const channels = GuildChannelStore.getChannels(autoFuckAllState.guildId);
    const vocalChannels = channels && channels.VOCAL
        ? channels.VOCAL.map((item: any) => item.channel)
        : [];

    autoFuckAllState.targetChannels = vocalChannels.filter((c: any) => c.id !== autoFuckAllState.channelId);
}

/**
 * Fuck a single user (Mute, Deafen, Move)
 */
export function fuckUser(guildId: string, userId: string): void {
    const { canMute, canDeafen, canMove } = autoFuckAllState.permissions;

    if (canMute) GuildActions.setServerMute(guildId, userId, true);
    if (canDeafen) GuildActions.setServerDeaf(guildId, userId, true);

    if (canMove && autoFuckAllState.targetChannels.length > 0) {
        const randomChannel = autoFuckAllState.targetChannels[Math.floor(Math.random() * autoFuckAllState.targetChannels.length)];
        GuildActions.setChannel(guildId, userId, randomChannel.id);
    }
}

/**
 * Fuck all users in the current voice channel
 */
export function fuckAllUsersInChannel(): number {
    if (!autoFuckAllState.channelId || !autoFuckAllState.guildId) return 0;

    const userIds = getOtherUsersInChannel(autoFuckAllState.channelId);
    let count = 0;

    // Shuffle targets
    if (autoFuckAllState.targetChannels.length > 0) {
        for (let i = autoFuckAllState.targetChannels.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [autoFuckAllState.targetChannels[i], autoFuckAllState.targetChannels[j]] = [autoFuckAllState.targetChannels[j], autoFuckAllState.targetChannels[i]];
        }
    }

    userIds.forEach((userId, index) => {
        if (settingsManager.isFriend(userId)) return;

        const { canMute, canDeafen, canMove } = autoFuckAllState.permissions;

        if (canMute) GuildActions.setServerMute(autoFuckAllState.guildId!, userId, true);
        if (canDeafen) GuildActions.setServerDeaf(autoFuckAllState.guildId!, userId, true);

        if (canMove && autoFuckAllState.targetChannels.length > 0) {
            const targetChannel = autoFuckAllState.targetChannels[index % autoFuckAllState.targetChannels.length];
            GuildActions.setChannel(autoFuckAllState.guildId!, userId, targetChannel.id);
        }

        count++;
    });

    return count;
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTO FUCK ALL CONTROL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Start auto fuck all
 */
export function startAutoFuckAll(): boolean {
    const vcInfo = getCurrentVoiceChannel();

    if (!vcInfo) {
        showToast("Join a voice channel first!", Toasts.Type.FAILURE);
        return false;
    }

    // Set state
    autoFuckAllState.enabled = true;
    autoFuckAllState.channelId = vcInfo.channelId;
    autoFuckAllState.guildId = vcInfo.guildId;

    updateContext();

    const { canMute, canDeafen, canMove } = autoFuckAllState.permissions;
    if (!canMute && !canDeafen && !canMove) {
        showToast("You don't have permissions to Fuck All (Mute, Deafen, or Move)!", Toasts.Type.FAILURE);
        autoFuckAllState.enabled = false;
        return false;
    }

    // Fuck all current users
    const count = fuckAllUsersInChannel();

    showToast(`Auto Fuck All enabled! Attacked ${count} existing user(s)`, Toasts.Type.SUCCESS);
    return true;
}

/**
 * Stop auto fuck all
 */
export function stopAutoFuckAll(): void {
    autoFuckAllState.enabled = false;
    autoFuckAllState.channelId = null;
    autoFuckAllState.guildId = null;
    autoFuckAllState.targetChannels = [];

    showToast("Auto Fuck All disabled", Toasts.Type.MESSAGE);
}

/**
 * Handle voice state updates
 */
export function handleVoiceStateUpdateAutoFuckAll(voiceStates: Array<{ userId: string; channelId?: string; guildId?: string; }>): void {
    if (!autoFuckAllState.enabled || !autoFuckAllState.channelId || !autoFuckAllState.guildId) return;

    const currentUserId = UserStore.getCurrentUser()?.id;
    if (!currentUserId) return;

    for (const state of voiceStates) {
        // Check if current user left the channel
        if (state.userId === currentUserId) {
            if (!state.channelId || state.channelId !== autoFuckAllState.channelId) {
                // User left the VC, disable
                stopAutoFuckAll();
                showToast("Auto Fuck All disabled - you left the voice channel", Toasts.Type.FAILURE);
                return;
            }
        }

        // Attack anyone who joins our channel
        if (state.channelId === autoFuckAllState.channelId && state.userId !== currentUserId) {
            // Small delay to ensure the user is fully in the channel
            setTimeout(() => {
                if (autoFuckAllState.enabled && autoFuckAllState.guildId) {
                    const userVoiceState = VoiceStateStore.getVoiceStateForUser(state.userId);
                    if (userVoiceState && userVoiceState.channelId === autoFuckAllState.channelId) {
                        if (!settingsManager.isFriend(state.userId)) {
                            fuckUser(autoFuckAllState.guildId!, state.userId);
                        }
                    }
                }
            }, 500);
        }
    }
}

/**
 * Check if auto fuck all is currently enabled
 */
export function isAutoFuckAllEnabled(): boolean {
    return autoFuckAllState.enabled;
}

/**
 * Cleanup on plugin stop
 */
export function cleanupAutoFuckAll(): void {
    if (autoFuckAllState.enabled) {
        stopAutoFuckAll();
    }
}
