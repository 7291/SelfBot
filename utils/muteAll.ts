/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showToast, Toasts } from "@webpack/common";

import { canMuteInChannel, getCurrentVoiceChannel, getOtherUsersInChannel } from "./autoMuteUtils";
import { setServerMute } from "./discordApiUtils";
import { settingsManager } from "./settingsManager";

/**
 * Mute all users in the current voice channel
 */
export function muteAll(): void {
    const vcInfo = getCurrentVoiceChannel();
    if (!vcInfo) {
        showToast("Join a voice channel first!", Toasts.Type.FAILURE);
        return;
    }

    const { channelId, guildId } = vcInfo;

    if (!canMuteInChannel(channelId)) {
        showToast("You don't have permission to mute members!", Toasts.Type.FAILURE);
        return;
    }

    const userIds = getOtherUsersInChannel(channelId);
    let count = 0;

    for (const userId of userIds) {
        if (settingsManager.isFriend(userId)) continue;
        setServerMute(guildId, userId, true);
        count++;
    }

    showToast(`Muted ${count} user(s)`, Toasts.Type.SUCCESS);
}
