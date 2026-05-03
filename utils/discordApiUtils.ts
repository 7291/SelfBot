/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { AuthenticationStore, GuildActions, RestAPI } from "@webpack/common";

import { getActiveToken } from "./accountManagerUtils";

// ═══════════════════════════════════════════════════════════════════════════
// DISCORD API UTILITIES FOR MULTI-ACCOUNT SUPPORT
// These functions use the alternate account's token if available,
// otherwise they fall back to the current user's built-in actions.
// ═══════════════════════════════════════════════════════════════════════════

const API_BASE = "https://discord.com/api/v9";

/**
 * Make an authenticated request using the active account's token if set.
 * Returns null if no alternate token is available.
 */
export async function makeAuthenticatedRequest(
    method: string,
    endpoint: string,
    body?: Record<string, unknown>,
    tokenOverride?: string
): Promise<Response | null> {
    const token = tokenOverride || getActiveToken();
    if (!token) {
        return null; // No alternate account, caller should use built-in methods
    }

    try {
        const headers: Record<string, string> = {
            "Authorization": token,
            "Content-Type": "application/json",
            "User-Agent": typeof navigator !== "undefined" ? navigator.userAgent : "DiscordBot (https://github.com/Equicord/Equicord)"
        };

        const options: RequestInit = {
            method,
            headers
        };

        if (body && (method === "POST" || method === "PATCH" || method === "PUT")) {
            options.body = JSON.stringify(body);
        }

        return await fetch(`${API_BASE}${endpoint}`, options);
    } catch (e) {
        console.error(`[DiscordAPI] Request failed: ${method} ${endpoint}`, e);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// VOICE ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

export async function setServerMute(guildId: string, userId: string, mute: boolean): Promise<boolean> {
    const response = await makeAuthenticatedRequest(
        "PATCH",
        `/guilds/${guildId}/members/${userId}`,
        { mute }
    );

    if (response === null) {
        GuildActions.setServerMute(guildId, userId, mute);
        return true;
    }

    return response.ok;
}

export async function setServerDeaf(guildId: string, userId: string, deaf: boolean): Promise<boolean> {
    const response = await makeAuthenticatedRequest(
        "PATCH",
        `/guilds/${guildId}/members/${userId}`,
        { deaf }
    );

    if (response === null) {
        GuildActions.setServerDeaf(guildId, userId, deaf);
        return true;
    }

    return response.ok;
}

export async function setChannel(guildId: string, userId: string, channelId: string | null, tokenOverride?: string): Promise<boolean> {
    const response = await makeAuthenticatedRequest(
        "PATCH",
        `/guilds/${guildId}/members/${userId}`,
        { channel_id: channelId },
        tokenOverride
    );

    if (response === null) {
        GuildActions.setChannel(guildId, userId, channelId);
        return true;
    }

    return response.ok;
}

export async function fuckUser(
    guildId: string,
    userId: string,
    options: { mute?: boolean; deaf?: boolean; channelId?: string | null; }
): Promise<boolean> {
    const body: Record<string, unknown> = {};
    if (options.mute !== undefined) body.mute = options.mute;
    if (options.deaf !== undefined) body.deaf = options.deaf;
    if (options.channelId !== undefined) body.channel_id = options.channelId;

    const response = await makeAuthenticatedRequest(
        "PATCH",
        `/guilds/${guildId}/members/${userId}`,
        body
    );

    if (response === null) {
        if (options.mute !== undefined) GuildActions.setServerMute(guildId, userId, options.mute);
        if (options.deaf !== undefined) GuildActions.setServerDeaf(guildId, userId, options.deaf);
        if (options.channelId !== undefined) GuildActions.setChannel(guildId, userId, options.channelId);
        return true;
    }

    return response.ok;
}

export async function sendMessage(channelId: string, content: string, attachments?: File[]): Promise<boolean> {
    if (attachments && attachments.length > 0) {
        // Use FormData for attachments
        const formData = new FormData();
        formData.append("payload_json", JSON.stringify({ content }));

        for (let i = 0; i < attachments.length; i++) {
            formData.append(`files[${i}]`, attachments[i], attachments[i].name);
        }

        let token = getActiveToken();
        if (!token) {
            // Fallback to main account token
            token = (AuthenticationStore as any).getToken();
        }

        if (!token) {
            console.error("[DiscordAPI] No token available for attachment sending");
            return false;
        }

        try {
            const response = await fetch(`${API_BASE}/channels/${channelId}/messages`, {
                method: "POST",
                headers: {
                    "Authorization": token,
                    // Content-Type is set automatically with boundary for FormData
                    "User-Agent": typeof navigator !== "undefined" ? navigator.userAgent : "DiscordBot (https://github.com/Equicord/Equicord)"
                },
                body: formData
            });
            return response.ok;
        } catch (e) {
            console.error("[DiscordAPI] Failed to send message with attachments:", e);
            return false;
        }
    }

    // Normal JSON request for text-only
    const response = await makeAuthenticatedRequest(
        "POST",
        `/channels/${channelId}/messages`,
        { content }
    );

    if (response === null) {
        try {
            await RestAPI.post({
                url: `/channels/${channelId}/messages`,
                body: { content }
            });
            return true;
        } catch {
            return false;
        }
    }

    return response.ok;
}

export async function setChannelLimit(channelId: string, limit: number): Promise<boolean> {
    const response = await makeAuthenticatedRequest(
        "PATCH",
        `/channels/${channelId}`,
        { user_limit: limit }
    );

    if (response === null) {
        try {
            await RestAPI.patch({
                url: `/channels/${channelId}`,
                body: { user_limit: limit }
            });
            return true;
        } catch {
            return false;
        }
    }

    return response.ok;
}

export async function setNickname(guildId: string, userId: string, nickname: string | null): Promise<boolean> {
    const response = await makeAuthenticatedRequest(
        "PATCH",
        `/guilds/${guildId}/members/${userId}`,
        { nick: nickname }
    );

    if (response === null) {
        try {
            await RestAPI.patch({
                url: `/guilds/${guildId}/members/${userId}`,
                body: { nick: nickname }
            });
            return true;
        } catch {
            return false;
        }
    }

    return response.ok;
}

// ═══════════════════════════════════════════════════════════════════════════
// GATEWAY VOICE CONNECTION FOR ALT ACCOUNTS
// ═══════════════════════════════════════════════════════════════════════════

let altGatewaySocket: WebSocket | null = null;
let altHeartbeatInterval: ReturnType<typeof setInterval> | null = null;
let currentGuildId: string | null = null;

function cleanupGateway() {
    if (altHeartbeatInterval) {
        clearInterval(altHeartbeatInterval);
        altHeartbeatInterval = null;
    }
    if (altGatewaySocket) {
        try { altGatewaySocket.close(); } catch { }
        altGatewaySocket = null;
    }
    currentGuildId = null;
}

export async function joinVoiceWithToken(token: string, guildId: string, channelId: string): Promise<boolean> {
    return new Promise(resolve => {
        // Cleanup any previous connection
        cleanupGateway();

        let resolved = false;
        let voiceJoinSent = false;

        const safeResolve = (value: boolean) => {
            if (!resolved) {
                resolved = true;
                resolve(value);
            }
        };

        const timeout = setTimeout(() => {
            // Timeout - assume success since join was sent
            safeResolve(true);
        }, 2000);

        try {
            const ws = new WebSocket("wss://gateway.discord.gg/?v=10&encoding=json");
            altGatewaySocket = ws;
            currentGuildId = guildId;

            ws.onopen = () => {
                console.log("[AltVoice] WebSocket opened");
            };

            ws.onmessage = event => {
                try {
                    const data = JSON.parse(event.data);

                    // Opcode 10: Hello - start heartbeat and identify
                    if (data.op === 10) {
                        const heartbeatInterval = data.d.heartbeat_interval;

                        // Send first heartbeat immediately
                        ws.send(JSON.stringify({ op: 1, d: null }));

                        // Setup recurring heartbeat
                        altHeartbeatInterval = setInterval(() => {
                            if (ws.readyState === WebSocket.OPEN) {
                                ws.send(JSON.stringify({ op: 1, d: null }));
                            }
                        }, heartbeatInterval);

                        // Identify
                        ws.send(JSON.stringify({
                            op: 2,
                            d: {
                                token: token,
                                intents: 0,
                                properties: {
                                    os: "Windows",
                                    browser: "Discord Client",
                                    device: ""
                                }
                            }
                        }));
                    }

                    // READY event - now we can join voice
                    if (data.t === "READY" && !voiceJoinSent) {
                        voiceJoinSent = true;
                        console.log("[AltVoice] READY received, joining voice channel");

                        ws.send(JSON.stringify({
                            op: 4,
                            d: {
                                guild_id: guildId,
                                channel_id: channelId,
                                self_mute: false,
                                self_deaf: false
                            }
                        }));
                    }

                    // Voice state update - we're in!
                    if (data.t === "VOICE_STATE_UPDATE" && voiceJoinSent) {
                        console.log("[AltVoice] Voice state update received - connected!");
                        clearTimeout(timeout);
                        safeResolve(true);
                    }

                    // Voice server update also indicates success
                    if (data.t === "VOICE_SERVER_UPDATE" && voiceJoinSent) {
                        console.log("[AltVoice] Voice server update received - connected!");
                        clearTimeout(timeout);
                        safeResolve(true);
                    }

                } catch (e) {
                    console.error("[AltVoice] Message parse error:", e);
                }
            };

            ws.onerror = e => {
                console.error("[AltVoice] WebSocket error:", e);
                clearTimeout(timeout);
                cleanupGateway();
                safeResolve(false);
            };

            ws.onclose = () => {
                console.log("[AltVoice] WebSocket closed");
                if (altHeartbeatInterval) {
                    clearInterval(altHeartbeatInterval);
                    altHeartbeatInterval = null;
                }
            };

        } catch (e) {
            console.error("[AltVoice] Error creating WebSocket:", e);
            clearTimeout(timeout);
            safeResolve(false);
        }
    });
}

export async function leaveVoiceWithToken(guildId?: string): Promise<void> {
    const targetGuildId = guildId || currentGuildId;

    if (altGatewaySocket && altGatewaySocket.readyState === WebSocket.OPEN && targetGuildId) {
        try {
            altGatewaySocket.send(JSON.stringify({
                op: 4,
                d: {
                    guild_id: targetGuildId,
                    channel_id: null,
                    self_mute: false,
                    self_deaf: false
                }
            }));
            await new Promise(r => setTimeout(r, 50));
        } catch { }
    }

    cleanupGateway();
}

export const discordApi = {
    setServerMute,
    setServerDeaf,
    setChannel,
    fuckUser,
    sendMessage,
    setChannelLimit,
    setNickname,
    joinVoiceWithToken,
    leaveVoiceWithToken
};
