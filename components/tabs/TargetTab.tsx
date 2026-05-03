/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showToast, Toasts, useCallback, useEffect, UserStore, useState, VoiceStateStore } from "@webpack/common";

import { deafenTargetsInGuild, isAutoDeafenTargetEnabled, startAutoDeafenTarget, stopAutoDeafenTarget } from "../../utils/autoDeafenTargetUtils";
import { disconnectTargetsInGuild, isAutoDisconnectTargetEnabled, startAutoDisconnectTarget, stopAutoDisconnectTarget } from "../../utils/autoDisconnectTargetUtils";
import { isAutoElevatorTargetEnabled, startAutoElevatorTarget, stopAutoElevatorTarget } from "../../utils/autoElevatorTargetUtils";
import { isAutoMuteTargetEnabled, muteTargetsInGuild, startAutoMuteTarget, stopAutoMuteTarget } from "../../utils/autoMuteTargetUtils";
import { getCurrentVoiceChannel, getCurrentVoiceChannelInfo, getOtherUsersInChannel } from "../../utils/autoMuteUtils";
import { isAutoPullTargetEnabled, startAutoPullTarget, stopAutoPullTarget } from "../../utils/autoPullTargetUtils";
import { settingsManager, Target } from "../../utils/settingsManager";
import { targetElevator } from "../../utils/targetElevator";
import { handleCopyProfile } from "../ProfileBackupPage";
import { Icons } from "../Icons";

// ─── Shared helpers ───────────────────────────────────────────
function Toggle({ on, onClick }: { on: boolean; onClick: () => void; }) {
    return (
        <div
            className={`sb-toggle${on ? " sb-on" : ""}`}
            onClick={e => { e.stopPropagation(); onClick(); }}
        />
    );
}

function SectionLabel({ children }: { children: React.ReactNode; }) {
    return <div className="sb-section-label">{children}</div>;
}

function ToggleRow({
    icon, label, desc, on, onClick
}: { icon?: React.ReactNode; label: string; desc?: string; on?: boolean; onClick: () => void; }) {
    return (
        <div className="sb-row" onClick={onClick}>
            <div className="sb-row-left">
                {icon && <div className="sb-row-icon">{icon}</div>}
                <div className="sb-row-info">
                    <div className="sb-row-label">{label}</div>
                    {desc && <div className="sb-row-desc">{desc}</div>}
                </div>
            </div>
            {on !== undefined && (
                <div className="sb-row-right">
                    <Toggle on={on} onClick={onClick} />
                </div>
            )}
        </div>
    );
}

