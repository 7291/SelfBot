/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showToast, Toasts } from "@webpack/common";

import { canMuteInChannel, getCurrentVoiceChannel, getOtherUsersInChannel } from "./autoMuteUtils";
import { setServerMute } from "./discordApiUtils";

/**
 * Unmute all users in the current voice channel
 */
export function unMuteAll(): void {
    const vcInfo = getCurrentVoiceChannel();
    if (!vcInfo) {
        showToast("Join a voice channel first!", Toasts.Type.FAILURE);
        return;
    }

    const { channelId, guildId } = vcInfo;

    if (!canMuteInChannel(channelId)) {
        showToast("You don't have permission to unmute members!", Toasts.Type.FAILURE);
        return;
    }

    const userIds = getOtherUsersInChannel(channelId);
    let count = 0;

    for (const userId of userIds) {
        // We unmute everyone, including friends, to ensure a clean state
        setServerMute(guildId, userId, false);
        count++;
    }

    showToast(`Unmuted ${count} user(s)`, Toasts.Type.SUCCESS);
}
