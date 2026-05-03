/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "../style.css";

import { RelationshipStore, showToast, Toasts, useCallback, useEffect, UserStore, useState, VoiceStateStore } from "@webpack/common";

import { logo } from "../assets";
import { deafenTargetsInGuild, isAutoDeafenTargetEnabled, startAutoDeafenTarget, stopAutoDeafenTarget } from "../utils/autoDeafenTargetUtils";
import { isAutoDeafenEnabled, startAutoDeafen, stopAutoDeafen } from "../utils/autoDeafenUtils";
import { disconnectTargetsInGuild, isAutoDisconnectTargetEnabled, startAutoDisconnectTarget, stopAutoDisconnectTarget } from "../utils/autoDisconnectTargetUtils";
import { isAutoDisconnectEnabled, startAutoDisconnect, stopAutoDisconnect } from "../utils/autoDisconnectUtils";
import { isAutoElevatorTargetEnabled, startAutoElevatorTarget, stopAutoElevatorTarget } from "../utils/autoElevatorTargetUtils";
import { isAutoElevatorEnabled, startAutoElevator, stopAutoElevator } from "../utils/autoElevatorUtils";
import { isAutoFuckAllEnabled, startAutoFuckAll, stopAutoFuckAll } from "../utils/autoFuckAllUtils";
import { isAutoMuteTargetEnabled, muteTargetsInGuild, startAutoMuteTarget, stopAutoMuteTarget } from "../utils/autoMuteTargetUtils";
import { getCurrentVoiceChannel, getCurrentVoiceChannelInfo, getOtherUsersInChannel, isAutoMuteEnabled, startAutoMute, stopAutoMute } from "../utils/autoMuteUtils";
import { isAutoPullTargetEnabled, startAutoPullTarget, stopAutoPullTarget } from "../utils/autoPullTargetUtils";
import { isAutoPullEnabled, startAutoPull, stopAutoPull } from "../utils/autoPullUtils";
import { startAutoStatus, stopAutoStatus } from "../utils/autoStatusUtils";
import { isAutoUndeafenEnabled, startAutoUndeafen, stopAutoUndeafen } from "../utils/autoUndeafenUtils";
import { isAutoUnmuteEnabled, startAutoUnmute, stopAutoUnmute } from "../utils/autoUnmuteUtils";
import { deafenAll } from "../utils/deafenAll";
import { disconnectAll } from "../utils/disconnectAll";
import { DmConversation, filterDmConversations, getDmConversations, startBackgroundDeletion } from "../utils/dmClearUtils";
import { elevatorAll } from "../utils/elevatorAll";
import { FakeState } from "../utils/fakeStateUtils";
import { followPullIntegration } from "../utils/followPullIntegration";
import { followUser } from "../utils/followUser";
import { fuckAll } from "../utils/fuckAll";
import { muteAll } from "../utils/muteAll";
import { protectionState, setAntiDisconnectProtection, setCameraProtection, setDeafenProtection, setFriendsDeafenProtection, setFriendsMuteProtection, setMuteProtection } from "../utils/protectionUtils";
import { Friend, settingsManager, Target } from "../utils/settingsManager";
import { targetElevator } from "../utils/targetElevator";
import { ActiveTask, formatTimeRemaining, taskManager } from "../utils/taskManager";
import { isTypingEternalActive, startTypingEternal, stopTypingEternal } from "../utils/typingEternalUtils";
import { unDeafenAll } from "../utils/unDeafenAll";
import { unMuteAll } from "../utils/unMuteAll";
import { AccountSwitcherPage, AccountSwitcherQuickPanel } from "./AccountSwitcher";
import { openElevatorModal } from "./ElevatorModal";
import { Icons } from "./Icons";
import { InitializingOverlay } from "./InitializingOverlay";
import { MassJoinerPage } from "./MassJoinerPage";
import { MenuOption } from "./MenuOption";
import { openNukeModal } from "./NukeModal";
import { handleCopyProfile, ProfileBackupPage } from "./ProfileBackupPage";
import { SpamPage } from "./SpamPage";
import { UserProfileCard } from "./UserProfileCard";
import { VoiceActionsPage } from "./VoiceActionsPage";

// Owner Discord IDs
const OWNER_ID = "1159205268442337413";
const SECOND_OWNER_ID = "1448796782342570089";

