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

// ═══════════════════════════════════════════════════════════════════════════
// AUTO PULL STATE
// ═══════════════════════════════════════════════════════════════════════════

interface AutoPullState {
    enabled: boolean;
    currentChannelId: string | null;
    guildId: string | null;
}

export const autoPullState: AutoPullState = {
    enabled: false,
    currentChannelId: null,
    guildId: null
};

// ═══════════════════════════════════════════════════════════════════════════
// LOGIC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Scan for friends with auto-pull enabled and move them to the target channel
 */
export function pullFriendsToChannel(guildId: string, targetChannelId: string): number {
    const friends = settingsManager.getFriends();
    if (friends.length === 0) return 0;

    // Filter for friends who have Auto-Pull enabled
    const autoPullFriendIds = new Set(
        friends
            .filter(f => f.autoPull)
            .map(f => f.id)
    );

    if (autoPullFriendIds.size === 0) return 0;

    // Get ALL voice states for the guild
    const voiceStates = VoiceStateStore.getVoiceStates(guildId);
    if (!voiceStates) return 0;

    let pulledCount = 0;

    // Iterate through all voice states in the guild
    for (const [userId, state] of Object.entries(voiceStates as Record<string, { channelId: string; }>)) {
        // If this user is in our auto-pull list
        if (autoPullFriendIds.has(userId)) {
            // And they are in a voice channel, but NOT the target channel
            if (state.channelId && state.channelId !== targetChannelId) {
                // MOVE THEM! - uses alternate account if available
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

// ═══════════════════════════════════════════════════════════════════════════
// CONTROL
// ═══════════════════════════════════════════════════════════════════════════

export function startAutoPull(): boolean {
    const vcInfo = getCurrentVoiceChannel();
    // note: We don't strictly NEED to be in a VC to enable it, but it makes sense to init state

    autoPullState.enabled = true;
    if (vcInfo) {
        autoPullState.currentChannelId = vcInfo.channelId;
        autoPullState.guildId = vcInfo.guildId;

        // Initial pull on enable
        pullFriendsToChannel(vcInfo.guildId, vcInfo.channelId);
    }

    showToast("Auto Pull enabled", Toasts.Type.SUCCESS);
    return true;
}

export function stopAutoPull(): void {
    autoPullState.enabled = false;
    autoPullState.currentChannelId = null;
    autoPullState.guildId = null;
    showToast("Auto Pull disabled", Toasts.Type.MESSAGE);
}

export function isAutoPullEnabled(): boolean {
    return autoPullState.enabled;
}

/**
 * Handle voice state updates for the CURRENT USER to detect channel switching
 */
export function handleVoiceStateUpdateAutoPull(voiceStates: Array<{ userId: string; channelId?: string; guildId?: string; }>): void {
    if (!autoPullState.enabled) return;

    const currentUserId = UserStore.getCurrentUser()?.id;
    if (!currentUserId) return;

    for (const state of voiceStates) {
        // We only care if the CURRENT USER changed state
        if (state.userId === currentUserId) {

            // If user left voice completely
            if (!state.channelId) {
                autoPullState.currentChannelId = null;
                autoPullState.guildId = null;
                return;
            }

            // If user moved to a NEW channel (or joined one)
            // We verify it's a different channel OR we were not tracking one before
            if (state.channelId !== autoPullState.currentChannelId) {
                // Update state
                autoPullState.currentChannelId = state.channelId;
                // guildId might be in state, or we fetch it
                if (state.guildId) {
                    autoPullState.guildId = state.guildId;
                } else {
                    // Fallback to fetching if missing in event (unlikely for move, but possible)
                    const vcInfo = getCurrentVoiceChannel();
                    if (vcInfo) autoPullState.guildId = vcInfo.guildId;
                }

                if (autoPullState.guildId && autoPullState.currentChannelId) {
                    // TRIGGER THE PULL
                    const count = pullFriendsToChannel(autoPullState.guildId, autoPullState.currentChannelId);
                    if (count > 0) {
                        showToast(`Auto-Pulled ${count} friend(s)`, Toasts.Type.SUCCESS);
                    }
                }
            }
        }
    }
}
