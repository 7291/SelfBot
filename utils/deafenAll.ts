/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showToast, Toasts } from "@webpack/common";

import { canDeafenInChannel } from "./autoDeafenUtils";
import { getCurrentVoiceChannel, getOtherUsersInChannel } from "./autoMuteUtils";
import { setServerDeaf } from "./discordApiUtils";
import { settingsManager } from "./settingsManager";

/**
 * Deafen all users in the current voice channel
 */
export function deafenAll(): void {
    const vcInfo = getCurrentVoiceChannel();
    if (!vcInfo) {
        showToast("Join a voice channel first!", Toasts.Type.FAILURE);
        return;
    }

    const { channelId, guildId } = vcInfo;

    if (!canDeafenInChannel(channelId)) {
        showToast("You don't have permission to deafen members!", Toasts.Type.FAILURE);
        return;
    }

    const userIds = getOtherUsersInChannel(channelId);
    let count = 0;

    for (const userId of userIds) {
        if (settingsManager.isFriend(userId)) continue;
        setServerDeaf(guildId, userId, true);
        count++;
    }

    showToast(`Deafened ${count} user(s)`, Toasts.Type.SUCCESS);
}
