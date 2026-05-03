/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChannelActions, ChannelStore, PermissionsBits, PermissionStore, SelectedChannelStore, showToast, Toasts, UserStore, VoiceActions, VoiceStateStore } from "@webpack/common";

import { isUsingAlternateAccount } from "./accountManagerUtils";
import { setServerDeaf, setServerMute } from "./discordApiUtils";
import { settingsManager } from "./settingsManager";

// ═══════════════════════════════════════════════════════════════════════════
// PROTECTION STATE
// ═══════════════════════════════════════════════════════════════════════════

interface ProtectionState {
    muteProtection: boolean;
    deafenProtection: boolean;
    cameraProtection: boolean;
    antiDisconnectProtection: boolean;
    lastChannelId: string | null;
    lastGuildId: string | null;
    reconnectTimeout: number | null;
    expectingDisconnect: boolean;
    intentTimeout: number | null;
    friendsMuteProtection: boolean;
    friendsDeafenProtection: boolean;
    isReconnecting: boolean;
}

export const protectionState: ProtectionState = {
    muteProtection: false,
    deafenProtection: false,
    cameraProtection: false,
    antiDisconnectProtection: false,
    lastChannelId: null,
    lastGuildId: null,
    reconnectTimeout: null,
    expectingDisconnect: false,
    intentTimeout: null,
    friendsMuteProtection: false,
    friendsDeafenProtection: false,
    isReconnecting: false
};

// ═══════════════════════════════════════════════════════════════════════════
// PROTECTION CONTROL
// ═══════════════════════════════════════════════════════════════════════════

export function setMuteProtection(enabled: boolean): void {
    if (protectionState.muteProtection === enabled) return;
    protectionState.muteProtection = enabled;
    if (enabled) showToast("Mute Protection Enabled", Toasts.Type.SUCCESS);
    else showToast("Mute Protection Disabled", Toasts.Type.MESSAGE);
}

export function setDeafenProtection(enabled: boolean): void {
    if (protectionState.deafenProtection === enabled) return;
    protectionState.deafenProtection = enabled;
    if (enabled) showToast("Deafen Protection Enabled", Toasts.Type.SUCCESS);
    else showToast("Deafen Protection Disabled", Toasts.Type.MESSAGE);
}

export function setCameraProtection(enabled: boolean): void {
    if (protectionState.cameraProtection === enabled) return;
    protectionState.cameraProtection = enabled;
    if (enabled) showToast("Camera Protection Enabled", Toasts.Type.SUCCESS);
    else showToast("Camera Protection Disabled", Toasts.Type.MESSAGE);
}

export function setAntiDisconnectProtection(enabled: boolean): void {
    if (protectionState.antiDisconnectProtection === enabled) return;
    protectionState.antiDisconnectProtection = enabled;
    if (enabled) showToast("Anti-Disconnect Protection Enabled", Toasts.Type.SUCCESS);
    else showToast("Anti-Disconnect Protection Disabled", Toasts.Type.MESSAGE);
}

export function setFriendsMuteProtection(enabled: boolean): void {
    if (protectionState.friendsMuteProtection === enabled) return;
    protectionState.friendsMuteProtection = enabled;
    if (enabled) showToast("Friends Mute Protection Enabled", Toasts.Type.SUCCESS);
    else showToast("Friends Mute Protection Disabled", Toasts.Type.MESSAGE);
}

export function setFriendsDeafenProtection(enabled: boolean): void {
    if (protectionState.friendsDeafenProtection === enabled) return;
    protectionState.friendsDeafenProtection = enabled;
    if (enabled) showToast("Friends Deafen Protection Enabled", Toasts.Type.SUCCESS);
    else showToast("Friends Deafen Protection Disabled", Toasts.Type.MESSAGE);
}

// ═══════════════════════════════════════════════════════════════════════════
// EVENT HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

