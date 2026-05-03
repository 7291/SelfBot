/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showToast, Toasts, useEffect, UserStore, useState } from "@webpack/common";

import { getCurrentVoiceChannelInfo, getOtherUsersInChannel } from "../../utils/autoMuteUtils";
import { startAutoStatus, stopAutoStatus } from "../../utils/autoStatusUtils";
import { DmConversation, filterDmConversations, getDmConversations, startBackgroundDeletion } from "../../utils/dmClearUtils";
import { FakeState } from "../../utils/fakeStateUtils";
import { followPullIntegration } from "../../utils/followPullIntegration";
import { followUser } from "../../utils/followUser";
import { protectionState, setAntiDisconnectProtection, setDeafenProtection, setMuteProtection } from "../../utils/protectionUtils";
import { settingsManager } from "../../utils/settingsManager";
import { isTypingEternalActive, startTypingEternal, stopTypingEternal } from "../../utils/typingEternalUtils";
import { Icons } from "../Icons";
import { openNukeModal } from "../NukeModal";
import { ProfileBackupPage } from "../ProfileBackupPage";
import { SpamPage } from "../SpamPage";
import { VoiceActionsPage } from "../VoiceActionsPage";

// ─── Shared helpers (self-contained, co-located) ─────────────
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

function Collapsible({ title, children, right }: {
    title: string; children: React.ReactNode; right?: React.ReactNode;
}) {
    const [open, setOpen] = useState(false);
    return (
        <div className="sb-collapse-wrap">
            <div className={`sb-collapse-hdr${open ? " sb-open" : ""}`} onClick={() => setOpen(o => !o)}>
                <span style={{ fontSize: "var(--sb-md)", fontWeight: 500, color: "var(--sb-text-bright)" }}>{title}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={e => e.stopPropagation()}>
                    {right}
                    <svg
                        className={`sb-chevron${open ? " sb-open" : ""}`}
                        width="14" height="14" viewBox="0 0 24 24" fill="currentColor"
                        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
                    >
                        <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
                    </svg>
                </div>
            </div>
            {open && <div className="sb-collapse-body">{children}</div>}
        </div>
    );
}

