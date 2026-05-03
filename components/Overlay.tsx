/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles/base.css";
import "./styles/overlay.css";
import "./styles/ui.css";

import { classes } from "@utils/misc";
import { useCallback, useEffect, useMemo, useRef, useState } from "@webpack/common";

import { SelfBotIcon } from "./SelfBotIcon";
import { AttackTab } from "./tabs/AttackTab";
import { MassJoinerTab } from "./tabs/MassJoinerTab";
import { SelfTab } from "./tabs/SelfTab";
import { SettingsTab } from "./tabs/SettingsTab";
import { TargetTab } from "./tabs/TargetTab";

type TabId = "self" | "attack" | "target" | "massjoiner" | "settings";

interface TabMeta {
    id: TabId;
    label: string;
    subtitle: string;
    hint: string;
    icon: React.ReactNode;
}

const TABS: TabMeta[] = [
    {
        id: "self",
        label: "Self",
        subtitle: "Identity controls, protections, utilities, and profile tooling",
        hint: "Ctrl+1",
        icon: <path d="M12 12.75a5.25 5.25 0 1 0 0-10.5 5.25 5.25 0 0 0 0 10.5Zm0 2.25c-5.38 0-9.75 2.78-9.75 6.2V24h19.5v-2.8c0-3.42-4.37-6.2-9.75-6.2Z" />
    },
    {
        id: "attack",
        label: "Attack",
        subtitle: "Mass actions, automation orchestration, and whitelist management",
        hint: "Ctrl+2",
        icon: <path d="M11.24 2.5 3.5 13.9h6.24L8.9 21.5l11.6-13.86h-6.19l.93-5.14Z" />
    },
    {
        id: "target",
        label: "Target",
        subtitle: "Target-focused automation, cards, and rapid action controls",
        hint: "Ctrl+3",
        icon: <path d="M12 1.5a10.5 10.5 0 1 0 10.5 10.5h-3a7.5 7.5 0 1 1-7.5-7.5v-3Zm7.8 2.7-4.6 4.6-2.2-2.2-2.1 2.1 4.3 4.3 6.7-6.7-2.1-2.1Z" />
    },
    {
        id: "massjoiner",
        label: "Mass Joiner",
        subtitle: "Companion-aware multi-account voice controls and monitoring",
        hint: "Ctrl+4",
        icon: <path d="M7 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm10 0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM2 19.5c0-3 2.8-5.25 6-5.25s6 2.25 6 5.25V22H2v-2.5Zm8.2 2.5v-2.1c0-1.83-.7-3.52-1.88-4.85a7.8 7.8 0 0 1 3.93-1.04c3.2 0 5.75 1.97 5.75 4.68V22h-7.8Z" />
    },
    {
        id: "settings",
        label: "Settings",
        subtitle: "Account switcher, task visibility, and operational preferences",
        hint: "Ctrl+5",
        icon: <path d="m19.13 12.94.04-.94-.04-.94 2.05-1.6a.9.9 0 0 0 .22-1.14l-1.94-3.34a.9.9 0 0 0-1.1-.39l-2.42.97a7.43 7.43 0 0 0-1.63-.94L13.9 2.1a.9.9 0 0 0-.88-.73H9.18a.9.9 0 0 0-.88.73l-.41 2.52c-.58.23-1.13.53-1.63.88L3.85 4.52a.9.9 0 0 0-1.1.39L.8 8.25a.9.9 0 0 0 .22 1.14l2.05 1.67-.04.94.04.94L1.02 14.6a.9.9 0 0 0-.22 1.14l1.95 3.34a.9.9 0 0 0 1.1.39l2.41-.97c.5.35 1.04.65 1.63.88l.4 2.52a.9.9 0 0 0 .89.73h3.84a.9.9 0 0 0 .88-.73l.4-2.52c.59-.23 1.14-.53 1.64-.88l2.41.97a.9.9 0 0 0 1.1-.39l1.94-3.34a.9.9 0 0 0-.22-1.14l-2.05-1.66ZM11.1 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z" />
    }
];

const STORAGE_KEY = "umbral-selfbot-state";
const MIN_W = 740;
const MIN_H = 500;
const EDGE = 20;

let hasShownInitAnimation = false;

