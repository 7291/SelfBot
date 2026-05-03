/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showToast, Toasts } from "@webpack/common";

import { makeAuthenticatedRequest } from "./discordApiUtils";
import { Account } from "./settingsManager";

// ═══════════════════════════════════════════════════════════════════════════
// MASS JOINER - Multi-Account Voice Connection Manager
// ═══════════════════════════════════════════════════════════════════════════

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface MassJoinerConnection {
    accountId: string;
    account: Account;
    socket: WebSocket | null;
    heartbeatInterval: ReturnType<typeof setInterval> | null;
    currentChannelId: string | null;
    currentGuildId: string | null;
    selfMute: boolean;
    selfDeaf: boolean;
    selfVideo: boolean;
    status: ConnectionStatus;
    sessionId: string | null;
}

// Map of account ID to connection state
const connections = new Map<string, MassJoinerConnection>();

// Listeners for state changes
const listeners = new Set<() => void>();

function notifyListeners() {
    listeners.forEach(l => l());
}

// ═══════════════════════════════════════════════════════════════════════════
// CONNECTION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

function createConnection(account: Account): MassJoinerConnection {
    return {
        accountId: account.id,
        account,
        socket: null,
        heartbeatInterval: null,
        currentChannelId: null,
        currentGuildId: null,
        selfMute: false,
        selfDeaf: false,
        selfVideo: false,
        status: "disconnected",
        sessionId: null
    };
}

function cleanupConnection(accountId: string) {
    const conn = connections.get(accountId);
    if (!conn) return;

    if (conn.heartbeatInterval) {
        clearInterval(conn.heartbeatInterval);
        conn.heartbeatInterval = null;
    }

    if (conn.socket) {
        try {
            conn.socket.close();
        } catch { }
        conn.socket = null;
    }

    conn.status = "disconnected";
    conn.currentChannelId = null;
    conn.currentGuildId = null;
    conn.sessionId = null;
    notifyListeners();
}

// ═══════════════════════════════════════════════════════════════════════════
// CONNECT / DISCONNECT
// ═══════════════════════════════════════════════════════════════════════════

export async function connectAccount(
    account: Account,
    guildId: string,
    channelId: string,
    options?: { selfMute?: boolean; selfDeaf?: boolean; selfVideo?: boolean }
): Promise<boolean> {
    if (!account.token) {
        console.error("[MassJoiner] No token for account:", account.username);
        return false;
    }

    // Initialize or get existing connection
    let conn = connections.get(account.id);
    if (!conn) {
        conn = createConnection(account);
        connections.set(account.id, conn);
    }

    // Cleanup any existing connection
    cleanupConnection(account.id);

    conn.status = "connecting";
    conn.selfMute = options?.selfMute ?? false;
    conn.selfDeaf = options?.selfDeaf ?? false;
    conn.selfVideo = options?.selfVideo ?? false;
    notifyListeners();

    return new Promise(resolve => {
        let resolved = false;
        let voiceJoinSent = false;

        const safeResolve = (value: boolean) => {
            if (!resolved) {
                resolved = true;
                resolve(value);
            }
        };

        const timeout = setTimeout(() => {
            if (voiceJoinSent) {
                conn!.status = "connected";
                conn!.currentChannelId = channelId;
                conn!.currentGuildId = guildId;
                notifyListeners();
                safeResolve(true);
            } else {
                conn!.status = "error";
                notifyListeners();
                safeResolve(false);
            }
        }, 3000);

        try {
            const ws = new WebSocket("wss://gateway.discord.gg/?v=10&encoding=json");
            conn.socket = ws;

            ws.onopen = () => {
                console.log(`[MassJoiner] [${account.username}] WebSocket opened`);
            };

            ws.onmessage = event => {
                try {
                    const data = JSON.parse(event.data);

                    // Opcode 10: Hello
                    if (data.op === 10) {
                        const heartbeatInterval = data.d.heartbeat_interval;

                        // First heartbeat
                        ws.send(JSON.stringify({ op: 1, d: null }));

                        // Setup recurring heartbeat
                        conn!.heartbeatInterval = setInterval(() => {
                            if (ws.readyState === WebSocket.OPEN) {
                                ws.send(JSON.stringify({ op: 1, d: null }));
                            }
                        }, heartbeatInterval);

                        // Identify
                        ws.send(JSON.stringify({
                            op: 2,
                            d: {
                                token: account.token,
                                intents: 0,
                                properties: {
                                    os: "Windows",
                                    browser: "Discord Client",
                                    device: ""
                                }
                            }
                        }));
                    }

                    // READY event
                    if (data.t === "READY" && !voiceJoinSent) {
                        voiceJoinSent = true;
                        conn!.sessionId = data.d.session_id;

                        console.log(`[MassJoiner] [${account.username}] Joining voice channel`);

                        ws.send(JSON.stringify({
                            op: 4,
                            d: {
                                guild_id: guildId,
                                channel_id: channelId,
                                self_mute: conn!.selfMute,
                                self_deaf: conn!.selfDeaf,
                                self_video: conn!.selfVideo
                            }
                        }));
                    }

                    // Voice state update
                    if (data.t === "VOICE_STATE_UPDATE" && voiceJoinSent && data.d?.user_id === account.id) {
                        console.log(`[MassJoiner] [${account.username}] Connected to voice!`);
                        clearTimeout(timeout);
                        conn!.status = "connected";
                        conn!.currentChannelId = channelId;
                        conn!.currentGuildId = guildId;
                        notifyListeners();
                        safeResolve(true);
                    }

                } catch (e) {
                    console.error(`[MassJoiner] [${account.username}] Parse error:`, e);
                }
            };

            ws.onerror = e => {
                console.error(`[MassJoiner] [${account.username}] WebSocket error:`, e);
                clearTimeout(timeout);
                conn!.status = "error";
                notifyListeners();
                safeResolve(false);
            };

            ws.onclose = () => {
                console.log(`[MassJoiner] [${account.username}] WebSocket closed`);
                if (conn!.heartbeatInterval) {
                    clearInterval(conn!.heartbeatInterval);
                    conn!.heartbeatInterval = null;
                }
                conn!.status = "disconnected";
                conn!.currentChannelId = null;
                notifyListeners();
            };

        } catch (e) {
            console.error(`[MassJoiner] [${account.username}] Error:`, e);
            clearTimeout(timeout);
            conn.status = "error";
            notifyListeners();
            safeResolve(false);
        }
    });
}

