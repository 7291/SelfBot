/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { RelationshipStore, showToast, Toasts, useEffect, UserStore, useState } from "@webpack/common";

import { startAutoDeafen, stopAutoDeafen } from "../../utils/autoDeafenUtils";
import { startAutoDisconnect, stopAutoDisconnect } from "../../utils/autoDisconnectUtils";
import { startAutoElevator, stopAutoElevator } from "../../utils/autoElevatorUtils";
import { startAutoFuckAll, stopAutoFuckAll } from "../../utils/autoFuckAllUtils";
import { getCurrentVoiceChannel, getOtherUsersInChannel, startAutoMute, stopAutoMute } from "../../utils/autoMuteUtils";
import { isAutoPullEnabled, startAutoPull, stopAutoPull } from "../../utils/autoPullUtils";
import { startAutoUndeafen, stopAutoUndeafen } from "../../utils/autoUndeafenUtils";
import { startAutoUnmute, stopAutoUnmute } from "../../utils/autoUnmuteUtils";
import { deafenAll } from "../../utils/deafenAll";
import { disconnectAll } from "../../utils/disconnectAll";
import { elevatorAll } from "../../utils/elevatorAll";
import { fuckAll } from "../../utils/fuckAll";
import { muteAll } from "../../utils/muteAll";
import { protectionState, setFriendsDeafenProtection, setFriendsMuteProtection } from "../../utils/protectionUtils";
import { Friend, settingsManager } from "../../utils/settingsManager";
import { unDeafenAll } from "../../utils/unDeafenAll";
import { unMuteAll } from "../../utils/unMuteAll";
import { Icons } from "../Icons";

// ─── helpers ────────────────────────────────────────────────

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