// Track if init animation has been shown this session (module-level = resets on Discord restart)
let hasShownInitAnimation = false;

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVE TASKS DROPDOWN
// ═══════════════════════════════════════════════════════════════════════════
function ActiveTaskItem({ task }: { task: ActiveTask; }) {
    const isFollowTask = task.type === "FOLLOW_PULL";
    const isDeletionTask = task.type === "DM_CLEAR" || task.type === "PACKAGE_CLEAR";
    // @ts-ignore
    const followedUser = task.metadata?.userId ? UserStore.getUser(task.metadata.userId) : null;

    // Style constants
    const TextPrimary = "#ffffff";
    const TextMuted = "#b9bbbe";
    const statusColor = task.status === "RUNNING" ? "#43b581" : task.status === "PAUSED" ? "#faa61a" : "#f04747";

    // Get metrics if available
    const { metrics } = task;
    const hasMetrics = metrics && (metrics.total > 0 || metrics.deleted > 0);
    const progressPercent = (metrics && metrics.total > 0) ? Math.round((metrics.deleted / metrics.total) * 100) : 0;

    // Render Icon or Avatar
    const renderMainIcon = () => {
        if (isFollowTask && followedUser) {
            return (
                <img
                    src={followedUser.getAvatarURL(null, 32) || "https://cdn.discordapp.com/embed/avatars/0.png"}
                    alt={followedUser.username}
                    style={{ width: "24px", height: "24px", borderRadius: "50%" }}
                />
            );
        }

        const iconPath = task.type === "NUKE"
            ? "M12 2L2 22h20L12 2zm0 3.5L18.5 19H5.5L12 5.5zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z"
            : task.type === "DM_CLEAR" || task.type === "PACKAGE_CLEAR"
                ? "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                : "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z";

        return (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d={iconPath} />
            </svg>
        );
    };

    // Clean progress string (remove emojis and weird chars)
    const cleanProgress = task.progress.replace(/[^\x00-\x7F]/g, "").replace(/\s*[✓✔]\s*$/, "").trim();

    // Determine Display Title
    const title = isFollowTask && followedUser
        ? `Following ${followedUser.username}`
        : task.type === "NUKE" ? "Nuke Operation"
            : task.type === "DM_CLEAR" ? "DM Clear"
                : task.type === "PACKAGE_CLEAR" ? "Package Clear"
                    : "Active Task";

    return (
        <div style={{
            background: isFollowTask ? "rgba(194, 24, 24, 0.08)" : "rgba(0, 0, 0, 0.2)",
            border: `1px solid ${isFollowTask ? "rgba(194, 24, 24, 0.2)" : "rgba(255, 255, 255, 0.05)"}`,
            borderRadius: "8px",
            marginBottom: "6px",
            padding: "8px",
            transition: "all 0.2s"
        }}>
            {/* Header Row */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: hasMetrics ? "6px" : "8px" }}>
                <div style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "8px",
                    background: isFollowTask ? "rgba(194, 24, 24, 0.15)" : "rgba(255, 255, 255, 0.05)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: isFollowTask ? "#c21818" : TextMuted,
                    flexShrink: 0
                }}>
                    {renderMainIcon()}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2px" }}>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: TextPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {title}
                        </div>
                        <div style={{
                            width: "8px",
                            height: "8px",
                            borderRadius: "50%",
                            background: statusColor,
                            boxShadow: `0 0 6px ${statusColor}80`,
                            animation: task.status === "RUNNING" ? "pulse 2s infinite" : "none"
                        }} />
                    </div>

                    <div style={{ fontSize: "11px", color: TextMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {isFollowTask ? cleanProgress : task.description}
                    </div>
                </div>
            </div>

            {/* Metrics Section - Only for deletion tasks with metrics */}
            {hasMetrics && isDeletionTask && (
                <div style={{ marginBottom: "8px" }}>
                    {/* Progress Bar - Only if total is known */}
                    {metrics.total > 0 && (
                        <div style={{
                            height: "4px",
                            background: "rgba(255, 255, 255, 0.1)",
                            borderRadius: "2px",
                            overflow: "hidden",
                            marginBottom: "6px"
                        }}>
                            <div style={{
                                height: "100%",
                                width: `${progressPercent}%`,
                                background: task.status === "COMPLETED" ? "#43b581" : "#c21818",
                                borderRadius: "2px",
                                transition: "width 0.3s ease"
                            }} />
                        </div>
                    )}

                    {/* Stats Row */}
                    <div style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "10px",
                        color: TextMuted,
                        fontFamily: "Consolas, monospace"
                    }}>
                        <span>{metrics.deleted.toLocaleString()}{metrics.total > 0 ? `/${metrics.total.toLocaleString()}` : " deleted"}</span>
                        <span>{metrics.currentSpeed || metrics.averageSpeed} msg/min</span>
                        {metrics.total > 0 && <span>{formatTimeRemaining(metrics.estimatedTimeRemaining)}</span>}
                        {metrics.rateLimitHits > 0 && (
                            <span style={{ color: "#faa61a" }}>⚠ {metrics.rateLimitHits}</span>
                        )}
                    </div>
                </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: "flex", gap: "6px" }}>
                <div
                    onClick={() => task.status === "PAUSED" ? task.actions.resume() : task.actions.pause()}
                    style={{
                        flex: 1,
                        background: "rgba(255, 255, 255, 0.05)",
                        borderRadius: "4px",
                        padding: "4px 0",
                        textAlign: "center",
                        fontSize: "11px",
                        fontWeight: 500,
                        color: TextPrimary,
                        cursor: "pointer",
                        transition: "background 0.15s"
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)"}
                    onMouseLeave={e => e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)"}
                >
                    {task.status === "PAUSED" ? "Resume" : "Pause"}
                </div>

                <div
                    onClick={task.actions.stop}
                    style={{
                        flex: 1,
                        background: "rgba(240, 71, 71, 0.15)",
                        borderRadius: "4px",
                        padding: "4px 0",
                        textAlign: "center",
                        fontSize: "11px",
                        fontWeight: 500,
                        color: "#f04747",
                        cursor: "pointer",
                        transition: "background 0.15s"
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(240, 71, 71, 0.25)"}
                    onMouseLeave={e => e.currentTarget.style.background = "rgba(240, 71, 71, 0.15)"}
                >
                    Stop
                </div>
            </div>
        </div>
    );
}

function ActiveTasksDropdown() {
    const [tasks, setTasks] = useState<ActiveTask[]>([]);

    useEffect(() => {
        setTasks(taskManager.getTasks());
        const unsubscribe = taskManager.subscribe(updatedTasks => {
            setTasks([...updatedTasks]);
        });
        return () => { unsubscribe(); };
    }, []);

    if (tasks.length === 0) {
        return (
            <div className="selfbot-tasks-dropdown empty">
                <div className="selfbot-tasks-empty-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-4h2v2h-2zm0-10h2v8h-2z" />
                    </svg>
                </div>
                <span>No active tasks running</span>
            </div>
        );
    }

    return (
        <div className="selfbot-tasks-dropdown">
            <div className="selfbot-tasks-header">
                <div className="selfbot-tasks-title">
                    <span>Tasks</span>
                    <span className="selfbot-tasks-count">{tasks.length}</span>
                </div>
            </div>
            {tasks.map(task => (
                <ActiveTaskItem key={task.id} task={task} />
            ))}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTO STATUS SECTION
// ═══════════════════════════════════════════════════════════════════════════
function AutoStatusSection({ autoStatus, setAutoStatus }: { autoStatus: boolean; setAutoStatus: (val: boolean) => void; }) {
    const [expanded, setExpanded] = useState(false);
    const [settings, setSettings] = useState(() => settingsManager.getSettings().autoStatusSettings);
    const [newMessage, setNewMessage] = useState("");

    const handleToggle = () => {
        const newState = !autoStatus;
        setAutoStatus(newState);
        settingsManager.setToggle("autoStatus", newState);
        if (newState) {
            startAutoStatus();
        } else {
            stopAutoStatus();
        }
    };

    const handleAddMessage = () => {
        if (!newMessage.trim()) return;
        const newSettings = { ...settings, messages: [...settings.messages, newMessage.trim()] };
        setSettings(newSettings);
        settingsManager.setSetting("autoStatusSettings", newSettings);
        setNewMessage("");
        if (autoStatus) startAutoStatus(); // Restart to apply changes
    };

    const handleRemoveMessage = (index: number) => {
        const newSettings = { ...settings, messages: settings.messages.filter((_, i) => i !== index) };
        setSettings(newSettings);
        settingsManager.setSetting("autoStatusSettings", newSettings);
        if (autoStatus) startAutoStatus();
    };

    const handleIntervalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseInt(e.target.value);
        if (isNaN(val) || val < 5000) return; // Min 5s
        const newSettings = { ...settings, intervalMs: val };
        setSettings(newSettings);
        settingsManager.setSetting("autoStatusSettings", newSettings);
        if (autoStatus) startAutoStatus();
    };

    const TextPrimary = "#ffffff";
    const TextMuted = "#b9bbbe";

    return (
        <div className="selfbot-follow-user-section" style={{ marginBottom: "8px" }}>
            <div
                className="selfbot-menu-option"
                style={{
                    marginBottom: expanded ? 0 : undefined,
                    borderRadius: expanded ? "8px 8px 0 0" : "8px",
                    borderBottom: expanded ? "1px solid rgba(255,255,255,0.05)" : undefined,
                    height: "auto",
                    padding: "10px"
                }}
                onClick={() => setExpanded(!expanded)}
            >
                <div className="selfbot-option-icon">
                    <Icons.Status />
                </div>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", marginLeft: "12px" }}>
                    <span className="selfbot-option-label" style={{ marginBottom: "2px", fontWeight: 600 }}>Auto Status</span>
                    <span style={{ fontSize: "11px", color: TextMuted, lineHeight: "1.2" }}>
                        {autoStatus ? "Active" : "Rotate through custom statuses"}
                    </span>
                </div>
                <div className="selfbot-option-actions" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div
                        className={`selfbot-mini-toggle ${autoStatus ? "on" : ""}`}
                        onClick={e => { e.stopPropagation(); handleToggle(); }}
                    >
                        <div className="selfbot-mini-toggle-slider" />
                    </div>
                    <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", color: TextMuted }}
                    >
                        <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
                    </svg>
                </div>
            </div>

            {expanded && (
                <div style={{ background: "rgba(0, 0, 0, 0.2)", borderRadius: "0 0 8px 8px", padding: "12px", marginTop: "0" }}>
                    <div style={{ fontSize: "10px", color: TextMuted, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        Status Messages
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "12px" }}>
                        {settings.messages.map((msg: string, idx: number) => (
                            <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.05)", padding: "6px 10px", borderRadius: "6px" }}>
                                <span style={{ fontSize: "12px", color: TextPrimary, wordBreak: "break-all" }}>{msg}</span>
                                <div onClick={() => handleRemoveMessage(idx)} style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#f04747" }}>
                                    <Icons.Trash />
                                </div>
                            </div>
                        ))}
                    </div>

                    <div style={{ display: "flex", gap: "6px", marginBottom: "12px" }}>
                        <input
                            type="text"
                            value={newMessage}
                            onChange={e => setNewMessage(e.target.value)}
                            placeholder="Add new status..."
                            style={{ flex: 1, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", padding: "6px 10px", color: TextPrimary, fontSize: "12px" }}
                            onKeyDown={e => { if (e.key === "Enter") handleAddMessage(); }}
                        />
                        <button
                            onClick={handleAddMessage}
                            style={{ background: "#43b581", border: "none", borderRadius: "6px", color: "#fff", padding: "0 12px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                        >
                            Add
                        </button>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                        <div style={{ fontSize: "12px", color: TextPrimary }}>Interval (ms)</div>
                        <input
                            type="number"
                            value={settings.intervalMs}
                            onChange={handleIntervalChange}
                            min={5000}
                            style={{ width: "80px", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", padding: "4px 8px", color: TextPrimary, fontSize: "12px", textAlign: "right" }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// FOLLOW USER SECTION - Complete Follow User settings and Pull Assist
// ═══════════════════════════════════════════════════════════════════════════
function FollowUserSection() {
    const [followStatus, setFollowStatus] = useState(() => followPullIntegration.getFollowPullStatus());
    const [vcUsers, setVcUsers] = useState<string[]>([]);
    const [expanded, setExpanded] = useState(false);

    // Settings state - read from followUser settings
    const [executeOnFollow, setExecuteOnFollow] = useState(() => followUser.getFollowUserSetting("executeOnFollow"));
    const [onlyManualTrigger, setOnlyManualTrigger] = useState(() => followUser.getFollowUserSetting("onlyManualTrigger"));
    const [followLeave, setFollowLeave] = useState(() => followUser.getFollowUserSetting("followLeave"));
    const [autoMoveBack, setAutoMoveBack] = useState(() => followUser.getFollowUserSetting("autoMoveBack"));
    const [channelFull, setChannelFull] = useState(() => followUser.getFollowUserSetting("channelFull"));
    const [pullAssist, setPullAssist] = useState(() => settingsManager.getToggle("followPullAssist"));

    // Update status and VC users periodically
    useEffect(() => {
        const interval = setInterval(() => {
            setFollowStatus(followPullIntegration.getFollowPullStatus());

            // Get users in current VC
            const vcInfo = getCurrentVoiceChannelInfo();
            if (vcInfo) {
                const users = getOtherUsersInChannel(vcInfo.channelId);
                setVcUsers(users);
            } else {
                setVcUsers([]);
            }
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    // Start pull monitor if enabled
    useEffect(() => {
        if (pullAssist) {
            followPullIntegration.startFollowPullMonitor();
        }
    }, [pullAssist]);

    const handleSelectUser = (userId: string) => {
        followPullIntegration.setTrackedFollowUser(userId);
    };

    const handleStopFollowing = () => {
        followPullIntegration.stopFollowing();
    };

    const handleSettingToggle = (setting: string, currentValue: boolean, setter: (v: boolean) => void) => {
        const newValue = !currentValue;
        setter(newValue);
        followUser.setFollowUserSetting(setting as any, newValue);
    };

    const handlePullAssistToggle = () => {
        const newState = !pullAssist;
        setPullAssist(newState);
        settingsManager.setToggle("followPullAssist", newState);
        if (newState) {
            followPullIntegration.startFollowPullMonitor();
            showToast("Follow Pull Assist enabled", Toasts.Type.SUCCESS);
        } else {
            followPullIntegration.stopFollowPullMonitor();
            showToast("Follow Pull Assist disabled", Toasts.Type.MESSAGE);
        }
    };

    const TextPrimary = "#ffffff";
    const TextMuted = "#b9bbbe";

    return (
        <div className="selfbot-follow-user-section" style={{ marginBottom: "8px" }}>
            {/* Header mimicking MenuOption structure */}
            <div
                className="selfbot-menu-option"
                style={{
                    marginBottom: expanded ? 0 : undefined,
                    borderRadius: expanded ? "8px 8px 0 0" : "8px",
                    borderBottom: expanded ? "1px solid rgba(255,255,255,0.05)" : undefined,
                    height: "auto", // Allow height to grow for subtitle
                    padding: "10px"
                }}
                onClick={() => setExpanded(!expanded)}
            >
                <div className="selfbot-option-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                    </svg>
                </div>

                <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", marginLeft: "12px" }}>
                    <span className="selfbot-option-label" style={{ marginBottom: "2px", fontWeight: 600 }}>Follow User</span>
                    <span style={{ fontSize: "11px", color: TextMuted, lineHeight: "1.2" }}>
                        {followStatus.targetUserId ? `Following ${followStatus.targetUsername}` : "Configure settings"}
                    </span>
                </div>

                <div className="selfbot-option-actions">
                    <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        style={{
                            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                            transition: "transform 0.2s",
                            color: TextMuted
                        }}
                    >
                        <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
                    </svg>
                </div>
            </div>

            {/* Expanded Content with box styling */}
            {expanded && (
                <div style={{
                    background: "rgba(0, 0, 0, 0.2)",
                    borderRadius: "0 0 8px 8px",
                    padding: "12px",
                    marginTop: "0"
                }}>
                    {/* Currently Following */}
                    {followStatus.targetUserId ? (
                        <div style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            padding: "10px",
                            background: "rgba(194, 24, 24, 0.15)",
                            borderRadius: "6px",
                            marginBottom: "12px"
                        }}>
                            <div style={{
                                width: "8px",
                                height: "8px",
                                borderRadius: "50%",
                                background: "#43b581",
                                animation: "pulse 2s infinite"
                            }} />
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: "12px", fontWeight: 600, color: TextPrimary }}>
                                    Following {followStatus.targetUsername}
                                </div>
                                <div style={{ fontSize: "10px", color: TextMuted }}>
                                    Right-click a user or use the toolbar icon to manage
                                </div>
                            </div>
                            <div
                                onClick={handleStopFollowing}
                                style={{
                                    padding: "6px 12px",
                                    background: "rgba(240, 71, 71, 0.2)",
                                    color: "#f04747",
                                    borderRadius: "4px",
                                    fontSize: "11px",
                                    fontWeight: 600,
                                    cursor: "pointer"
                                }}
                            >
                                Stop
                            </div>
                        </div>
                    ) : vcUsers.length > 0 ? (
                        <div style={{ marginBottom: "12px" }}>
                            <div style={{ fontSize: "10px", color: TextMuted, marginBottom: "6px" }}>
                                Quick follow (users in your VC):
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                                {vcUsers.slice(0, 6).map(userId => {
                                    const user = UserStore.getUser(userId);
                                    return (
                                        <div
                                            key={userId}
                                            onClick={() => handleSelectUser(userId)}
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "6px",
                                                padding: "4px 8px",
                                                background: "rgba(0,0,0,0.3)",
                                                borderRadius: "4px",
                                                cursor: "pointer",
                                                fontSize: "11px",
                                                transition: "background 0.2s"
                                            }}
                                            onMouseEnter={e => (e.currentTarget.style.background = "rgba(194, 24, 24, 0.3)")}
                                            onMouseLeave={e => (e.currentTarget.style.background = "rgba(0,0,0,0.3)")}
                                        >
                                            <img
                                                src={user?.getAvatarURL(null, 16) || "https://cdn.discordapp.com/embed/avatars/0.png"}
                                                alt=""
                                                style={{ width: "16px", height: "16px", borderRadius: "50%" }}
                                            />
                                            <span style={{ color: TextPrimary }}>{user?.username || "Unknown"}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        <div style={{
                            padding: "8px 10px",
                            background: "rgba(255,255,255,0.05)",
                            borderRadius: "6px",
                            fontSize: "11px",
                            color: TextMuted,
                            marginBottom: "12px",
                            opacity: 0.7
                        }}>
                            Right-click any user to follow them
                        </div>
                    )}

                    {/* Settings */}
                    <div style={{ fontSize: "10px", color: TextMuted, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        Settings
                    </div>

                    {/* Execute on Follow */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0" }}>
                        <div style={{ fontSize: "12px", color: TextPrimary }}>Join on Follow</div>
                        <div
                            className={`selfbot-mini-toggle ${executeOnFollow ? "on" : ""}`}
                            onClick={() => handleSettingToggle("executeOnFollow", !!executeOnFollow, setExecuteOnFollow)}
                        >
                            <div className="selfbot-mini-toggle-slider" />
                        </div>
                    </div>

                    {/* Only Manual Trigger */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0" }}>
                        <div style={{ fontSize: "12px", color: TextPrimary }}>Manual Trigger Only</div>
                        <div
                            className={`selfbot-mini-toggle ${onlyManualTrigger ? "on" : ""}`}
                            onClick={() => handleSettingToggle("onlyManualTrigger", !!onlyManualTrigger, setOnlyManualTrigger)}
                        >
                            <div className="selfbot-mini-toggle-slider" />
                        </div>
                    </div>

                    {/* Follow Leave */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0" }}>
                        <div style={{ fontSize: "12px", color: TextPrimary }}>Leave When They Leave</div>
                        <div
                            className={`selfbot-mini-toggle ${followLeave ? "on" : ""}`}
                            onClick={() => handleSettingToggle("followLeave", !!followLeave, setFollowLeave)}
                        >
                            <div className="selfbot-mini-toggle-slider" />
                        </div>
                    </div>

                    {/* Auto Move Back */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0" }}>
                        <div style={{ fontSize: "12px", color: TextPrimary }}>Auto Move Back</div>
                        <div
                            className={`selfbot-mini-toggle ${autoMoveBack ? "on" : ""}`}
                            onClick={() => handleSettingToggle("autoMoveBack", !!autoMoveBack, setAutoMoveBack)}
                        >
                            <div className="selfbot-mini-toggle-slider" />
                        </div>
                    </div>

                    {/* Channel Full */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0" }}>
                        <div style={{ fontSize: "12px", color: TextPrimary }}>Join When Not Full</div>
                        <div
                            className={`selfbot-mini-toggle ${channelFull ? "on" : ""}`}
                            onClick={() => handleSettingToggle("channelFull", !!channelFull, setChannelFull)}
                        >
                            <div className="selfbot-mini-toggle-slider" />
                        </div>
                    </div>

                    {/* Separator */}
                    <div style={{ height: "1px", background: "rgba(255,255,255,0.1)", margin: "12px 0" }} />

                    {/* Pull Assist Section */}
                    <div style={{ fontSize: "10px", color: TextMuted, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        Alt Account Pull Assist
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0" }}>
                        <div>
                            <div style={{ fontSize: "12px", color: TextPrimary }}>Pull Assist</div>
                            <div style={{ fontSize: "10px", color: TextMuted }}>Use alt to pull when channel is full</div>
                        </div>
                        <div
                            className={`selfbot-mini-toggle ${pullAssist ? "on" : ""}`}
                            onClick={handlePullAssistToggle}
                        >
                            <div className="selfbot-mini-toggle-slider" />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// FRIENDS QUICK-PANEL - Inline collapsible friends manager
// ═══════════════════════════════════════════════════════════════════════════
function FriendsQuickPanel({ autoPullEnabled, onAutoPullToggle, friendsMuteProtection, friendsDeafenProtection, onFriendsMuteToggle, onFriendsDeafenToggle, onNavigate }: {
    autoPullEnabled: boolean;
    onAutoPullToggle: () => void;
    friendsMuteProtection: boolean;
    friendsDeafenProtection: boolean;
    onFriendsMuteToggle: () => void;
    onFriendsDeafenToggle: () => void;
    onNavigate: () => void;
}) {
    const [friends, setFriends] = useState<Friend[]>(() => settingsManager.getFriends());
    const [expanded, setExpanded] = useState(false);

    // Re-fetch friends when expanded
    useEffect(() => {
        if (expanded) {
            setFriends(settingsManager.getFriends());
        }
    }, [expanded]);

    const maxAvatars = 6;
    const displayFriends = friends.slice(0, maxAvatars);
    const remainingCount = friends.length - maxAvatars;

    return (
        <div className="selfbot-friends-quick-panel">
            <div className="selfbot-friends-quick-header" onClick={() => setExpanded(!expanded)}>
                <div className="selfbot-friends-quick-icon">
                    <Icons.Friends />
                </div>
                <div className="selfbot-friends-quick-title">
                    <span>Friends Whitelist</span>
                    <span>Protected from attacks</span>
                </div>
                {friends.length > 0 && (
                    <div className="selfbot-friends-quick-badge">{friends.length}</div>
                )}
                <div className={`selfbot-friends-quick-expand ${expanded ? "expanded" : ""}`}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
                    </svg>
                </div>
            </div>

            <div className={`selfbot-friends-quick-content ${expanded ? "" : "collapsed"}`}>
                {/* Avatar Row */}
                {friends.length === 0 ? (
                    <div className="selfbot-friends-empty" onClick={e => { e.stopPropagation(); onNavigate(); }} style={{ cursor: "pointer" }}>
                        <div className="selfbot-friends-empty-icon">
                            <Icons.Friends />
                        </div>
                        <span>No friends added yet</span>
                        <div style={{ fontSize: "11px", color: "#43b581", marginTop: "4px", fontWeight: 700 }}>+ Click to add</div>
                    </div>
                ) : (
                    <div className="selfbot-friends-avatar-row">
                        {displayFriends.map(friend => {
                            const user = UserStore.getUser(friend.id);
                            const avatarUrl = user?.getAvatarURL(null, 32) || friend.avatar || "https://cdn.discordapp.com/embed/avatars/0.png";
                            return (
                                <div key={friend.id} className="selfbot-friends-avatar-item" onClick={e => { e.stopPropagation(); onNavigate(); }}>
                                    <img src={avatarUrl} alt="" />
                                    <div className="selfbot-avatar-tooltip">{user?.username || friend.username}</div>
                                </div>
                            );
                        })}
                        {remainingCount > 0 && (
                            <div className="selfbot-friends-avatar-more" onClick={e => { e.stopPropagation(); onNavigate(); }}>
                                +{remainingCount}
                            </div>
                        )}
                        <div className="selfbot-friends-add-btn" onClick={e => { e.stopPropagation(); onNavigate(); }}>+</div>
                    </div>
                )}

                {/* Quick Toggles */}
                <div className="selfbot-friends-quick-actions">
                    <div className="selfbot-friends-toggle-row">
                        <div className="selfbot-friends-toggle-label">
                            <Icons.Automation />
                            <span>Auto Pull</span>
                        </div>
                        <div className={`selfbot-mini-toggle ${autoPullEnabled ? "on" : ""}`} onClick={onAutoPullToggle}>
                            <div className="selfbot-mini-toggle-slider" />
                        </div>
                    </div>
                    <div className="selfbot-friends-toggle-row">
                        <div className="selfbot-friends-toggle-label">
                            <Icons.ShieldMic />
                            <span>Mute Protection</span>
                        </div>
                        <div className={`selfbot-mini-toggle ${friendsMuteProtection ? "on" : ""}`} onClick={onFriendsMuteToggle}>
                            <div className="selfbot-mini-toggle-slider" />
                        </div>
                    </div>
                    <div className="selfbot-friends-toggle-row">
                        <div className="selfbot-friends-toggle-label">
                            <Icons.ShieldHeadphone />
                            <span>Deafen Protection</span>
                        </div>
                        <div className={`selfbot-mini-toggle ${friendsDeafenProtection ? "on" : ""}`} onClick={onFriendsDeafenToggle}>
                            <div className="selfbot-mini-toggle-slider" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// INLINE FRIENDS PAGE - Full friends management within menu
// ═══════════════════════════════════════════════════════════════════════════
function FriendsPage({ onBack }: { onBack: () => void; }) {
    const [friends, setFriends] = useState<Friend[]>(() => settingsManager.getFriends());
    const [newFriendId, setNewFriendId] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [vcUsers, setVcUsers] = useState<string[]>([]);
    const [vcExpanded, setVcExpanded] = useState(true);

    // Load VC users on mount
    useEffect(() => {
        const vcInfo = getCurrentVoiceChannel();
        if (vcInfo) {
            const usersInVc = getOtherUsersInChannel(vcInfo.channelId);
            setVcUsers(usersInVc);
        }
    }, []);

    const refreshFriends = () => setFriends([...settingsManager.getFriends()]);

    const handleAddFriend = (id: string) => {
        if (!id.trim()) return;
        const user = UserStore.getUser(id);
        const friend: Friend = user ? {
            id: user.id,
            username: user.username,
            discriminator: user.discriminator,
            avatar: user.getAvatarURL(null, 32)
        } : {
            id: id.trim(),
            username: "Unknown User",
            avatar: "https://cdn.discordapp.com/embed/avatars/0.png"
        };
        if (settingsManager.addFriend(friend)) {
            refreshFriends();
            // Remove from VC list if present
            setVcUsers(prev => prev.filter(uid => uid !== id));
            showToast(user ? `Added ${user.username}` : "Added friend", Toasts.Type.SUCCESS);
        } else {
            showToast("Already in whitelist", Toasts.Type.FAILURE);
        }
    };

    const handleRemoveFriend = (id: string) => {
        if (settingsManager.removeFriend(id)) {
            refreshFriends();
            showToast("Removed", Toasts.Type.SUCCESS);
        }
    };

    const handleToggleAutoPull = (id: string) => {
        settingsManager.toggleFriendAutoPull(id);
        refreshFriends();
    };

    const handleAddAllDiscordFriends = () => {
        const discordFriendIds = RelationshipStore.getFriendIDs();
        let added = 0;
        for (const id of discordFriendIds) {
            if (settingsManager.isFriend(id)) continue;
            const user = UserStore.getUser(id);
            const friend: Friend = user ? {
                id: user.id,
                username: user.username,
                discriminator: user.discriminator,
                avatar: user.getAvatarURL(null, 32)
            } : { id, username: "Unknown", avatar: "https://cdn.discordapp.com/embed/avatars/0.png" };
            if (settingsManager.addFriend(friend)) added++;
        }
        refreshFriends();
        showToast(`Added ${added} Discord friends`, Toasts.Type.SUCCESS);
    };

    const handleRemoveAll = () => {
        for (const f of friends) {
            settingsManager.removeFriend(f.id);
        }
        refreshFriends();
        showToast("Cleared whitelist", Toasts.Type.SUCCESS);
    };

    // Filter friends by search query
    const filteredFriends = friends.filter(friend => {
        if (!searchQuery.trim()) return true;
        const user = UserStore.getUser(friend.id);
        const username = user?.username || friend.username || "";
        return username.toLowerCase().includes(searchQuery.toLowerCase()) ||
            friend.id.includes(searchQuery);
    });

    // Filter VC users to only show non-whitelisted
    const nonWhitelistedVcUsers = vcUsers.filter(id => !settingsManager.isFriend(id));

    return (
        <div className="selfbot-friends-page">
            {/* Header */}
            <div className="selfbot-friends-page-header">
                <div className="selfbot-friends-back-btn" onClick={onBack}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
                    </svg>
                </div>
                <div className="selfbot-friends-page-title">
                    <h3>Friends Whitelist</h3>
                    <span>{friends.length} friends protected</span>
                </div>
            </div>

            {/* Add Friend */}
            <div className="selfbot-friends-add-section">
                <input
                    type="text"
                    className="selfbot-friends-add-input"
                    placeholder="Enter User ID..."
                    value={newFriendId}
                    onChange={e => setNewFriendId(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { handleAddFriend(newFriendId); setNewFriendId(""); } }}
                />
                <button className="selfbot-friends-add-submit" disabled={!newFriendId.trim()} onClick={() => { handleAddFriend(newFriendId); setNewFriendId(""); }}>
                    Add
                </button>
            </div>

            {/* Search Bar */}
            {friends.length > 0 && (
                <div className="selfbot-friends-search-section">
                    <input
                        type="text"
                        className="selfbot-friends-search-input"
                        placeholder="🔍 Search friends..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                </div>
            )}

            {/* Voice Chat Users Section */}
            {nonWhitelistedVcUsers.length > 0 && (
                <div className="selfbot-vc-section">
                    <div className="selfbot-vc-header" onClick={() => setVcExpanded(!vcExpanded)}>
                        <div className="selfbot-vc-title">
                            <Icons.MicOn />
                            <span>Users in Voice Chat</span>
                        </div>
                        <div className="selfbot-vc-badge">{nonWhitelistedVcUsers.length}</div>
                        <div className={`selfbot-vc-expand ${vcExpanded ? "expanded" : ""}`}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
                            </svg>
                        </div>
                    </div>
                    {vcExpanded && (
                        <div className="selfbot-vc-users">
                            {nonWhitelistedVcUsers.map(userId => {
                                const user = UserStore.getUser(userId);
                                const avatarUrl = user?.getAvatarURL(null, 32) || "https://cdn.discordapp.com/embed/avatars/0.png";
                                return (
                                    <div key={userId} className="selfbot-vc-user-item">
                                        <img src={avatarUrl} alt="" className="selfbot-vc-user-avatar" />
                                        <div className="selfbot-vc-user-info">
                                            <span className="selfbot-vc-user-name">{user?.username || "Unknown"}</span>
                                            <span className="selfbot-vc-user-id">{userId}</span>
                                        </div>
                                        <div className="selfbot-friend-action-btn add" onClick={() => handleAddFriend(userId)}>
                                            + Add
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Bulk Actions - Show only when friends exist */}
            {friends.length > 0 && (
                <div className="selfbot-friends-bulk-actions">
                    <div className="selfbot-bulk-btn add-all" onClick={handleAddAllDiscordFriends}>
                        <Icons.Friends />
                        <span>Add Discord Friends</span>
                    </div>
                    <div className="selfbot-bulk-btn remove-all" onClick={handleRemoveAll}>
                        <Icons.Trash />
                        <span>Clear All</span>
                    </div>
                </div>
            )}

            {/* Friends List */}
            <div className="selfbot-friends-page-list">
                {friends.length === 0 ? (
                    <div className="selfbot-friends-page-empty enhanced">
                        <div className="selfbot-empty-icon-container">
                            <Icons.Friends />
                        </div>
                        <span className="selfbot-empty-title">No friends in whitelist</span>
                        <span className="selfbot-empty-desc">Friends are protected from attack features and can be auto-pulled to your voice channel</span>
                        <div className="selfbot-empty-add-btn" onClick={handleAddAllDiscordFriends}>
                            <Icons.Friends />
                            <span>Add Discord Friends</span>
                        </div>
                    </div>
                ) : filteredFriends.length === 0 ? (
                    <div className="selfbot-friends-page-empty">
                        <Icons.Friends />
                        <span>No friends match "{searchQuery}"</span>
                    </div>
                ) : (
                    <>
                        <div className="selfbot-friends-section-header">
                            <span>Whitelisted ({filteredFriends.length})</span>
                            <div className="line" />
                        </div>
                        {filteredFriends.map(friend => {
                            const user = UserStore.getUser(friend.id);
                            const avatarUrl = user?.getAvatarURL(null, 40) || friend.avatar || "https://cdn.discordapp.com/embed/avatars/0.png";
                            return (
                                <div key={friend.id} className="selfbot-friend-page-item">
                                    <img src={avatarUrl} alt="" className="selfbot-friend-page-avatar" />
                                    <div className="selfbot-friend-page-info">
                                        <div className="selfbot-friend-page-name">{user?.username || friend.username}</div>
                                        <div className="selfbot-friend-page-id">{friend.id}</div>
                                    </div>
                                    <div className="selfbot-friend-page-actions">
                                        <div
                                            className={`selfbot-friend-action-btn toggle ${friend.autoPull ? "on" : ""}`}
                                            onClick={() => handleToggleAutoPull(friend.id)}
                                        >
                                            {friend.autoPull ? "✓ Pull" : "Pull"}
                                        </div>
                                        <div className="selfbot-friend-action-btn remove" onClick={() => handleRemoveFriend(friend.id)}>
                                            ✕
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </>
                )}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// TARGETS QUICK-PANEL - Inline collapsible targets manager
// ═══════════════════════════════════════════════════════════════════════════
function TargetsQuickPanel({ onNavigate, autoMuteTargetEnabled, autoDeafenTargetEnabled, autoPullTargetEnabled, autoDisconnectTargetEnabled, autoElevatorTargetEnabled, onAutoMuteToggle, onAutoDeafenToggle, onAutoPullToggle, onAutoDisconnectToggle, onAutoElevatorToggle }: {
    onNavigate: () => void;
    autoMuteTargetEnabled: boolean;
    autoDeafenTargetEnabled: boolean;
    autoPullTargetEnabled: boolean;
    autoDisconnectTargetEnabled: boolean;
    autoElevatorTargetEnabled: boolean;
    onAutoMuteToggle: () => void;
    onAutoDeafenToggle: () => void;
    onAutoPullToggle: () => void;
    onAutoDisconnectToggle: () => void;
    onAutoElevatorToggle: () => void;
}) {
    const [targets, setTargets] = useState<Target[]>(() => settingsManager.getTargets());
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        if (expanded) {
            setTargets(settingsManager.getTargets());
        }
    }, [expanded]);

    const maxAvatars = 6;
    const displayTargets = targets.slice(0, maxAvatars);
    const remainingCount = targets.length - maxAvatars;
    const enabledCount = targets.filter(t => t.enabled).length;

    return (
        <div className="selfbot-targets-quick-panel">
            <div className="selfbot-targets-quick-header" onClick={() => setExpanded(!expanded)}>
                <div className="selfbot-targets-quick-icon">
                    <Icons.Target />
                </div>
                <div className="selfbot-targets-quick-title">
                    <span>Attack Targets</span>
                    <span>{enabledCount} active / {targets.length} total</span>
                </div>
                {targets.length > 0 && (
                    <div className="selfbot-targets-quick-badge">{targets.length}</div>
                )}
                <div className={`selfbot-targets-quick-expand ${expanded ? "expanded" : ""}`}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
                    </svg>
                </div>
            </div>

            <div className={`selfbot-friends-quick-content ${expanded ? "" : "collapsed"}`}>
                {/* Avatar Row */}
                {targets.length === 0 ? (
                    <div className="selfbot-targets-empty" onClick={onNavigate}>
                        <div className="selfbot-targets-empty-icon"><Icons.Attack /></div>
                        <span>No targets added - Click to manage</span>
                    </div>
                ) : (
                    <div className="selfbot-targets-avatar-row">
                        {displayTargets.map(target => {
                            const user = UserStore.getUser(target.id);
                            const avatarUrl = user?.getAvatarURL(null, 32) || target.avatar || "https://cdn.discordapp.com/embed/avatars/0.png";
                            return (
                                <div key={target.id} className={`selfbot-targets-avatar-item ${!target.enabled ? "disabled" : ""}`} onClick={e => { e.stopPropagation(); onNavigate(); }}>
                                    <img src={avatarUrl} alt="" />
                                </div>
                            );
                        })}
                        {remainingCount > 0 && (
                            <div className="selfbot-friends-avatar-more" onClick={e => { e.stopPropagation(); onNavigate(); }} style={{ borderColor: "rgb(233 30 99 / 40%)", color: "#e91e63" }}>
                                +{remainingCount}
                            </div>
                        )}
                        <div className="selfbot-targets-add-btn" onClick={e => { e.stopPropagation(); onNavigate(); }}>+</div>
                    </div>
                )}

                {/* Quick Toggles */}
                <div className="selfbot-targets-quick-actions">
                    <div className="selfbot-targets-toggle-row">
                        <div className="selfbot-targets-toggle-label">
                            <Icons.MicOff />
                            <span>Auto Mute</span>
                        </div>
                        <div className={`selfbot-mini-toggle target ${autoMuteTargetEnabled ? "on" : ""}`} onClick={onAutoMuteToggle}>
                            <div className="selfbot-mini-toggle-slider" />
                        </div>
                    </div>
                    <div className="selfbot-targets-toggle-row">
                        <div className="selfbot-targets-toggle-label">
                            <Icons.HeadphoneOff />
                            <span>Auto Deafen</span>
                        </div>
                        <div className={`selfbot-mini-toggle target ${autoDeafenTargetEnabled ? "on" : ""}`} onClick={onAutoDeafenToggle}>
                            <div className="selfbot-mini-toggle-slider" />
                        </div>
                    </div>
                    <div className="selfbot-targets-toggle-row">
                        <div className="selfbot-targets-toggle-label">
                            <Icons.Automation />
                            <span>Auto Pull</span>
                        </div>
                        <div className={`selfbot-mini-toggle target ${autoPullTargetEnabled ? "on" : ""}`} onClick={onAutoPullToggle}>
                            <div className="selfbot-mini-toggle-slider" />
                        </div>
                    </div>
                    <div className="selfbot-targets-toggle-row">
                        <div className="selfbot-targets-toggle-label">
                            <Icons.ShieldDisconnect />
                            <span>Auto Disconnect</span>
                        </div>
                        <div className={`selfbot-mini-toggle target ${autoDisconnectTargetEnabled ? "on" : ""}`} onClick={onAutoDisconnectToggle}>
                            <div className="selfbot-mini-toggle-slider" />
                        </div>
                    </div>
                    <div className="selfbot-targets-toggle-row">
                        <div className="selfbot-targets-toggle-label">
                            <Icons.Automation />
                            <span>Auto Elevator</span>
                        </div>
                        <div className={`selfbot-mini-toggle target ${autoElevatorTargetEnabled ? "on" : ""}`} onClick={onAutoElevatorToggle}>
                            <div className="selfbot-mini-toggle-slider" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// INLINE TARGETS PAGE - Full targets management within menu
// ═══════════════════════════════════════════════════════════════════════════
function TargetsPage({ onBack }: { onBack: () => void; }) {
    const [targets, setTargets] = useState<Target[]>(() => settingsManager.getTargets());
    const [newTargetId, setNewTargetId] = useState("");
    const [vcUsers, setVcUsers] = useState<string[]>([]);
    const [reactionText, setReactionText] = useState(() => settingsManager.getSettings().reactionSpellerText || "LMAO");

    const refreshTargets = useCallback(() => {
        setTargets([...settingsManager.getTargets()]);
        const vcInfo = getCurrentVoiceChannelInfo();
        if (vcInfo) {
            const usersInVc = getOtherUsersInChannel(vcInfo.channelId);
            setVcUsers(usersInVc);
        }
    }, []);

    useEffect(() => {
        refreshTargets();
        const update = () => refreshTargets();
        VoiceStateStore.addChangeListener(update);
        const interval = setInterval(update, 1000);
        return () => {
            VoiceStateStore.removeChangeListener(update);
            clearInterval(interval);
        };
    }, [refreshTargets]);

    const handleAddTarget = (id: string) => {
        if (!id.trim()) return;
        const user = UserStore.getUser(id);
        const target: Target = user ? {
            id: user.id,
            username: user.username,
            discriminator: user.discriminator,
            avatar: user.getAvatarURL(null, 32),
            enabled: true
        } : {
            id: id.trim(),
            username: "Unknown User",
            avatar: "https://cdn.discordapp.com/embed/avatars/0.png",
            enabled: true
        };
        if (settingsManager.addTarget(target)) {
            refreshTargets();
            setVcUsers(prev => prev.filter(uid => uid !== id));
            showToast(user ? `Added ${user.username} as target` : "Added target", Toasts.Type.SUCCESS);
        } else {
            showToast("Already a target", Toasts.Type.FAILURE);
        }
    };

    const handleRemoveTarget = (id: string) => {
        if (settingsManager.removeTarget(id)) {
            refreshTargets();
            showToast("Target removed", Toasts.Type.SUCCESS);
        }
    };

    const handleToggleEnabled = (id: string) => {
        settingsManager.toggleTargetEnabled(id);
        refreshTargets();
    };

    const handleToggleVoiceStalker = (id: string) => {
        settingsManager.toggleTargetVoiceStalker(id);
        refreshTargets();
    };

    const handleToggleMessageMirror = (id: string) => {
        settingsManager.toggleTargetMessageMirror(id);
        refreshTargets();
    };

    const handleToggleReactionSpeller = (id: string) => {
        settingsManager.toggleTargetReactionSpeller(id);
        refreshTargets();
    };

    const handleReactionTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.toUpperCase().replace(/[^A-Z]/g, "");
        setReactionText(val);
        settingsManager.setReactionSpellerText(val);
    };

    const handleAddAllVcUsers = () => {
        let added = 0;
        for (const id of vcUsers) {
            if (settingsManager.isTarget(id)) continue;
            const user = UserStore.getUser(id);
            const target: Target = user ? {
                id: user.id,
                username: user.username,
                discriminator: user.discriminator,
                avatar: user.getAvatarURL(null, 32),
                enabled: true
            } : { id, username: "Unknown", avatar: "https://cdn.discordapp.com/embed/avatars/0.png", enabled: true };
            if (settingsManager.addTarget(target)) added++;
        }
        refreshTargets();
        setVcUsers([]);
        showToast(`Added ${added} VC users as targets`, Toasts.Type.SUCCESS);
    };

    const handleRemoveAll = () => {
        const toDelete = [...targets];
        for (const t of toDelete) {
            settingsManager.removeTarget(t.id);
        }
        refreshTargets();
        showToast("Cleared all targets", Toasts.Type.SUCCESS);
    };

    const nonTargetVcUsers = vcUsers.filter(id => !settingsManager.isTarget(id));

    return (
        <div className="selfbot-targets-page">
            {/* Header */}
            <div className="selfbot-targets-page-header">
                <div className="selfbot-targets-back-btn" onClick={onBack}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
                    </svg>
                </div>
                <div className="selfbot-targets-page-title">
                    <h3>Attack Targets</h3>
                    <span>{targets.filter(t => t.enabled).length} active / {targets.length} total</span>
                </div>
            </div>

            {/* Add Target */}
            <div className="selfbot-targets-add-section">
                <input
                    type="text"
                    className="selfbot-targets-add-input"
                    placeholder="Enter User ID..."
                    value={newTargetId}
                    onChange={e => setNewTargetId(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { handleAddTarget(newTargetId); setNewTargetId(""); } }}
                />
                <button className="selfbot-targets-add-submit" disabled={!newTargetId.trim()} onClick={() => { handleAddTarget(newTargetId); setNewTargetId(""); }}>
                    Add
                </button>
            </div>

            {/* Bulk Actions */}
            <div className="selfbot-targets-bulk-actions">
                <div className="selfbot-targets-bulk-btn add-vc" onClick={handleAddAllVcUsers}>
                    <Icons.MicOn />
                    <span>Add VC Users</span>
                </div>
                <div className="selfbot-targets-bulk-btn remove-all" onClick={handleRemoveAll}>
                    <Icons.Trash />
                    <span>Clear All</span>
                </div>
            </div>

            {/* Reaction Speller Config */}
            <div className="selfbot-targets-config-section">
                <div className="selfbot-targets-config-row">
                    <div className="selfbot-targets-config-label">
                        <Icons.Reaction />
                        <span>Reaction Text</span>
                    </div>
                    <input
                        type="text"
                        value={reactionText}
                        onChange={handleReactionTextChange}
                        placeholder="LMAO"
                        className="selfbot-targets-config-input"
                        maxLength={10}
                    />
                </div>
            </div>

            {/* Targets List */}
            <div className="selfbot-targets-page-list">
                {/* VC Users Section */}
                {nonTargetVcUsers.length > 0 && (
                    <div className="selfbot-targets-vc-section">
                        <div className="selfbot-targets-vc-header">
                            <Icons.MicOn />
                            <span>Users in Voice ({nonTargetVcUsers.length})</span>
                        </div>
                        <div className="selfbot-targets-vc-list">
                            {nonTargetVcUsers.map(userId => {
                                const user = UserStore.getUser(userId);
                                const avatarUrl = user?.getAvatarURL(null, 24) || "https://cdn.discordapp.com/embed/avatars/0.png";
                                return (
                                    <div key={userId} className="selfbot-targets-vc-user" onClick={() => handleAddTarget(userId)}>
                                        <img src={avatarUrl} alt="" />
                                        <span>{user?.username || "Unknown"}</span>
                                        <div className="selfbot-targets-vc-user-add">+ Add</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {targets.length === 0 ? (
                    <div className="selfbot-targets-page-empty">
                        <Icons.Attack />
                        <span>No targets added</span>
                        <span className="selfbot-targets-empty-hint">Add users by ID or from voice chat</span>
                    </div>
                ) : (
                    <>
                        <div className="selfbot-targets-list-header">
                            <span>Targets ({targets.length})</span>
                            <div className="line" />
                        </div>
                        {targets.map(target => {
                            const user = UserStore.getUser(target.id);
                            const avatarUrl = user?.getAvatarURL(null, 40) || target.avatar || "https://cdn.discordapp.com/embed/avatars/0.png";
                            return (
                                <div key={target.id} className={`selfbot-target-card ${!target.enabled ? "disabled" : ""}`}>
                                    {/* Card Header */}
                                    <div className="selfbot-target-card-header">
                                        <img src={avatarUrl} alt="" className="selfbot-target-card-avatar" />
                                        <div className="selfbot-target-card-info">
                                            <div className="selfbot-target-card-name">{user?.username || target.username}</div>
                                            <div className="selfbot-target-card-id">{target.id}</div>
                                        </div>
                                        <div className="selfbot-target-card-controls">
                                            <div
                                                className={`selfbot-target-status-pill ${target.enabled ? "active" : "inactive"}`}
                                                onClick={() => handleToggleEnabled(target.id)}
                                            >
                                                {target.enabled ? "Active" : "Off"}
                                            </div>
                                            <div className="selfbot-target-remove-btn" onClick={() => handleRemoveTarget(target.id)}>
                                                ✕
                                            </div>
                                        </div>
                                    </div>

                                    {/* Feature Toggles */}
                                    <div className="selfbot-target-features">
                                        <div
                                            className={`selfbot-target-feature ${target.voiceStalker ? "on" : ""}`}
                                            onClick={() => handleToggleVoiceStalker(target.id)}
                                            title="Follow this user to voice channels"
                                        >
                                            <Icons.Footprints />
                                            <span>Stalk</span>
                                        </div>
                                        <div
                                            className={`selfbot-target-feature ${target.messageMirror ? "on" : ""}`}
                                            onClick={() => handleToggleMessageMirror(target.id)}
                                            title="Mirror their DM messages"
                                        >
                                            <Icons.Mirror />
                                            <span>Mirror</span>
                                        </div>

                                        <div
                                            className={`selfbot-target-feature ${target.reactionSpeller ? "on" : ""}`}
                                            onClick={() => handleToggleReactionSpeller(target.id)}
                                            title="React with letter emojis"
                                        >
                                            <Icons.Reaction />
                                            <span>React</span>
                                        </div>
                                        <div
                                            className="selfbot-target-feature copy"
                                            onClick={() => handleCopyProfile(target.id, user?.username || target.username)}
                                            title="Copy their profile"
                                        >
                                            <Icons.CopyProfile />
                                            <span>Copy</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </>
                )}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// INLINE DM CLEAR PAGE
// ═══════════════════════════════════════════════════════════════════════════
type DmClearStep = "select" | "configure" | "confirm";

function DmClearPage({ onBack }: { onBack: () => void; }) {
    const [step, setStep] = useState<DmClearStep>("select");
    const [conversations] = useState(() => getDmConversations());
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedConversation, setSelectedConversation] = useState<DmConversation | null>(null);
    const [newestFirst, setNewestFirst] = useState<boolean>(() => {
        const saved = settingsManager.getToggle("dmClearNewestFirst");
        return typeof saved === "boolean" ? saved : true;
    });

    const filteredConversations = filterDmConversations(conversations, searchQuery);

    const handleSelect = (c: DmConversation) => {
        setSelectedConversation(c);
        setStep("configure");
    };

    const handleOrderChange = () => {
        const newValue = !newestFirst;
        setNewestFirst(newValue);
        settingsManager.setToggle("dmClearNewestFirst", newValue as any);
    };

    const handleStartDelete = () => {
        if (!selectedConversation) return;
        setStep("confirm");

        // Start background process
        const controller = startBackgroundDeletion(
            selectedConversation,
            {
                delay: 100, // Hardcoded to 100ms
                newestFirst: newestFirst
            }
        );
        showToast(`Starting deletion in ${selectedConversation.name}...`, Toasts.Type.MESSAGE);
        onBack();
    };

    return (
        <div className="selfbot-dmclear-page">
            {/* Header */}
            <div className="selfbot-dmclear-page-header">
                <div className="selfbot-dmclear-back-btn" onClick={step === "select" ? onBack : () => setStep("select")}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
                    </svg>
                </div>
                <div className="selfbot-dmclear-page-title">
                    <h3>Clear DM Messages</h3>
                    <span>{step === "select" ? "Select a conversation" : "Configure & start"}</span>
                </div>
            </div>

            {/* Step Indicator */}
            <div className="selfbot-step-indicator">
                <div className={`selfbot-step-dot ${step === "select" ? "active" : "completed"}`} />
                <div className={`selfbot-step-line ${step === "configure" ? "completed" : ""}`} />
                <div className={`selfbot-step-dot ${step === "configure" ? "active" : ""}`} />
            </div>

            {step === "select" && (
                <>
                    <div className="selfbot-dmclear-search">
                        <input
                            type="text"
                            placeholder="Search conversations..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="selfbot-dmclear-list">
                        {filteredConversations.length === 0 ? (
                            <div className="selfbot-targets-page-empty">
                                <Icons.Trash />
                                <span>{searchQuery ? "No matches" : "No DM conversations"}</span>
                            </div>
                        ) : (
                            filteredConversations.map(c => (
                                <div key={c.channelId} className="selfbot-dmclear-conv-item" onClick={() => handleSelect(c)}>
                                    <img src={c.avatarUrl} alt="" className="selfbot-dmclear-conv-avatar" />
                                    <div className="selfbot-dmclear-conv-info">
                                        <div className="selfbot-dmclear-conv-name">{c.name}</div>
                                        <div className="selfbot-dmclear-conv-type">{c.subtext}</div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </>
            )}

            {step === "configure" && selectedConversation && (
                <div className="selfbot-dmclear-config">
                    <div className="selfbot-dmclear-selected">
                        <img src={selectedConversation.avatarUrl} alt="" />
                        <div className="selfbot-dmclear-selected-info">
                            <h4>{selectedConversation.name}</h4>
                            <span>{selectedConversation.subtext}</span>
                        </div>
                    </div>

                    <div className="selfbot-dmclear-delay-section">
                        <div className="selfbot-dmclear-delay-title">Deletion Order</div>
                        <button
                            className="selfbot-dm-order-btn"
                            onClick={handleOrderChange}
                            title={newestFirst ? "Newest first (most recent)" : "Oldest first"}
                            style={{ marginBottom: "16px" }}
                        >
                            <span className="selfbot-dm-order-arrow">
                                {newestFirst ? (
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z" /></svg>
                                ) : (
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" /></svg>
                                )}
                            </span>
                            <span className="selfbot-dm-order-label">
                                {newestFirst ? "Newest First" : "Oldest First"}
                            </span>
                        </button>
                    </div>

                    <div className="selfbot-dmclear-actions">
                        <button className="selfbot-dmclear-btn back" onClick={() => setStep("select")}>Back</button>
                        <button className="selfbot-dmclear-btn start" onClick={handleStartDelete}>Start Clearing</button>
                    </div>
                </div>
            )}
            <div className="selfbot-menu-footer">
                <span className="selfbot-footer-text">SelfBot v1.0</span>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// INLINE TYPING ETERNAL PAGE
// ═══════════════════════════════════════════════════════════════════════════
function TypingPage({ onBack }: { onBack: () => void; }) {
    const [conversations] = useState(() => getDmConversations());
    const [searchQuery, setSearchQuery] = useState("");
    // We use a dummy state to force re-render when toggling
    const [tick, setTick] = useState(0);

    const filteredConversations = filterDmConversations(conversations, searchQuery);

    const handleToggleTyping = (c: DmConversation) => {
        if (isTypingEternalActive(c.channelId)) {
            stopTypingEternal(c.channelId);
        } else {
            startTypingEternal(c.channelId, c.name);
        }
        setTick(t => t + 1);
    };

    return (
        <div className="selfbot-dmclear-page">
            {/* Reuse dmclear styles for consistency */}
            <div className="selfbot-dmclear-page-header">
                <div className="selfbot-dmclear-back-btn" onClick={onBack}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
                    </svg>
                </div>
                <div className="selfbot-dmclear-page-title">
                    <h3>Typing Eternal</h3>
                    <span>Select DMs to spam "Typing..."</span>
                </div>
            </div>

            <div className="selfbot-dmclear-search">
                <input
                    type="text"
                    placeholder="Search conversations..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                />
            </div>
            <div className="selfbot-dmclear-list">
                {filteredConversations.length === 0 ? (
                    <div className="selfbot-targets-page-empty">
                        <Icons.Misc />
                        <span>{searchQuery ? "No matches" : "No DM conversations"}</span>
                    </div>
                ) : (
                    filteredConversations.map(c => {
                        const isActive = isTypingEternalActive(c.channelId);
                        return (
                            <div key={c.channelId} className="selfbot-dmclear-conv-item" onClick={() => handleToggleTyping(c)}>
                                <img src={c.avatarUrl} alt="" className="selfbot-dmclear-conv-avatar" />
                                <div className="selfbot-dmclear-conv-info">
                                    <div className="selfbot-dmclear-conv-name">{c.name}</div>
                                    <div className="selfbot-dmclear-conv-type">{c.subtext}</div>
                                </div>
                                <div className={`selfbot-mini-toggle ${isActive ? "on" : ""}`} style={{ marginLeft: "auto" }}>
                                    <div className="selfbot-mini-toggle-slider" />
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
            <div className="selfbot-menu-footer">
                <span className="selfbot-footer-text">SelfBot v1.0</span>
            </div>
        </div>
    );
}

export function SelfBotMenu({ closePopout }: { closePopout: () => void; }) {
    const currentUser = UserStore.getCurrentUser();
    const [showInit, setShowInit] = useState(() => {
        if (hasShownInitAnimation) return false;
        hasShownInitAnimation = true;
        return true;
    });
    const [menuReady, setMenuReady] = useState(!showInit);

    // State for toggles - Initialize from SettingsManager
    const [autoMuteEnabled, setAutoMuteEnabled] = useState(() => isAutoMuteEnabled());
    const [autoDeafenEnabled, setAutoDeafenEnabled] = useState(() => isAutoDeafenEnabled());
    const [autoUnmuteEnabled, setAutoUnmuteEnabled] = useState(() => isAutoUnmuteEnabled());
    const [autoUndeafenEnabled, setAutoUndeafenEnabled] = useState(() => isAutoUndeafenEnabled());
    const [autoStatus, setAutoStatus] = useState(() => settingsManager.getToggle("autoStatus"));
    const [autoPullEnabled, setAutoPullEnabled] = useState(() => isAutoPullEnabled());
    const [autoDisconnectEnabled, setAutoDisconnectEnabled] = useState(() => isAutoDisconnectEnabled());
    const [autoElevatorEnabled, setAutoElevatorEnabled] = useState(() => isAutoElevatorEnabled());
    const [autoFuckAllEnabled, setAutoFuckAllEnabled] = useState(() => isAutoFuckAllEnabled());
    const [hideLogo, setHideLogo] = useState(() => settingsManager.getToggle("hideLogo"));

    const [isFakeMuteEnabled, setIsFakeMuteEnabled] = useState(FakeState.fakeMuteEnabled);
    const [isFakeDeafenEnabled, setIsFakeDeafenEnabled] = useState(FakeState.fakeDeafenEnabled);
    const [isFakeVideoEnabled, setIsFakeVideoEnabled] = useState(FakeState.fakeVideoEnabled);

    // Target States
    const [autoMuteTargetEnabled, setAutoMuteTargetEnabled] = useState(() => isAutoMuteTargetEnabled());
    const [autoDeafenTargetEnabled, setAutoDeafenTargetEnabled] = useState(() => isAutoDeafenTargetEnabled());
    const [autoPullTargetEnabled, setAutoPullTargetEnabled] = useState(() => isAutoPullTargetEnabled());
    const [autoDisconnectTargetEnabled, setAutoDisconnectTargetEnabled] = useState(() => isAutoDisconnectTargetEnabled());
    const [autoElevatorTargetEnabled, setAutoElevatorTargetEnabled] = useState(() => isAutoElevatorTargetEnabled());

    // State for protections - Initialize from SettingsManager via protectionState/utils
    // ideally protectionUtils should have been initialized by index.tsx reading settingsManager
    // but here we just reflect the current state which should be in sync.
    const [muteProtection, setMuteProtectionState] = useState(protectionState.muteProtection);
    const [deafenProtection, setDeafenProtectionState] = useState(protectionState.deafenProtection);

    const [cameraProtection, setCameraProtectionState] = useState(protectionState.cameraProtection);
    const [antiDisconnectProtection, setAntiDisconnectProtectionState] = useState(protectionState.antiDisconnectProtection);

    const [friendsMuteProtection, setFriendsMuteProtectionState] = useState(protectionState.friendsMuteProtection);
    const [friendsDeafenProtection, setFriendsDeafenProtectionState] = useState(protectionState.friendsDeafenProtection);

    const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
    const [switching, setSwitching] = useState(false);
    const [showTasksDropdown, setShowTasksDropdown] = useState(false);
    const [activeTaskCount, setActiveTaskCount] = useState(() => taskManager.getTasks().length);
    const [activeTab, setActiveTab] = useState("general");
    const [currentPage, setCurrentPage] = useState<"main" | "friends" | "targets" | "dmclear" | "nuke" | "typing" | "profilebackup" | "accountswitcher" | "voiceactions" | "massjoiner" | "spam">("main");

    // Subscribe to task updates for badge count
    useEffect(() => {
        const unsubscribe = taskManager.subscribe(tasks => {
            setActiveTaskCount(tasks.length);
        });
        return () => { unsubscribe(); };
    }, []);

    const toggleCategory = (category: string) => {
        if (expandedCategory && expandedCategory !== category) {
            setSwitching(true);
            setTimeout(() => {
                setExpandedCategory(category);
                setSwitching(false);
            }, 150);
        } else {
            setExpandedCategory(expandedCategory === category ? null : category);
        }
    };

    const handleAutoMuteToggle = () => {
        if (autoMuteEnabled) {
            stopAutoMute();
            setAutoMuteEnabled(false);
            settingsManager.setToggle("autoMute", false);
        } else {
            const success = startAutoMute();
            setAutoMuteEnabled(success);
            settingsManager.setToggle("autoMute", success);
        }
    };

    const handleAutoDeafenToggle = () => {
        if (autoDeafenEnabled) {
            stopAutoDeafen();
            setAutoDeafenEnabled(false);
            settingsManager.setToggle("autoDeafen", false);
        } else {
            const success = startAutoDeafen();
            setAutoDeafenEnabled(success);
            settingsManager.setToggle("autoDeafen", success);
        }
    };

    const handleAutoUnmuteToggle = () => {
        if (autoUnmuteEnabled) {
            stopAutoUnmute();
            setAutoUnmuteEnabled(false);
            settingsManager.setToggle("autoUnmute", false);
        } else {
            const success = startAutoUnmute();
            setAutoUnmuteEnabled(success);
            settingsManager.setToggle("autoUnmute", success);
        }
    };

    const handleAutoUndeafenToggle = () => {
        if (autoUndeafenEnabled) {
            stopAutoUndeafen();
            setAutoUndeafenEnabled(false);
            settingsManager.setToggle("autoUndeafen", false);
        } else {
            const success = startAutoUndeafen();
            setAutoUndeafenEnabled(success);
            settingsManager.setToggle("autoUndeafen", success);
        }
    };

    const handleAutoPullToggle = () => {
        if (autoPullEnabled) {
            stopAutoPull();
            setAutoPullEnabled(false);
            settingsManager.setToggle("autoPull", false);
        } else {
            const success = startAutoPull();
            setAutoPullEnabled(success);
            settingsManager.setToggle("autoPull", success);
        }
    };

    const handleAutoDisconnectToggle = () => {
        if (autoDisconnectEnabled) {
            stopAutoDisconnect();
            setAutoDisconnectEnabled(false);
            settingsManager.setToggle("autoDisconnect", false);
        } else {
            const success = startAutoDisconnect();
            setAutoDisconnectEnabled(success);
            settingsManager.setToggle("autoDisconnect", success);
        }
    };

    const handleAutoElevatorToggle = () => {
        if (autoElevatorEnabled) {
            stopAutoElevator();
            setAutoElevatorEnabled(false);
            settingsManager.setToggle("autoElevator", false);
        } else {
            const success = startAutoElevator();
            setAutoElevatorEnabled(success);
            settingsManager.setToggle("autoElevator", success);
        }
    };

    const handleAutoFuckAllToggle = () => {
        if (autoFuckAllEnabled) {
            stopAutoFuckAll();
            setAutoFuckAllEnabled(false);
            settingsManager.setToggle("autoFuckAll", false);
        } else {
            if (window.confirm("Warning: Auto Fuck All\n\nThis feature is highly risky and may result in a ban. It will repeatedly Mute, Deafen, and Move users who join the channel. Are you sure you want to enable this?")) {
                const success = startAutoFuckAll();
                setAutoFuckAllEnabled(success);
                settingsManager.setToggle("autoFuckAll", success);
            }
        }
    };

    const handleFakeMuteToggle = () => {
        const newState = FakeState.toggleFakeMute();
        setIsFakeMuteEnabled(newState);
        settingsManager.setToggle("fakeMute", newState);
    };

    const handleFakeDeafenToggle = () => {
        const newState = FakeState.toggleFakeDeafen();
        setIsFakeDeafenEnabled(newState);
        settingsManager.setToggle("fakeDeafen", newState);
    };

    const handleFakeVideoToggle = () => {
        const newState = FakeState.toggleFakeVideo();
        setIsFakeVideoEnabled(newState);
        settingsManager.setToggle("fakeVideo", newState);
    };

    // Target Handlers
    const handleAutoMuteTargetToggle = () => {
        if (autoMuteTargetEnabled) {
            stopAutoMuteTarget();
            setAutoMuteTargetEnabled(false);
            settingsManager.setToggle("autoMuteTarget", false);
        } else {
            const success = startAutoMuteTarget();
            setAutoMuteTargetEnabled(success);
            settingsManager.setToggle("autoMuteTarget", success);
        }
    };

    const handleAutoDeafenTargetToggle = () => {
        if (autoDeafenTargetEnabled) {
            stopAutoDeafenTarget();
            setAutoDeafenTargetEnabled(false);
            settingsManager.setToggle("autoDeafenTarget", false);
        } else {
            const success = startAutoDeafenTarget();
            setAutoDeafenTargetEnabled(success);
            settingsManager.setToggle("autoDeafenTarget", success);
        }
    };

    const handleAutoPullTargetToggle = () => {
        if (autoPullTargetEnabled) {
            stopAutoPullTarget();
            setAutoPullTargetEnabled(false);
            settingsManager.setToggle("autoPullTarget", false);
        } else {
            const success = startAutoPullTarget();
            setAutoPullTargetEnabled(success);
            settingsManager.setToggle("autoPullTarget", success);
        }
    };

    const handleAutoDisconnectTargetToggle = () => {
        if (autoDisconnectTargetEnabled) {
            stopAutoDisconnectTarget();
            setAutoDisconnectTargetEnabled(false);
            settingsManager.setToggle("autoDisconnectTarget", false);
        } else {
            const success = startAutoDisconnectTarget();
            setAutoDisconnectTargetEnabled(success);
            settingsManager.setToggle("autoDisconnectTarget", success);
        }
    };

    const handleAutoElevatorTargetToggle = () => {
        if (autoElevatorTargetEnabled) {
            stopAutoElevatorTarget();
            setAutoElevatorTargetEnabled(false);
            settingsManager.setToggle("autoElevatorTarget", false);
        } else {
            const success = startAutoElevatorTarget();
            setAutoElevatorTargetEnabled(success);
            settingsManager.setToggle("autoElevatorTarget", success);
        }
    };

    // Manual Actions
    const handleTargetElevator = () => {
        openElevatorModal(); // This modal should be updated to handle target elevator if it doesn't already?
        // Wait, openElevatorModal opens the generic elevator modal.
        // The user request said "Elevator button (it asks the user how many times he wants to move the user)".
        // I need to check if ElevatorModal supports targets or if I should implement a prompt here.
        // Existing targetElevator.ts takes 'iterations'.
        // If ElevatorModal calls elevatorAll, that's different.
        // Let's implement a simple prompt for now as per plan, or reuse ElevatorModal if adaptable.
        // Given I can't easily change ElevatorModal without seeing it, I'll use a prompt or verify ElevatorModal content.
        // I'll stick to prompt for now to ensure it calls targetElevator logic specifically.

        // Actually, let's use a nice prompt if possible, or window.prompt.
        // As per plan: "I will use the existing ElevatorModal pattern if possible or window.prompt if simple."
        // I'll use window.prompt for simplicity and certainty.

        const input = window.prompt("Enter number of iterations:", "5");
        if (input) {
            const iterations = parseInt(input);
            if (!isNaN(iterations) && iterations > 0) {
                targetElevator(iterations);
            } else {
                showToast("Invalid number", Toasts.Type.FAILURE);
            }
        }
    };

    const handleDisconnectTargets = () => {
        const vcInfo = getCurrentVoiceChannel();
        if (vcInfo) {
            const count = disconnectTargetsInGuild(vcInfo.guildId);
            showToast(`Disconnected ${count} targets`, Toasts.Type.SUCCESS);
        } else {
            showToast("Join a voice channel first!", Toasts.Type.FAILURE);
        }
    };

    const handleMuteTargets = () => {
        const vcInfo = getCurrentVoiceChannel();
        if (vcInfo) {
            const count = muteTargetsInGuild(vcInfo.guildId);
            showToast(`Muted ${count} targets`, Toasts.Type.SUCCESS);
        } else {
            showToast("Join a voice channel first!", Toasts.Type.FAILURE);
        }
    };

    const handleDeafenTargets = () => {
        const vcInfo = getCurrentVoiceChannel();
        if (vcInfo) {
            const count = deafenTargetsInGuild(vcInfo.guildId);
            showToast(`Deafened ${count} targets`, Toasts.Type.SUCCESS);
        } else {
            showToast("Join a voice channel first!", Toasts.Type.FAILURE);
        }
    };

    if (showInit) {
        return <InitializingOverlay onComplete={() => { setShowInit(false); setMenuReady(true); }} />;
    }

    // Render inline FriendsPage when navigated
    if (currentPage === "friends") {
        return (
            <div className={`selfbot-menu-container ${menuReady ? "selfbot-menu-ready" : ""}`}>
                <FriendsPage onBack={() => setCurrentPage("main")} />
            </div>
        );
    }

    // Render inline TargetsPage when navigated
    if (currentPage === "targets") {
        return (
            <div className={`selfbot-menu-container ${menuReady ? "selfbot-menu-ready" : ""}`}>
                <TargetsPage onBack={() => setCurrentPage("main")} />
            </div>
        );
    }

    // Render inline DmClearPage when navigated
    if (currentPage === "dmclear") {
        return (
            <div className={`selfbot-menu-container ${menuReady ? "selfbot-menu-ready" : ""}`}>
                <DmClearPage onBack={() => setCurrentPage("main")} />
            </div>
        );
    }

    // Render inline TypingPage when navigated
    if (currentPage === "typing") {
        return (
            <div className={`selfbot-menu-container ${menuReady ? "selfbot-menu-ready" : ""}`}>
                <TypingPage onBack={() => setCurrentPage("main")} />
            </div>
        );
    }

    // Navigation is now handled by tabs for voice actions

    // Render inline AccountSwitcherPage when navigated
    if (currentPage === "accountswitcher") {
        return (
            <div className={`selfbot-menu-container ${menuReady ? "selfbot-menu-ready" : ""}`}>
                <AccountSwitcherPage onBack={() => setCurrentPage("main")} />
            </div>
        );
    }

    // Render inline ProfileBackupPage when navigated
    if (currentPage === "profilebackup") {
        return (
            <div className={`selfbot-menu-container ${menuReady ? "selfbot-menu-ready" : ""}`}>
                <ProfileBackupPage onBack={() => setCurrentPage("main")} />
            </div>
        );
    }

    // Render inline MassJoinerPage when navigated
    if (currentPage === "massjoiner") {
        return (
            <div className={`selfbot-menu-container ${menuReady ? "selfbot-menu-ready" : ""}`}>
                <MassJoinerPage onBack={() => setCurrentPage("main")} />
            </div>
        );
    }

    // Render inline SpamPage when navigated
    if (currentPage === "spam") {
        return (
            <div className={`selfbot-menu-container ${menuReady ? "selfbot-menu-ready" : ""}`}>
                <SpamPage onBack={() => setCurrentPage("main")} />
            </div>
        );
    }

    return (
        <div className={`selfbot-menu-container ${menuReady ? "selfbot-menu-ready" : ""}`}>
            {/* Header with dual profiles */}
            <div className="selfbot-menu-header" style={{ justifyContent: "space-between", padding: "0 16px 0 10px" }}>
                <img src={logo} alt="SelfBot Logo" style={{ height: "60px", width: "auto", objectFit: "contain", display: "block", visibility: hideLogo ? "hidden" : "visible", marginLeft: "8px" }} />
                <div className="selfbot-owners-wrapper">
                    <UserProfileCard userId={OWNER_ID} role="Owner" isOwner onClose={closePopout} />
                    <div className="selfbot-header-divider" />
                    <UserProfileCard userId={SECOND_OWNER_ID} role="Owner" isOwner onClose={closePopout} />
                </div>
            </div>

            {/* Categories & Content */}
            <div className="selfbot-horizontal-layout">
                {/* Category Tabs */}
                <div className="selfbot-category-tabs">
                    {[
                        { id: "self", label: "Self", icon: <Icons.Self />, color: "#c21818" },
                        { id: "attack", label: "Attack", icon: <Icons.Attack />, color: "#c21818" },
                        { id: "target", label: "Target", icon: <Icons.Target />, color: "#c21818" },
                        { id: "defense", label: "Defense", icon: <Icons.Defense />, color: "#c21818" },
                        { id: "voiceactions", label: "Voice", icon: <Icons.ShieldMic />, color: "#c21818" },
                        { id: "misc", label: "Misc", icon: <Icons.Misc />, color: "#c21818" }
                    ].map((cat, idx) => (
                        <div
                            key={cat.id}
                            className={`selfbot-tab ${expandedCategory === cat.id ? "selfbot-tab-active" : ""}`}
                            onClick={() => toggleCategory(cat.id)}
                            style={{ "--tab-color": cat.color, "--tab-delay": `${idx * 50}ms` } as React.CSSProperties}
                        >
                            {cat.icon}
                            <span>{cat.label}</span>
                        </div>
                    ))}
                </div>

                {/* Options Panel */}
                <div className={`selfbot-options-panel ${switching ? "selfbot-switching" : ""}`}>
                    {!expandedCategory && (
                        <div className="selfbot-no-category">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" opacity="0.3">
                                <path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z" />
                            </svg>
                            <span>Select a category</span>
                        </div>
                    )}

                    {/* SELF Options */}
                    {expandedCategory === "self" && (
                        <div className="selfbot-panel-content">
                            <MenuOption icon={<Icons.FakeMic />} label="Fake Mute" description="Appear muted but still talk" toggled={isFakeMuteEnabled} onClick={handleFakeMuteToggle} />
                            <MenuOption icon={<Icons.FakeHeadphone />} label="Fake Deafen" description="Appear deafened but still hear" toggled={isFakeDeafenEnabled} onClick={handleFakeDeafenToggle} />
                            <MenuOption icon={<Icons.FakeCamera />} label="Fake Camera" description="Appear to have camera on" toggled={isFakeVideoEnabled} onClick={handleFakeVideoToggle} />

                            <div className="selfbot-section-header">
                                <div className="selfbot-section-line" />
                                <span>Protections</span>
                                <div className="selfbot-section-line" />
                            </div>

                            <MenuOption
                                icon={<Icons.ShieldMic />}
                                label="Mute Protection"
                                description="Auto-unmute if server muted"
                                toggled={muteProtection}
                                onClick={() => {
                                    const newState = !muteProtection;
                                    setMuteProtection(newState);
                                    setMuteProtectionState(newState);
                                    settingsManager.setToggle("muteProtection", newState);
                                }}
                            />
                            <MenuOption
                                icon={<Icons.ShieldHeadphone />}
                                label="Deafen Protection"
                                description="Auto-undeafen if server deafened"
                                toggled={deafenProtection}
                                onClick={() => {
                                    const newState = !deafenProtection;
                                    setDeafenProtection(newState);
                                    setDeafenProtectionState(newState);
                                    settingsManager.setToggle("deafenProtection", newState);
                                }}
                            />

                            <MenuOption
                                icon={<Icons.ShieldCamera />}
                                label="Camera Protection"
                                description="Auto-enable camera if disabled"
                                toggled={cameraProtection}
                                onClick={() => {
                                    const newState = !cameraProtection;
                                    setCameraProtection(newState);
                                    setCameraProtectionState(newState);
                                    settingsManager.setToggle("cameraProtection", newState);
                                }}
                            />
                            <MenuOption
                                icon={<Icons.ShieldDisconnect />}
                                label="Anti-Disconnect"
                                description="Auto-reconnect if disconnected"
                                toggled={antiDisconnectProtection}
                                onClick={() => {
                                    const newState = !antiDisconnectProtection;
                                    setAntiDisconnectProtection(newState);
                                    setAntiDisconnectProtectionState(newState);
                                    settingsManager.setToggle("antiDisconnectProtection", newState);
                                }}
                            />

                            <div className="selfbot-section-header">
                                <div className="selfbot-section-line" />
                                <span>Voice</span>
                                <div className="selfbot-section-line" />
                            </div>
                            <MenuOption icon={<Icons.Keyboard />} label="Spam & Raid" description="Spam messages to multiple channels" onClick={() => setCurrentPage("spam")} />
                            <MenuOption icon={<Icons.Keyboard />} label="Typing Spam" description="Eternal typing in selected DMs" onClick={() => setCurrentPage("typing")} />

                            <FollowUserSection />
                            <AutoStatusSection autoStatus={autoStatus} setAutoStatus={setAutoStatus} />
                        </div>
                    )}

                    {/* ATTACK Options */}
                    {expandedCategory === "attack" && (
                        <div className="selfbot-panel-content">
                            {/* Friends Quick Panel */}
                            <FriendsQuickPanel
                                autoPullEnabled={autoPullEnabled}
                                onAutoPullToggle={handleAutoPullToggle}
                                friendsMuteProtection={friendsMuteProtection}
                                friendsDeafenProtection={friendsDeafenProtection}
                                onFriendsMuteToggle={() => {
                                    const newState = !friendsMuteProtection;
                                    setFriendsMuteProtection(newState);
                                    setFriendsMuteProtectionState(newState);
                                    settingsManager.setToggle("friendsMuteProtection", newState);
                                }}
                                onFriendsDeafenToggle={() => {
                                    const newState = !friendsDeafenProtection;
                                    setFriendsDeafenProtection(newState);
                                    setFriendsDeafenProtectionState(newState);
                                    settingsManager.setToggle("friendsDeafenProtection", newState);
                                }}
                                onNavigate={() => setCurrentPage("friends")}
                            />

                            <div className="selfbot-section-header">
                                <div className="selfbot-section-line" />
                                <span>Automation</span>
                                <div className="selfbot-section-line" />
                            </div>

                            <MenuOption icon={<Icons.MicOff />} label="Auto Mute" description="Server-mute all users in your VC" toggled={autoMuteEnabled} onClick={handleAutoMuteToggle} />
                            <MenuOption icon={<Icons.HeadphoneOff />} label="Auto Deafen" description="Server-deafen all users in your VC" toggled={autoDeafenEnabled} onClick={handleAutoDeafenToggle} />
                            <MenuOption icon={<Icons.ShieldDisconnect />} label="Auto Disconnect" description="Auto-disconnect users" toggled={autoDisconnectEnabled} onClick={handleAutoDisconnectToggle} />
                            <MenuOption icon={<Icons.Elevator />} label="Auto Elevator" description="Auto-move users randomly" toggled={autoElevatorEnabled} onClick={handleAutoElevatorToggle} />
                            <MenuOption icon={<Icons.Nuke />} label="Auto Fuck All" description="Auto Mute/Deafen/Move users" toggled={autoFuckAllEnabled} onClick={handleAutoFuckAllToggle} />

                            <div className="selfbot-section-header">
                                <div className="selfbot-section-line" />
                                <span>Actions</span>
                                <div className="selfbot-section-line" />
                            </div>

                            <MenuOption icon={<Icons.MicOff />} label="Mute All" description="Server-mute everyone once" onClick={() => muteAll()} />
                            <MenuOption icon={<Icons.HeadphoneOff />} label="Deafen All" description="Server-deafen everyone once" onClick={() => deafenAll()} />
                            <MenuOption icon={<Icons.ShieldDisconnect />} label="Disconnect All" description="Disconnect everyone" onClick={() => disconnectAll()} />
                            <MenuOption icon={<Icons.Elevator />} label="Elevator All" description="Move everyone to random VC" onClick={() => elevatorAll()} />
                            <MenuOption icon={<Icons.Nuke />} label="Fuck All" description="Mute, Deafen, then Move everyone" onClick={() => fuckAll()} />

                            <div className="selfbot-section-header">
                                <div className="selfbot-section-line" />
                                <span>Multi-Account</span>
                                <div className="selfbot-section-line" />
                            </div>

                            <MenuOption icon={<Icons.Group />} label="Mass Joiner" description="Control multiple accounts in voice" onClick={() => setCurrentPage("massjoiner")} />
                        </div>
                    )}

                    {/* TARGET Options */}
                    {expandedCategory === "target" && (
                        <div className="selfbot-panel-content">
                            {/* Targets Quick Panel */}
                            <TargetsQuickPanel
                                onNavigate={() => setCurrentPage("targets")}
                                autoMuteTargetEnabled={autoMuteTargetEnabled}
                                autoDeafenTargetEnabled={autoDeafenTargetEnabled}
                                autoPullTargetEnabled={autoPullTargetEnabled}
                                autoDisconnectTargetEnabled={autoDisconnectTargetEnabled}
                                autoElevatorTargetEnabled={autoElevatorTargetEnabled}
                                onAutoMuteToggle={handleAutoMuteTargetToggle}
                                onAutoDeafenToggle={handleAutoDeafenTargetToggle}
                                onAutoPullToggle={handleAutoPullTargetToggle}
                                onAutoDisconnectToggle={handleAutoDisconnectTargetToggle}
                                onAutoElevatorToggle={handleAutoElevatorTargetToggle}
                            />

                            <div className="selfbot-section-header">
                                <div className="selfbot-section-line" />
                                <span>Actions</span>
                                <div className="selfbot-section-line" />
                            </div>

                            <MenuOption icon={<Icons.MicOff />} label="Mute Targets" description="Mute all targets in VC" onClick={handleMuteTargets} />
                            <MenuOption icon={<Icons.HeadphoneOff />} label="Deafen Targets" description="Deafen all targets in VC" onClick={handleDeafenTargets} />
                            <MenuOption icon={<Icons.ShieldDisconnect />} label="Disconnect Targets" description="Disconnect all targets" onClick={handleDisconnectTargets} />
                            <MenuOption icon={<Icons.Elevator />} label="Elevator Targets" description="Loop move targets" onClick={handleTargetElevator} />

                        </div>
                    )}

                    {/* DEFENSE Options */}
                    {expandedCategory === "defense" && (
                        <div className="selfbot-panel-content">
                            <MenuOption icon={<Icons.MicOn />} label="Auto Unmute" description="Server-unmute all users in your VC" toggled={autoUnmuteEnabled} onClick={handleAutoUnmuteToggle} />
                            <MenuOption icon={<Icons.HeadphoneOn />} label="Auto Undeafen" description="Server-undeafen all users in your VC" toggled={autoUndeafenEnabled} onClick={handleAutoUndeafenToggle} />

                            <div className="selfbot-section-header">
                                <div className="selfbot-section-line" />
                                <span>Actions</span>
                                <div className="selfbot-section-line" />
                            </div>

                            <MenuOption icon={<Icons.MicOn />} label="UnMute All" description="Server-unmute everyone once" onClick={() => unMuteAll()} />
                            <MenuOption icon={<Icons.HeadphoneOn />} label="UnDeafen All" description="Server-undeafen everyone once" onClick={() => unDeafenAll()} />
                        </div>
                    )}

                    {/* VOICE ACTIONS Options */}
                    {expandedCategory === "voiceactions" && (
                        <div className="selfbot-panel-content" style={{ padding: 0, height: "100%", overflow: "hidden" }}>
                            <VoiceActionsPage isTab={true} onBack={() => setExpandedCategory(null)} />
                        </div>
                    )}

                    {/* MISC Options */}
                    {expandedCategory === "misc" && (
                        <div className="selfbot-panel-content">
                            {/* Account Switcher Quick Panel (Pinned Top) */}
                            <AccountSwitcherQuickPanel onNavigate={() => setCurrentPage("accountswitcher")} />

                            <div style={{ position: "relative" }}>
                                <MenuOption
                                    icon={<Icons.Automation />}
                                    label="Active Tasks"
                                    description="Manage background operations"
                                    highlight
                                    onClick={() => setShowTasksDropdown(!showTasksDropdown)}
                                />
                                {activeTaskCount > 0 && (
                                    <div className="selfbot-active-tasks-badge" style={{ position: "absolute", top: "8px", right: "48px" }}>
                                        {activeTaskCount}
                                    </div>
                                )}
                            </div>
                            {showTasksDropdown && <ActiveTasksDropdown />}

                            <MenuOption icon={<Icons.Trash />} label="DM Clear" description="Clear your messages from a DM" onClick={() => setCurrentPage("dmclear")} />
                            <MenuOption icon={<Icons.Nuke />} label="Nuke Account" description="Delete all DMs, leave servers, remove friends" onClick={() => openNukeModal()} />
                            <MenuOption icon={<Icons.Profile />} label="Profile Backup" description="Save and restore your Discord profile" onClick={() => setCurrentPage("profilebackup")} />

                            <div className="selfbot-section-header">
                                <div className="selfbot-section-line" />
                                <span>Settings</span>
                                <div className="selfbot-section-line" />
                            </div>

                            <MenuOption
                                icon={<Icons.EyeOff />}
                                label="Hide Umbral Logo"
                                description="Hide the SelfBot logo in the header"
                                toggled={hideLogo}
                                onClick={() => {
                                    const newState = !hideLogo;
                                    setHideLogo(newState);
                                    settingsManager.setToggle("hideLogo", newState);
                                }}
                            />

                        </div>
                    )}
                </div>
            </div>

            {/* Footer */}
            <div className="selfbot-menu-footer">
                <span className="selfbot-footer-text">SelfBot v1.0</span>
            </div>
        </div>
    );
}
