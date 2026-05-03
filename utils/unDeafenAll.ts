/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showToast, Toasts } from "@webpack/common";

import { canDeafenInChannel } from "./autoDeafenUtils";
import { getCurrentVoiceChannel, getOtherUsersInChannel } from "./autoMuteUtils";
import { setServerDeaf } from "./discordApiUtils";

/**
 * Undeafen all users in the current voice channel
 */
export function unDeafenAll(): void {
    const vcInfo = getCurrentVoiceChannel();
    if (!vcInfo) {
        showToast("Join a voice channel first!", Toasts.Type.FAILURE);
        return;
    }

    const { channelId, guildId } = vcInfo;

    if (!canDeafenInChannel(channelId)) {
        showToast("You don't have permission to undeafen members!", Toasts.Type.FAILURE);
        return;
    }

    const userIds = getOtherUsersInChannel(channelId);
    let count = 0;

    for (const userId of userIds) {
        // We undeafen everyone, including friends, to ensure a clean state
        setServerDeaf(guildId, userId, false);
        count++;
    }

    showToast(`Undeafened ${count} user(s)`, Toasts.Type.SUCCESS);
}