export function disconnectAccount(accountId: string): void {
    const conn = connections.get(accountId);
    if (!conn || !conn.socket) return;

    // Send leave voice
    if (conn.socket.readyState === WebSocket.OPEN && conn.currentGuildId) {
        try {
            conn.socket.send(JSON.stringify({
                op: 4,
                d: {
                    guild_id: conn.currentGuildId,
                    channel_id: null,
                    self_mute: false,
                    self_deaf: false
                }
            }));
        } catch { }
    }

    cleanupConnection(accountId);
}

export function disconnectAll(): void {
    for (const accountId of connections.keys()) {
        disconnectAccount(accountId);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// STATE CONTROL
// ═══════════════════════════════════════════════════════════════════════════

export function setAccountState(
    accountId: string,
    state: { mute?: boolean; deaf?: boolean; video?: boolean }
): void {
    const conn = connections.get(accountId);
    if (!conn || !conn.socket || conn.socket.readyState !== WebSocket.OPEN || !conn.currentGuildId) {
        return;
    }

    if (state.mute !== undefined) conn.selfMute = state.mute;
    if (state.deaf !== undefined) conn.selfDeaf = state.deaf;
    if (state.video !== undefined) conn.selfVideo = state.video;

    conn.socket.send(JSON.stringify({
        op: 4,
        d: {
            guild_id: conn.currentGuildId,
            channel_id: conn.currentChannelId,
            self_mute: conn.selfMute,
            self_deaf: conn.selfDeaf,
            self_video: conn.selfVideo
        }
    }));

    notifyListeners();
}

export function setAllAccountsState(state: { mute?: boolean; deaf?: boolean; video?: boolean }): void {
    for (const conn of connections.values()) {
        if (conn.status === "connected") {
            setAccountState(conn.accountId, state);
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONNECT ALL SELECTED
// ═══════════════════════════════════════════════════════════════════════════

export async function getAccountsWithMissingPermissions(accounts: Account[], channelId: string): Promise<Account[]> {
    const denied: Account[] = [];

    const checks = accounts.map(async account => {
        if (!account.token) return;
        const response = await makeAuthenticatedRequest("GET", `/channels/${channelId}`, undefined, account.token);
        // If 403 or 404, they can't see the channel or connect (likely)
        if (response && !response.ok) {
            denied.push(account);
        }
    });

    await Promise.all(checks);
    return denied;
}

export async function connectAllAccounts(
    accounts: Account[],
    guildId: string,
    channelId: string,
    options?: { selfMute?: boolean; selfDeaf?: boolean; selfVideo?: boolean }
): Promise<{ success: number; failed: number }> {
    const promises = accounts.map(async account => {
        if (!account.token) return false;
        return connectAccount(account, guildId, channelId, options);
    });

    const results = await Promise.all(promises);

    const success = results.filter(r => r).length;
    const failed = results.filter(r => !r).length;

    if (success > 0) {
        showToast(`Connected ${success} account(s) to voice`, Toasts.Type.SUCCESS);
    }
    if (failed > 0) {
        showToast(`Failed to connect ${failed} account(s)`, Toasts.Type.FAILURE);
    }

    return { success, failed };
}

// ═══════════════════════════════════════════════════════════════════════════
// GETTERS
// ═══════════════════════════════════════════════════════════════════════════

export function getConnection(accountId: string): MassJoinerConnection | undefined {
    return connections.get(accountId);
}

export function getAllConnections(): Map<string, MassJoinerConnection> {
    return connections;
}

export function getConnectedAccounts(): MassJoinerConnection[] {
    return Array.from(connections.values()).filter(c => c.status === "connected");
}

export function isAccountConnected(accountId: string): boolean {
    return connections.get(accountId)?.status === "connected";
}

export function getAccountStatus(accountId: string): ConnectionStatus {
    return connections.get(accountId)?.status ?? "disconnected";
}

// ═══════════════════════════════════════════════════════════════════════════
// SUBSCRIPTION
// ═══════════════════════════════════════════════════════════════════════════

export function subscribeToMassJoiner(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const massJoiner = {
    connectAccount,
    disconnectAccount,
    disconnectAll,
    setAccountState,
    setAllAccountsState,
    connectAllAccounts,
    getConnection,
    getAllConnections,
    getConnectedAccounts,
    isAccountConnected,
    getAccountStatus,
    subscribeToMassJoiner,
    getAccountsWithMissingPermissions
};