interface OverlayState {
    x: number;
    y: number;
    w: number;
    h: number;
    minimized: boolean;
    activeTab: TabId;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const clampFrame = ({ x, y, w, h }: { x: number; y: number; w: number; h: number; }) => {
    if (typeof window === "undefined") return { x, y, w, h };

    const maxW = Math.max(320, window.innerWidth - EDGE * 2);
    const maxH = Math.max(260, window.innerHeight - EDGE * 2);
    const minW = Math.min(MIN_W, maxW);
    const minH = Math.min(MIN_H, maxH);
    const nextW = clamp(w, minW, maxW);
    const nextH = clamp(h, minH, maxH);
    const maxX = Math.max(EDGE, window.innerWidth - nextW - EDGE);
    const maxY = Math.max(EDGE, window.innerHeight - nextH - EDGE);

    return {
        x: clamp(x, EDGE, maxX),
        y: clamp(y, EDGE, maxY),
        w: nextW,
        h: nextH,
    };
};

function loadState(): OverlayState {
    try {
        const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
        const next = {
            x: typeof s.x === "number" ? s.x : 80,
            y: typeof s.y === "number" ? s.y : 60,
            w: typeof s.w === "number" ? s.w : 980,
            h: typeof s.h === "number" ? s.h : 620,
            minimized: !!s.minimized,
            activeTab: (["self", "attack", "target", "massjoiner", "settings"].includes(s.activeTab) ? s.activeTab : "self") as TabId,
        };

        return { ...next, ...clampFrame(next) };
    } catch {
        const next = {
            x: 80,
            y: 60,
            w: 980,
            h: 620,
            minimized: false,
            activeTab: "self" as TabId,
        };

        return { ...next, ...clampFrame(next) };
    }
}

function saveState(state: OverlayState) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch { }
}

