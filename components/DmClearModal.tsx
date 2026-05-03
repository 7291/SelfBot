/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { ModalCloseButton, ModalContent, ModalHeader, ModalProps, ModalRoot, ModalSize, openModal } from "@utils/modal";
import { Button, Forms, showToast, TextInput, Toasts, useCallback, useEffect, useRef, useState } from "@webpack/common";

import { DmClearController, DmClearOptions, DmClearProgress, DmConversation, filterDmConversations, getDmConversations, startBackgroundDeletion } from "../utils/dmClearUtils";

// ═══════════════════════════════════════════════════════════════════════════
// DATASTORE KEYS
// ═══════════════════════════════════════════════════════════════════════════
const DELAY_STORAGE_KEY = "selfbot-dm-clear-delay";
const ORDER_STORAGE_KEY = "selfbot-dm-clear-order";

// ═══════════════════════════════════════════════════════════════════════════
// COLLAPSIBLE SECTION COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
function CollapsibleSection({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean; }) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className="selfbot-dm-section">
            <div
                className="selfbot-dm-section-header"
                onClick={() => setIsOpen(!isOpen)}
            >
                <span>{title}</span>
                <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    style={{
                        transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                        transition: "transform 0.2s"
                    }}
                >
                    <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
                </svg>
            </div>
            {isOpen && (
                <div className="selfbot-dm-section-content">
                    {children}
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// USER LIST ITEM COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
function UserListItem({ conversation, onSelect }: { conversation: DmConversation; onSelect: (c: DmConversation) => void; }) {
    return (
        <div
            className="selfbot-dm-user-item"
            onClick={() => onSelect(conversation)}
            role="button"
            tabIndex={0}
        >
            <img
                className="selfbot-dm-user-avatar"
                src={conversation.avatarUrl}
                alt=""
            />
            <div className="selfbot-dm-user-info">
                <span className="selfbot-dm-user-name">{conversation.name}</span>
                <span className="selfbot-dm-user-tag">{conversation.subtext}</span>
            </div>
            {conversation.type === "GROUP" && (
                <span className="selfbot-dm-user-badge">Group</span>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// CONVERSATION SELECTION VIEW
// ═══════════════════════════════════════════════════════════════════════════
function UserSelectionView({ onSelect }: { onSelect: (c: DmConversation) => void; }) {
    const [searchQuery, setSearchQuery] = useState("");
    const [conversations] = useState(() => getDmConversations());

    const filteredConversations = filterDmConversations(conversations, searchQuery);

    return (
        <div className="selfbot-dm-selection">
            <TextInput
                className="selfbot-dm-search"
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={setSearchQuery}
            />
            <div className="selfbot-dm-user-list">
                {filteredConversations.length === 0 ? (
                    <div className="selfbot-dm-empty">
                        {searchQuery ? "No conversations match your search" : "No DM conversations found"}
                    </div>
                ) : (
                    filteredConversations.map(c => (
                        <UserListItem
                            key={c.channelId}
                            conversation={c}
                            onSelect={onSelect}
                        />
                    ))
                )}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION VIEW (ENHANCED)
// ═══════════════════════════════════════════════════════════════════════════
function ConfigView({
    target,
    onBack,
    onStart
}: {
    target: DmConversation;
    onBack: () => void;
    onStart: (options: DmClearOptions) => void;
}) {
    // State
    const [newestFirst, setNewestFirst] = useState(true);
    const [filterText, setFilterText] = useState("");
    const [caseSensitive, setCaseSensitive] = useState(false);
    const [beforeDate, setBeforeDate] = useState("");
    const [afterDate, setAfterDate] = useState("");
    const [maxMessages, setMaxMessages] = useState("");
    const [isLoaded, setIsLoaded] = useState(false);

    // Load saved settings
    useEffect(() => {
        Promise.all([
            DataStore.get(ORDER_STORAGE_KEY)
        ]).then(([savedOrder]) => {
            if (typeof savedOrder === "boolean") {
                setNewestFirst(savedOrder);
            }
            setIsLoaded(true);
        });
    }, []);

    const handleStart = () => {
        // Save settings
        DataStore.set(ORDER_STORAGE_KEY, newestFirst);

        // Build options
        const options: DmClearOptions = {
            delay: 100, // Hardcoded to 100ms
            newestFirst,
            filterText: filterText.trim() || undefined,
            filterCaseSensitive: caseSensitive,
            beforeDate: beforeDate ? new Date(beforeDate) : null,
            afterDate: afterDate ? new Date(afterDate) : null,
            maxMessages: maxMessages ? parseInt(maxMessages) : undefined,
        };

        onStart(options);
    };

    if (!isLoaded) return null;

    return (
        <div className="selfbot-dm-config">
            {/* Target User */}
            <div className="selfbot-dm-selected-user">
                <img src={target.avatarUrl} alt="" className="selfbot-dm-user-avatar" />
                <div className="selfbot-dm-user-info">
                    <span className="selfbot-dm-user-name">{target.name}</span>
                    <span className="selfbot-dm-user-tag">{target.subtext}</span>
                </div>
            </div>

            {/* Order Toggle (Always Visible) */}
            <div className="selfbot-dm-order-section">
                <div className="selfbot-dm-order-label">Order</div>
                <div className="selfbot-dm-order-toggle" onClick={() => setNewestFirst(!newestFirst)}>
                    <span className="selfbot-dm-order-arrow">{newestFirst ? "↓" : "↑"}</span>
                    <span>{newestFirst ? "Newest First" : "Oldest First"}</span>
                </div>
            </div>

            {/* Advanced Options (Collapsible) */}
            <CollapsibleSection title="Filter by Text">
                <TextInput
                    placeholder="Only delete messages containing..."
                    value={filterText}
                    onChange={setFilterText}
                />
                <label className="selfbot-dm-checkbox">
                    <input
                        type="checkbox"
                        checked={caseSensitive}
                        onChange={e => setCaseSensitive(e.target.checked)}
                    />
                    <span>Case sensitive</span>
                </label>
            </CollapsibleSection>

            <CollapsibleSection title="Date Range">
                <div className="selfbot-dm-date-row">
                    <label>After:</label>
                    <input
                        type="date"
                        className="selfbot-dm-date-input"
                        value={afterDate}
                        onChange={e => setAfterDate(e.target.value)}
                    />
                </div>
                <div className="selfbot-dm-date-row">
                    <label>Before:</label>
                    <input
                        type="date"
                        className="selfbot-dm-date-input"
                        value={beforeDate}
                        onChange={e => setBeforeDate(e.target.value)}
                    />
                </div>
            </CollapsibleSection>

            <CollapsibleSection title="Limit">
                <TextInput
                    placeholder="Max messages to delete (empty = all)"
                    value={maxMessages}
                    onChange={v => setMaxMessages(v.replace(/\D/g, ""))}
                />
            </CollapsibleSection>

            {/* Action Buttons */}
            <div className="selfbot-dm-config-buttons">
                <Button color={Button.Colors.TRANSPARENT} onClick={onBack}>
                    Back
                </Button>
                <Button color={Button.Colors.RED} onClick={handleStart}>
                    Start Deleting
                </Button>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// PROGRESS VIEW WITH LOG
// ═══════════════════════════════════════════════════════════════════════════
function ProgressView({
    target,
    progress,
    logs,
    controller,
    onClose
}: {
    target: DmConversation;
    progress: DmClearProgress;
    logs: string[];
    controller: DmClearController | null;
    onClose: () => void;
}) {
    const logRef = useRef<HTMLDivElement>(null);
    const [autoScroll, setAutoScroll] = useState(true);

    // Auto-scroll log
    useEffect(() => {
        if (autoScroll && logRef.current) {
            logRef.current.scrollTop = logRef.current.scrollHeight;
        }
    }, [logs, autoScroll]);

    const percentage = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
    const isRunning = progress.status === "deleting" || progress.status === "fetching" || progress.status === "rate-limited";
    const isPaused = progress.status === "paused";
    const isComplete = progress.status === "complete" || progress.status === "stopped";

    return (
        <div className="selfbot-dm-progress">
            {/* Target Info */}
            <div className="selfbot-dm-selected-user small">
                <img src={target.avatarUrl} alt="" className="selfbot-dm-user-avatar" />
                <div className="selfbot-dm-user-info">
                    <span className="selfbot-dm-user-name">{target.name}</span>
                    <span className="selfbot-dm-user-tag">{progress.status}</span>
                </div>
            </div>

            {/* Progress Bar - Only if total > 0 */}
            {progress.total > 0 && (
                <div className="selfbot-dm-progress-bar">
                    <div
                        className={`selfbot-dm-progress-fill ${isComplete ? "complete" : ""}`}
                        style={{ width: `${percentage}%` }}
                    />
                </div>
            )}

            <div className="selfbot-dm-progress-text">
                {progress.total > 0
                    ? `${progress.current} / ${progress.total} (${percentage}%)`
                    : `${progress.current} deleted`
                }
            </div>

            {/* Log Panel */}
            <div className="selfbot-dm-log-header">
                <span>Log</span>
                <label className="selfbot-dm-checkbox small">
                    <input
                        type="checkbox"
                        checked={autoScroll}
                        onChange={e => setAutoScroll(e.target.checked)}
                    />
                    <span>Auto-scroll</span>
                </label>
            </div>
            <div className="selfbot-dm-log" ref={logRef}>
                {logs.length === 0 ? (
                    <div className="selfbot-dm-log-empty">Waiting for logs...</div>
                ) : (
                    logs.map((log, i) => (
                        <div key={i} className="selfbot-dm-log-entry">{log}</div>
                    ))
                )}
            </div>

            {/* Control Buttons */}
            <div className="selfbot-dm-config-buttons">
                {isComplete ? (
                    <Button color={Button.Colors.PRIMARY} onClick={onClose}>
                        Close
                    </Button>
                ) : (
                    <>
                        <Button
                            color={Button.Colors.TRANSPARENT}
                            onClick={() => isPaused ? controller?.resume() : controller?.pause()}
                        >
                            {isPaused ? "▶️ Resume" : "⏸️ Pause"}
                        </Button>
                        <Button
                            color={Button.Colors.RED}
                            onClick={() => controller?.stop()}
                        >
                            ⏹️ Stop
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN MODAL COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
type Step = "select" | "configure" | "progress";

function DmClearModal({ modalProps }: { modalProps: ModalProps; }) {
    const [step, setStep] = useState<Step>("select");
    const [selectedConversation, setSelectedConversation] = useState<DmConversation | null>(null);
    const [progress, setProgress] = useState<DmClearProgress>({ current: 0, total: 0, status: "idle" });
    const [logs, setLogs] = useState<string[]>([]);
    const [controller, setController] = useState<DmClearController | null>(null);

    const handleSelect = (c: DmConversation) => {
        setSelectedConversation(c);
        setStep("configure");
    };

    const handleBack = () => {
        setSelectedConversation(null);
        setStep("select");
    };

    const handleStart = useCallback((options: DmClearOptions) => {
        if (!selectedConversation) return;

        // Reset logs
        setLogs([]);

        // Add log callback
        options.onLog = (message: string) => {
            setLogs(prev => [...prev, message]);
        };

        // Start deletion
        const ctrl = startBackgroundDeletion(
            selectedConversation,
            options,
            p => setProgress(p)
        );

        setController(ctrl);
        setStep("progress");

        showToast(`Starting deletion in ${selectedConversation.name}...`, Toasts.Type.MESSAGE);
    }, [selectedConversation]);

    const getTitle = () => {
        switch (step) {
            case "select": return "DM Cleaner";
            case "configure": return "Configure";
            case "progress": return "Progress";
        }
    };

    return (
        <ModalRoot {...modalProps} size={ModalSize.MEDIUM}>
            <ModalHeader className="selfbot-dm-modal-header">
                <Forms.FormTitle tag="h2" style={{ margin: 0 }}>
                    {getTitle()}
                </Forms.FormTitle>
                <ModalCloseButton onClick={modalProps.onClose} />
            </ModalHeader>
            <ModalContent className="selfbot-dm-modal-content">
                {step === "select" && (
                    <UserSelectionView onSelect={handleSelect} />
                )}
                {step === "configure" && selectedConversation && (
                    <ConfigView
                        target={selectedConversation}
                        onBack={handleBack}
                        onStart={handleStart}
                    />
                )}
                {step === "progress" && selectedConversation && (
                    <ProgressView
                        target={selectedConversation}
                        progress={progress}
                        logs={logs}
                        controller={controller}
                        onClose={modalProps.onClose}
                    />
                )}
            </ModalContent>
        </ModalRoot>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT FUNCTION TO OPEN MODAL
// ═══════════════════════════════════════════════════════════════════════════
export function openDmClearModal() {
    openModal(props => <DmClearModal modalProps={props} />);
}
