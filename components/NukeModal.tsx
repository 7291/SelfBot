/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ModalCloseButton, ModalContent, ModalHeader, ModalProps, ModalRoot, ModalSize, openModal } from "@utils/modal";
import { Button, Forms, showToast, TextInput, Toasts, useEffect, useRef, useState } from "@webpack/common";

import { NukeController, NukeOptions, NukeProgress } from "../utils/nukeUtils";
import { startPackageDeletion } from "../utils/packageClearUtils";
import { formatPackageSummary, parseDiscordPackage, ParsedPackage } from "../utils/packageParserUtils";
import { Icons } from "./Icons";
import { MenuOption } from "./MenuOption";

// ═══════════════════════════════════════════════════════════════════════════
// PROGRESS STAT COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
function ProgressStat({ current, label, currentItem, active }: {
    current: number;
    label: string;
    currentItem?: string;
    active: boolean;
}) {
    return (
        <div className={`selfbot-nuke-progress-section ${active ? "active" : ""}`}>
            <div className="selfbot-nuke-progress-header">
                <span className="selfbot-nuke-progress-label">{label}</span>
                <span className="selfbot-nuke-progress-count">{current} processed</span>
            </div>
            {active && currentItem && (
                <div className="selfbot-nuke-progress-current">
                    {currentItem}
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 1.5: REVIEW PACKAGE CONTENT
// ═══════════════════════════════════════════════════════════════════════════
function ReviewStep({ parsedPackage, excludedIds, setExcludedIds, onBack, onStart }: {
    parsedPackage: ParsedPackage;
    excludedIds: Set<string>;
    setExcludedIds: (ids: Set<string>) => void;
    onBack: () => void;
    onStart: () => void;
}) {
    const [searchTerm, setSearchTerm] = useState("");
    const [filterType, setFilterType] = useState<"ALL" | "DM" | "GUILD">("ALL");

    const channels = parsedPackage.channels.map(c => {
        const isDm = c.type === "1" || c.type === "3" || c.type === "DM" || c.type === "GROUP" || c.type === "GROUP_DM";
        return { ...c, isDm };
    });

    const filteredChannels = channels.filter(c => {
        const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            c.id.includes(searchTerm);
        const matchesType = filterType === "ALL"
            ? true
            : filterType === "DM" ? c.isDm : !c.isDm;

        return matchesSearch && matchesType;
    });

    const toggleChannel = (id: string) => {
        const excluded = new Set(excludedIds);
        if (excluded.has(id)) excluded.delete(id);
        else excluded.add(id);
        setExcludedIds(excluded);
    };

    const toggleAllVisible = () => {
        const excluded = new Set(excludedIds);
        const allVisibleSelected = filteredChannels.every(c => !excludedIds.has(c.id));

        filteredChannels.forEach(c => {
            if (allVisibleSelected) {
                excluded.add(c.id);
            } else {
                excluded.delete(c.id);
            }
        });
        setExcludedIds(excluded);
    };

    const selectedCount = parsedPackage.channels.length - excludedIds.size;
    const totalMessages = channels
        .filter(c => !excludedIds.has(c.id))
        .reduce((acc, c) => acc + c.messageCount, 0);

    return (
        <div className="selfbot-nuke-step">
            <Forms.FormTitle tag="h2" style={{ marginBottom: 16 }}>Select Channels to Clear</Forms.FormTitle>

            <div className="selfbot-nuke-review-controls">
                <TextInput
                    value={searchTerm}
                    onChange={setSearchTerm}
                    placeholder="Search channels..."
                    style={{ marginBottom: 8 }}
                />
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <Button
                        size={Button.Sizes.SMALL}
                        color={filterType === "ALL" ? Button.Colors.BRAND : Button.Colors.PRIMARY}
                        onClick={() => setFilterType("ALL")}
                    >
                        All
                    </Button>
                    <Button
                        size={Button.Sizes.SMALL}
                        color={filterType === "DM" ? Button.Colors.BRAND : Button.Colors.PRIMARY}
                        onClick={() => setFilterType("DM")}
                    >
                        DMs
                    </Button>
                    <Button
                        size={Button.Sizes.SMALL}
                        color={filterType === "GUILD" ? Button.Colors.BRAND : Button.Colors.PRIMARY}
                        onClick={() => setFilterType("GUILD")}
                    >
                        Servers
                    </Button>
                    <div style={{ flex: 1 }} />
                    <Button size={Button.Sizes.SMALL} look={Button.Looks.LINK} onClick={toggleAllVisible}>
                        Toggle All
                    </Button>
                </div>
            </div>

            <div className="selfbot-nuke-channel-list">
                {filteredChannels.length === 0 ? (
                    <div className="selfbot-nuke-empty-list">No channels found</div>
                ) : (
                    filteredChannels.map(c => (
                        <div
                            key={c.id}
                            className={`selfbot-nuke-channel-item ${excludedIds.has(c.id) ? "excluded" : "selected"}`}
                            onClick={() => toggleChannel(c.id)}
                        >
                            <div className="selfbot-nuke-checkbox">
                                {!excludedIds.has(c.id) && <Icons.Check />}
                            </div>
                            <div className="selfbot-nuke-channel-info">
                                <div className="selfbot-nuke-channel-name">{c.name}</div>
                                <div className="selfbot-nuke-channel-meta">
                                    {c.isDm ? "DM" : "Server"} • {c.messageCount.toLocaleString()} msgs • ID: {c.id}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="selfbot-nuke-summary-footer">
                <div>Selected: <strong>{selectedCount}</strong> channels • <strong>{totalMessages.toLocaleString()}</strong> messages</div>
            </div>

            <div className="selfbot-nuke-buttons">
                <Button color={Button.Colors.TRANSPARENT} onClick={onBack}>
                    Back
                </Button>
                <Button
                    color={Button.Colors.RED}
                    onClick={onStart}
                    disabled={selectedCount === 0}
                >
                    Start Deleting
                </Button>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 1: CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════
function ConfigStep({ options, setOptions, parsedPackage, setParsedPackage, onNext, onStartPackageClear }: {
    options: NukeOptions;
    setOptions: (opt: NukeOptions) => void;
    parsedPackage: ParsedPackage | null;
    setParsedPackage: (pkg: ParsedPackage | null) => void;
    onNext: () => void;
    onStartPackageClear: () => void;
}) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isParsingPackage, setIsParsingPackage] = useState(false);
    const [parseError, setParseError] = useState<string | null>(null);

    const anyEnabled = options.deleteMessages || options.closeDms || options.leaveServers || options.removeFriends;

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsParsingPackage(true);
        setParseError(null);

        try {
            const result = await parseDiscordPackage(file);
            if (result.totalMessages === 0) {
                setParseError("No messages found in package");
                setParsedPackage(null);
            } else {
                setParsedPackage(result);
                showToast(`Found ${result.totalMessages.toLocaleString()} messages in ${result.channels.length} channels`, Toasts.Type.SUCCESS);
            }
        } catch (err: any) {
            setParseError(err.message || "Failed to parse package");
            setParsedPackage(null);
        } finally {
            setIsParsingPackage(false);
        }
    };

    const handleRemovePackage = () => {
        setParsedPackage(null);
        setParseError(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    return (
        <div className="selfbot-nuke-step">
            <div className="selfbot-nuke-warning-header">
                <span className="selfbot-nuke-skull"><Icons.Nuke /></span>
                <span>NUKE OPTIONS</span>
            </div>

            <div className="selfbot-nuke-toggles">
                <MenuOption
                    toggled={options.deleteMessages}
                    onClick={() => setOptions({ ...options, deleteMessages: !options.deleteMessages })}
                    icon={<Icons.Trash />}
                    label="Delete All Messages"
                    description="Delete all your messages (use package for complete history)"
                    danger
                />
                <MenuOption
                    toggled={options.closeDms}
                    onClick={() => setOptions({ ...options, closeDms: !options.closeDms })}
                    icon={<Icons.CloseDMs />}
                    label="Close All DMs"
                    description="Close all DM channels after deleting messages"
                    danger
                />
                <MenuOption
                    toggled={options.leaveServers}
                    onClick={() => setOptions({ ...options, leaveServers: !options.leaveServers })}
                    icon={<Icons.LeaveServers />}
                    label="Leave All Servers"
                    description="Leave every Discord server you're in"
                    danger
                />
                <MenuOption
                    toggled={options.removeFriends}
                    onClick={() => setOptions({ ...options, removeFriends: !options.removeFriends })}
                    icon={<Icons.RemoveFriends />}
                    label="Remove All Friends"
                    description="Remove everyone from your friends list"
                    danger
                />
            </div>

            {/* Package Upload Section - Only show when deleteMessages is enabled */}
            {options.deleteMessages && (
                <div className="selfbot-nuke-package-section">
                    <Forms.FormTitle>Discord Data Package (Optional)</Forms.FormTitle>
                    <Forms.FormText className="selfbot-nuke-package-desc">
                        Upload your Discord data package (package.zip) to delete ALL messages since account creation.
                        Without a package, only visible messages will be deleted.
                    </Forms.FormText>

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".zip"
                        onChange={handleFileSelect}
                        style={{ display: "none" }}
                    />

                    {!parsedPackage ? (
                        <button
                            className="selfbot-nuke-package-upload-btn"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isParsingPackage}
                        >
                            {isParsingPackage ? (
                                <><span className="selfbot-nuke-spinner small" /> Parsing...</>
                            ) : (
                                <>Select package.zip</>
                            )}
                        </button>
                    ) : (
                        <div className="selfbot-nuke-package-info">
                            <div className="selfbot-nuke-package-summary">
                                <span className="selfbot-nuke-package-icon"></span>
                                <div>
                                    <strong>{formatPackageSummary(parsedPackage)}</strong>
                                    <div className="selfbot-nuke-package-channels">
                                        Top channels: {parsedPackage.channels.slice(0, 3).map(c => `${c.name} (${c.messageCount})`).join(", ")}
                                    </div>
                                </div>
                            </div>
                            <button
                                className="selfbot-nuke-package-remove-btn"
                                onClick={handleRemovePackage}
                            >
                                ✕
                            </button>
                        </div>
                    )}

                    {parseError && (
                        <div className="selfbot-nuke-package-error">
                            {parseError}
                        </div>
                    )}
                </div>
            )}

            {options.deleteMessages && (
                <div className="selfbot-nuke-delay-config">
                    <Forms.FormTitle>Message Deletion Delay</Forms.FormTitle>
                    <div className="selfbot-nuke-delay-buttons">
                        {[100, 500, 750, 1000, 2000].map(d => (
                            <button
                                key={d}
                                className={`selfbot-nuke-delay-btn ${options.messageDelay === d ? "selected" : ""}`}
                                onClick={() => setOptions({ ...options, messageDelay: d })}
                            >
                                {d >= 1000 ? `${d / 1000}s` : `${d}ms`}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {!anyEnabled && (
                <div className="selfbot-nuke-no-selection">
                    Select at least one option to continue
                </div>
            )}

            {/* Show Package Clear button if package is loaded */}
            {parsedPackage && options.deleteMessages && (
                <Button
                    color={Button.Colors.RED}
                    onClick={onStartPackageClear}
                    className="selfbot-nuke-next-btn"
                    style={{ marginBottom: "8px" }}
                >
                    Start Package Clear ({parsedPackage.totalMessages.toLocaleString()} messages)
                </Button>
            )}

            <Button
                color={Button.Colors.RED}
                disabled={!anyEnabled}
                onClick={onNext}
                className="selfbot-nuke-next-btn"
            >
                {parsedPackage ? "Continue Without Package" : "Continue to Confirmation"}
            </Button>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 2: CONFIRMATION
// ═══════════════════════════════════════════════════════════════════════════
function ConfirmStep({ options, onConfirm, onBack }: {
    options: NukeOptions;
    onConfirm: () => void;
    onBack: () => void;
}) {
    const [clickCount, setClickCount] = useState(0);

    const handleConfirm = () => {
        if (clickCount === 0) {
            setClickCount(1);
        } else {
            onConfirm();
        }
    };

    return (
        <div className="selfbot-nuke-step">
            <div className="selfbot-nuke-confirm-warning">
                <span className="selfbot-nuke-confirm-icon"></span>
                <div>
                    <strong>This action is IRREVERSIBLE!</strong>
                    <p>You are about to:</p>
                    <ul>
                        {options.deleteMessages && <li>Delete all your messages in all DMs</li>}
                        {options.closeDms && <li>Close all your DM channels</li>}
                        {options.leaveServers && <li>Leave every single server</li>}
                        {options.removeFriends && <li>Remove all your friends</li>}
                    </ul>
                </div>
            </div>

            <div className="selfbot-nuke-buttons">
                <Button color={Button.Colors.TRANSPARENT} onClick={onBack}>
                    Cancel
                </Button>
                <Button
                    color={clickCount === 0 ? Button.Colors.RED : Button.Colors.BRAND}
                    onClick={handleConfirm}
                >
                    {clickCount === 0 ? "EXECUTE NUKE" : "ARE YOU SURE? CLICK AGAIN"}
                </Button>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 3: PROGRESS
// ═══════════════════════════════════════════════════════════════════════════
function ProgressStep({ options, onComplete }: {
    options: NukeOptions;
    onComplete: (progress: NukeProgress) => void;
}) {
    const [progress, setProgress] = useState<NukeProgress>({
        phase: "idle",
        messages: { current: 0 },
        dmsClosed: { current: 0 },
        servers: { current: 0 },
        friends: { current: 0 }
    });
    const [controller, setController] = useState<NukeController | null>(null);

    useEffect(() => {
        const ctrl = new NukeController(options, p => {
            setProgress(p);
            if (p.phase === "complete" || p.phase === "stopped") {
                onComplete(p);
            }
        });

        setController(ctrl);
        ctrl.execute();

        return () => { ctrl.stop(); };
    }, []);

    const handleStop = () => {
        controller?.stop();
    };

    const isRunning = progress.phase !== "complete" && progress.phase !== "stopped";

    return (
        <div className="selfbot-nuke-step">
            <div className="selfbot-nuke-progress-header-main">
                {isRunning && <div className="selfbot-nuke-spinner small" />}
                <span>{isRunning ? "Nuking in progress..." : progress.phase === "complete" ? "Nuke Complete!" : "Nuke Stopped"}</span>
            </div>

            <div className="selfbot-nuke-progress-sections">
                {options.deleteMessages && (
                    <ProgressStat
                        current={progress.messages.current}
                        label="Messages"
                        currentItem={progress.messages.currentUser ? `Clearing: ${progress.messages.currentUser}` : undefined}
                        active={progress.phase === "messages"}
                    />
                )}
                {options.closeDms && (
                    <ProgressStat
                        current={progress.dmsClosed.current}
                        label="DMs Closed"
                        currentItem={progress.dmsClosed.currentDm ? `Closing: ${progress.dmsClosed.currentDm}` : undefined}
                        active={progress.phase === "closingDms"}
                    />
                )}
                {options.leaveServers && (
                    <ProgressStat
                        current={progress.servers.current}
                        label="Servers"
                        currentItem={progress.servers.currentServer ? `Leaving: ${progress.servers.currentServer}` : undefined}
                        active={progress.phase === "servers"}
                    />
                )}
                {options.removeFriends && (
                    <ProgressStat
                        current={progress.friends.current}
                        label="Friends"
                        currentItem={progress.friends.currentFriend ? `Removing: ${progress.friends.currentFriend}` : undefined}
                        active={progress.phase === "friends"}
                    />
                )}
            </div>

            {isRunning && (
                <Button color={Button.Colors.RED} onClick={handleStop} className="selfbot-nuke-stop-btn">
                    ⏹️ STOP
                </Button>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 4: COMPLETE
// ═══════════════════════════════════════════════════════════════════════════
function CompleteStep({ progress, options, onClose }: {
    progress: NukeProgress;
    options: NukeOptions;
    onClose: () => void;
}) {
    const wasStopped = progress.phase === "stopped";

    return (
        <div className="selfbot-nuke-step">
            <div className={`selfbot-nuke-complete ${wasStopped ? "stopped" : ""}`}>
                <span className="selfbot-nuke-complete-icon">{wasStopped ? "⏹️" : "✅"}</span>
                <span className="selfbot-nuke-complete-title">
                    {wasStopped ? "Nuke Stopped" : "Nuke Complete!"}
                </span>
            </div>

            <div className="selfbot-nuke-final-summary">
                {options.deleteMessages && (
                    <div className="selfbot-nuke-summary-item">
                        <span>Messages deleted:</span>
                        <strong>{progress.messages.current}</strong>
                    </div>
                )}
                {options.closeDms && (
                    <div className="selfbot-nuke-summary-item">
                        <span>DMs closed:</span>
                        <strong>{progress.dmsClosed.current}</strong>
                    </div>
                )}
                {options.leaveServers && (
                    <div className="selfbot-nuke-summary-item">
                        <span>Servers left:</span>
                        <strong>{progress.servers.current}</strong>
                    </div>
                )}
                {options.removeFriends && (
                    <div className="selfbot-nuke-summary-item">
                        <span>Friends removed:</span>
                        <strong>{progress.friends.current}</strong>
                    </div>
                )}
            </div>

            <Button color={Button.Colors.BRAND} onClick={onClose}>
                Close
            </Button>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN MODAL
// ═══════════════════════════════════════════════════════════════════════════
type Step = "config" | "review" | "confirm" | "progress" | "complete";

function NukeModal({ modalProps }: { modalProps: ModalProps; }) {
    const [step, setStep] = useState<Step>("config");
    const [options, setOptions] = useState<NukeOptions>({
        deleteMessages: false,
        closeDms: false,
        leaveServers: false,
        removeFriends: false,
        messageDelay: 1000
    });
    const [finalProgress, setFinalProgress] = useState<NukeProgress | null>(null);
    const [parsedPackage, setParsedPackage] = useState<ParsedPackage | null>(null);
    const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());

    const handleStartPackageClear = () => {
        if (!parsedPackage) return;

        // Start package deletion and close modal
        startPackageDeletion(parsedPackage, {
            delayMs: options.messageDelay,
            newestFirst: true,
            excludedChannelIds: Array.from(excludedIds),
            onLog: msg => console.log("[Package Clear]", msg)
        });

        const selectedMsgs = parsedPackage.channels
            .filter(c => !excludedIds.has(c.id))
            .reduce((acc, c) => acc + c.messageCount, 0);

        showToast(`Started package clear: ${selectedMsgs.toLocaleString()} messages`, Toasts.Type.SUCCESS);
        modalProps.onClose();
    };

    const getTitle = () => {
        switch (step) {
            case "config": return (
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Icons.Nuke />
                    <span>Nuke Configuration</span>
                </div>
            );
            case "review": return "Select Channels";
            case "confirm": return "Final Confirmation";
            case "progress": return "Executing Nuke";
            case "complete": return "Nuke Summary";
        }
    };

    return (
        <ModalRoot {...modalProps} size={ModalSize.MEDIUM}>
            <ModalHeader className="selfbot-nuke-modal-header">
                <Forms.FormTitle tag="h2" style={{ margin: 0 }}>
                    {getTitle()}
                </Forms.FormTitle>
                {step !== "progress" && <ModalCloseButton onClick={modalProps.onClose} />}
            </ModalHeader>
            <ModalContent className="selfbot-nuke-modal-content">
                {step === "config" && (
                    <ConfigStep
                        options={options}
                        setOptions={setOptions}
                        parsedPackage={parsedPackage}
                        setParsedPackage={setParsedPackage}
                        onNext={() => setStep("confirm")}
                        onStartPackageClear={() => setStep("review")}
                    />
                )}
                {step === "review" && parsedPackage && (
                    <ReviewStep
                        parsedPackage={parsedPackage}
                        excludedIds={excludedIds}
                        setExcludedIds={setExcludedIds}
                        onBack={() => setStep("config")}
                        onStart={handleStartPackageClear}
                    />
                )}
                {step === "confirm" && (
                    <ConfirmStep
                        options={options}
                        onConfirm={() => {
                            // Start background task
                            setStep("progress");
                        }}
                        onBack={() => setStep("config")}
                    />
                )}
                {step === "progress" && (
                    <ProgressStep
                        options={options}
                        onComplete={p => {
                            setFinalProgress(p);
                            setStep("complete");
                        }}
                    />
                )}
                {step === "complete" && finalProgress && (
                    <CompleteStep
                        progress={finalProgress}
                        options={options}
                        onClose={modalProps.onClose}
                    />
                )}
            </ModalContent>
        </ModalRoot>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════
export function openNukeModal() {
    openModal(props => <NukeModal modalProps={props} />);
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════
export function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
    return (
        <div className={`selfbot-mini-toggle ${checked ? "on" : ""}`} onClick={e => {
            e.stopPropagation();
            onChange();
        }}>
            <div className="selfbot-mini-toggle-slider" />
        </div>
    );
}