// ─── Friends whitelist (full inline manager) ─────────────────
function FriendsManager() {
    const [friends, setFriends] = useState<Friend[]>(() => settingsManager.getFriends());
    const [inputId, setInputId] = useState("");
    const [search, setSearch] = useState("");
    const [vcUsers, setVcUsers] = useState<string[]>([]);

    useEffect(() => {
        const vc = getCurrentVoiceChannel();
        if (vc) setVcUsers(getOtherUsersInChannel(vc.channelId));
    }, []);

    const refresh = () => setFriends([...settingsManager.getFriends()]);

    const addFriend = (id: string) => {
        if (!id.trim()) return;
        const user = UserStore.getUser(id.trim());
        const f: Friend = user
            ? { id: user.id, username: user.username, discriminator: user.discriminator, avatar: user.getAvatarURL(null, 32) }
            : { id: id.trim(), username: "Unknown User" };
        if (settingsManager.addFriend(f)) {
            refresh();
            setVcUsers(p => p.filter(u => u !== id.trim()));
            showToast(user ? `Added ${user.username}` : "Added friend", Toasts.Type.SUCCESS);
        } else {
            showToast("Already in whitelist", Toasts.Type.FAILURE);
        }
    };

    const removeFriend = (id: string) => {
        settingsManager.removeFriend(id);
        refresh();
        showToast("Removed", Toasts.Type.SUCCESS);
    };

    const toggleAutoPull = (id: string) => {
        settingsManager.toggleFriendAutoPull(id);
        refresh();
    };

    const addAllDiscordFriends = () => {
        const ids = RelationshipStore.getFriendIDs();
        let added = 0;
        for (const id of ids) {
            if (settingsManager.isFriend(id)) continue;
            const user = UserStore.getUser(id);
            const f: Friend = user
                ? { id: user.id, username: user.username, discriminator: user.discriminator, avatar: user.getAvatarURL(null, 32) }
                : { id, username: "Unknown" };
            if (settingsManager.addFriend(f)) added++;
        }
        refresh();
        showToast(`Added ${added} Discord friends`, Toasts.Type.SUCCESS);
    };

    const clearAll = () => {
        friends.forEach(f => settingsManager.removeFriend(f.id));
        refresh();
        showToast("Cleared whitelist", Toasts.Type.SUCCESS);
    };

    const filtered = friends.filter(f => {
        if (!search.trim()) return true;
        const u = UserStore.getUser(f.id);
        return (u?.username || f.username || "").toLowerCase().includes(search.toLowerCase()) || f.id.includes(search);
    });

    const nonWhitelistedVc = vcUsers.filter(id => !settingsManager.isFriend(id));

    return (
        <div>
            {/* Add input */}
            <div className="sb-input-group" style={{ marginBottom: 6 }}>
                <input
                    className="sb-input"
                    type="text"
                    placeholder="Enter User ID..."
                    value={inputId}
                    onChange={e => setInputId(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { addFriend(inputId); setInputId(""); } }}
                />
                <button
                    className="sb-btn sb-sm"
                    disabled={!inputId.trim()}
                    onClick={() => { addFriend(inputId); setInputId(""); }}
                >Add</button>
            </div>

            {/* Bulk actions */}
            <div className="sb-bulk-bar">
                <button className="sb-bulk-btn" onClick={addAllDiscordFriends}>
                    <Icons.Friends /><span>Add Discord Friends</span>
                </button>
                {friends.length > 0 && (
                    <button className="sb-bulk-btn sb-danger" onClick={clearAll}>
                        <Icons.Trash /><span>Clear All</span>
                    </button>
                )}
            </div>

            {/* Search */}
            {friends.length > 4 && (
                <div className="sb-search">
                    <input
                        type="text"
                        placeholder="Search friends..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
            )}

            {/* VC users quick-add */}
            {nonWhitelistedVc.length > 0 && (
                <>
                    <div className="sb-section-label">Users in Voice Chat</div>
                    {nonWhitelistedVc.map(uid => {
                        const u = UserStore.getUser(uid);
                        return (
                            <div key={uid} className="sb-person-row">
                                <img className="sb-person-avatar"
                                    src={u?.getAvatarURL(null, 32) || "https://cdn.discordapp.com/embed/avatars/0.png"}
                                    alt=""
                                />
                                <div className="sb-person-info">
                                    <div className="sb-person-name">{u?.username || "Unknown"}</div>
                                    <div className="sb-person-id">{uid}</div>
                                </div>
                                <div className="sb-person-actions">
                                    <button className="sb-btn sb-sm" onClick={() => addFriend(uid)}>+ Add</button>
                                </div>
                            </div>
                        );
                    })}
                </>
            )}

            {/* Friends list */}
            {friends.length === 0 ? (
                <div className="sb-empty">No friends in whitelist.<br />Add by ID or from voice chat.</div>
            ) : filtered.length === 0 ? (
                <div className="sb-empty">No matches for "{search}"</div>
            ) : (
                <>
                    <div className="sb-section-label">Whitelisted ({filtered.length})</div>
                    {filtered.map(f => {
                        const u = UserStore.getUser(f.id);
                        return (
                            <div key={f.id} className="sb-person-row">
                                <img
                                    className="sb-person-avatar"
                                    src={u?.getAvatarURL(null, 32) || f.avatar || "https://cdn.discordapp.com/embed/avatars/0.png"}
                                    alt=""
                                />
                                <div className="sb-person-info">
                                    <div className="sb-person-name">{u?.username || f.username}</div>
                                    <div className="sb-person-id">{f.id}</div>
                                </div>
                                <div className="sb-person-actions">
                                    <button
                                        className={`sb-btn sb-sm${f.autoPull ? " sb-pill-on" : ""}`}
                                        onClick={() => toggleAutoPull(f.id)}
                                        title="Toggle Auto Pull"
                                    >{f.autoPull ? "✓ Pull" : "Pull"}</button>
                                    <button className="sb-btn sb-sm sb-danger" onClick={() => removeFriend(f.id)}>✕</button>
                                </div>
                            </div>
                        );
                    })}
                </>
            )}
        </div>
    );
}

