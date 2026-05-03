/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { GuildChannelStore, showToast, Toasts, VoiceStateStore } from "@webpack/common";

import { getCurrentVoiceChannel } from "./autoMuteUtils";
import { setChannel } from "./discordApiUtils";
import { settingsManager } from "./settingsManager";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function targetElevator(iterations: number): Promise<void> {
    const vcInfo = getCurrentVoiceChannel();
    if (!vcInfo) {
        showToast("Join a voice channel first!", Toasts.Type.FAILURE);
        return;
    }

    const { guildId } = vcInfo;

    const targets = settingsManager.getTargets();
    if (targets.length === 0) {
        showToast("No targets added!", Toasts.Type.FAILURE);
        return;
    }

    const activeTargetIds = new Set(
        targets.filter(t => t.enabled).map(t => t.id)
    );

    if (activeTargetIds.size === 0) {
        showToast("No active targets!", Toasts.Type.FAILURE);
        return;
    }

    // Get active targets who are currently in voice in THIS guild
    const voiceStates = VoiceStateStore.getVoiceStates(guildId);
    const availabletargetIds: string[] = [];

    for (const [userId, state] of Object.entries(voiceStates as Record<string, { channelId: string; }>)) {
        if (activeTargetIds.has(userId) && state.channelId) {
            availabletargetIds.push(userId);
        }
    }

    if (availabletargetIds.length === 0) {
        showToast("No active targets found in voice channels!", Toasts.Type.FAILURE);
        return;
    }

    // Get all voice channels
    const channels = GuildChannelStore.getChannels(guildId);
    const vocalChannels = channels && channels.VOCAL
        ? channels.VOCAL.map((item: any) => item.channel)
        : [];

    const validChannels = vocalChannels.filter((c: any) => c.id !== vcInfo.channelId);

    if (validChannels.length === 0) {
        showToast("No other voice channels to elevator to!", Toasts.Type.FAILURE);
        return;
    }

    showToast(`Starting Elevator on ${availabletargetIds.length} targets for ${iterations} loops...`, Toasts.Type.SUCCESS);

    for (let i = 0; i < iterations; i++) {
        for (const userId of availabletargetIds) {
            // Pick a random channel
            const randomChannel = validChannels[Math.floor(Math.random() * validChannels.length)];
            setChannel(guildId, userId, randomChannel.id);
            // Small delay to avoid severe rate limits and make it actually work
            await sleep(150);
        }
        await sleep(500); // Delay between loops
    }

    showToast("Target Elevator completed!", Toasts.Type.SUCCESS);
}
