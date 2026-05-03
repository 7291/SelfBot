/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChannelStore, RestAPI, UserStore } from "@webpack/common";

import { settingsManager } from "./settingsManager";

/**
 * Handle incoming messages for Message Mirror
 */
export function handleMessageMirror(msg: any) {
    // 1. Basic checks
    if (!msg || !msg.author || !msg.content) return;

    // 2. Ignore self
    const currentUser = UserStore.getCurrentUser();
    if (currentUser && msg.author.id === currentUser.id) return;

    // 3. Check if author is a target
    if (!settingsManager.isTarget(msg.author.id)) return;

    // 4. Get target settings
    // We need to find the specific target object to check flags
    const targets = settingsManager.getTargets();
    const target = targets.find(t => t.id === msg.author.id);

    if (!target || !target.enabled || !target.messageMirror) return;

    // 5. Check if it's a DM
    const channel = ChannelStore.getChannel(msg.channel_id);
    if (!channel) return;

    // 6. Mirror the message
    // We reply with the same content.
    // Avoid mirroring empty content (e.g. only attachments) for now, unless content string exists.
    if (!msg.content.trim()) return;

    sendMessage(msg.channel_id, msg.content);
}

async function sendMessage(channelId: string, content: string) {
    try {
        await RestAPI.post({
            url: `/channels/${channelId}/messages`,
            body: {
                content: content,
                // We don't copy attachments or embeds to keep it simple and avoid upload limits
                tts: false
            }
        });
    } catch (err) {
        console.error("[MessageMirror] Failed to send message", err);
    }
}
