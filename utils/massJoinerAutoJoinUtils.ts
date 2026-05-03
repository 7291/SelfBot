/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { UserStore } from "@webpack/common";

import { companionClient } from "./companionClient";
import { massJoiner } from "./massJoinerUtils";
import { settingsManager } from "./settingsManager";

/**
 * Handles voice state updates to trigger Mass Joiner Auto Join.
 * If the current user moves voice channels and "Auto Join" is enabled,
 * all connected accounts will follow.
 */
export function handleVoiceStateUpdateMassJoiner(voiceStates: any[]) {
    // Check if Auto Join is enabled
    if (!settingsManager.getToggle("massJoinerAutoJoin")) return;

    const currentUserId = UserStore.getCurrentUser()?.id;
    if (!currentUserId) return;

    for (const state of voiceStates) {
        // We only care about the current user's movement
        if (state.userId === currentUserId) {

            // If channelId is null, they disconnected (we do nothing, or maybe disconnect? User usually wants to keep bots in)
            // Request said "follow the user", usually implies joining where they go.
            // If user leaves, bots staying is standard selfbot behavior unless specified.
            // User request: "when is in auto join all connected accounts must follow the user"

            const newChannelId = state.channelId;
            const { guildId } = state;

            if (newChannelId && guildId) {
                console.log("[MassJoiner] User moved to", newChannelId, " - Auto Joining accounts...");

                // 1. Move Local Accounts
                // We typically use `connectAllAccounts`. It handles "already connected" by moving them if needed (connectAccount logic).
                // But `connectAccount` checks connection status. If already connected, does it move?
                // Looking at `massJoinerUtils.ts`, `connectAccount` sends Op 4. Sending Op 4 again allows moving channels.
                // So calling `connectAllAccounts` on ALREADY connected accounts should move them.

                const localAccounts = massJoiner.getConnectedAccounts().map(c => c.account);
                if (localAccounts.length > 0) {
                    massJoiner.connectAllAccounts(localAccounts, guildId, newChannelId);
                }

                // 2. Move Companion Accounts
                // If we are connected to companion, we should send a join command for ALL known tokens?
                // Companion client doesn't track "connected accounts" as a list, it just knows count.
                // However, `joinVoice` takes a list of tokens.
                // If we just want to "move all currently connected", we might need a "move_all" opcode or just re-send "connect_all".
                // `companionClient.joinVoice` sends `connect_voice` with tokens.
                // Limitation: We don't know EXACTLY which tokens are connected on Companion side unless we track them.
                // But usually we just send ALL enabled tokens from our list.

                if (companionClient.isConnected()) {
                    // We need the list of accounts that SHOULD be connected.
                    // Or we can just send the "move" command if we update the server to support it?
                    // Existing `joinVoice` (op: connect_voice) connects specific tokens.
                    // If we pass all our "selected" or "known" accounts, it might reconnect ones that were disconnected.
                    // Ideally we only move those that are online.
                    // But "Auto Join" usually implies "Ensure these accounts are in my channel".
                    // So taking all accounts that *we think* are active is best.

                    const allAccounts = settingsManager.getAccounts(); // Or `accountManager.getAccounts()`
                    // We probably only want to move the ones that were "activated".
                    // Mass Joiner Page tracks "selectedIds". But here we are in a background util.
                    // We don't know which ones were "active".
                    // However, for Local Mass Joiner we use `getConnectedAccounts()`.
                    // For Companion, we can blindly send `joinVoice` for ALL accounts if the user wants "Auto Join".
                    // Or we can try to be smart.
                    // Let's assume the user wants ALL their accounts in the list to be there if they enable Auto Join.
                    // OR we can rely on the user having selected them previously? No, state is lost on reload.
                    // Let's use `accountManager.getAccounts()` and filter out the user.

                    const accountsToMove = allAccounts.filter(a => a.id !== currentUserId);
                    if (accountsToMove.length > 0) {
                        const tokens = accountsToMove.map(a => a.token).filter(t => !!t) as string[];
                        companionClient.joinVoice(tokens, guildId, newChannelId);
                    }
                }
            }
            // Break after handling current user (only one update per event usually)
            break;
        }
    }
}
