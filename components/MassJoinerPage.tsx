/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showToast, Toasts, useCallback, useEffect, UserStore, useState } from "@webpack/common";

import { Account,accountManager } from "../utils/accountManagerUtils";
import { getCurrentVoiceChannelInfo } from "../utils/autoMuteUtils";
import { companionClient } from "../utils/companionClient";
import { ConnectionStatus,massJoiner, subscribeToMassJoiner } from "../utils/massJoinerUtils";
import { settingsManager } from "../utils/settingsManager";
import { Icons } from "./Icons";
import { ToggleSwitch } from "./NukeModal";

// ═══════════════════════════════════════════════════════════════════════════
// MASS JOINER PAGE - Rebuilt for Tabs & Granular Control
// ═══════════════════════════════════════════════════════════════════════════

export function MassJoinerPage({ onBack }: { onBack: () => void }) {
    const [activeTab, setActiveTab] = useState<"dashboard" | "controls" | "settings">("dashboard");
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [connectionStates, setConnectionStates] = useState<Map<string, { status: ConnectionStatus; mute: boolean; deaf: boolean; video: boolean }>>(new Map());
    const [isJoining, setIsJoining] = useState(false);
    const [autoJoin, setAutoJoin] = useState(() => settingsManager.getToggle("massJoinerAutoJoin"));
    const [pullAssistEnabled, setPullAssistEnabled] = useState(() => settingsManager.getToggle("massJoinerPullAssistEnabled"));
    const [pullerId, setPullerId] = useState(() => settingsManager.getMassJoinerPullerId() || "");
    const [confirmState, setConfirmState] = useState<{ show: boolean; message: string; subMessage?: string; onConfirm: () => void; } | null>(null);
    const [companionConnected, setCompanionConnected] = useState(false);
    const [companionCount, setCompanionCount] = useState(0);

    // Subscribe to Companion Status (Connected + Count)
    useEffect(() => {
        const unsubConn = companionClient.subscribe(setCompanionConnected);
        const unsubCount = companionClient.subscribeStatus(setCompanionCount);
        return () => {
            unsubConn();
            unsubCount();
        };
    }, []);

    // Subscribe to Companion Devices
    const [audioDevices, setAudioDevices] = useState<string[]>([]);
    const [currentAudioDevice, setCurrentAudioDevice] = useState<string>("");
    const [micEnabled, setMicEnabled] = useState(false);

    // Optimistic state for remote account controls
    const [remoteStates, setRemoteStates] = useState<Map<string, { mute: boolean; deaf: boolean; video: boolean }>>(new Map());

    useEffect(() => {
        return companionClient.subscribeDevices((list, current, enabled) => {
            setAudioDevices(list);
            setCurrentAudioDevice(current);
            setMicEnabled(enabled);
        });
    }, []);

    // Subscribe to Companion Video/Camera Devices
    const [videoDevices, setVideoDevices] = useState<string[]>([]);
    const [currentVideoDevice, setCurrentVideoDevice] = useState<string>("");
    const [cameraEnabled, setCameraEnabled] = useState<boolean>(false);

    useEffect(() => {
        // Fetch video devices on mount
        companionClient.getVideoDevices();
        return companionClient.subscribeVideo((devices, current, enabled) => {
            setVideoDevices(devices);
            setCurrentVideoDevice(current);
            setCameraEnabled(enabled);
        });
    }, []);

    // Load accounts and subscribe to changes
    useEffect(() => {
        const updateAccounts = () => {
            const allAccounts = accountManager.getAccounts();
            // Filter out the current logged-in user (they're already in the call)
            const currentUserId = UserStore.getCurrentUser()?.id;
            const filteredAccounts = allAccounts.filter(a => a.id !== currentUserId);
            setAccounts(filteredAccounts);
        };
        updateAccounts();
        const unsubscribe = accountManager.subscribeToAccountChanges(updateAccounts);
        return () => unsubscribe();
    }, []);

    // Sync selection with accounts on load/change
    useEffect(() => {
        if (accounts.length > 0 && selectedIds.size === 0 && accounts.length > 0) {
            setSelectedIds(new Set(accounts.map(a => a.id)));
        }
    }, [accounts.length]);

    // Subscribe to connection state changes
    useEffect(() => {
        const updateStates = () => {
            const newStates = new Map<string, { status: ConnectionStatus; mute: boolean; deaf: boolean; video: boolean }>();
            for (const [id, conn] of massJoiner.getAllConnections()) {
                newStates.set(id, {
                    status: conn.status,
                    mute: conn.selfMute,
                    deaf: conn.selfDeaf,
                    video: conn.selfVideo
                });
            }
            setConnectionStates(newStates);
        };
        updateStates();
        return subscribeToMassJoiner(updateStates);
    }, []);

    const toggleSelection = useCallback((accountId: string) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(accountId)) newSet.delete(accountId);
            else newSet.add(accountId);
            return newSet;
        });
    }, []);

    const selectAll = useCallback(() => {
        if (selectedIds.size === accounts.length) setSelectedIds(new Set());
        else setSelectedIds(new Set(accounts.map(a => a.id)));
    }, [accounts, selectedIds.size]);

    const performJoin = async (accs: Account[], guildId: string, channelId: string) => {
        if (companionConnected) {
            const tokens = accs.map(a => a.token).filter(t => !!t);
            companionClient.joinVoice(tokens, guildId, channelId);
            showToast(`Sent ${tokens.length} accounts to Voice Companion`, Toasts.Type.SUCCESS);
        } else {
            setIsJoining(true);
            await massJoiner.connectAllAccounts(accs, guildId, channelId);
            setIsJoining(false);
        }
    };

    const handleJoinAll = useCallback(async () => {
        const vcInfo = getCurrentVoiceChannelInfo();
        if (!vcInfo) {
            showToast("Join a voice channel first!", Toasts.Type.FAILURE);
            return;
        }

        const selectedAccounts = accounts.filter((a: Account) => selectedIds.has(a.id));
        if (selectedAccounts.length === 0) {
            showToast("No accounts selected", Toasts.Type.FAILURE);
            return;
        }

        if (!vcInfo.guildId) {
            showToast("Cannot use in DM calls", Toasts.Type.FAILURE);
            return;
        }

        await performJoin(selectedAccounts, vcInfo.guildId, vcInfo.channelId);

    }, [accounts, selectedIds, companionConnected]);

    const handleLeaveAll = useCallback(() => {
        if (companionConnected) {
            companionClient.disconnectAll();
            showToast("Sent disconnect command to Voice Companion", Toasts.Type.SUCCESS);
        } else {
            massJoiner.disconnectAll();
            showToast("All accounts disconnected", Toasts.Type.SUCCESS);
        }
    }, [companionConnected]);

    // --- Mass Handlers ---
    const handleMuteAll = useCallback((state: boolean) => {
        if (companionConnected) {
            companionClient.toggleMuteAll(state);
            showToast(state ? "Muting All (Remote)" : "Unmuting All (Remote)", Toasts.Type.SUCCESS);
        } else {
            massJoiner.setAllAccountsState({ mute: state });
            showToast(state ? "Muted All" : "Unmuted All", Toasts.Type.SUCCESS);
        }
    }, [companionConnected]);

    const handleDeafAll = useCallback((state: boolean) => {
        if (companionConnected) {
            companionClient.toggleDeafAll(state);
            showToast(state ? "Deafening All (Remote)" : "Undeafening All (Remote)", Toasts.Type.SUCCESS);
        } else {
            massJoiner.setAllAccountsState({ deaf: state });
            showToast(state ? "Deafened All" : "Undeafened All", Toasts.Type.SUCCESS);
        }
    }, [companionConnected]);

    const handleVideoAll = useCallback((state: boolean) => {
        if (companionConnected) {
            companionClient.toggleVideoAll(state);
            showToast(state ? "Cam On All (Remote)" : "Cam Off All (Remote)", Toasts.Type.SUCCESS);
        } else {
            massJoiner.setAllAccountsState({ video: state });
            showToast(state ? "Cam On All" : "Cam Off All", Toasts.Type.SUCCESS);
        }
    }, [companionConnected]);

    // --- Individual Handlers ---
    const handleAccountAction = (account: Account, action: "mute" | "deaf" | "video", currentState: boolean) => {
        const newState = !currentState;
        if (companionConnected) {
            // Optimistic update
            setRemoteStates(prev => {
                const next = new Map(prev);
                const current = next.get(account.id) || { mute: false, deaf: false, video: false };
                next.set(account.id, { ...current, [action]: newState });
                return next;
            });

            if (action === "mute") companionClient.toggleMuteAccount(account.token, newState);
            if (action === "deaf") companionClient.toggleDeafAccount(account.token, newState);
            if (action === "video") companionClient.toggleVideoAccount(account.token, newState);
        } else {
            massJoiner.setAccountState(account.id, { [action]: newState });
        }
    };

    // --- Settings Handlers ---
    const handleAutoJoinToggle = useCallback(() => {
        const newValue = !autoJoin;
        setAutoJoin(newValue);
        settingsManager.setToggle("massJoinerAutoJoin", newValue);
        showToast(newValue ? "Auto-join enabled" : "Auto-join disabled", Toasts.Type.SUCCESS);
    }, [autoJoin]);

    const handlePullAssistToggle = useCallback(() => {
        const newValue = !pullAssistEnabled;
        setPullAssistEnabled(newValue);
        settingsManager.setToggle("massJoinerPullAssistEnabled", newValue);
    }, [pullAssistEnabled]);

    const handlePullerChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value;
        setPullerId(val);
        settingsManager.setMassJoinerPullerId(val);
    }, []);

    const localConnectedCount = massJoiner.getConnectedAccounts().length;
    const connectedCount = companionConnected ? companionCount : localConnectedCount;
    const vcInfo = getCurrentVoiceChannelInfo();

    return (
        <div className="selfbot-dmclear-page">
            {/* Header */}
            <div className="selfbot-dmclear-page-header">
                <div className="selfbot-dmclear-back-btn" onClick={onBack}>
                    <Icons.Back />
                </div>
                <div className="selfbot-dmclear-page-title">
                    <h3>Mass Joiner</h3>
                    <span>Control multiple accounts in voice</span>
                </div>
            </div>

            {/* Tabs */}
            <div className="selfbot-tabs" style={{ display: "flex", gap: "8px", padding: "0 16px", borderBottom: "1px solid var(--selfbot-border)", marginBottom: "16px" }}>
                {["dashboard", "controls", "settings"].map(tab => (
                    <div
                        key={tab}
                        onClick={() => setActiveTab(tab as any)}
                        style={{
                            padding: "10px 16px",
                            cursor: "pointer",
                            color: activeTab === tab ? "var(--selfbot-text-primary)" : "var(--selfbot-text-muted)",
                            borderBottom: activeTab === tab ? "2px solid var(--selfbot-accent)" : "2px solid transparent",
                            fontWeight: activeTab === tab ? 600 : 400,
                            textTransform: "capitalize",
                            transition: "all 0.2s ease"
                        }}
                    >
                        {tab}
                    </div>
                ))}
            </div>

            <div className="selfbot-massjoiner-content" style={{ padding: "0 16px", overflowY: "auto", flex: 1 }}>

                {/* DASHBOARD TAB */}
                {activeTab === "dashboard" && (
                    <div className="animate-fade-in">
                        {/* Status Bar */}
                        <div className="selfbot-massjoiner-status-bar" style={{ marginBottom: "16px" }}>
                            <div className="selfbot-massjoiner-status-item">
                                <Icons.Account />
                                <span>{accounts.length} accts</span>
                            </div>
                            <div className="selfbot-massjoiner-status-item connected">
                                <Icons.Voice />
                                <span>{connectedCount} in call</span>
                            </div>
                        </div>

                        {/* Join/Leave Actions */}
                        <div className="selfbot-massjoiner-actions" style={{ display: "flex", gap: "12px", marginBottom: "24px" }}>
                            <button
                                className={`selfbot-massjoiner-action-btn primary ${isJoining ? "loading" : ""}`}
                                onClick={handleJoinAll}
                                disabled={isJoining || !vcInfo}
                                style={{ flex: 1, height: "40px", fontSize: "14px" }}
                            >
                                {isJoining ? "Joining..." : <> <Icons.Voice /> <span>Join Selected</span> </>}
                            </button>
                            <button
                                className="selfbot-massjoiner-action-btn danger"
                                onClick={handleLeaveAll}
                                disabled={connectedCount === 0}
                                style={{ flex: 1, height: "40px", fontSize: "14px" }}
                            >
                                <Icons.Disconnect /> <span>Leave All</span>
                            </button>
                        </div>

                        {/* Accounts List Header */}
                        <div className="selfbot-list-header" style={{ marginBottom: "8px" }}>
                            <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--selfbot-text-secondary)" }}>ACCOUNTS ({accounts.length})</span>
                            <div style={{ display: "flex", gap: "8px" }}>
                                <button className="selfbot-text-btn" onClick={() => accountManager.loadAccounts()}>Refresh</button>
                                <button className="selfbot-text-btn" onClick={selectAll}>
                                    {selectedIds.size === accounts.length ? "Deselect All" : "Select All"}
                                </button>
                            </div>
                        </div>

                        {/* Accounts List */}
                        <div className="selfbot-massjoiner-list" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            {accounts.map(account => {
                                const conn = connectionStates.get(account.id);
                                // If using companion, we don't have per-account state easily unless we track it manually or assume from commands.
                                // For now, let's just show "Connected" if count > 0? No, that's bad.
                                // With companion, we only know "connected count". We don't know WHICH ones are connected.
                                // Wait, `companionClient` should ideally track which tokens are active, but it just tracks count.
                                // IMPORTANT limitation: Companion doesn't report back WHICH bots connected.
                                // However, `connectionStates` works for LOCAL mass joiner.
                                // For visual feedback with Companion, we might assume "Selected + Count > 0 = Connected"? No.
                                // For now, I will use local state if available. If companion, I can't show per-account status easily correctly without protocol update.
                                // But controls are requested.

                                const status = conn?.status || "disconnected";
                                const isSelected = selectedIds.has(account.id);

                                // Determine state (local or remote/optimistic)
                                const remoteState = remoteStates.get(account.id);
                                const isMuted = companionConnected ? (remoteState?.mute ?? false) : (conn?.mute ?? false);
                                const isDeaf = companionConnected ? (remoteState?.deaf ?? false) : (conn?.deaf ?? false);
                                const isVideo = companionConnected ? (remoteState?.video ?? false) : (conn?.video ?? false);

                                return (
                                    <div key={account.id} className={`selfbot-account-card ${isSelected ? "selected" : ""}`} onClick={() => toggleSelection(account.id)} style={{ padding: "8px 12px" }}>
                                        <div className="selfbot-checkbox-wrapper">
                                            <input type="checkbox" checked={isSelected} readOnly />
                                            <div className="selfbot-checkbox" />
                                        </div>
                                        <div className="selfbot-account-avatar">
                                            <img src={account.avatar || "https://cdn.discordapp.com/embed/avatars/0.png"} alt="" />
                                            <div className={`selfbot-status-indicator ${status}`} title={status} />
                                        </div>
                                        <div className="selfbot-account-info" style={{ flex: 1 }}>
                                            <div className="username">{account.username}</div>
                                            <div className="status-text">{status}</div>
                                        </div>

                                        {/* Inline Controls */}
                                        <div className="selfbot-account-inline-controls" onClick={e => e.stopPropagation()} style={{ display: "flex", gap: "4px" }}>
                                            <button className={`selfbot-icon-btn small ${isMuted ? "active" : ""}`} onClick={() => handleAccountAction(account, "mute", isMuted)} title="Toggle Mute">
                                                {isMuted ? <Icons.MicOff /> : <Icons.MicOn />}
                                            </button>
                                            <button className={`selfbot-icon-btn small ${isDeaf ? "active" : ""}`} onClick={() => handleAccountAction(account, "deaf", isDeaf)} title="Toggle Deaf">
                                                {isDeaf ? <Icons.HeadphoneOff /> : <Icons.HeadphoneOn />}
                                            </button>
                                            <button className={`selfbot-icon-btn small ${isVideo ? "active" : ""}`} onClick={() => handleAccountAction(account, "video", isVideo)} title="Toggle Video">
                                                {isVideo ? <Icons.VideoOn /> : <Icons.VideoOff />}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* CONTROLS TAB */}
                {activeTab === "controls" && (
                    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                        {/* Mass Toggles */}
                        <div className="selfbot-settings-group">
                            <label className="selfbot-settings-label" style={{ fontSize: "14px", marginBottom: "8px", display: "block" }}>Mass Controls</label>
                            <span className="selfbot-settings-desc" style={{ marginBottom: "12px", display: "block" }}>Apply action to ALL connected accounts instantly.</span>

                            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                {/* Microphone Row */}
                                <div className="selfbot-control-row">
                                    <div className="selfbot-control-label">
                                        <Icons.MicOn />
                                        <span>Microphone</span>
                                    </div>
                                    <div className="selfbot-control-buttons">
                                        <button className="selfbot-icon-btn success" onClick={() => handleMuteAll(false)} title="Unmute All">
                                            <Icons.MicOn />
                                        </button>
                                        <button className="selfbot-icon-btn danger" onClick={() => handleMuteAll(true)} title="Mute All">
                                            <Icons.MicOff />
                                        </button>
                                    </div>
                                </div>

                                {/* Headphones Row */}
                                <div className="selfbot-control-row">
                                    <div className="selfbot-control-label">
                                        <Icons.HeadphoneOn />
                                        <span>Headphones</span>
                                    </div>
                                    <div className="selfbot-control-buttons">
                                        <button className="selfbot-icon-btn success" onClick={() => handleDeafAll(false)} title="Undeaf All">
                                            <Icons.HeadphoneOn />
                                        </button>
                                        <button className="selfbot-icon-btn danger" onClick={() => handleDeafAll(true)} title="Deaf All">
                                            <Icons.HeadphoneOff />
                                        </button>
                                    </div>
                                </div>

                                {/* Camera Row */}
                                <div className="selfbot-control-row">
                                    <div className="selfbot-control-label">
                                        <Icons.VideoOn />
                                        <span>Camera</span>
                                    </div>
                                    <div className="selfbot-control-buttons">
                                        <button className="selfbot-icon-btn success" onClick={() => handleVideoAll(true)} title="Camera On">
                                            <Icons.VideoOn />
                                        </button>
                                        <button className="selfbot-icon-btn danger" onClick={() => handleVideoAll(false)} title="Camera Off">
                                            <Icons.VideoOff />
                                        </button>
                                    </div>
                                </div>

                            </div>
                        </div>

                        {/* Pull Assist */}
                        <div className="selfbot-settings-group">
                            <label className="selfbot-settings-label">Pull Assist</label>
                            <div className="selfbot-toggle-row">
                                <div className="selfbot-toggle-info">
                                    <span>Enable Pull Assist</span>
                                    <span className="sub">Use a specific account to move users</span>
                                </div>
                                <ToggleSwitch checked={pullAssistEnabled} onChange={handlePullAssistToggle} />
                            </div>
                            {pullAssistEnabled && (
                                <div className="selfbot-setting-item" style={{ marginTop: "12px" }}>
                                    <span>Puller Account</span>
                                    <select className="selfbot-input" value={pullerId} onChange={handlePullerChange} style={{ width: "100%" }}>
                                        <option value="">Select an account...</option>
                                        {accounts.map(a => (
                                            <option key={a.id} value={a.id}>{a.username}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* SETTINGS TAB */}
                {activeTab === "settings" && (
                    <div className="animate-fade-in">
                        {/* Companion Status Indicator */}
                        <div className="selfbot-settings-group">
                            <label className="selfbot-settings-label">Companion Status</label>
                            <div style={{
                                display: "flex",
                                alignItems: "center",
                                padding: "12px",
                                background: companionConnected ? "rgba(67, 181, 129, 0.1)" : "rgba(240, 71, 71, 0.1)",
                                border: companionConnected ? "1px solid rgba(67, 181, 129, 0.2)" : "1px solid rgba(240, 71, 71, 0.2)",
                                borderRadius: "8px"
                            }}>
                                <div style={{
                                    width: "12px",
                                    height: "12px",
                                    borderRadius: "50%",
                                    background: companionConnected ? "#43b581" : "#f04747",
                                    marginRight: "10px",
                                    boxShadow: companionConnected ? "0 0 10px rgba(67, 181, 129, 0.5)" : "none"
                                }} />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, color: "var(--selfbot-text-primary)" }}>
                                        {companionConnected ? "Connected to Companion" : "Disconnected"}
                                    </div>
                                    <div style={{ fontSize: "11px", color: "var(--selfbot-text-muted)" }}>
                                        {companionConnected ? "Ready to control external accounts" : "Check if server is running on localhost:8999"}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="selfbot-settings-group">
                            <label className="selfbot-settings-label">Automation</label>
                            <div className="selfbot-toggle-row">
                                <div className="selfbot-toggle-info">
                                    <span>Auto Join</span>
                                    <span className="sub">Automatically join when you enter a call</span>
                                </div>
                                <ToggleSwitch checked={autoJoin} onChange={handleAutoJoinToggle} />
                            </div>
                        </div>

                        {/* Voice Companion Settings */}
                        {companionConnected && (
                            <div className="selfbot-settings-group">
                                <label className="selfbot-settings-label">
                                    <Icons.Voice /> Voice Companion
                                </label>

                                {/* Use Real Mic Toggle */}
                                <div className="selfbot-toggle-row">
                                    <div className="selfbot-toggle-info">
                                        <span>Use Real Microphone</span>
                                        <span className="sub">Stream your mic audio to all bots</span>
                                    </div>
                                    <ToggleSwitch
                                        checked={micEnabled}
                                        onChange={() => companionClient.toggleMic(!micEnabled)}
                                    />
                                </div>

                                {/* Audio Device Selector */}
                                <div className="selfbot-setting-item" style={{ marginTop: "8px" }}>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                            <Icons.MicOn />
                                            <span style={{ fontSize: "13px" }}>Audio Device</span>
                                        </div>
                                        <button
                                            className="selfbot-icon-btn small"
                                            onClick={() => companionClient.getDevices()}
                                            title="Refresh"
                                        >
                                            <Icons.Refresh />
                                        </button>
                                    </div>
                                    <select
                                        className="selfbot-input"
                                        value={currentAudioDevice}
                                        onChange={e => companionClient.setDevice(e.target.value)}
                                        style={{ width: "100%" }}
                                    >
                                        <option value="">Select a microphone...</option>
                                        {audioDevices.map((d, i) => (
                                            <option key={i} value={d}>{d}</option>
                                        ))}
                                    </select>
                                </div>

                                <hr style={{ border: "none", borderTop: "1px solid var(--selfbot-border)", margin: "12px 0" }} />

                                {/* Use Real Camera Toggle */}
                                <div className="selfbot-toggle-row">
                                    <div className="selfbot-toggle-info">
                                        <span>Use Real Camera</span>
                                        <span className="sub">Stream your webcam to all bots</span>
                                    </div>
                                    <ToggleSwitch
                                        checked={cameraEnabled}
                                        onChange={() => {
                                            if (!cameraEnabled) {
                                                showToast("Warning: Real Camera feature is experimental", Toasts.Type.WARNING);
                                            }
                                            companionClient.toggleCamera(!cameraEnabled);
                                        }}
                                    />
                                    <div style={{ marginLeft: "10px", fontSize: "10px", color: "#faa61a", fontWeight: "bold" }}>⚠️ Buggy</div>
                                </div>

                                {/* Camera Device Selector */}
                                <div className="selfbot-setting-item" style={{ marginTop: "8px" }}>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                            <Icons.VideoOn />
                                            <span style={{ fontSize: "13px" }}>Camera Device</span>
                                        </div>
                                        <button
                                            className="selfbot-icon-btn small"
                                            onClick={() => companionClient.getVideoDevices()}
                                            title="Refresh"
                                        >
                                            <Icons.Refresh />
                                        </button>
                                    </div>
                                    <select
                                        className="selfbot-input"
                                        value={currentVideoDevice}
                                        onChange={e => companionClient.setVideoDevice(e.target.value)}
                                        style={{ width: "100%" }}
                                    >
                                        <option value="">Select a camera...</option>
                                        {videoDevices.map((d, i) => (
                                            <option key={i} value={d}>{d}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Confirmation Modal */}
            {confirmState && confirmState.show && (
                <div className="selfbot-modal-overlay">
                    <div className="selfbot-modal">
                        <div className="selfbot-modal-header">
                            <h3>Confirmation</h3>
                            <button className="close-btn" onClick={() => setConfirmState(null)}>×</button>
                        </div>
                        <div className="selfbot-modal-content">
                            <p>{confirmState.message}</p>
                            {confirmState.subMessage && <p className="sub">{confirmState.subMessage}</p>}
                        </div>
                        <div className="selfbot-modal-footer">
                            <button className="secondary" onClick={() => setConfirmState(null)}>Cancel</button>
                            <button className="primary" onClick={confirmState.onConfirm}>Confirm</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
