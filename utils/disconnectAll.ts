/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showToast, Toasts } from "@webpack/common";

import { getCurrentVoiceChannel, getOtherUsersInChannel } from "./autoMuteUtils";
import { setChannel } from "./discordApiUtils";
import { settingsManager } from "./settingsManager";

/**
 * Disconnect all users in the current voice channel
 */
export function disconnectAll(): void {
    const vcInfo = getCurrentVoiceChannel();
    if (!vcInfo) {
        showToast("Join a voice channel first!", Toasts.Type.FAILURE);
        return;
    }

    const { channelId, guildId } = vcInfo;

    const userIds = getOtherUsersInChannel(channelId);
    let count = 0;

    for (const userId of userIds) {
        if (settingsManager.isFriend(userId)) continue;
        // Disconnect by setting channel to null
        setChannel(guildId, userId, null);
        count++;
    }

    showToast(`Disconnected ${count} user(s)`, Toasts.Type.SUCCESS);
}
