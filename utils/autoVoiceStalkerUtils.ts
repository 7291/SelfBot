/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChannelActions, showToast, Toasts, UserStore, VoiceStateStore } from "@webpack/common";

import { settingsManager } from "./settingsManager";

/**
 * Handle voice state updates for Voice Stalker
 */
export function handleVoiceStateUpdateVoiceStalker(voiceStates: Array<{ userId: string; channelId?: string; guildId?: string; }>): void {
    const targets = settingsManager.getTargets();
    const stalkerTargets = targets.filter(t => t.enabled && t.voiceStalker);

    if (stalkerTargets.length === 0) return;

    // Safety: If more than one target is enabled for stalking, disable all and warn
    if (stalkerTargets.length > 1) {
        stalkerTargets.forEach(t => {
            settingsManager.toggleTargetVoiceStalker(t.id);
        });
        showToast("Cannot stalk multiple users at once! Voice Stalker disabled for all.", Toasts.Type.FAILURE);
        return;
    }

    const target = stalkerTargets[0];
    const currentUserId = UserStore.getCurrentUser()?.id;
    if (!currentUserId) return;

    for (const state of voiceStates) {
        if (state.userId === target.id) {
            console.log("[VoiceStalker] Target update detected:", state);

            // Target updated voice state
            if (state.channelId) {
                // They are in a channel (or moved to one)
                const myState = VoiceStateStore.getVoiceStateForUser(currentUserId);

                // If I'm already in that channel, do nothing
                if (myState?.channelId === state.channelId) {
                    console.log("[VoiceStalker] Already in same channel");
                    return;
                }

                console.log("[VoiceStalker] Attempting to join channel:", state.channelId);
                // Join the channel
                // We use selectVoiceChannel which handles joining, switching, etc.
                try {
                    ChannelActions.selectVoiceChannel(state.channelId);
                    showToast(`Stalking ${target.username} -> Joining their channel`, Toasts.Type.SUCCESS);
                } catch (err) {
                    console.error("[VoiceStalker] Failed to join:", err);
                    showToast(`Stalking failed: ${err}`, Toasts.Type.FAILURE);
                }
            } else {
                console.log("[VoiceStalker] Target left voice");
            }
        }
    }
}