export function handleProtectionVoiceChannelSelect(data: { guildId: string | null; channelId: string | null; }): void {
    // This event fires when the USER interacts with the UI to select a channel or disconnect
    // processing this lets us know the disconnect/move is VOLUNTARY.

    // If we are Auto-Reconnecting, this event is triggered by US, not the user.
    // So we should ignore it to prevent disabling protection for rapid kicks.
    if (protectionState.isReconnecting) {
        protectionState.isReconnecting = false;
        return;
    }

    // Clear any pending timeout
    if (protectionState.intentTimeout) {
        clearTimeout(protectionState.intentTimeout);
        protectionState.intentTimeout = null;
    }

    // Set flag that we are expecting a voice state change initiated by the user
    protectionState.expectingDisconnect = true;

    // Reset this flag after a short delay in case the connection fails or never happens,
    // so we don't leave protection permanently disabled.
    protectionState.intentTimeout = window.setTimeout(() => {
        protectionState.expectingDisconnect = false;
        protectionState.intentTimeout = null;
    }, 2000);
}

export function handleProtectionVoiceStateUpdate(voiceStates: Array<{ userId: string; channelId?: string; mute?: boolean; deaf?: boolean; selfVideo?: boolean; suppress?: boolean; guildId?: string; }>): void {
    const currentUser = UserStore.getCurrentUser();
    if (!currentUser) return;

    // Check Friends Protection for ALL voice state updates
    for (const state of voiceStates) {
        if (state.userId === currentUser.id) continue; // Skip self

        // If user is a friend
        if (settingsManager.isFriend(state.userId)) {
            const { guildId } = state;
            const { channelId } = state;
            if (!guildId || !channelId) continue;

            const channel = ChannelStore.getChannel(channelId);
            if (!channel) continue;

            // Friends Mute Protection
            if (protectionState.friendsMuteProtection) {
                if (state.mute) {
                    // Check if we can unmute (or have alt account)
                    if (isUsingAlternateAccount() || PermissionStore.can(PermissionsBits.MUTE_MEMBERS, channel)) {
                        // Double check state
                        setTimeout(() => {
                            const freshState = VoiceStateStore.getVoiceState(guildId, state.userId);
                            if (freshState?.mute) {
                                setServerMute(guildId, state.userId, false);
                                const user = UserStore.getUser(state.userId);
                                showToast(`Protection: Unmuted friend ${user?.username || state.userId}`, Toasts.Type.SUCCESS);
                            }
                        }, 200);
                    }
                }
            }

            // Friends Deafen Protection
            if (protectionState.friendsDeafenProtection) {
                if (state.deaf) {
                    if (isUsingAlternateAccount() || PermissionStore.can(PermissionsBits.DEAFEN_MEMBERS, channel)) {
                        setTimeout(() => {
                            const freshState = VoiceStateStore.getVoiceState(guildId, state.userId);
                            if (freshState?.deaf) {
                                setServerDeaf(guildId, state.userId, false);
                                const user = UserStore.getUser(state.userId);
                                showToast(`Protection: Undeafened friend ${user?.username || state.userId}`, Toasts.Type.SUCCESS);
                            }
                        }, 200);
                    }
                }
            }
        }
    }

    const myState = voiceStates.find(vs => vs.userId === currentUser.id);

    // UPDATE TRACKING
    if (myState) {
        if (myState.channelId) {
            // User connected to a channel (or moved to one)

            // If we are here, any disconnect expectation was seemingly fulfilled (or we successfully moved)
            // Only update tracking if this event matches our LOCALLY selected channel
            // This prevents events from other sessions (multicall/phone) from hijacking our state
            const localChannelId = SelectedChannelStore.getVoiceChannelId();
            if (localChannelId && myState.channelId === localChannelId) {
                protectionState.lastChannelId = myState.channelId;
                protectionState.lastGuildId = myState.guildId || null;

                // If we didn't have guildId in update, try to get from channel
                if (!protectionState.lastGuildId && protectionState.lastChannelId) {
                    const ch = ChannelStore.getChannel(protectionState.lastChannelId);
                    if (ch) protectionState.lastGuildId = ch.guild_id;
                }
            } else if (!localChannelId) {
                // If we have no local channel, any connection is valid to track (initial connect)
                protectionState.lastChannelId = myState.channelId;
                protectionState.lastGuildId = myState.guildId || null;
            }

            // If we successfully landed in a channel, valid voluntary move is complete.
            // (We keep expectingDisconnect true for a bit longer via timeout just in case of jitter,
            // but effectively we are safe).
        } else {
            // User disconnected (channelId is null)
            // CHECK ANTI-DISCONNECT
            if (protectionState.antiDisconnectProtection && protectionState.lastChannelId) {
                // We were connected, now we are not.

                // CHECK IF USER INTENDED THIS
                if (protectionState.expectingDisconnect) {
                    // User manually clicked disconnect or switched channels (and this is the 'leave' part)
                    // Do NOT reconnect.
                    // Also clear the last channel so we don't reconnect later unexpectedly
                    protectionState.lastChannelId = null;
                    return;
                }

                // CHECK IF DISCONNECT WAS RELEVANT TO THIS CLIENT
                // If we are still connected locally (to another channel) or if the disconnect event
                // was for a channel we weren't tracking locally, ignore it.
                // However, SelectedChannelStore might be null immediately after disconnect.
                // So relying solely on SelectedChannelStore here is tricky.
                // But since we only update protectionState.lastChannelId if it matched local,
                // we can assume protectionState.lastChannelId IS the relevant channel.

                // If not expecting disconnect, it was INVOLUNTARY (kick, move by admin, network drop)

                // Reconnect INSTANTLY
                const targetChannelId = protectionState.lastChannelId;

                showToast("Anti-Disconnect: Reconnecting...", Toasts.Type.MESSAGE);

                // Flag this action as an auto-reconnect to prevent it from being seen as user-initiated
                protectionState.isReconnecting = true;
                // Safety reset in case event doesn't fire
                setTimeout(() => { protectionState.isReconnecting = false; }, 1000);

                if (ChannelActions) ChannelActions.selectVoiceChannel(targetChannelId);

                // Keep lastChannelId to allow retry loop if kicked repeatedly
            }
        }
    }

    if (!myState) return;

    // Check if we are in a voice channel
    const currentChannelId = myState.channelId;
    if (!currentChannelId) return;

    const channel = ChannelStore.getChannel(currentChannelId);
    if (!channel || !channel.guild_id) return;
    const guildId = channel.guild_id;

    // 1. Mute Protection
    if (protectionState.muteProtection) {
        // If server muted (mute === true) and we have permission to unmute
        if (myState.mute) {
            if (isUsingAlternateAccount() || PermissionStore.can(PermissionsBits.MUTE_MEMBERS, channel)) {
                setTimeout(() => {
                    const freshState = VoiceStateStore.getVoiceState(guildId, currentUser.id);
                    if (freshState?.mute) {
                        setServerMute(guildId, currentUser.id, false);
                        showToast("Mute Protection: Auto-unmuted myself", Toasts.Type.SUCCESS);
                    }
                }, 200);
            }
        }
    }

    // 2. Deafen Protection
    if (protectionState.deafenProtection) {
        if (myState.deaf) {
            if (isUsingAlternateAccount() || PermissionStore.can(PermissionsBits.DEAFEN_MEMBERS, channel)) {
                setTimeout(() => {
                    const freshState = VoiceStateStore.getVoiceState(guildId, currentUser.id);
                    if (freshState?.deaf) {
                        setServerDeaf(guildId, currentUser.id, false);
                        showToast("Deafen Protection: Auto-undeafened myself", Toasts.Type.SUCCESS);
                    }
                }, 200);
            }
        }
    }

    // 3. Camera Protection
    if (protectionState.cameraProtection) {
        if (!myState.selfVideo) {
            if (PermissionStore.can(PermissionsBits.STREAM, channel)) {
                setTimeout(() => {
                    const freshState = VoiceStateStore.getVoiceState(guildId, currentUser.id);
                    if (!freshState?.selfVideo) {
                        VoiceActions.toggleSelfVideo();
                        showToast("Camera Protection: Auto-enabled camera", Toasts.Type.SUCCESS);
                    }
                }, 200);
            }
        }
    }
}
