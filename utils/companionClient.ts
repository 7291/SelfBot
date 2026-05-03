/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showToast, Toasts } from "@webpack/common";

/*
 * WebSocket client for the Voice Companion
 * Handles connecting to the local server and sending commands
 */

const COMPANION_URL = "ws://localhost:8999";

interface CompanionState {
    connected: boolean;
    socket: WebSocket | null;
    reconnectInterval: ReturnType<typeof setInterval> | null;
    devices: string[];
    currentDevice: string;
    micEnabled: boolean; // Added micEnabled
    activeBotCount: number;
    // Video state
    videoDevices: string[];
    currentVideoDevice: string;
    cameraEnabled: boolean;
}

const state: CompanionState = {
    connected: false,
    socket: null,
    reconnectInterval: null,
    devices: [],
    currentDevice: "",
    micEnabled: false,
    activeBotCount: 0,
    // Video
    videoDevices: [],
    currentVideoDevice: "",
    cameraEnabled: false
};

type Listener = (connected: boolean) => void;
type DeviceListener = (devices: string[], current: string, enabled: boolean) => void;
type StatusListener = (count: number) => void;
type VideoListener = (devices: string[], current: string, enabled: boolean) => void;

const listeners = new Set<Listener>();
const deviceListeners = new Set<DeviceListener>();
const statusListeners = new Set<StatusListener>();
const videoListeners = new Set<VideoListener>();

function notifyListeners() {
    listeners.forEach(l => l(state.connected));
}

function notifyDeviceListeners() {
    deviceListeners.forEach(l => l(state.devices, state.currentDevice, state.micEnabled));
}

function notifyStatusListeners() {
    statusListeners.forEach(l => l(state.activeBotCount));
}

function notifyVideoListeners() {
    videoListeners.forEach(l => l(state.videoDevices, state.currentVideoDevice, state.cameraEnabled));
}

