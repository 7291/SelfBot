/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useEffect, UserStore, useState } from "@webpack/common";

import { settingsManager } from "../../utils/settingsManager";
import { ActiveTask, formatTimeRemaining, taskManager } from "../../utils/taskManager";
import { AccountSwitcherPage, AccountSwitcherQuickPanel } from "../AccountSwitcher";

// ─── Helpers ─────────────────────────────────────────────────
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

// ─── Active Tasks panel ───────────────────────────────────────
function TasksPanel() {
    const [tasks, setTasks] = useState<ActiveTask[]>(() => taskManager.getTasks());

    useEffect(() => {
        const unsub = taskManager.subscribe(t => setTasks([...t]));
        return () => { unsub(); };
    }, []);

    if (tasks.length === 0) {
        return <div className="sb-empty">No active tasks running</div>;
    }

    const statusColor = (status: string) =>
        status === "RUNNING" ? "#44bb77" : status === "PAUSED" ? "#ccaa44" : "#cc4444";

    return (
        <div>
            {tasks.map(task => {
                const { metrics } = task;
                const hasMetrics = metrics && (metrics.total > 0 || metrics.deleted > 0);
                const prog = metrics && metrics.total > 0
                    ? Math.round((metrics.deleted / metrics.total) * 100)
                    : 0;

                // @ts-ignore
                const followedUser = task.metadata?.userId ? UserStore.getUser(task.metadata.userId) : null;
                const title = followedUser
                    ? `Following ${followedUser.username}`
                    : task.type === "NUKE" ? "Nuke Operation"
                        : task.type === "DM_CLEAR" ? "DM Clear"
                            : task.type === "PACKAGE_CLEAR" ? "Package Clear"
                                : "Active Task";

                return (
                    <div key={task.id} className="sb-task-item">
                        <div className="sb-task-hdr">
                            <div className="sb-task-icon">
                                {followedUser
                                    ? <img src={followedUser.getAvatarURL(null, 24)} alt="" style={{ width: 14, height: 14, borderRadius: "50%" }} />
                                    : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 22h20L12 2z" /></svg>
                                }
                            </div>
                            <span className="sb-task-title">{title}</span>
                            <div className="sb-task-dot" style={{ background: statusColor(task.status) }} />
                        </div>
                        <div className="sb-task-desc">{task.progress}</div>

                        {hasMetrics && task.type !== "NUKE" && (
                            <>
                                {metrics.total > 0 && (
                                    <div className="sb-task-prog">
                                        <div className="sb-task-prog-fill" style={{ width: `${prog}%` }} />
                                    </div>
                                )}
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--sb-xs)", color: "var(--sb-text-muted)", fontFamily: "var(--sb-mono)", marginBottom: 5 }}>
                                    <span>{metrics.deleted.toLocaleString()}{metrics.total > 0 ? `/${metrics.total.toLocaleString()}` : " deleted"}</span>
                                    <span>{metrics.currentSpeed || metrics.averageSpeed} msg/min</span>
                                    {metrics.total > 0 && <span>{formatTimeRemaining(metrics.estimatedTimeRemaining)}</span>}
                                </div>
                            </>
                        )}

                        <div className="sb-task-actions">
                            <div
                                className="sb-task-btn"
                                onClick={() => task.status === "PAUSED" ? task.actions.resume() : task.actions.pause()}
                            >
                                {task.status === "PAUSED" ? "Resume" : "Pause"}
                            </div>
                            <div className="sb-task-btn sb-danger" onClick={task.actions.stop}>Stop</div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ─── Account Switcher section ─────────────────────────────────
function AccountSwitcherSection() {
    const [showFull, setShowFull] = useState(false);

    if (showFull) {
        return <AccountSwitcherPage onBack={() => setShowFull(false)} />;
    }
    return <AccountSwitcherQuickPanel onNavigate={() => setShowFull(true)} />;
}

// ═══════════════════════════════════════════════════════════════
// SETTINGS TAB
// ═══════════════════════════════════════════════════════════════
export function SettingsTab() {
    const [hideLogo, setHideLogo] = useState(() => settingsManager.getToggle("hideLogo"));
    const [showTasks, setShowTasks] = useState(false);
    const [taskCount, setTaskCount] = useState(() => taskManager.getTasks().length);
    const [reactionText, setReactionText] = useState(() => settingsManager.getSettings().reactionSpellerText || "LMAO");

    useEffect(() => {
        const unsub = taskManager.subscribe(tasks => setTaskCount(tasks.length));
        return () => { unsub(); };
    }, []);

    const handleHideLogo = () => {
        const n = !hideLogo;
        setHideLogo(n);
        settingsManager.setToggle("hideLogo", n);
    };

    const handleReactionText = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.toUpperCase().replace(/[^A-Z]/g, "");
        setReactionText(val);
        settingsManager.setReactionSpellerText(val);
    };

    return (
        <div>
            <SectionLabel>Account Switcher</SectionLabel>
            <AccountSwitcherSection />

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, marginBottom: 4 }}>
                <SectionLabel>Active Tasks</SectionLabel>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {taskCount > 0 && <span className="sb-badge">{taskCount}</span>}
                    <button className="sb-btn sb-sm" onClick={() => setShowTasks(s => !s)}>
                        {showTasks ? "Hide" : "Show"}
                    </button>
                </div>
            </div>
            {showTasks && <TasksPanel />}

            <SectionLabel>Interface</SectionLabel>
            <div className="sb-setting-row">
                <div className="sb-setting-info">
                    <div className="sb-setting-label">Hide Umbral Logo</div>
                    <div className="sb-setting-sub">Hide the logo from the overlay header</div>
                </div>
                <Toggle on={hideLogo} onClick={handleHideLogo} />
            </div>

            <SectionLabel>Reaction Speller</SectionLabel>
            <div className="sb-setting-row">
                <div className="sb-setting-info">
                    <div className="sb-setting-label">Spell Text</div>
                    <div className="sb-setting-sub">Letters reacted on target messages</div>
                </div>
                <input
                    className="sb-input"
                    type="text"
                    value={reactionText}
                    onChange={handleReactionText}
                    placeholder="LMAO"
                    maxLength={10}
                    style={{ width: 80, textAlign: "right" }}
                />
            </div>

            <div style={{ marginTop: 20, paddingTop: 10, borderTop: "1px solid var(--sb-border)", fontSize: "var(--sb-xs)", color: "var(--sb-text-muted)", textAlign: "center", letterSpacing: "0.06em" }}>
                UMBRAL SELFBOT — v1.0
            </div>
        </div>
    );
}
