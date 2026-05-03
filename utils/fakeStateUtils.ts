/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { SelectedChannelStore, UserStore, VoiceActions, VoiceStateStore } from "@webpack/common";

/**
 * Manages the "Fake" state for Voice capabilities (Fake Mute, Fake Deafen, Fake Video).
 * It handles the state tracking and forcing updates to the Discord voice server
 * to reflect these fake states without user interaction.
 */
class FakeStateManager {
    private _fakeMute = false;
    private _fakeDeafen = false;
    private _fakeVideo = false;
    private _fakeScreen = false;
    private _updateTimeout: number | null = null;
    private _listeners = new Set<() => void>();

    public get fakeMuteEnabled() { return this._fakeMute; }
    public get fakeDeafenEnabled() { return this._fakeDeafen; }
    public get fakeVideoEnabled() { return this._fakeVideo; }
    public get fakeScreenEnabled() { return this._fakeScreen; }

    public subscribe(listener: () => void) {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }

    private notifyListeners() {
        this._listeners.forEach(l => l());
    }

    /**
     * Toggles the fake mute state
     * @returns New state
     */
    public toggleFakeMute(force?: boolean): boolean {
        if (typeof force !== "undefined") {
            this._fakeMute = force;
        } else {
            this._fakeMute = !this._fakeMute;
        }
        this.forceVoiceStateUpdate();
        this.notifyListeners();
        return this._fakeMute;
    }

    /**
     * Toggles the fake deafen state
     * @returns New state
     */
    public toggleFakeDeafen(force?: boolean): boolean {
        if (typeof force !== "undefined") {
            this._fakeDeafen = force;
        } else {
            this._fakeDeafen = !this._fakeDeafen;
        }
        this.forceVoiceStateUpdate();
        this.notifyListeners();
        return this._fakeDeafen;
    }

    /**
     * Toggles the fake video (camera) state
     * @returns New state
     */
    public toggleFakeVideo(force?: boolean): boolean {
        if (typeof force !== "undefined") {
            this._fakeVideo = force;
        } else {
            this._fakeVideo = !this._fakeVideo;
        }
        this.forceVoiceStateUpdate();
        this.notifyListeners();
        return this._fakeVideo;
    }

    /**
     * Toggles the fake screen share state
     * @returns New state
     */
    public toggleFakeScreen(force?: boolean): boolean {
        if (typeof force !== "undefined") {
            this._fakeScreen = force;
        } else {
            this._fakeScreen = !this._fakeScreen;
        }
        this.forceVoiceStateUpdate();
        this.notifyListeners();
        return this._fakeScreen;
    }

    /**
     * Determines whether to override the outgoing voice state packet.
     * Use this in the handleVoiceStateUpdate patch.
     */
    public shouldApplyFakeState = (original: boolean | undefined, type: "mute" | "deaf" | "video" | "stream"): boolean => {
        if (type === "mute" && this._fakeMute) return true;
        if (type === "deaf" && this._fakeDeafen) return true;
        if (type === "video" && this._fakeVideo) return true;
        if (type === "stream" && this._fakeScreen) return true;
        return !!original;
    };

    /**
     * Forces a voice state update packet to be sent to the server.
     * This is required because simply changing the local flag doesn't tell the server anything.
     * We must trigger a legitimate state change (temporarily) so the client sends an update,
     * which our patch then intercepts to inject the fake values.
     */
    private forceVoiceStateUpdate() {
        const userId = UserStore.getCurrentUser()?.id;
        if (!userId) return;

        // Prioritize the channel currently selected/connected in this client
        const localChannelId = SelectedChannelStore.getVoiceChannelId();
        let voiceState;

        if (localChannelId) {
            const channelStates = VoiceStateStore.getVoiceStatesForChannel(localChannelId);
            if (channelStates) {
                voiceState = channelStates[userId];
            }
        }

        if (!voiceState) {
            voiceState = VoiceStateStore.getVoiceStateForUser(userId);
        }

        // Safety check: if we are not in a VC, no need to force update (it will update when we join)
        if (!voiceState?.channelId) return;

        // We check selfMute (local state) specifically.
        // Checking .mute (server state) is problematic because if Fake Mute is active,
        // the server THINKS we are muted, so we would erroneously enter the "safely deafen" branch,
        // causing a deafen toggle when the user just wanted to disable fake mute.
        // By checking selfMute, we know the actual local state of the microphone.
        const isLocallyMuted = voiceState.selfMute;

        // Clear any pending update to avoid race conditions
        if (this._updateTimeout) {
            clearTimeout(this._updateTimeout);
            this._updateTimeout = null;
        }

        if (isLocallyMuted) {
            // SAFE MODE: If strictly muted locally, we can toggle deafen safely.
            // We use deafen because if we toggled mute, we would briefly UNMUTE the user,
            // which could leak audio. Deafen is safe (just cuts audio).
            VoiceActions.toggleSelfDeaf();
            this._updateTimeout = window.setTimeout(() => VoiceActions.toggleSelfDeaf(), 50);
        } else {
            // UNMUTED MODE: logic is reversed.
            // If we toggle deafen, the user will briefly not hear anything (annoying interruption).
            // Toggling Mute is better - it just stops sending audio for 50ms (silence).
            VoiceActions.toggleSelfMute();
            this._updateTimeout = window.setTimeout(() => VoiceActions.toggleSelfMute(), 50);
        }
    }
}

// Export singleton instance
export const FakeState = new FakeStateManager();