export const companionClient = {
    connect() {
        if (state.socket && (state.socket.readyState === WebSocket.OPEN || state.socket.readyState === WebSocket.CONNECTING)) return;

        try {
            state.socket = new WebSocket(COMPANION_URL);

            state.socket.onopen = () => {
                console.log("[VoiceCompanion] Connected to companion");
                state.connected = true;

                // Clear reconnect interval
                if (state.reconnectInterval) {
                    clearInterval(state.reconnectInterval);
                    state.reconnectInterval = null;
                }

                showToast("Connected to Voice Companion", Toasts.Type.SUCCESS);
                notifyListeners();

                // Always fetch devices on (re)connect
                setTimeout(() => {
                    companionClient.getDevices();
                    companionClient.getVideoDevices();
                }, 100);
            };

            state.socket.onmessage = event => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.op === "device_list") {
                        state.devices = data.devices || [];
                        if (data.currentDevice) state.currentDevice = data.currentDevice.replace("audio=", "");
                        state.micEnabled = !!data.micEnabled;
                        notifyDeviceListeners();
                    } else if (data.op === "hello" && data.currentDevice) {
                        state.currentDevice = data.currentDevice.replace("audio=", "");
                        notifyDeviceListeners();
                    } else if (data.op === "status") {
                        state.activeBotCount = data.connected || 0;
                        notifyStatusListeners();
                    }
                    // Video device handlers
                    else if (data.op === "video_devices") {
                        state.videoDevices = data.devices || [];
                        state.currentVideoDevice = data.currentDevice || "";
                        state.cameraEnabled = !!data.enabled;
                        notifyVideoListeners();
                    } else if (data.op === "video_status") {
                        state.cameraEnabled = !!data.cameraEnabled;
                        state.currentVideoDevice = data.currentVideoDevice || "";
                        notifyVideoListeners();
                    }
                } catch (e) { }
            };

            state.socket.onclose = () => {
                console.log("[VoiceCompanion] Disconnected");
                state.connected = false;
                state.socket = null;
                state.activeBotCount = 0; // Reset count
                notifyListeners();
                notifyStatusListeners();

                // Auto reconnect
                if (!state.reconnectInterval) {
                    state.reconnectInterval = setInterval(() => companionClient.connect(), 5000);
                }
            };

            state.socket.onerror = e => {
                // Silent error (polling)
            };

            // Clear reconnect interval if successful
            if (state.reconnectInterval && state.socket.readyState === WebSocket.OPEN) {
                clearInterval(state.reconnectInterval);
                state.reconnectInterval = null;
            }

        } catch (e) {
            console.error("[VoiceCompanion] Connection failed:", e);
        }
    },

    disconnect() {
        if (state.reconnectInterval) {
            clearInterval(state.reconnectInterval);
            state.reconnectInterval = null;
        }
        if (state.socket) {
            state.socket.close();
            state.socket = null;
        }
        state.connected = false;
        state.activeBotCount = 0;
        notifyListeners();
        notifyStatusListeners();
    },

    isConnected() {
        return state.connected;
    },

    getConnectedCount() {
        return state.activeBotCount;
    },

    subscribe(listener: Listener) {
        listeners.add(listener);
        // Initial state
        listener(state.connected);
        return () => listeners.delete(listener);
    },

    subscribeDevices(listener: DeviceListener) {
        deviceListeners.add(listener);
        listener(state.devices, state.currentDevice, state.micEnabled);
        return () => deviceListeners.delete(listener);
    },

    subscribeStatus(listener: StatusListener) {
        statusListeners.add(listener);
        listener(state.activeBotCount);
        return () => statusListeners.delete(listener);
    },

    // Commands
    joinVoice(tokens: string[], guildId: string, channelId: string) {
        if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;
        state.socket.send(JSON.stringify({
            op: "connect_voice",
            tokens,
            guildId,
            channelId
        }));
    },

    disconnectAll() {
        if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;
        state.socket.send(JSON.stringify({
            op: "disconnect_all"
        }));
    },

    // Per-account connection controls
    connectAccount(token: string, guildId: string, channelId: string) {
        if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;
        state.socket.send(JSON.stringify({
            op: "connect_account",
            token,
            guildId,
            channelId
        }));
    },

    disconnectAccount(token: string) {
        if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;
        state.socket.send(JSON.stringify({
            op: "disconnect_account",
            token
        }));
    },

    connectAll(tokens: string[], guildId: string, channelId: string) {
        if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;
        state.socket.send(JSON.stringify({
            op: "connect_all",
            tokens,
            guildId,
            channelId
        }));
    },

    getDevices() {
        if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;
        state.socket.send(JSON.stringify({ op: "get_devices" }));
    },

    setDevice(device: string) {
        if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;
        state.socket.send(JSON.stringify({ op: "set_device", device }));
        // Optimistic update
        state.currentDevice = device;
        notifyDeviceListeners();
    },

    toggleMic(enabled: boolean) {
        if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;
        state.socket.send(JSON.stringify({ op: "toggle_mic", value: enabled }));
        state.micEnabled = enabled; // Optimistic
        notifyDeviceListeners();
    },

    toggleMuteAll(mute: boolean) {
        if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;
        state.socket.send(JSON.stringify({ op: "mute_all", value: mute }));
    },

    toggleDeafAll(deaf: boolean) {
        if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;
        state.socket.send(JSON.stringify({ op: "deaf_all", value: deaf }));
    },

    toggleVideoAll(video: boolean) {
        if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;
        state.socket.send(JSON.stringify({ op: "video_all", value: video }));
    },

    // Per-account controls
    toggleMuteAccount(token: string, mute: boolean) {
        if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;
        state.socket.send(JSON.stringify({ op: "mute_account", token, value: mute }));
    },

    toggleDeafAccount(token: string, deaf: boolean) {
        if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;
        state.socket.send(JSON.stringify({ op: "deaf_account", token, value: deaf }));
    },

    toggleVideoAccount(token: string, video: boolean) {
        if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;
        state.socket.send(JSON.stringify({ op: "video_account", token, value: video }));
    },

    // Permission checking
    checkPermissions(tokens: string[], guildId: string, channelId: string): Promise<{ results: any[], canJoinCount: number, totalCount: number }> {
        return new Promise((resolve, reject) => {
            if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
                reject(new Error("Not connected to companion"));
                return;
            }

            const timeout = setTimeout(() => {
                reject(new Error("Permission check timed out"));
            }, 60000); // 60s timeout for all checks

            const handler = (event: MessageEvent) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.op === "permission_results") {
                        clearTimeout(timeout);
                        state.socket?.removeEventListener("message", handler);
                        resolve(data);
                    }
                } catch (e) { }
            };

            state.socket.addEventListener("message", handler);
            state.socket.send(JSON.stringify({
                op: "check_permissions",
                tokens,
                guildId,
                channelId
            }));
        });
    },

    // ═══════════════════════════════════════════════════════════════
    // VIDEO/CAMERA CONTROL
    // ═══════════════════════════════════════════════════════════════

    getVideoDevices() {
        if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;
        state.socket.send(JSON.stringify({ op: "get_video_devices" }));
    },

    setVideoDevice(device: string) {
        if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;
        state.socket.send(JSON.stringify({ op: "set_video_device", device }));
    },

    toggleCamera(enabled: boolean) {
        if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;
        state.socket.send(JSON.stringify({ op: "toggle_camera", value: enabled }));
    },

    subscribeVideo(listener: VideoListener) {
        videoListeners.add(listener);
        // Immediately notify with current state
        listener(state.videoDevices, state.currentVideoDevice, state.cameraEnabled);
        return () => videoListeners.delete(listener);
    },

    getCameraState() {
        return {
            devices: state.videoDevices,
            currentDevice: state.currentVideoDevice,
            enabled: state.cameraEnabled
        };
    }
};

// Start trying to connect immediately
companionClient.connect();