// ─── Collapsible wrapper ─────────────────────────────────────
function Collapsible({ title, badge, children, defaultOpen = false }: {
    title: string; badge?: string | number; children: React.ReactNode; defaultOpen?: boolean;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="sb-collapse-wrap">
            <div className={`sb-collapse-hdr${open ? " sb-open" : ""}`} onClick={() => setOpen(o => !o)}>
                <span style={{ fontSize: "var(--sb-md)", fontWeight: 500, color: "var(--sb-text-bright)" }}>
                    {title}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {badge != null && <span className="sb-badge">{badge}</span>}
                    <svg className={`sb-chevron${open ? " sb-open" : ""}`} width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
                    </svg>
                </div>
            </div>
            {open && <div className="sb-collapse-body">{children}</div>}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// ATTACK TAB
// ═══════════════════════════════════════════════════════════════
export function AttackTab() {
    const [autoMute, setAutoMute] = useState(() => settingsManager.getToggle("autoMute"));
    const [autoDeafen, setAutoDeafen] = useState(() => settingsManager.getToggle("autoDeafen"));
    const [autoDisconnect, setAutoDisconnect] = useState(() => settingsManager.getToggle("autoDisconnect"));
    const [autoElevator, setAutoElevator] = useState(() => settingsManager.getToggle("autoElevator"));
    const [autoFuckAll, setAutoFuckAll] = useState(() => settingsManager.getToggle("autoFuckAll"));
    const [autoUnmute, setAutoUnmute] = useState(() => settingsManager.getToggle("autoUnmute"));
    const [autoUndeafen, setAutoUndeafen] = useState(() => settingsManager.getToggle("autoUndeafen"));
    const [autoPull, setAutoPull] = useState(() => isAutoPullEnabled());

    const [friendsMute, setFriendsMute] = useState(protectionState.friendsMuteProtection);
    const [friendsDeafen, setFriendsDeafen] = useState(protectionState.friendsDeafenProtection);

    const [friendsCount, setFriendsCount] = useState(() => settingsManager.getFriends().length);
    useEffect(() => { setFriendsCount(settingsManager.getFriends().length); }, []);

    const toggle = (
        current: boolean,
        setter: (v: boolean) => void,
        key: string,
        startFn: () => boolean | void,
        stopFn: () => void,
        dangerMsg?: string
    ) => {
        if (current) {
            stopFn();
            setter(false);
            settingsManager.setToggle(key, false);
        } else {
            if (dangerMsg && !window.confirm(dangerMsg)) return;
            const ok = startFn();
            const result = ok === undefined ? true : !!ok;
            setter(result);
            settingsManager.setToggle(key, result);
        }
    };

    return (
        <div>
            {/* ─── Friends Whitelist ─────────────────────── */}
            <Collapsible title="Friends Whitelist" badge={friendsCount}>
                <ToggleRow
                    icon={<Icons.Friends />}
                    label="Auto Pull Friends"
                    desc="Pull whitelisted friends to your VC"
                    on={autoPull}
                    onClick={() => toggle(autoPull, setAutoPull, "autoPull", startAutoPull, stopAutoPull)}
                />
                <ToggleRow
                    icon={<Icons.ShieldMic />}
                    label="Friends Mute Protection"
                    desc="Auto-unmute whitelisted friends"
                    on={friendsMute}
                    onClick={() => {
                        const n = !friendsMute;
                        setFriendsMute(n);
                        setFriendsMuteProtection(n);
                        settingsManager.setToggle("friendsMuteProtection", n);
                    }}
                />
                <ToggleRow
                    icon={<Icons.ShieldHeadphone />}
                    label="Friends Deafen Protection"
                    desc="Auto-undeafen whitelisted friends"
                    on={friendsDeafen}
                    onClick={() => {
                        const n = !friendsDeafen;
                        setFriendsDeafen(n);
                        setFriendsDeafenProtection(n);
                        settingsManager.setToggle("friendsDeafenProtection", n);
                    }}
                />
                <div className="sb-divider" />
                <FriendsManager />
            </Collapsible>

            {/* ─── Automation ───────────────────────────── */}
            <SectionLabel>Automation</SectionLabel>

            <ToggleRow icon={<Icons.MicOff />} label="Auto Mute" desc="Server-mute all users in your VC" on={autoMute} onClick={() => toggle(autoMute, setAutoMute, "autoMute", startAutoMute, stopAutoMute)} />
            <ToggleRow icon={<Icons.HeadphoneOff />} label="Auto Deafen" desc="Server-deafen all users in your VC" on={autoDeafen} onClick={() => toggle(autoDeafen, setAutoDeafen, "autoDeafen", startAutoDeafen, stopAutoDeafen)} />
            <ToggleRow icon={<Icons.ShieldDisconnect />} label="Auto Disconnect" desc="Auto-disconnect users who join" on={autoDisconnect} onClick={() => toggle(autoDisconnect, setAutoDisconnect, "autoDisconnect", startAutoDisconnect, stopAutoDisconnect)} />
            <ToggleRow icon={<Icons.Elevator />} label="Auto Elevator" desc="Auto-move users to random channels" on={autoElevator} onClick={() => toggle(autoElevator, setAutoElevator, "autoElevator", startAutoElevator, stopAutoElevator)} />
            <ToggleRow
                icon={<Icons.Nuke />}
                label="Auto Fuck All"
                desc="Mute + Deafen + Move on join"
                on={autoFuckAll}
                onClick={() => toggle(
                    autoFuckAll, setAutoFuckAll, "autoFuckAll",
                    startAutoFuckAll, stopAutoFuckAll,
                    "Warning: Auto Fuck All is highly risky and may result in a ban. Proceed?"
                )}
            />

            {/* ─── Counter automation ───────────────────── */}
            <SectionLabel>Counter</SectionLabel>
            <ToggleRow icon={<Icons.MicOn />} label="Auto Unmute" desc="Server-unmute all users in your VC" on={autoUnmute} onClick={() => toggle(autoUnmute, setAutoUnmute, "autoUnmute", startAutoUnmute, stopAutoUnmute)} />
            <ToggleRow icon={<Icons.HeadphoneOn />} label="Auto Undeafen" desc="Server-undeafen all users in your VC" on={autoUndeafen} onClick={() => toggle(autoUndeafen, setAutoUndeafen, "autoUndeafen", startAutoUndeafen, stopAutoUndeafen)} />

            {/* ─── One-shot actions ─────────────────────── */}
            <SectionLabel>Actions</SectionLabel>
            <div className="sb-action-grid">
                <button className="sb-action-btn" onClick={() => muteAll()}>
                    <Icons.MicOff /><span>Mute All</span>
                </button>
                <button className="sb-action-btn" onClick={() => deafenAll()}>
                    <Icons.HeadphoneOff /><span>Deafen All</span>
                </button>
                <button className="sb-action-btn" onClick={() => disconnectAll()}>
                    <Icons.ShieldDisconnect /><span>Disconnect All</span>
                </button>
                <button className="sb-action-btn" onClick={() => elevatorAll()}>
                    <Icons.Elevator /><span>Elevator All</span>
                </button>
                <button className="sb-action-btn" onClick={() => fuckAll()}>
                    <Icons.Nuke /><span>Fuck All</span>
                </button>
                <button className="sb-action-btn" onClick={() => unMuteAll()}>
                    <Icons.MicOn /><span>UnMute All</span>
                </button>
                <button className="sb-action-btn" onClick={() => unDeafenAll()}>
                    <Icons.HeadphoneOn /><span>UnDeafen All</span>
                </button>
            </div>
        </div>
    );
}
