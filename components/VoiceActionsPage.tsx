/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChannelStore, GuildChannelStore, GuildMemberStore, PermissionsBits, PermissionStore, SelectedChannelStore, showToast, Toasts, useCallback,useEffect, UserStore, useState, VoiceStateStore } from "@webpack/common";

import { accountManager } from "../utils/accountManagerUtils";
import { getCurrentVoiceChannelInfo } from "../utils/autoMuteUtils";
import { discordApi } from "../utils/discordApiUtils";
import { settingsManager } from "../utils/settingsManager";
import { Icons } from "./Icons";

// Define types for local use if not exported
interface User {
    id: string;
    username: string;
    discriminator: string;
    getAvatarURL(guildId: string | null, size: number): string;
}

export function VoiceActionsPage({ onBack, isTab }: { onBack: () => void, isTab?: boolean }) {
    const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
    const [vcUsers, setVcUsers] = useState<User[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    // Config Modal State
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [configInput, setConfigInput] = useState({ usePerms: false, command: "", channelId: "", useVoiceChat: false });
    const [pendingAction, setPendingAction] = useState<string | null>(null);
    const [channelSearch, setChannelSearch] = useState("");

    // Limit Modal State
    const [showLimitModal, setShowLimitModal] = useState(false);
    const [customLimit, setCustomLimit] = useState("");

    // Pull Modal State
    const [showPullModal, setShowPullModal] = useState(false);
    const [pullChannelId, setPullChannelId] = useState("");

    // Nickname Modal State
    const [showNicknameModal, setShowNicknameModal] = useState(false);
    const [nicknameInput, setNicknameInput] = useState("");
    const [nicknameTargetUserId, setNicknameTargetUserId] = useState<string | null>(null);

    // State to force re-render for toggles
    const [tick, setTick] = useState(0);

    // Update Users Function
    const updateUsers = useCallback(() => {
        const vcInfo = getCurrentVoiceChannelInfo();
        if (vcInfo) {
            const channelState = VoiceStateStore.getVoiceStatesForChannel(vcInfo.channelId);
            if (channelState) {
                const users = Object.values(channelState)
                    .map((state: any) => UserStore.getUser(state.userId))
                    .filter((u: User | undefined): u is User => u !== undefined);
                setVcUsers(users);
                return;
            }
        }
        setVcUsers([]);
    }, []);

    // Load users loop and listeners
    useEffect(() => {
        updateUsers();

        // Refresh interval fallback
        const interval = setInterval(() => {
            setTick((t: number) => t + 1);
            updateUsers();
        }, 1000);

        // Listen for Voice State updates
        const handleVoiceChange = () => {
            setTick((t: number) => t + 1);
            updateUsers();
        };
        VoiceStateStore.addChangeListener(handleVoiceChange);

        return () => {
            clearInterval(interval);
            VoiceStateStore.removeChangeListener(handleVoiceChange);
        };
    }, [updateUsers]);

    // Helper to get display name for a user (server nickname > global name > username)
    const getDisplayName = (user: User, guildId: string | null): string => {
        if (guildId) {
            const nickname = GuildMemberStore.getNick(guildId, user.id);
            if (nickname) return nickname;
        }
        return (user as any).globalName || user.username;
    };

    // Get first selected user for single-user operations like checking mute state
    const getFirstSelectedUser = (): string | null => {
        const arr = Array.from(selectedUserIds);
        return arr.length > 0 ? arr[0] : null;
    };

    const handleAction = async (action: string, label: string) => {
        if (selectedUserIds.size === 0) {
            showToast("No user selected", Toasts.Type.FAILURE);
            return;
        }

        const vcInfo = getCurrentVoiceChannelInfo();
        const guildId = vcInfo?.guildId;

        setIsLoading(true);
        let successCount = 0;
        let failCount = 0;

        try {
            for (const targetId of selectedUserIds) {
                let targetGuildId = guildId;

                if (!targetGuildId) {
                    const state = VoiceStateStore.getVoiceStateForUser(targetId);
                    if (state && state.guildId) {
                        targetGuildId = state.guildId;
                    } else {
                        const channelId = SelectedChannelStore.getChannelId();
                        if (channelId) {
                            const channel = ChannelStore.getChannel(channelId);
                            if (channel?.guild_id) targetGuildId = channel.guild_id;
                        }
                    }
                }

                if (!targetGuildId) {
                    failCount++;
                    continue;
                }

                let success = false;

                switch (action) {
                    case "toggle_mute": {
                        const vs = VoiceStateStore.getVoiceStateForUser(targetId);
                        const isMuted = vs?.mute || false;
                        success = await discordApi.setServerMute(targetGuildId, targetId, !isMuted);
                        break;
                    }
                    case "toggle_deaf": {
                        const vs = VoiceStateStore.getVoiceStateForUser(targetId);
                        const isDeaf = vs?.deaf || false;
                        success = await discordApi.setServerDeaf(targetGuildId, targetId, !isDeaf);
                        break;
                    }
                    case "disconnect":
                        success = await discordApi.setChannel(targetGuildId, targetId, null);
                        break;
                    case "pull":
                        if (!vcInfo?.channelId) {
                            failCount++;
                            continue;
                        }
                        success = await discordApi.setChannel(targetGuildId, targetId, vcInfo.channelId);
                        break;
                }

                if (success) successCount++;
                else failCount++;
            }

            if (failCount === 0) {
                showToast(`${label} successful for ${successCount} user(s)`, Toasts.Type.SUCCESS);
            } else if (successCount > 0) {
                showToast(`${label}: ${successCount} success, ${failCount} failed`, Toasts.Type.MESSAGE);
            } else {
                showToast(`${label} failed for all users`, Toasts.Type.FAILURE);
            }
        } catch (err) {
            console.error(err);
            showToast(`Error executing ${label}`, Toasts.Type.FAILURE);
        } finally {
            setIsLoading(false);
            setTick((t: number) => t + 1);
        }
    };

    const handlePullContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        if (selectedUserIds.size === 0) {
            showToast("Select a user first", Toasts.Type.FAILURE);
            return;
        }
        setShowPullModal(true);
    };

    const executeCustomPull = async () => {
        if (!pullChannelId) {
            showToast("Enter a Channel ID", Toasts.Type.FAILURE);
            return;
        }
        if (selectedUserIds.size === 0) {
            showToast("No user selected", Toasts.Type.FAILURE);
            return;
        }

        let successCount = 0;
        let failCount = 0;

        for (const targetId of selectedUserIds) {
            let targetGuildId = "";
            const vs = VoiceStateStore.getVoiceStateForUser(targetId);
            if (vs) targetGuildId = vs.guildId;

            if (!targetGuildId) {
                const vcInfo = getCurrentVoiceChannelInfo();
                if (vcInfo) targetGuildId = vcInfo.guildId;
            }

            if (!targetGuildId) {
                failCount++;
                continue;
            }

            const success = await discordApi.setChannel(targetGuildId, targetId, pullChannelId);
            if (success) successCount++;
            else failCount++;
        }

        if (successCount > 0) {
            showToast(`Moved ${successCount} user(s)!`, Toasts.Type.SUCCESS);
            setShowPullModal(false);
        } else {
            showToast("Failed to move. Check ID/Perms.", Toasts.Type.FAILURE);
        }
    };

    // Nickname change handler
    const handleNicknameChange = async () => {
        if (!nicknameTargetUserId) return;

        const vcInfo = getCurrentVoiceChannelInfo();
        let guildId = vcInfo?.guildId;

        if (!guildId) {
            const vs = VoiceStateStore.getVoiceStateForUser(nicknameTargetUserId);
            if (vs?.guildId) guildId = vs.guildId;
        }

        if (!guildId) {
            showToast("Could not determine server", Toasts.Type.FAILURE);
            return;
        }

        const success = await discordApi.setNickname(guildId, nicknameTargetUserId, nicknameInput || null);
        if (success) {
            showToast("Nickname updated!", Toasts.Type.SUCCESS);
            setShowNicknameModal(false);
            setNicknameInput("");
            setNicknameTargetUserId(null);
        } else {
            showToast("Failed to change nickname. Check permissions.", Toasts.Type.FAILURE);
        }
    };

    const openNicknameModal = (userId: string) => {
        const vcInfo = getCurrentVoiceChannelInfo();
        const guildId = vcInfo?.guildId;

        // Get current nickname if exists
        const currentNick = guildId ? GuildMemberStore.getNick(guildId, userId) : null;
        setNicknameInput(currentNick || "");
        setNicknameTargetUserId(userId);
        setShowNicknameModal(true);
    };

    // Lock Call Handlers
    const executeLockCommand = async (config: { usePerms: boolean, command: string, channelId: string, useVoiceChat?: boolean }, suffix: string) => {
        const vcInfo = getCurrentVoiceChannelInfo();
        if (!vcInfo) return;

        if (config.usePerms) {
            // Permission Mode - use alt account if available to change channel limit
            const limitValue = suffix === "0" ? 0 : (suffix === "1" ? 1 : parseInt(suffix));
            if (isNaN(limitValue)) {
                showToast("Invalid limit value", Toasts.Type.FAILURE);
                return;
            }

            const success = await discordApi.setChannelLimit(vcInfo.channelId, limitValue);
            if (success) {
                showToast(`Channel limit set to ${limitValue === 0 ? "Unlimited" : limitValue}`, Toasts.Type.SUCCESS);
            } else {
                showToast("Failed to change channel limit. Check permissions.", Toasts.Type.FAILURE);
            }
            return;
        }

        // Determine which channel to send the command to
        const targetChannelId = config.useVoiceChat ? vcInfo.channelId : config.channelId;

        if (!targetChannelId) {
            showToast("No channel configured for commands", Toasts.Type.FAILURE);
            return;
        }

        // Validate channel exists and has permission to send messages BEFORE connecting
        const targetChannel = ChannelStore.getChannel(targetChannelId);
        if (!targetChannel) {
            showToast("Channel not found. Check the Channel ID.", Toasts.Type.FAILURE);
            return;
        }

        // Command Mode - need to join voice first, then send, then leave
        const activeAccount = accountManager.getActiveAccount();

        // Check if we have permission to send messages in that channel
        // Only check strictly if using the main account (since PermissionStore checks Main User)
        if (!activeAccount?.token) {
            const canSendMessages = PermissionStore.can(PermissionsBits.SEND_MESSAGES, targetChannel);
            if (!canSendMessages) {
                showToast("No permission to send messages in that channel.", Toasts.Type.FAILURE);
                return;
            }
        }

        const { guildId } = vcInfo;

        if (!guildId) {
            showToast("Cannot use bot commands in DMs", Toasts.Type.FAILURE);
            return;
        }

        if (activeAccount && activeAccount.token) {
            // Alt account flow: join -> send -> leave
            showToast("Connecting...", Toasts.Type.MESSAGE);

            try {
                // Try to join voice
                await discordApi.joinVoiceWithToken(activeAccount.token, guildId, vcInfo.channelId);

                // Wait for connection to establish
                await new Promise(r => setTimeout(r, 300));

                // Send the command
                const cmd = `${config.command} ${suffix}`;
                const success = await discordApi.sendMessage(targetChannelId, cmd);

                if (success) {
                    showToast(`Sent: ${cmd}`, Toasts.Type.SUCCESS);
                } else {
                    showToast("Failed to send command.", Toasts.Type.FAILURE);
                }

                // Wait before disconnecting
                await new Promise(r => setTimeout(r, 200));
            } catch (e) {
                console.error("[VoiceActions] Error:", e);
                showToast("Error executing command", Toasts.Type.FAILURE);
            } finally {
                // Always disconnect
                await discordApi.leaveVoiceWithToken();
            }
        } else {
            // No alt account - just send the message with current account
            const cmd = `${config.command} ${suffix}`;
            const success = await discordApi.sendMessage(targetChannelId, cmd);
            if (success) {
                showToast(`Sent: ${cmd}`, Toasts.Type.SUCCESS);
            } else {
                showToast("Failed to send command. Check Channel ID.", Toasts.Type.FAILURE);
            }
        }
    };

    const handleLockCall = async (suffix: string) => {
        const vcInfo = getCurrentVoiceChannelInfo();
        if (!vcInfo) {
            showToast("Join a voice channel first!", Toasts.Type.FAILURE);
            return;
        }

        const key = vcInfo.guildId || vcInfo.channelId;
        const config = settingsManager.getCallConfig(key);

        if (!config) {
            setConfigInput({ usePerms: false, command: "", channelId: "", useVoiceChat: false });
            setPendingAction(suffix);
            setShowConfigModal(true);
            return;
        }

        executeLockCommand(config, suffix);
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        const vcInfo = getCurrentVoiceChannelInfo();
        if (!vcInfo) {
            showToast("Join a voice channel first", Toasts.Type.FAILURE);
            return;
        }

        const key = vcInfo.guildId || vcInfo.channelId;
        const config = settingsManager.getCallConfig(key);
        setConfigInput({
            usePerms: config?.usePerms || false,
            command: config?.command || "",
            channelId: config?.channelId || "",
            useVoiceChat: config?.useVoiceChat || false
        });
        setPendingAction(null);
        setShowConfigModal(true);
    };

    const saveConfig = () => {
        const vcInfo = getCurrentVoiceChannelInfo();
        if (!vcInfo) return;

        // Validate: if not using perms, need command and either useVoiceChat or channelId
        if (!configInput.usePerms) {
            if (!configInput.command) {
                showToast("Bot command is required", Toasts.Type.FAILURE);
                return;
            }
            if (!configInput.useVoiceChat && !configInput.channelId) {
                showToast("Select 'Use Voice Chat' or specify a Channel ID", Toasts.Type.FAILURE);
                return;
            }
        }

        const config = {
            usePerms: configInput.usePerms,
            command: configInput.command,
            channelId: configInput.channelId,
            useVoiceChat: configInput.useVoiceChat
        };
        const key = vcInfo.guildId || vcInfo.channelId;
        settingsManager.setCallConfig(key, config);
        showToast("Configuration saved!", Toasts.Type.SUCCESS);
        setShowConfigModal(false);
        setPendingAction(null);
    };

    const handleCustomLimitExecute = () => {
        if (!customLimit) {
            showToast("Please enter a limit", Toasts.Type.FAILURE);
            return;
        }
        handleLockCall(customLimit);
        setShowLimitModal(false);
    };

    // Get current guild ID for display names
    const vcInfo = getCurrentVoiceChannelInfo();
    const currentGuildId = vcInfo?.guildId || null;

    // For mute/deaf indicators on single selection
    const firstSelectedId = getFirstSelectedUser();
    const firstSelectedVS = firstSelectedId ? VoiceStateStore.getVoiceStateForUser(firstSelectedId) : null;
    const isMuted = firstSelectedVS?.mute || false;
    const isDeaf = firstSelectedVS?.deaf || false;

    // Toggle selection for a user
    const toggleUserSelection = (userId: string) => {
        setSelectedUserIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(userId)) {
                newSet.delete(userId);
            } else {
                newSet.add(userId);
            }
            return newSet;
        });
    };

    // Select all / deselect all
    const selectAllUsers = () => {
        if (selectedUserIds.size === vcUsers.length) {
            setSelectedUserIds(new Set());
        } else {
            setSelectedUserIds(new Set(vcUsers.map(u => u.id)));
        }
    };

    return (
        <div className="selfbot-dmclear-page" style={{ position: "relative", height: "100%", overflow: "hidden", borderRadius: isTab ? "0" : undefined }}>
            {!isTab && (
                <div className="selfbot-dmclear-page-header">
                    <div className="selfbot-dmclear-back-btn" onClick={onBack}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
                        </svg>
                    </div>
                    <div className="selfbot-dmclear-title">Voice Actions</div>
                </div>
            )}

            <div className="selfbot-panel-content" style={{ paddingBottom: "60px", paddingTop: isTab ? "12px" : undefined, height: "100%", overflowY: "auto" }}>

                {/* Search / Target Area */}
                <div className="selfbot-voice-target-area" style={{ paddingLeft: "20px", paddingRight: "40px" }}>
                    <div className="selfbot-input-group">
                        <div style={{ position: "relative" }}>
                            <input
                                type="text"
                                className="selfbot-input"
                                placeholder="Search user or paste ID..."
                                value={searchQuery}
                                onChange={e => {
                                    setSearchQuery(e.target.value);
                                    // If paste a valid ID, add to selection
                                    if (e.target.value.match(/^\d{17,20}$/)) {
                                        setSelectedUserIds(prev => new Set([...prev, e.target.value]));
                                    }
                                }}
                            />
                            {searchQuery && (
                                <div className="selfbot-search-clear" onClick={() => { setSearchQuery(""); }}>×</div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Actions Grid */}
                <div className={`selfbot-voice-actions-grid ${selectedUserIds.size === 0 ? "disabled" : ""}`} style={{ marginTop: "4px", padding: "0 12px" }}>
                    <button
                        className={`selfbot-action-btn ${isMuted ? "mute" : ""}`}
                        onClick={() => handleAction("toggle_mute", isMuted ? "Unmute" : "Mute")}
                        title={isMuted ? "Unmute User(s)" : "Mute User(s)"}
                    >
                        {isMuted ? <Icons.MicOff /> : <Icons.MicOn />}
                        <span>{isMuted ? "Unmute" : "Mute"}</span>
                    </button>

                    <button
                        className={`selfbot-action-btn ${isDeaf ? "deafen" : ""}`}
                        onClick={() => handleAction("toggle_deaf", isDeaf ? "Undeafen" : "Deafen")}
                        title={isDeaf ? "Undeafen User(s)" : "Deafen User(s)"}
                    >
                        {isDeaf ? <Icons.HeadphoneOff /> : <Icons.HeadphoneOn />}
                        <span>{isDeaf ? "Undeaf" : "Deaf"}</span>
                    </button>

                    <button
                        className="selfbot-action-btn pull"
                        onClick={() => handleAction("pull", "Pull")}
                        onContextMenu={handlePullContextMenu}
                        title="Left-click: Pull Here | Right-click: Pull to Channel"
                    >
                        <Icons.Link />
                        <span>Pull</span>
                    </button>

                    <button className="selfbot-action-btn" onClick={() => handleAction("disconnect", "Disconnect")}>
                        <Icons.ShieldDisconnect />
                        <span>Disconnect</span>
                    </button>
                </div>

                {/* Users List */}
                <div className="selfbot-voice-list-section">
                    <div className="selfbot-section-title" style={{ fontSize: "11px", marginBottom: "4px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span>
                            CALL PARTICIPANTS <span className="selfbot-badge">{vcUsers.length}</span>
                            {selectedUserIds.size > 0 && (
                                <span className="selfbot-badge" style={{ marginLeft: "4px", background: "rgba(194, 24, 24, 0.3)" }}>
                                    {selectedUserIds.size} selected
                                </span>
                            )}
                        </span>
                        {vcUsers.length > 1 && (
                            <button
                                className="selfbot-btn-mini"
                                onClick={selectAllUsers}
                                style={{
                                    padding: "2px 8px",
                                    fontSize: "10px",
                                    background: "rgba(255,255,255,0.05)",
                                    border: "none",
                                    borderRadius: "4px",
                                    color: "var(--selfbot-text-muted)",
                                    cursor: "pointer"
                                }}
                            >
                                {selectedUserIds.size === vcUsers.length ? "Deselect All" : "Select All"}
                            </button>
                        )}
                    </div>

                    {vcUsers.length === 0 ? (
                        <div className="selfbot-empty-search">
                            <Icons.Friends />
                            <span>No users nearby</span>
                        </div>
                    ) : (
                        <div className="selfbot-user-grid">
                            {vcUsers
                                .filter(u => !searchQuery ||
                                    u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                    u.id.includes(searchQuery) ||
                                    (currentGuildId && GuildMemberStore.getNick(currentGuildId, u.id)?.toLowerCase().includes(searchQuery.toLowerCase())) ||
                                    (u as any).globalName?.toLowerCase().includes(searchQuery.toLowerCase())
                                )
                                .map((u: User) => {
                                    const isSelected = selectedUserIds.has(u.id);
                                    const displayName = getDisplayName(u, currentGuildId);

                                    return (
                                        <div
                                            key={u.id}
                                            className={`selfbot-user-card-sm ${isSelected ? "selected" : ""}`}
                                            onClick={() => toggleUserSelection(u.id)}
                                            onContextMenu={e => {
                                                e.preventDefault();
                                                openNicknameModal(u.id);
                                            }}
                                            title={`${displayName}\nRight-click to change nickname`}
                                        >
                                            {isSelected && (
                                                <div className="selfbot-user-check" style={{
                                                    position: "absolute",
                                                    top: "4px",
                                                    right: "4px",
                                                    width: "16px",
                                                    height: "16px",
                                                    borderRadius: "50%",
                                                    background: "#c21818",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center"
                                                }}>
                                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="white">
                                                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                                                    </svg>
                                                </div>
                                            )}
                                            <img src={u.getAvatarURL(currentGuildId, 48)} alt="" />
                                            <span className="name">{displayName}</span>
                                        </div>
                                    );
                                })}
                        </div>
                    )}
                </div>
            </div>

            {/* Config Modal Overlay */}
            {showConfigModal && (
                <div className="selfbot-modal-overlay">
                    <div className="selfbot-modal-content" style={{ maxWidth: "380px" }}>
                        <div className="selfbot-modal-header">
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                <Icons.Lock />
                                <h3 style={{ margin: 0 }}>Voice Lock Settings</h3>
                            </div>
                            <div className="selfbot-modal-close" onClick={() => setShowConfigModal(false)}>×</div>
                        </div>
                        <div className="selfbot-modal-body" style={{ padding: "16px" }}>
                            {/* Mode Selection Cards */}
                            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "16px" }}>
                                {/* Permission Mode Card */}
                                <div
                                    className={`selfbot-config-card ${configInput.usePerms ? "active" : ""}`}
                                    onClick={() => setConfigInput({ ...configInput, usePerms: true })}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        padding: "12px",
                                        borderRadius: "8px",
                                        background: configInput.usePerms ? "linear-gradient(135deg, rgba(194, 24, 24, 0.2), rgba(194, 24, 24, 0.05))" : "rgba(255,255,255,0.03)",
                                        border: configInput.usePerms ? "1px solid rgba(194, 24, 24, 0.5)" : "1px solid rgba(255,255,255,0.08)",
                                        cursor: "pointer",
                                        transition: "all 0.2s ease"
                                    }}
                                >
                                    <div style={{
                                        width: "36px",
                                        height: "36px",
                                        borderRadius: "8px",
                                        background: configInput.usePerms ? "rgba(194, 24, 24, 0.3)" : "rgba(255,255,255,0.05)",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        marginRight: "12px",
                                        flexShrink: 0
                                    }}>
                                        <Icons.Shield />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600, fontSize: "13px", color: "var(--selfbot-text-primary)" }}>
                                            Permission Mode
                                        </div>
                                        <div style={{ fontSize: "11px", color: "var(--selfbot-text-muted)", marginTop: "2px" }}>
                                            Change channel limit directly (requires Manage Channel)
                                        </div>
                                    </div>
                                    <div style={{
                                        width: "18px",
                                        height: "18px",
                                        borderRadius: "50%",
                                        border: configInput.usePerms ? "5px solid #c21818" : "2px solid rgba(255,255,255,0.3)",
                                        background: configInput.usePerms ? "#c21818" : "transparent",
                                        transition: "all 0.2s ease"
                                    }} />
                                </div>

                                {/* Bot Command Mode Card */}
                                <div
                                    className={`selfbot-config-card ${!configInput.usePerms ? "active" : ""}`}
                                    onClick={() => setConfigInput({ ...configInput, usePerms: false })}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        padding: "12px",
                                        borderRadius: "8px",
                                        background: !configInput.usePerms ? "linear-gradient(135deg, rgba(194, 24, 24, 0.2), rgba(194, 24, 24, 0.05))" : "rgba(255,255,255,0.03)",
                                        border: !configInput.usePerms ? "1px solid rgba(194, 24, 24, 0.5)" : "1px solid rgba(255,255,255,0.08)",
                                        cursor: "pointer",
                                        transition: "all 0.2s ease"
                                    }}
                                >
                                    <div style={{
                                        width: "36px",
                                        height: "36px",
                                        borderRadius: "8px",
                                        background: !configInput.usePerms ? "rgba(194, 24, 24, 0.3)" : "rgba(255,255,255,0.05)",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        marginRight: "12px",
                                        flexShrink: 0
                                    }}>
                                        <Icons.Message />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600, fontSize: "13px", color: "var(--selfbot-text-primary)" }}>
                                            Bot Command Mode
                                        </div>
                                        <div style={{ fontSize: "11px", color: "var(--selfbot-text-muted)", marginTop: "2px" }}>
                                            Send a command to a bot (e.g. hit!call)
                                        </div>
                                    </div>
                                    <div style={{
                                        width: "18px",
                                        height: "18px",
                                        borderRadius: "50%",
                                        border: !configInput.usePerms ? "5px solid #c21818" : "2px solid rgba(255,255,255,0.3)",
                                        background: !configInput.usePerms ? "#c21818" : "transparent",
                                        transition: "all 0.2s ease"
                                    }} />
                                </div>
                            </div>

                            {/* Content Area - Fixed Height */}
                            <div style={{ minHeight: "140px" }}>
                                {!configInput.usePerms ? (
                                    <div style={{
                                        background: "rgba(0,0,0,0.2)",
                                        borderRadius: "8px",
                                        padding: "14px",
                                        border: "1px solid rgba(255,255,255,0.05)"
                                    }}>
                                        <div className="selfbot-input-group" style={{ marginBottom: "12px" }}>
                                            <label style={{ fontSize: "12px", fontWeight: 600, marginBottom: "6px", display: "flex", alignItems: "center", gap: "6px", color: "var(--selfbot-text-primary)" }}>
                                                <Icons.Message /> Bot Command
                                            </label>
                                            <input
                                                className="selfbot-input"
                                                value={configInput.command}
                                                onChange={e => setConfigInput({ ...configInput, command: e.target.value })}
                                                placeholder="e.g. hit!call"
                                                style={{ background: "rgba(0,0,0,0.3)" }}
                                            />
                                            <span style={{ fontSize: "10px", color: "var(--selfbot-text-muted)", marginTop: "4px" }}>
                                                The limit number will be added automatically (e.g. "hit!call 5")
                                            </span>
                                        </div>
                                        <div className="selfbot-input-group" style={{ marginBottom: "12px" }}>
                                            <label style={{ fontSize: "12px", fontWeight: 600, marginBottom: "6px", display: "flex", alignItems: "center", gap: "6px", color: "var(--selfbot-text-primary)" }}>
                                                <Icons.Hashtag /> Command Channel
                                            </label>

                                            {/* Use Voice Chat Toggle */}
                                            <div
                                                onClick={() => setConfigInput({ ...configInput, useVoiceChat: !configInput.useVoiceChat })}
                                                style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    padding: "10px 12px",
                                                    borderRadius: "6px",
                                                    background: configInput.useVoiceChat ? "rgba(194, 24, 24, 0.2)" : "rgba(0,0,0,0.3)",
                                                    border: configInput.useVoiceChat ? "1px solid rgba(194, 24, 24, 0.5)" : "1px solid rgba(255,255,255,0.08)",
                                                    cursor: "pointer",
                                                    marginBottom: "8px",
                                                    transition: "all 0.2s ease"
                                                }}
                                            >
                                                <div style={{
                                                    width: "18px",
                                                    height: "18px",
                                                    borderRadius: "4px",
                                                    border: configInput.useVoiceChat ? "none" : "2px solid rgba(255,255,255,0.3)",
                                                    background: configInput.useVoiceChat ? "#c21818" : "transparent",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    marginRight: "10px",
                                                    transition: "all 0.2s ease"
                                                }}>
                                                    {configInput.useVoiceChat && (
                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
                                                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                                                        </svg>
                                                    )}
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--selfbot-text-primary)" }}>
                                                        Use Voice Chat
                                                    </div>
                                                    <div style={{ fontSize: "10px", color: "var(--selfbot-text-muted)", marginTop: "2px" }}>
                                                        Send command to the voice channel's text chat
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Channel input - only show if not using voice chat */}
                                            {!configInput.useVoiceChat && (
                                                <>
                                                    <input
                                                        className="selfbot-input"
                                                        value={channelSearch || configInput.channelId}
                                                        onChange={e => {
                                                            const val = e.target.value;
                                                            setChannelSearch(val);
                                                            // If it looks like an ID, set it directly
                                                            if (val.match(/^\d{17,20}$/)) {
                                                                setConfigInput({ ...configInput, channelId: val });
                                                            }
                                                        }}
                                                        placeholder="Search channel or paste ID..."
                                                        style={{ background: "rgba(0,0,0,0.3)" }}
                                                    />
                                                    {/* Channel suggestions */}
                                                    {channelSearch && !channelSearch.match(/^\d{17,20}$/) && (() => {
                                                        const vcInfo = getCurrentVoiceChannelInfo();
                                                        if (!vcInfo?.guildId) return null;

                                                        const guildChannels = GuildChannelStore.getChannels(vcInfo.guildId);
                                                        const textChannelList = guildChannels?.SELECTABLE || [];
                                                        const textChannels = textChannelList
                                                            .map((item: any) => item.channel)
                                                            .filter((c: any) =>
                                                                c && c.name?.toLowerCase().includes(channelSearch.toLowerCase())
                                                            )
                                                            .slice(0, 6);

                                                        if (textChannels.length === 0) return null;

                                                        return (
                                                            <div style={{
                                                                marginTop: "4px",
                                                                background: "rgba(0,0,0,0.4)",
                                                                borderRadius: "4px",
                                                                maxHeight: "120px",
                                                                overflowY: "auto"
                                                            }}>
                                                                {textChannels.map((ch: any) => (
                                                                    <div
                                                                        key={ch.id}
                                                                        onClick={() => {
                                                                            setConfigInput({ ...configInput, channelId: ch.id });
                                                                            setChannelSearch("");
                                                                        }}
                                                                        style={{
                                                                            padding: "8px 10px",
                                                                            cursor: "pointer",
                                                                            fontSize: "12px",
                                                                            display: "flex",
                                                                            alignItems: "center",
                                                                            gap: "6px",
                                                                            borderBottom: "1px solid rgba(255,255,255,0.05)"
                                                                        }}
                                                                        onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                                                                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                                                                    >
                                                                        <span style={{ color: "var(--selfbot-text-muted)" }}>#</span>
                                                                        <span>{ch.name}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        );
                                                    })()}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{
                                        background: "rgba(194, 24, 24, 0.1)",
                                        borderRadius: "8px",
                                        padding: "16px",
                                        border: "1px solid rgba(194, 24, 24, 0.2)",
                                        minHeight: "112px",
                                        display: "flex",
                                        flexDirection: "column",
                                        justifyContent: "center"
                                    }}>
                                        <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                                            <div style={{
                                                width: "32px",
                                                height: "32px",
                                                borderRadius: "8px",
                                                background: "rgba(194, 24, 24, 0.2)",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                flexShrink: 0
                                            }}>
                                                <Icons.Info />
                                            </div>
                                            <div style={{ fontSize: "12px", color: "var(--selfbot-text-secondary)", lineHeight: 1.6 }}>
                                                <div style={{ fontWeight: 600, color: "var(--selfbot-text-primary)", marginBottom: "6px" }}>How it works:</div>
                                                <div style={{ color: "var(--selfbot-text-muted)" }}>
                                                    <div style={{ marginBottom: "2px" }}>• <b>Open</b> → Sets limit to <b>Unlimited</b></div>
                                                    <div style={{ marginBottom: "2px" }}>• <b>Close</b> → Sets limit to <b>1 user</b></div>
                                                    <div>• <b>Custom</b> → Sets your chosen limit</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="selfbot-modal-actions" style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                            <button className="selfbot-btn-secondary" onClick={() => setShowConfigModal(false)}>Cancel</button>
                            <button className="selfbot-btn-primary" onClick={saveConfig}>Save</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Limit Modal Overlay */}
            {showLimitModal && (
                <div className="selfbot-modal-overlay">
                    <div className="selfbot-modal-content">
                        <div className="selfbot-modal-header">
                            <h3>Set Call Limit</h3>
                            <div className="selfbot-modal-close" onClick={() => setShowLimitModal(false)}>×</div>
                        </div>
                        <div className="selfbot-modal-body">
                            <div className="selfbot-input-group">
                                <label>User Limit</label>
                                <input
                                    type="number"
                                    className="selfbot-input"
                                    value={customLimit}
                                    onChange={e => setCustomLimit(e.target.value)}
                                    placeholder="e.g. 5"
                                    autoFocus
                                />
                            </div>
                        </div>
                        <div className="selfbot-modal-actions">
                            <button className="selfbot-btn-secondary" onClick={() => setShowLimitModal(false)}>Cancel</button>
                            <button className="selfbot-btn-primary" onClick={handleCustomLimitExecute}>Set Limit</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Pull to Channel Modal */}
            {showPullModal && (
                <div className="selfbot-modal-overlay">
                    <div className="selfbot-modal-content">
                        <div className="selfbot-modal-header">
                            <h3>Pull to Custom Channel</h3>
                            <div className="selfbot-modal-close" onClick={() => setShowPullModal(false)}>×</div>
                        </div>
                        <div className="selfbot-modal-body">
                            <div className="selfbot-input-group">
                                <label>Destination Channel ID</label>
                                <input
                                    className="selfbot-input"
                                    value={pullChannelId}
                                    onChange={e => setPullChannelId(e.target.value)}
                                    placeholder="Channel ID..."
                                    autoFocus
                                />
                            </div>
                        </div>
                        <div className="selfbot-modal-actions">
                            <button className="selfbot-btn-secondary" onClick={() => setShowPullModal(false)}>Cancel</button>
                            <button className="selfbot-btn-primary" onClick={executeCustomPull}>Pull Here</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Nickname Change Modal */}
            {showNicknameModal && nicknameTargetUserId && (
                <div className="selfbot-modal-overlay">
                    <div className="selfbot-modal-content">
                        <div className="selfbot-modal-header">
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                <Icons.Pencil />
                                <h3 style={{ margin: 0 }}>Change Nickname</h3>
                            </div>
                            <div className="selfbot-modal-close" onClick={() => {
                                setShowNicknameModal(false);
                                setNicknameTargetUserId(null);
                            }}>×</div>
                        </div>
                        <div className="selfbot-modal-body">
                            <div className="selfbot-input-group">
                                <label>New Nickname</label>
                                <input
                                    className="selfbot-input"
                                    value={nicknameInput}
                                    onChange={e => setNicknameInput(e.target.value)}
                                    placeholder="Leave empty to reset nickname..."
                                    autoFocus
                                />
                                <span style={{ fontSize: "11px", color: "var(--selfbot-text-muted)", marginTop: "4px" }}>
                                    Leave empty to reset to original username
                                </span>
                            </div>
                        </div>
                        <div className="selfbot-modal-actions">
                            <button className="selfbot-btn-secondary" onClick={() => {
                                setShowNicknameModal(false);
                                setNicknameTargetUserId(null);
                            }}>Cancel</button>
                            <button className="selfbot-btn-primary" onClick={handleNicknameChange}>Save Nickname</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Footer with Lock Buttons */}
            <div className="selfbot-voice-actions-footer">
                <button
                    className="selfbot-voice-lock-btn open"
                    onClick={() => handleLockCall("0")}
                    onContextMenu={handleContextMenu}
                    title="Unlock Call (Right-click to Config)"
                >
                    <Icons.LockOpen />
                </button>
                <div style={{ width: "1px", background: "var(--selfbot-border)" }} />
                <button
                    className="selfbot-voice-lock-btn closed"
                    onClick={() => handleLockCall("1")}
                    onContextMenu={handleContextMenu}
                    title="Lock Call (Right-click to Config)"
                >
                    <Icons.Lock />
                </button>
                <div style={{ width: "1px", background: "var(--selfbot-border)" }} />
                <button
                    className="selfbot-voice-lock-btn small"
                    onClick={() => setShowLimitModal(true)}
                    onContextMenu={handleContextMenu}
                    title="Set Custom Limit (Right-click to Config)"
                >
                    <Icons.More />
                </button>
            </div>
        </div>
    );
}
