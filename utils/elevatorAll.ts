/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { GuildChannelStore, showToast, Toasts } from "@webpack/common";

import { getCurrentVoiceChannel, getOtherUsersInChannel } from "./autoMuteUtils";
import { setChannel } from "./discordApiUtils";
import { settingsManager } from "./settingsManager";

/**
 * Move all users in the current voice channel to a random voice channel
 */
export function elevatorAll(): void {
    const vcInfo = getCurrentVoiceChannel();
    if (!vcInfo) {
        showToast("Join a voice channel first!", Toasts.Type.FAILURE);
        return;
    }

    const { channelId, guildId } = vcInfo;

    // Get all voice channels in the guild
    const channels = GuildChannelStore.getChannels(guildId);

    // Safety check for VOCAL category
    const vocalChannels = channels && channels.VOCAL
        ? channels.VOCAL.map((item: any) => item.channel)
        : [];

    const validTargets = vocalChannels.filter((c: any) => c.id !== channelId);

    if (validTargets.length === 0) {
        showToast("No other voice channels to move users to!", Toasts.Type.FAILURE);
        return;
    }

    // Shuffle targets to ensure randomness
    for (let i = validTargets.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [validTargets[i], validTargets[j]] = [validTargets[j], validTargets[i]];
    }

    const userIds = getOtherUsersInChannel(channelId);
    let count = 0;

    userIds.forEach((userId, index) => {
        if (settingsManager.isFriend(userId)) return;
        // Cycle through targets if we have more users than channels
        const targetChannel = validTargets[index % validTargets.length];
        setChannel(guildId, userId, targetChannel.id);
        count++;
    });

    showToast(`Elevating ${count} user(s) to different channels`, Toasts.Type.SUCCESS);
}
