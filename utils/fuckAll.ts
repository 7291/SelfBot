/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChannelStore, GuildChannelStore, PermissionsBits, PermissionStore, showToast, Toasts } from "@webpack/common";

import { isUsingAlternateAccount } from "./accountManagerUtils";
import { getCurrentVoiceChannel, getOtherUsersInChannel } from "./autoMuteUtils";
import { setChannel, setServerDeaf, setServerMute } from "./discordApiUtils";
import { settingsManager } from "./settingsManager";

/**
 * Mute, Deafen, and Elevator each user sequentially to avoid rate limits
 */
export function fuckAll(): void {
    const vcInfo = getCurrentVoiceChannel();
    if (!vcInfo) {
        showToast("Join a voice channel first!", Toasts.Type.FAILURE);
        return;
    }

    const { channelId, guildId } = vcInfo;
    const channel = ChannelStore.getChannel(channelId);

    // Initial Permission Checks
    if (!channel) return;

    // Check Mute/Deafen perms - we'll just check if we have them generally in the channel
    const useAlt = isUsingAlternateAccount();
    const canMute = useAlt || PermissionStore.can(PermissionsBits.MUTE_MEMBERS, channel);
    const canDeafen = useAlt || PermissionStore.can(PermissionsBits.DEAFEN_MEMBERS, channel);
    const canMove = useAlt || PermissionStore.can(PermissionsBits.MOVE_MEMBERS, channel);

    if (!canMute && !canDeafen && !canMove) {
        showToast("You don't have permissions to Fuck All (Mute, Deafen, or Move)!", Toasts.Type.FAILURE);
        return;
    }

    // Prepare Elevator Targets
    const channels = GuildChannelStore.getChannels(guildId);
    const vocalChannels = channels && channels.VOCAL
        ? channels.VOCAL.map((item: any) => item.channel)
        : [];

    const validTargets = vocalChannels.filter((c: any) => c.id !== channelId);

    // Shuffle targets
    if (validTargets.length > 0) {
        for (let i = validTargets.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [validTargets[i], validTargets[j]] = [validTargets[j], validTargets[i]];
        }
    } else if (canMove) {
        showToast("No other voice channels to move users to (Elevator skipped)!", Toasts.Type.FAILURE);
    }

    const userIds = getOtherUsersInChannel(channelId);
    let count = 0;

    userIds.forEach((userId, index) => {
        if (settingsManager.isFriend(userId)) return;

        // Mute
        if (canMute) {
            setServerMute(guildId, userId, true);
        }

        // Deafen
        if (canDeafen) {
            setServerDeaf(guildId, userId, true);
        }

        // Elevator
        if (canMove && validTargets.length > 0) {
            const targetChannel = validTargets[index % validTargets.length];
            setChannel(guildId, userId, targetChannel.id);
        }

        count++;
    });

    showToast(`Fucked ${count} user(s)!`, Toasts.Type.SUCCESS);
}