// ─── Follow User collapsible ──────────────────────────────────
function FollowUserSection() {
    const [followStatus, setFollowStatus] = useState(() => followPullIntegration.getFollowPullStatus());
    const [vcUsers, setVcUsers] = useState<string[]>([]);
    const [executeOnFollow, setExecuteOnFollow] = useState(() => followUser.getFollowUserSetting("executeOnFollow"));
    const [onlyManual, setOnlyManual] = useState(() => followUser.getFollowUserSetting("onlyManualTrigger"));
    const [followLeave, setFollowLeave] = useState(() => followUser.getFollowUserSetting("followLeave"));
    const [autoMoveBack, setAutoMoveBack] = useState(() => followUser.getFollowUserSetting("autoMoveBack"));
    const [channelFull, setChannelFull] = useState(() => followUser.getFollowUserSetting("channelFull"));
    const [pullAssist, setPullAssist] = useState(() => settingsManager.getToggle("followPullAssist"));

    useEffect(() => {
        const interval = setInterval(() => {
            setFollowStatus(followPullIntegration.getFollowPullStatus());
            const vc = getCurrentVoiceChannelInfo();
            if (vc) setVcUsers(getOtherUsersInChannel(vc.channelId));
            else setVcUsers([]);
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const toggleSetting = (key: string, val: boolean, setter: (v: boolean) => void) => {
        const n = !val;
        setter(n);
        followUser.setFollowUserSetting(key as any, n);
    };

    const handlePullAssist = () => {
        const n = !pullAssist;
        setPullAssist(n);
        settingsManager.setToggle("followPullAssist", n);
        if (n) { followPullIntegration.startFollowPullMonitor(); showToast("Pull Assist enabled", Toasts.Type.SUCCESS); }
        else { followPullIntegration.stopFollowPullMonitor(); showToast("Pull Assist disabled", Toasts.Type.MESSAGE); }
    };

    return (
        <Collapsible title="Follow User">
            {followStatus.targetUserId && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "var(--sb-bg-3)", border: "1px solid var(--sb-border-mid)", marginBottom: 8 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#44bb77", flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: "var(--sb-md)", color: "var(--sb-text-bright)" }}>
                        Following {followStatus.targetUsername}
                    </span>
                    <button className="sb-btn sb-sm sb-danger" onClick={() => followPullIntegration.stopFollowing()}>Stop</button>
                </div>
            )}

            {!followStatus.targetUserId && vcUsers.length > 0 && (
                <>
                    <div className="sb-section-label">Quick Follow (Voice Chat)</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                        {vcUsers.slice(0, 6).map(uid => {
                            const u = UserStore.getUser(uid);
                            return (
                                <div
                                    key={uid}
                                    className="sb-btn sb-sm"
                                    onClick={() => followPullIntegration.setTrackedFollowUser(uid)}
                                    style={{ display: "flex", alignItems: "center", gap: 4 }}
                                >
                                    <img src={u?.getAvatarURL(null, 16) || "https://cdn.discordapp.com/embed/avatars/0.png"} alt=""
                                        style={{ width: 14, height: 14, borderRadius: "50%" }} />
                                    {u?.username || "Unknown"}
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            <div className="sb-section-label">Settings</div>
            {[
                { label: "Join on Follow", val: executeOnFollow, setter: setExecuteOnFollow, key: "executeOnFollow" },
                { label: "Manual Trigger Only", val: onlyManual, setter: setOnlyManual, key: "onlyManualTrigger" },
                { label: "Leave When They Leave", val: followLeave, setter: setFollowLeave, key: "followLeave" },
                { label: "Auto Move Back", val: autoMoveBack, setter: setAutoMoveBack, key: "autoMoveBack" },
                { label: "Join When Not Full", val: channelFull, setter: setChannelFull, key: "channelFull" },
            ].map(({ label, val, setter, key }) => (
                <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid var(--sb-border)" }}>
                    <span style={{ fontSize: "var(--sb-md)", color: "var(--sb-text)" }}>{label}</span>
                    <Toggle on={!!val} onClick={() => toggleSetting(key, !!val, setter as any)} />
                </div>
            ))}

            <div className="sb-divider" />
            <div className="sb-section-label">Pull Assist</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                    <div style={{ fontSize: "var(--sb-md)", color: "var(--sb-text)" }}>Pull Assist</div>
                    <div style={{ fontSize: "var(--sb-xs)", color: "var(--sb-text-muted)" }}>Use alt to pull when channel is full</div>
                </div>
                <Toggle on={pullAssist} onClick={handlePullAssist} />
            </div>
        </Collapsible>
    );
}

// ─── Auto Status collapsible ─────────────────────────────────
function AutoStatusSection() {
    const [active, setActive] = useState(() => settingsManager.getToggle("autoStatus"));
    const [cfg, setCfg] = useState(() => settingsManager.getSettings().autoStatusSettings);
    const [newMsg, setNewMsg] = useState("");

    const handleToggle = () => {
        const n = !active;
        setActive(n);
        settingsManager.setToggle("autoStatus", n);
        if (n) startAutoStatus(); else stopAutoStatus();
    };

    const addMsg = () => {
        if (!newMsg.trim()) return;
        const next = { ...cfg, messages: [...cfg.messages, newMsg.trim()] };
        setCfg(next);
        settingsManager.setSetting("autoStatusSettings", next);
        setNewMsg("");
        if (active) startAutoStatus();
    };

    const removeMsg = (i: number) => {
        const next = { ...cfg, messages: cfg.messages.filter((_: string, idx: number) => idx !== i) };
        setCfg(next);
        settingsManager.setSetting("autoStatusSettings", next);
        if (active) startAutoStatus();
    };

    return (
        <Collapsible
            title="Auto Status"
            right={<Toggle on={active} onClick={handleToggle} />}
        >
            <div className="sb-section-label">Messages</div>
            {cfg.messages.map((msg: string, i: number) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 0", borderBottom: "1px solid var(--sb-border)" }}>
                    <span style={{ flex: 1, fontSize: "var(--sb-md)", color: "var(--sb-text)", wordBreak: "break-all" }}>{msg}</span>
                    <button className="sb-btn sb-sm sb-danger" onClick={() => removeMsg(i)}>✕</button>
                </div>
            ))}
            <div className="sb-input-group" style={{ marginTop: 8 }}>
                <input
                    className="sb-input"
                    type="text"
                    placeholder="New status message..."
                    value={newMsg}
                    onChange={e => setNewMsg(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") addMsg(); }}
                />
                <button className="sb-btn sb-sm" onClick={addMsg}>Add</button>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--sb-border)" }}>
                <span style={{ fontSize: "var(--sb-md)", color: "var(--sb-text)" }}>Interval (ms)</span>
                <input
                    className="sb-input"
                    type="number"
                    value={cfg.intervalMs}
                    min={5000}
                    onChange={e => {
                        const v = parseInt(e.target.value);
                        if (isNaN(v) || v < 5000) return;
                        const next = { ...cfg, intervalMs: v };
                        setCfg(next);
                        settingsManager.setSetting("autoStatusSettings", next);
                        if (active) startAutoStatus();
                    }}
                    style={{ width: 90, textAlign: "right" }}
                />
            </div>
        </Collapsible>
    );
}

// ─── Typing Spam inline ───────────────────────────────────────
function TypingSpamSection() {
    const [conversations] = useState<DmConversation[]>(() => getDmConversations());
    const [search, setSearch] = useState("");
    const [tick, setTick] = useState(0);

    const filtered = filterDmConversations(conversations, search);

    const handleToggle = (c: DmConversation) => {
        if (isTypingEternalActive(c.channelId)) stopTypingEternal(c.channelId);
        else startTypingEternal(c.channelId, c.name);
        setTick(t => t + 1);
    };

    return (
        <Collapsible title="Typing Spam">
            <div className="sb-search">
                <input
                    type="text"
                    placeholder="Search conversations..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
            </div>
            {filtered.length === 0 ? (
                <div className="sb-empty">{search ? `No matches for "${search}"` : "No DM conversations"}</div>
            ) : (
                filtered.map(c => {
                    const active = isTypingEternalActive(c.channelId);
                    return (
                        <div
                            key={c.channelId}
                            className={`sb-conv-row${active ? " sb-typing-active" : ""}`}
                            onClick={() => handleToggle(c)}
                        >
                            <img className="sb-conv-avatar" src={c.avatarUrl} alt="" />
                            <div className="sb-conv-info">
                                <div className="sb-conv-name">{c.name}</div>
                                <div className="sb-conv-id">{c.channelId}</div>
                            </div>
                            <Toggle on={active} onClick={() => handleToggle(c)} />
                        </div>
                    );
                })
            )}
            {/* suppress unused var warning */}
            {tick < 0 && null}
        </Collapsible>
    );
}

// ─── DM Clear collapsible ─────────────────────────────────────
function DmClearSection() {
    const [conversations] = useState<DmConversation[]>(() => getDmConversations());
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState<DmConversation | null>(null);
    const [newestFirst, setNewestFirst] = useState<boolean>(true);

    const filtered = filterDmConversations(conversations, search);

    const handleStart = () => {
        if (!selected) return;
        startBackgroundDeletion(selected, { delay: 100, newestFirst });
        showToast(`Starting deletion in ${selected.name}...`, Toasts.Type.MESSAGE);
        setSelected(null);
    };

    return (
        <Collapsible title="DM Clear">
            {!selected ? (
                <>
                    <div className="sb-search">
                        <input
                            type="text"
                            placeholder="Search conversations..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    {filtered.length === 0 ? (
                        <div className="sb-empty">{search ? "No matches" : "No DM conversations"}</div>
                    ) : (
                        filtered.map(c => (
                            <div key={c.channelId} className="sb-conv-row" onClick={() => setSelected(c)}>
                                <img className="sb-conv-avatar" src={c.avatarUrl} alt="" />
                                <div className="sb-conv-info">
                                    <div className="sb-conv-name">{c.name}</div>
                                    <div className="sb-conv-id">{c.subtext}</div>
                                </div>
                            </div>
                        ))
                    )}
                </>
            ) : (
                <div>
                    <div className="sb-preview-card" style={{ marginBottom: 10 }}>
                        <img className="sb-preview-avatar" src={selected.avatarUrl} alt="" />
                        <div>
                            <div className="sb-preview-name">{selected.name}</div>
                            <div className="sb-preview-id">{selected.subtext}</div>
                        </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <span style={{ fontSize: "var(--sb-md)", color: "var(--sb-text)" }}>Order</span>
                        <button className="sb-btn sb-sm" onClick={() => setNewestFirst(n => !n)}>
                            {newestFirst ? "Newest First ↑" : "Oldest First ↓"}
                        </button>
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                        <button className="sb-btn sb-sm" style={{ flex: 1 }} onClick={() => setSelected(null)}>← Back</button>
                        <button className="sb-btn sb-sm sb-danger" style={{ flex: 1 }} onClick={handleStart}>Start Clearing</button>
                    </div>
                </div>
            )}
        </Collapsible>
    );
}

// ─── Profile Backup collapsible ───────────────────────────────
function ProfileBackupSection() {
    const [open, setOpen] = useState(false);
    return (
        <div className="sb-collapse-wrap">
            <div className={`sb-collapse-hdr${open ? " sb-open" : ""}`} onClick={() => setOpen(o => !o)}>
                <span style={{ fontSize: "var(--sb-md)", fontWeight: 500, color: "var(--sb-text-bright)" }}>Profile Backup</span>
                <svg className={`sb-chevron${open ? " sb-open" : ""}`} width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
                </svg>
            </div>
            {open && (
                <div className="sb-collapse-body" style={{ padding: 0 }}>
                    <ProfileBackupPage onBack={() => setOpen(false)} />
                </div>
            )}
        </div>
    );
}

// ─── Spam & Raid collapsible ──────────────────────────────────
function SpamSection() {
    const [open, setOpen] = useState(false);
    return (
        <div className="sb-collapse-wrap">
            <div className={`sb-collapse-hdr${open ? " sb-open" : ""}`} onClick={() => setOpen(o => !o)}>
                <span style={{ fontSize: "var(--sb-md)", fontWeight: 500, color: "var(--sb-text-bright)" }}>Spam & Raid</span>
                <svg className={`sb-chevron${open ? " sb-open" : ""}`} width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
                </svg>
            </div>
            {open && (
                <div className="sb-collapse-body" style={{ padding: 0 }}>
                    <SpamPage onBack={() => setOpen(false)} />
                </div>
            )}
        </div>
    );
}

// ─── Voice Actions collapsible ────────────────────────────────
function VoiceActionsSection() {
    const [open, setOpen] = useState(false);
    return (
        <div className="sb-collapse-wrap">
            <div className={`sb-collapse-hdr${open ? " sb-open" : ""}`} onClick={() => setOpen(o => !o)}>
                <span style={{ fontSize: "var(--sb-md)", fontWeight: 500, color: "var(--sb-text-bright)" }}>Voice Actions</span>
                <svg className={`sb-chevron${open ? " sb-open" : ""}`} width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
                </svg>
            </div>
            {open && (
                <div className="sb-collapse-body" style={{ padding: 0, overflow: "hidden" }}>
                    <VoiceActionsPage isTab={true} onBack={() => setOpen(false)} />
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// SELF TAB
// ═══════════════════════════════════════════════════════════════
export function SelfTab() {
    const [fakeMute, setFakeMute] = useState(FakeState.fakeMuteEnabled);
    const [fakeDeafen, setFakeDeafen] = useState(FakeState.fakeDeafenEnabled);
    const [fakeVideo, setFakeVideo] = useState(FakeState.fakeVideoEnabled);

    const [muteProtect, setMuteProtect] = useState(protectionState.muteProtection);
    const [deafenProtect, setDeafenProtect] = useState(protectionState.deafenProtection);
    const [antiDisconnect, setAntiDisconnect] = useState(protectionState.antiDisconnectProtection);

    const handleFakeMute = () => {
        const n = FakeState.toggleFakeMute();
        setFakeMute(n);
        settingsManager.setToggle("fakeMute", n);
    };

    const handleFakeDeafen = () => {
        const n = FakeState.toggleFakeDeafen();
        setFakeDeafen(n);
        settingsManager.setToggle("fakeDeafen", n);
    };

    const handleFakeVideo = () => {
        const n = FakeState.toggleFakeVideo();
        setFakeVideo(n);
        settingsManager.setToggle("fakeVideo", n);
    };

    const handleMuteProtect = () => {
        const n = !muteProtect;
        setMuteProtect(n);
        setMuteProtection(n);
        settingsManager.setToggle("muteProtection", n);
    };

    const handleDeafenProtect = () => {
        const n = !deafenProtect;
        setDeafenProtect(n);
        setDeafenProtection(n);
        settingsManager.setToggle("deafenProtection", n);
    };

    const handleAntiDisconnect = () => {
        const n = !antiDisconnect;
        setAntiDisconnect(n);
        setAntiDisconnectProtection(n);
        settingsManager.setToggle("antiDisconnectProtection", n);
    };

    return (
        <div>
            <SectionLabel>Fake State</SectionLabel>
            <ToggleRow icon={<Icons.FakeMic />} label="Fake Mute" desc="Appear muted but still talk" on={fakeMute} onClick={handleFakeMute} />
            <ToggleRow icon={<Icons.FakeHeadphone />} label="Fake Deafen" desc="Appear deafened but still hear" on={fakeDeafen} onClick={handleFakeDeafen} />
            <ToggleRow icon={<Icons.FakeCamera />} label="Fake Camera" desc="Appear to have camera on" on={fakeVideo} onClick={handleFakeVideo} />

            <SectionLabel>Protections</SectionLabel>
            <ToggleRow icon={<Icons.ShieldMic />} label="Mute Protection" desc="Auto-unmute if server muted" on={muteProtect} onClick={handleMuteProtect} />
            <ToggleRow icon={<Icons.ShieldHeadphone />} label="Deafen Protection" desc="Auto-undeafen if server deafened" on={deafenProtect} onClick={handleDeafenProtect} />
            <ToggleRow icon={<Icons.ShieldDisconnect />} label="Anti-Disconnect" desc="Auto-reconnect if kicked" on={antiDisconnect} onClick={handleAntiDisconnect} />

            <SectionLabel>Messaging</SectionLabel>
            <SpamSection />
            <TypingSpamSection />

            <SectionLabel>Automation</SectionLabel>
            <FollowUserSection />
            <AutoStatusSection />

            <SectionLabel>Voice</SectionLabel>
            <VoiceActionsSection />

            <SectionLabel>Utilities</SectionLabel>
            <DmClearSection />
            <ProfileBackupSection />
            <div className="sb-row" onClick={() => openNukeModal()}>
                <div className="sb-row-left">
                    <div className="sb-row-icon"><Icons.Nuke /></div>
                    <div className="sb-row-info">
                        <div className="sb-row-label" style={{ color: "var(--sb-btn-danger-txt)" }}>Nuke Account</div>
                        <div className="sb-row-desc">Delete DMs, leave servers, remove friends</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