export function Overlay({ onClose }: { onClose: () => void; }) {
    const init = loadState();

    const [x, setX] = useState(init.x);
    const [y, setY] = useState(init.y);
    const [w, setW] = useState(init.w);
    const [h, setH] = useState(init.h);
    const [minimized, setMinimized] = useState(init.minimized);
    const [activeTab, setActiveTab] = useState<TabId>(init.activeTab);

    const [showInit, setShowInit] = useState(() => {
        if (hasShownInitAnimation) return false;
        hasShownInitAnimation = true;
        return true;
    });
    const [initPhase, setInitPhase] = useState<0 | 1 | 2 | 3>(0);
    const [contentReady, setContentReady] = useState(!showInit);

    const stateRef = useRef({ x, y, w, h });

    useEffect(() => {
        stateRef.current = { x, y, w, h };
    });

    useEffect(() => {
        saveState({ x, y, w, h, minimized, activeTab });
    }, [x, y, w, h, minimized, activeTab]);

    useEffect(() => {
        if (!showInit) return;

        const t1 = setTimeout(() => setInitPhase(1), 260);
        const t2 = setTimeout(() => setInitPhase(2), 560);
        const t3 = setTimeout(() => {
            setInitPhase(3);
            setTimeout(() => {
                setShowInit(false);
                setContentReady(true);
            }, 200);
        }, 900);

        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
            clearTimeout(t3);
        };
    }, [showInit]);

    useEffect(() => {
        const onResize = () => {
            const next = clampFrame(stateRef.current);
            setX(next.x);
            setY(next.y);
            setW(next.w);
            setH(next.h);
        };

        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            const typing = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

            if (!(event.ctrlKey || event.metaKey) || typing) return;

            if (event.key >= "1" && event.key <= "5") {
                const idx = Number(event.key) - 1;
                const tab = TABS[idx];
                if (!tab) return;
                event.preventDefault();
                setActiveTab(tab.id);
                return;
            }

            if (event.key.toLowerCase() === "m") {
                event.preventDefault();
                setMinimized(prev => !prev);
                return;
            }

            if (event.key.toLowerCase() === "q") {
                event.preventDefault();
                onClose();
            }
        };

        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [onClose]);

    const handleDragMouseDown = useCallback((e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest(".sb-titlebar-controls")) return;
        e.preventDefault();

        const startMouseX = e.clientX;
        const startMouseY = e.clientY;
        const { x: startX, y: startY } = stateRef.current;

        const onMove = (ev: MouseEvent) => {
            const next = clampFrame({
                x: startX + (ev.clientX - startMouseX),
                y: startY + (ev.clientY - startMouseY),
                w: stateRef.current.w,
                h: stateRef.current.h,
            });

            setX(next.x);
            setY(next.y);
        };

        const onUp = () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
        };

        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    }, []);

    const handleResizeMouseDown = useCallback((e: React.MouseEvent, dir: string) => {
        e.preventDefault();
        e.stopPropagation();

        const startMouseX = e.clientX;
        const startMouseY = e.clientY;
        const { x: startX, y: startY, w: startW, h: startH } = stateRef.current;

        const onMove = (ev: MouseEvent) => {
            const dx = ev.clientX - startMouseX;
            const dy = ev.clientY - startMouseY;
            let nx = startX;
            let ny = startY;
            let nw = startW;
            let nh = startH;

            if (dir.includes("e")) nw = startW + dx;
            if (dir.includes("s")) nh = startH + dy;
            if (dir.includes("w")) {
                nw = startW - dx;
                nx = startX + (startW - nw);
            }
            if (dir.includes("n")) {
                nh = startH - dy;
                ny = startY + (startH - nh);
            }

            const next = clampFrame({ x: nx, y: ny, w: nw, h: nh });
            setX(next.x);
            setY(next.y);
            setW(next.w);
            setH(next.h);
        };

        const onUp = () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
        };

        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    }, []);

    const activeTabMeta = useMemo(() => TABS.find(tab => tab.id === activeTab) ?? TABS[0], [activeTab]);

    return (
        <div
            className={classes("sb-overlay", minimized && "sb-minimized")}
            style={{ left: x, top: y, width: w, height: minimized ? undefined : h }}
        >
            {showInit && (
                <div className="sb-init-wrapper">
                    <div className="sb-init-icon">
                        <SelfBotIcon />
                    </div>
                    {initPhase >= 1 && (
                        <div className="sb-init-bar-wrap">
                            <div className="sb-init-bar" />
                        </div>
                    )}
                    {initPhase >= 2 && (
                        <div className="sb-init-label">Umbral Control Center</div>
                    )}
                </div>
            )}

            {!showInit && (
                <div className={classes("sb-shell", contentReady && "sb-content-enter")}>
                    <div className="sb-titlebar" onMouseDown={handleDragMouseDown} onDoubleClick={() => setMinimized(prev => !prev)}>
                        <div className="sb-brand">
                            <div className="sb-titlebar-icon">
                                <SelfBotIcon />
                            </div>
                            <div className="sb-brand-copy">
                                <span className="sb-brand-name">Umbral Control Center</span>
                                <span className="sb-brand-sub">Operational interface for advanced account automation</span>
                            </div>
                        </div>

                        <div className="sb-titlebar-meta">
                            <span className="sb-kbd-hint">Ctrl+1...5</span>
                            <span className="sb-kbd-hint">Ctrl+M</span>
                            <span className="sb-kbd-hint">Ctrl+Q</span>
                        </div>

                        <div className="sb-titlebar-controls" onMouseDown={e => e.stopPropagation()}>
                            <button className="sb-titlebar-btn" onClick={() => setMinimized(prev => !prev)} title={minimized ? "Restore" : "Minimize"}>
                                {minimized
                                    ? <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M5 5h14v14H5z" /></svg>
                                    : <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M5 11h14v2H5z" /></svg>
                                }
                            </button>
                            <button className="sb-titlebar-btn sb-btn-close" onClick={onClose} title="Close">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12Z" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {!minimized && (
                        <div className="sb-main">
                            <aside className="sb-sidebar">
                                <div className="sb-nav">
                                    {TABS.map(tab => (
                                        <button
                                            key={tab.id}
                                            className={classes("sb-nav-btn", activeTab === tab.id && "sb-nav-btn-active")}
                                            onClick={() => setActiveTab(tab.id)}
                                        >
                                            <span className="sb-nav-icon">
                                                <svg viewBox="0 0 24 24" fill="currentColor" role="img">{tab.icon}</svg>
                                            </span>
                                            <span className="sb-nav-copy">
                                                <span className="sb-nav-label">{tab.label}</span>
                                                <span className="sb-nav-hint">{tab.hint}</span>
                                            </span>
                                        </button>
                                    ))}
                                </div>
                                <div className="sb-sidebar-footer">
                                    <span>{activeTabMeta.subtitle}</span>
                                </div>
                            </aside>

                            <section className="sb-workspace">
                                <div className="sb-workspace-header">
                                    <div className="sb-workspace-copy">
                                        <span className="sb-workspace-eyebrow">Feature Group</span>
                                        <h2 className="sb-workspace-title">{activeTabMeta.label}</h2>
                                        <p className="sb-workspace-desc">{activeTabMeta.subtitle}</p>
                                    </div>
                                </div>

                                <div className="sb-content">
                                    <div className="sb-tab-panel">
                                        {activeTab === "self" && <SelfTab />}
                                        {activeTab === "attack" && <AttackTab />}
                                        {activeTab === "target" && <TargetTab />}
                                        {activeTab === "massjoiner" && <MassJoinerTab />}
                                        {activeTab === "settings" && <SettingsTab />}
                                    </div>
                                </div>
                            </section>
                        </div>
                    )}
                </div>
            )}

            {!minimized && (
                <>
                    <div className="sb-resize-n" onMouseDown={e => handleResizeMouseDown(e, "n")} />
                    <div className="sb-resize-s" onMouseDown={e => handleResizeMouseDown(e, "s")} />
                    <div className="sb-resize-e" onMouseDown={e => handleResizeMouseDown(e, "e")} />
                    <div className="sb-resize-w" onMouseDown={e => handleResizeMouseDown(e, "w")} />
                    <div className="sb-resize-nw" onMouseDown={e => handleResizeMouseDown(e, "nw")} />
                    <div className="sb-resize-ne" onMouseDown={e => handleResizeMouseDown(e, "ne")} />
                    <div className="sb-resize-sw" onMouseDown={e => handleResizeMouseDown(e, "sw")} />
                    <div className="sb-resize-se" onMouseDown={e => handleResizeMouseDown(e, "se")} />
                </>
            )}
        </div>
    );
}