// ─── ID input with live user preview ─────────────────────────
function UserIdInput({ onAdd, placeholder = "Enter User ID..." }: {
    onAdd: (id: string) => void;
    placeholder?: string;
}) {
    const [inputId, setInputId] = useState("");
    const preview = inputId.trim().length > 15 ? UserStore.getUser(inputId.trim()) : null;

    return (
        <div style={{ marginBottom: 6 }}>
            <div className="sb-input-group">
                <input
                    className="sb-input"
                    type="text"
                    placeholder={placeholder}
                    value={inputId}
                    onChange={e => setInputId(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === "Enter") {
                            onAdd(inputId.trim());
                            setInputId("");
                        }
                    }}
                />
                <button
                    className="sb-btn sb-sm"
                    disabled={!inputId.trim()}
                    onClick={() => { onAdd(inputId.trim()); setInputId(""); }}
                >Add</button>
            </div>
            {preview && (
                <div className="sb-preview-card">
                    <img className="sb-preview-avatar"
                        src={preview.getAvatarURL(null, 32) || "https://cdn.discordapp.com/embed/avatars/0.png"}
                        alt=""
                    />
                    <div>
                        <div className="sb-preview-name">{preview.username}</div>
                        <div className="sb-preview-id">{preview.id}</div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// TARGET TAB
// ═══════════════════════════════════════════════════════════════
export function TargetTab() {
    const [targets, setTargets]   = useState<Target[]>(() => settingsManager.getTargets());
    const [vcUsers, setVcUsers]   = useState<string[]>([]);
    const [reactionText, setReactionText] = useState(() => settingsManager.getSettings().reactionSpellerText || "LMAO");

    const [autoMuteT,       setAutoMuteT]       = useState(() => isAutoMuteTargetEnabled());
    const [autoDeafenT,     setAutoDeafenT]     = useState(() => isAutoDeafenTargetEnabled());
    const [autoPullT,       setAutoPullT]       = useState(() => isAutoPullTargetEnabled());
    const [autoDisconnectT, setAutoDisconnectT] = useState(() => isAutoDisconnectTargetEnabled());
    const [autoElevatorT,   setAutoElevatorT]   = useState(() => isAutoElevatorTargetEnabled());

    const refresh = useCallback(() => {
        setTargets([...settingsManager.getTargets()]);
        const vc = getCurrentVoiceChannelInfo();
        if (vc) setVcUsers(getOtherUsersInChannel(vc.channelId));
        else     setVcUsers([]);
    }, []);

    useEffect(() => {
        refresh();
        const update = () => refresh();
        VoiceStateStore.addChangeListener(update);
        const interval = setInterval(update, 1500);
        return () => { VoiceStateStore.removeChangeListener(update); clearInterval(interval); };
    }, [refresh]);

    const handleAdd = (id: string) => {
        if (!id) return;
        const user = UserStore.getUser(id);
        const t: Target = user
            ? { id: user.id, username: user.username, discriminator: user.discriminator, avatar: user.getAvatarURL(null, 32), enabled: true }
            : { id, username: "Unknown User", enabled: true };
        if (settingsManager.addTarget(t)) {
            refresh();
            showToast(user ? `Added ${user.username} as target` : "Added target", Toasts.Type.SUCCESS);
        } else {
            showToast("Already a target", Toasts.Type.FAILURE);
        }
    };

    const handleRemove = (id: string) => {
        settingsManager.removeTarget(id);
        refresh();
        showToast("Target removed", Toasts.Type.SUCCESS);
    };

    const handleToggleEnabled = (id: string) => { settingsManager.toggleTargetEnabled(id); refresh(); };
    const handleToggleStalk   = (id: string) => { settingsManager.toggleTargetVoiceStalker(id); refresh(); };
    const handleToggleMirror  = (id: string) => { settingsManager.toggleTargetMessageMirror(id); refresh(); };
    const handleToggleReact   = (id: string) => { settingsManager.toggleTargetReactionSpeller(id); refresh(); };

    const handleAddAllVc = () => {
        let added = 0;
        for (const id of vcUsers) {
            if (settingsManager.isTarget(id)) continue;
            const u = UserStore.getUser(id);
            const t: Target = u
                ? { id: u.id, username: u.username, discriminator: u.discriminator, avatar: u.getAvatarURL(null, 32), enabled: true }
                : { id, username: "Unknown", enabled: true };
            if (settingsManager.addTarget(t)) added++;
        }
        refresh();
        showToast(`Added ${added} VC users as targets`, Toasts.Type.SUCCESS);
    };

    const handleClearAll = () => {
        [...targets].forEach(t => settingsManager.removeTarget(t.id));
        refresh();
        showToast("Cleared all targets", Toasts.Type.SUCCESS);
    };

    const handleReactionTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.toUpperCase().replace(/[^A-Z]/g, "");
        setReactionText(val);
        settingsManager.setReactionSpellerText(val);
    };

    const toggleAuto = (
        current: boolean,
        setter: (v: boolean) => void,
        key: string,
        startFn: () => boolean | void,
        stopFn: () => void
    ) => {
        if (current) { stopFn(); setter(false); settingsManager.setToggle(key, false); }
        else {
            const ok = startFn();
            const result = ok === undefined ? true : !!ok;
            setter(result); settingsManager.setToggle(key, result);
        }
    };

    const handleDisconnectTargets = () => {
        const vc = getCurrentVoiceChannel();
        if (!vc) { showToast("Join a voice channel first!", Toasts.Type.FAILURE); return; }
        const n = disconnectTargetsInGuild(vc.guildId);
        showToast(`Disconnected ${n} targets`, Toasts.Type.SUCCESS);
    };

    const handleMuteTargets = () => {
        const vc = getCurrentVoiceChannel();
        if (!vc) { showToast("Join a voice channel first!", Toasts.Type.FAILURE); return; }
        const n = muteTargetsInGuild(vc.guildId);
        showToast(`Muted ${n} targets`, Toasts.Type.SUCCESS);
    };

    const handleDeafenTargets = () => {
        const vc = getCurrentVoiceChannel();
        if (!vc) { showToast("Join a voice channel first!", Toasts.Type.FAILURE); return; }
        const n = deafenTargetsInGuild(vc.guildId);
        showToast(`Deafened ${n} targets`, Toasts.Type.SUCCESS);
    };

    const handleTargetElevator = () => {
        const input = window.prompt("Elevator iterations:", "5");
        if (!input) return;
        const n = parseInt(input);
        if (isNaN(n) || n <= 0) { showToast("Invalid number", Toasts.Type.FAILURE); return; }
        targetElevator(n);
    };

    const nonTargetVcUsers = vcUsers.filter(id => !settingsManager.isTarget(id));

    return (
        <div>
            {/* ─── Add Target ───────────────────────────── */}
            <SectionLabel>Add Target</SectionLabel>
            <UserIdInput onAdd={handleAdd} />

            {/* vc quick-add */}
            {nonTargetVcUsers.length > 0 && (
                <div className="sb-bulk-bar">
                    <button className="sb-bulk-btn" onClick={handleAddAllVc}>
                        <Icons.MicOn /><span>Add All VC Users ({nonTargetVcUsers.length})</span>
                    </button>
                </div>
            )}

            {nonTargetVcUsers.length > 0 && (
                <>
                    <div className="sb-section-label">Users in Voice</div>
                    {nonTargetVcUsers.map(uid => {
                        const u = UserStore.getUser(uid);
                        return (
                            <div key={uid} className="sb-person-row" style={{ cursor: "pointer" }} onClick={() => handleAdd(uid)}>
                                <img className="sb-person-avatar"
                                    src={u?.getAvatarURL(null, 32) || "https://cdn.discordapp.com/embed/avatars/0.png"}
                                    alt=""
                                />
                                <div className="sb-person-info">
                                    <div className="sb-person-name">{u?.username || "Unknown"}</div>
                                    <div className="sb-person-id">{uid}</div>
                                </div>
                                <div className="sb-person-actions">
                                    <span style={{ fontSize: "var(--sb-xs)", color: "var(--sb-text-muted)" }}>+ Add</span>
                                </div>
                            </div>
                        );
                    })}
                </>
            )}

            {/* ─── Auto-attack toggles ──────────────────── */}
            <SectionLabel>Automation</SectionLabel>
            <ToggleRow icon={<Icons.MicOff />}          label="Auto Mute Target"       desc="Server-mute targets on join" on={autoMuteT}       onClick={() => toggleAuto(autoMuteT,       setAutoMuteT,       "autoMuteTarget",       startAutoMuteTarget,       stopAutoMuteTarget)} />
            <ToggleRow icon={<Icons.HeadphoneOff />}    label="Auto Deafen Target"     desc="Server-deafen targets on join" on={autoDeafenT}     onClick={() => toggleAuto(autoDeafenT,     setAutoDeafenT,     "autoDeafenTarget",     startAutoDeafenTarget,     stopAutoDeafenTarget)} />
            <ToggleRow icon={<Icons.Automation />}      label="Auto Pull Target"       desc="Pull targets to your channel" on={autoPullT}       onClick={() => toggleAuto(autoPullT,       setAutoPullT,       "autoPullTarget",       startAutoPullTarget,       stopAutoPullTarget)} />
            <ToggleRow icon={<Icons.ShieldDisconnect />} label="Auto Disconnect Target" desc="Disconnect targets on join" on={autoDisconnectT} onClick={() => toggleAuto(autoDisconnectT, setAutoDisconnectT, "autoDisconnectTarget", startAutoDisconnectTarget, stopAutoDisconnectTarget)} />
            <ToggleRow icon={<Icons.Elevator />}        label="Auto Elevator Target"   desc="Loop-move targets between channels" on={autoElevatorT}   onClick={() => toggleAuto(autoElevatorT,   setAutoElevatorT,   "autoElevatorTarget",   startAutoElevatorTarget,   stopAutoElevatorTarget)} />

            {/* ─── One-shot actions ─────────────────────── */}
            <SectionLabel>Actions</SectionLabel>
            <div className="sb-action-grid" style={{ marginBottom: 10 }}>
                <button className="sb-action-btn" onClick={handleMuteTargets}>
                    <Icons.MicOff /><span>Mute Targets</span>
                </button>
                <button className="sb-action-btn" onClick={handleDeafenTargets}>
                    <Icons.HeadphoneOff /><span>Deafen Targets</span>
                </button>
                <button className="sb-action-btn" onClick={handleDisconnectTargets}>
                    <Icons.ShieldDisconnect /><span>Disconnect</span>
                </button>
                <button className="sb-action-btn" onClick={handleTargetElevator}>
                    <Icons.Elevator /><span>Elevator</span>
                </button>
            </div>

            {/* ─── Reaction speller config ──────────────── */}
            <SectionLabel>Reaction Speller Text</SectionLabel>
            <div className="sb-input-group" style={{ marginBottom: 8 }}>
                <input
                    className="sb-input"
                    type="text"
                    value={reactionText}
                    onChange={handleReactionTextChange}
                    placeholder="LMAO"
                    maxLength={10}
                />
            </div>

            {/* ─── Targets list ─────────────────────────── */}
            {targets.length > 0 && (
                <>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                        <SectionLabel>Targets ({targets.length})</SectionLabel>
                        <button className="sb-btn sb-sm sb-danger" onClick={handleClearAll}>Clear All</button>
                    </div>
                </>
            )}

            {targets.length === 0 ? (
                <div className="sb-empty">No targets added.<br />Add by ID or from voice chat above.</div>
            ) : (
                targets.map(t => {
                    const u = UserStore.getUser(t.id);
                    return (
                        <div key={t.id} className={`sb-target-card${!t.enabled ? " sb-disabled" : ""}`}>
                            {/* Card header */}
                            <div className="sb-target-card-hdr">
                                <img
                                    className="sb-person-avatar"
                                    src={u?.getAvatarURL(null, 32) || t.avatar || "https://cdn.discordapp.com/embed/avatars/0.png"}
                                    alt=""
                                />
                                <div className="sb-target-card-info sb-person-info">
                                    <div className="sb-person-name">{u?.username || t.username}</div>
                                    <div className="sb-person-id">{t.id}</div>
                                </div>
                                <div className="sb-target-controls">
                                    <span
                                        className={`sb-pill ${t.enabled ? "sb-pill-on" : "sb-pill-off"}`}
                                        onClick={() => handleToggleEnabled(t.id)}
                                    >{t.enabled ? "Active" : "Off"}</span>
                                    <button className="sb-btn sb-sm sb-danger" onClick={() => handleRemove(t.id)}>✕</button>
                                </div>
                            </div>

                            {/* Feature chips */}
                            <div className="sb-feat-row">
                                <div className={`sb-feat${t.voiceStalker ? " sb-on" : ""}`}
                                    onClick={() => handleToggleStalk(t.id)} title="Follow to voice channels">
                                    <Icons.Footprints /><span>Stalk</span>
                                </div>
                                <div className={`sb-feat${t.messageMirror ? " sb-on" : ""}`}
                                    onClick={() => handleToggleMirror(t.id)} title="Mirror DM messages">
                                    <Icons.Mirror /><span>Mirror</span>
                                </div>
                                <div className={`sb-feat${t.reactionSpeller ? " sb-on" : ""}`}
                                    onClick={() => handleToggleReact(t.id)} title="React with letter emojis">
                                    <Icons.Reaction /><span>React</span>
                                </div>
                                <div className="sb-feat"
                                    onClick={() => handleCopyProfile(t.id, u?.username || t.username)}
                                    title="Copy their profile">
                                    <Icons.CopyProfile /><span>Copy Profile</span>
                                </div>
                            </div>
                        </div>
                    );
                })
            )}
        </div>
    );
}
