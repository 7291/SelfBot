/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChannelStore, GuildStore, showToast, Toasts, UserStore, useState } from "@webpack/common";

import { SpamMessage, SpamOptions, startSpamTask } from "../utils/spamUtils";
import { Icons } from "./Icons";

interface ChannelMetadata {
    id: string;
    name: string;
    guildName: string;
    guildIcon: string | null;
    type: "text" | "dm" | "group";
}

const DELAY_PRESETS = [
    { label: "Instant", value: 0, unit: "ms" as const },
    { label: "Fast", value: 500, unit: "ms" as const },
    { label: "Normal", value: 1000, unit: "ms" as const },
    { label: "Slow", value: 3000, unit: "ms" as const },
];

export function SpamPage({ onBack }: { onBack: () => void; }) {
    // Target State
    const [targetInput, setTargetInput] = useState("");
    const [channels, setChannels] = useState<ChannelMetadata[]>([]);

    // Message State
    const [messageContent, setMessageContent] = useState("");
    const [attachments, setAttachments] = useState<File[]>([]);
    const [messageQueue, setMessageQueue] = useState<SpamMessage[]>([]);

    // Settings State
    const [amount, setAmount] = useState<string>("5");
    const [isInfinite, setIsInfinite] = useState(false);
    const [delay, setDelay] = useState<string>("1000");
    const [delayUnit, setDelayUnit] = useState<"ms" | "s">("ms");
    const [waitForSlowmode, setWaitForSlowmode] = useState(true);

    const getChannelMetadata = (channelId: string): ChannelMetadata | null => {
        const channel = ChannelStore.getChannel(channelId);
        if (!channel) return null;

        const currentUser = UserStore.getCurrentUser();

        // DM Channel
        if (channel.type === 1) {
            const recipientId = channel.recipients?.[0];
            const user = recipientId ? UserStore.getUser(recipientId) : null;
            return {
                id: channelId,
                name: user ? ((user as any).globalName || user.username) : "Unknown User",
                guildName: "Direct Message",
                guildIcon: user?.avatar
                    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=32`
                    : null,
                type: "dm"
            };
        }

        // Group DM
        if (channel.type === 3) {
            return {
                id: channelId,
                name: channel.name || "Unnamed Group",
                guildName: "Group DM",
                guildIcon: channel.icon
                    ? `https://cdn.discordapp.com/channel-icons/${channelId}/${channel.icon}.png?size=32`
                    : null,
                type: "group"
            };
        }

        // Guild Channel
        const guild = GuildStore.getGuild(channel.guild_id);
        return {
            id: channelId,
            name: channel.name || "Unknown Channel",
            guildName: guild?.name || "Unknown Server",
            guildIcon: guild?.icon
                ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=32`
                : null,
            type: "text"
        };
    };

    const handleAddTarget = () => {
        const ids = targetInput.split(/[\s,]+/).filter(id => /^\d{17,20}$/.test(id));
        if (ids.length === 0) {
            showToast("Invalid Channel ID(s)", Toasts.Type.FAILURE);
            return;
        }

        const newChannels: ChannelMetadata[] = [];
        for (const id of ids) {
            if (channels.some(c => c.id === id)) continue;
            const metadata = getChannelMetadata(id);
            if (metadata) newChannels.push(metadata);
        }

        if (newChannels.length > 0) {
            setChannels(prev => [...prev, ...newChannels]);
            setTargetInput("");
        } else {
            showToast("Could not find any valid channels", Toasts.Type.FAILURE);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setAttachments(Array.from(e.target.files));
        }
    };

    const handleAddToQueue = () => {
        if (!messageContent.trim() && attachments.length === 0) {
            showToast("Message cannot be empty", Toasts.Type.FAILURE);
            return;
        }

        const newMessage: SpamMessage = {
            id: Date.now().toString(),
            content: messageContent,
            attachments: attachments.length > 0 ? attachments : undefined
        };

        setMessageQueue([...messageQueue, newMessage]);
        setMessageContent("");
        setAttachments([]);
    };

    const handleRemoveMessage = (index: number) => {
        setMessageQueue(messageQueue.filter((_, i) => i !== index));
    };

    const handleStart = () => {
        if (channels.length === 0) {
            showToast("No target channels selected", Toasts.Type.FAILURE);
            return;
        }
        if (messageQueue.length === 0) {
            showToast("Message queue is empty", Toasts.Type.FAILURE);
            return;
        }

        const delayVal = parseInt(delay) || 0;
        const finalDelay = delayUnit === "s" ? delayVal * 1000 : delayVal;

        const options: SpamOptions = {
            channelIds: channels.map(c => c.id),
            messages: messageQueue,
            amount: isInfinite ? -1 : parseInt(amount) || 1,
            delayMs: finalDelay,
            instant: finalDelay === 0,
            waitForSlowmode
        };

        startSpamTask(options);
        showToast("Spam task started!", Toasts.Type.SUCCESS);
        onBack();
    };

    const applyPreset = (preset: typeof DELAY_PRESETS[0]) => {
        setDelay(preset.value.toString());
        setDelayUnit(preset.unit);
    };

    return (
        <div className="selfbot-dmclear-page" style={{ background: "linear-gradient(180deg, rgba(194, 24, 24, 0.05) 0%, transparent 100%)" }}>
            {/* Header */}
            <div className="selfbot-dmclear-page-header" style={{ background: "rgba(194, 24, 24, 0.1)", borderBottom: "1px solid rgba(194, 24, 24, 0.2)" }}>
                <div className="selfbot-dmclear-back-btn" onClick={onBack}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
                    </svg>
                </div>
                <div className="selfbot-dmclear-page-title">
                    <h3 style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <Icons.Keyboard />
                        Spam & Raid
                    </h3>
                    <span>Advanced message spamming tool</span>
                </div>
            </div>

            <div className="selfbot-spam-content" style={{ padding: "16px", overflowY: "auto", maxHeight: "calc(100% - 60px)" }}>

                {/* Target Channels Section */}
                <div style={{ marginBottom: "20px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                        <div style={{ fontSize: "14px", fontWeight: 600, color: "#dcddde" }}>Target Channels</div>
                        {channels.length > 0 && (
                            <div
                                onClick={() => setChannels([])}
                                style={{ fontSize: "11px", color: "#f04747", cursor: "pointer", textDecoration: "underline" }}
                            >
                                Clear All ({channels.length})
                            </div>
                        )}
                    </div>

                    <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                        <input
                            type="text"
                            placeholder="Paste Channel IDs (comma or space separated)"
                            value={targetInput}
                            onChange={e => setTargetInput(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && handleAddTarget()}
                            style={{
                                flex: 1,
                                background: "rgba(0,0,0,0.3)",
                                border: "1px solid rgba(255,255,255,0.1)",
                                borderRadius: "6px",
                                padding: "10px 12px",
                                color: "white",
                                fontSize: "13px",
                                outline: "none",
                                transition: "all 0.2s"
                            }}
                        />
                        <button
                            onClick={handleAddTarget}
                            style={{
                                background: "#43b581",
                                color: "white",
                                border: "none",
                                borderRadius: "6px",
                                padding: "0 20px",
                                cursor: "pointer",
                                fontWeight: 600,
                                fontSize: "13px",
                                transition: "all 0.2s"
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = "#3ca374"}
                            onMouseLeave={e => e.currentTarget.style.background = "#43b581"}
                        >
                            Add
                        </button>
                    </div>

                    {/* Channel Cards */}
                    {channels.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            {channels.map(channel => (
                                <div
                                    key={channel.id}
                                    style={{
                                        background: "rgba(0,0,0,0.2)",
                                        border: "1px solid rgba(255,255,255,0.1)",
                                        borderRadius: "8px",
                                        padding: "12px",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "12px",
                                        transition: "all 0.2s",
                                        cursor: "default"
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = "rgba(0,0,0,0.3)"}
                                    onMouseLeave={e => e.currentTarget.style.background = "rgba(0,0,0,0.2)"}
                                >
                                    {/* Server/User Icon */}
                                    <div style={{
                                        width: "32px",
                                        height: "32px",
                                        borderRadius: channel.type === "dm" ? "50%" : "8px",
                                        background: "rgba(255,255,255,0.1)",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        overflow: "hidden",
                                        flexShrink: 0
                                    }}>
                                        {channel.guildIcon ? (
                                            <img src={channel.guildIcon} alt="" style={{ width: "100%", height: "100%" }} />
                                        ) : (
                                            <span style={{ fontSize: "14px", fontWeight: 600, color: "#b9bbbe" }}>
                                                {channel.type === "dm" ? "DM" : channel.type === "group" ? "G" : "#"}
                                            </span>
                                        )}
                                    </div>

                                    {/* Channel Info */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: "14px", fontWeight: 500, color: "#dcddde", marginBottom: "2px" }}>
                                            {channel.type === "text" && "#"}{channel.name}
                                        </div>
                                        <div style={{ fontSize: "11px", color: "#72767d" }}>
                                            {channel.guildName}
                                        </div>
                                    </div>

                                    {/* Remove Button */}
                                    <div
                                        onClick={() => setChannels(channels.filter(c => c.id !== channel.id))}
                                        style={{
                                            width: "24px",
                                            height: "24px",
                                            borderRadius: "4px",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            cursor: "pointer",
                                            transition: "all 0.2s",
                                            color: "#72767d"
                                        }}
                                        onMouseEnter={e => {
                                            e.currentTarget.style.background = "rgba(240, 71, 71, 0.2)";
                                            e.currentTarget.style.color = "#f04747";
                                        }}
                                        onMouseLeave={e => {
                                            e.currentTarget.style.background = "transparent";
                                            e.currentTarget.style.color = "#72767d";
                                        }}
                                    >
                                        ✕
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Message Queue Section */}
                <div style={{ marginBottom: "20px" }}>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "#dcddde", marginBottom: "12px" }}>
                        Message Queue ({messageQueue.length})
                    </div>

                    {/* Add Message Card */}
                    <div style={{
                        background: "rgba(0,0,0,0.2)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "8px",
                        padding: "12px",
                        marginBottom: "12px"
                    }}>
                        <textarea
                            placeholder="Type your message here..."
                            value={messageContent}
                            onChange={e => setMessageContent(e.target.value)}
                            style={{
                                width: "100%",
                                minHeight: "60px",
                                background: "transparent",
                                border: "none",
                                color: "white",
                                resize: "vertical",
                                marginBottom: "8px",
                                outline: "none",
                                fontSize: "13px"
                            }}
                        />

                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <label style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", color: "#b9bbbe", fontSize: "12px", transition: "color 0.2s" }}
                                onMouseEnter={e => e.currentTarget.style.color = "#dcddde"}
                                onMouseLeave={e => e.currentTarget.style.color = "#b9bbbe"}
                            >
                                <input
                                    type="file"
                                    multiple
                                    accept="image/*"
                                    onChange={handleFileSelect}
                                    style={{ display: "none" }}
                                />
                                <Icons.Misc />
                                <span>{attachments.length > 0 ? `${attachments.length} file(s) selected` : "Add Images"}</span>
                            </label>
                            <div style={{ display: "flex", gap: "8px" }}>
                                <button
                                    onClick={handleAddToQueue}
                                    style={{
                                        background: "transparent",
                                        color: "#dcddde",
                                        border: "1px solid #5865F2",
                                        borderRadius: "6px",
                                        padding: "8px 16px",
                                        cursor: "pointer",
                                        fontSize: "12px",
                                        fontWeight: 600,
                                        transition: "all 0.2s"
                                    }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.background = "rgba(88, 101, 242, 0.1)";
                                        e.currentTarget.style.color = "#fff";
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.background = "transparent";
                                        e.currentTarget.style.color = "#dcddde";
                                    }}
                                >
                                    Add to Queue
                                </button>
                                <button
                                    onClick={() => {
                                        if (channels.length === 0) {
                                            showToast("No target channels selected", Toasts.Type.FAILURE);
                                            return;
                                        }
                                        if (!messageContent.trim() && attachments.length === 0) {
                                            showToast("Message cannot be empty", Toasts.Type.FAILURE);
                                            return;
                                        }

                                        const delayVal = parseInt(delay) || 0;
                                        const finalDelay = delayUnit === "s" ? delayVal * 1000 : delayVal;

                                        const singleMessage: SpamMessage = {
                                            id: Date.now().toString(),
                                            content: messageContent,
                                            attachments: attachments.length > 0 ? attachments : undefined
                                        };

                                        // Start a one-off task
                                        startSpamTask({
                                            channelIds: channels.map(c => c.id),
                                            messages: [singleMessage],
                                            amount: 1, // Send once per channel
                                            delayMs: finalDelay, // Use the delay setting mainly for rate limits between channels
                                            instant: true, // Try to go fast
                                            waitForSlowmode
                                        });

                                        showToast("Sending message...", Toasts.Type.SUCCESS);
                                        // Optional: Clear input or keep it? Users usually want to spam same thing.
                                        // Let's keep it.
                                    }}
                                    style={{
                                        background: "#5865F2",
                                        color: "white",
                                        border: "none",
                                        borderRadius: "6px",
                                        padding: "8px 16px",
                                        cursor: "pointer",
                                        fontSize: "12px",
                                        fontWeight: 600,
                                        transition: "all 0.2s"
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = "#4752c4"}
                                    onMouseLeave={e => e.currentTarget.style.background = "#5865F2"}
                                >
                                    Send Directly
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Queue List */}
                    {messageQueue.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            {messageQueue.map((msg, idx) => (
                                <div key={msg.id} style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "12px",
                                    background: "rgba(0,0,0,0.15)",
                                    borderLeft: "3px solid #5865F2",
                                    padding: "10px 12px",
                                    borderRadius: "0 6px 6px 0",
                                    transition: "all 0.2s"
                                }}
                                    onMouseEnter={e => e.currentTarget.style.background = "rgba(0,0,0,0.25)"}
                                    onMouseLeave={e => e.currentTarget.style.background = "rgba(0,0,0,0.15)"}
                                >
                                    <div style={{ fontSize: "11px", color: "#72767d", fontWeight: 600, minWidth: "20px" }}>
                                        #{idx + 1}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: "13px", color: "#dcddde", marginBottom: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            {msg.content || "[No Text]"}
                                        </div>
                                        {msg.attachments && msg.attachments.length > 0 && (
                                            <div style={{ fontSize: "11px", color: "#72767d" }}>
                                                📎 {msg.attachments.length} attachment(s)
                                            </div>
                                        )}
                                    </div>
                                    <div
                                        onClick={() => handleRemoveMessage(idx)}
                                        style={{
                                            width: "24px",
                                            height: "24px",
                                            borderRadius: "4px",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            cursor: "pointer",
                                            transition: "all 0.2s",
                                            color: "#72767d"
                                        }}
                                        onMouseEnter={e => {
                                            e.currentTarget.style.background = "rgba(240, 71, 71, 0.2)";
                                            e.currentTarget.style.color = "#f04747";
                                        }}
                                        onMouseLeave={e => {
                                            e.currentTarget.style.background = "transparent";
                                            e.currentTarget.style.color = "#72767d";
                                        }}
                                    >
                                        ✕
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Settings Section */}
                <div style={{ marginBottom: "20px" }}>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "#dcddde", marginBottom: "12px" }}>
                        Settings
                    </div>

                    <div style={{
                        background: "rgba(0,0,0,0.2)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "8px",
                        padding: "16px"
                    }}>
                        {/* Amount */}
                        <div style={{ marginBottom: "16px" }}>
                            <div style={{ fontSize: "12px", color: "#b9bbbe", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                Spam Amount
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    <div
                                        className={`selfbot-mini-toggle ${isInfinite ? "on" : ""}`}
                                        onClick={() => setIsInfinite(!isInfinite)}
                                    >
                                        <div className="selfbot-mini-toggle-slider" />
                                    </div>
                                    <span style={{ fontSize: "13px", color: "#dcddde" }}>Infinite</span>
                                </div>

                                {!isInfinite && (
                                    <input
                                        type="number"
                                        value={amount}
                                        onChange={e => setAmount(e.target.value)}
                                        min="1"
                                        style={{
                                            width: "80px",
                                            background: "rgba(0,0,0,0.3)",
                                            border: "1px solid rgba(255,255,255,0.1)",
                                            borderRadius: "6px",
                                            padding: "8px",
                                            color: "white",
                                            textAlign: "center",
                                            fontSize: "13px",
                                            outline: "none"
                                        }}
                                    />
                                )}
                            </div>
                        </div>

                        {/* Delay Presets */}
                        <div style={{ marginBottom: "16px" }}>
                            <div style={{ fontSize: "12px", color: "#b9bbbe", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                Speed Presets
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
                                {DELAY_PRESETS.map(preset => {
                                    const isActive = parseInt(delay) === preset.value && delayUnit === preset.unit;
                                    return (
                                        <button
                                            key={preset.label}
                                            onClick={() => applyPreset(preset)}
                                            style={{
                                                background: isActive ? "#5865F2" : "rgba(0,0,0,0.3)",
                                                border: `1px solid ${isActive ? "#5865F2" : "rgba(255,255,255,0.1)"}`,
                                                borderRadius: "6px",
                                                padding: "8px",
                                                color: isActive ? "white" : "#b9bbbe",
                                                cursor: "pointer",
                                                fontSize: "12px",
                                                fontWeight: 600,
                                                transition: "all 0.2s"
                                            }}
                                            onMouseEnter={e => !isActive && (e.currentTarget.style.background = "rgba(0,0,0,0.4)")}
                                            onMouseLeave={e => !isActive && (e.currentTarget.style.background = "rgba(0,0,0,0.3)")}
                                        >
                                            {preset.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Custom Delay */}
                        <div style={{ marginBottom: "16px" }}>
                            <div style={{ fontSize: "12px", color: "#b9bbbe", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                Custom Delay
                            </div>
                            <div style={{ display: "flex", gap: "8px" }}>
                                <input
                                    type="number"
                                    value={delay}
                                    onChange={e => setDelay(e.target.value)}
                                    min="0"
                                    style={{
                                        flex: 1,
                                        background: "rgba(0,0,0,0.3)",
                                        border: "1px solid rgba(255,255,255,0.1)",
                                        borderRadius: "6px",
                                        padding: "8px 12px",
                                        color: "white",
                                        fontSize: "13px",
                                        outline: "none"
                                    }}
                                />
                                <div style={{ display: "flex", background: "rgba(0,0,0,0.3)", borderRadius: "6px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)" }}>
                                    <div
                                        onClick={() => setDelayUnit("ms")}
                                        style={{
                                            padding: "8px 12px",
                                            fontSize: "12px",
                                            cursor: "pointer",
                                            background: delayUnit === "ms" ? "rgba(255,255,255,0.1)" : "transparent",
                                            color: delayUnit === "ms" ? "white" : "#b9bbbe",
                                            fontWeight: 600,
                                            transition: "all 0.2s"
                                        }}
                                    >
                                        ms
                                    </div>
                                    <div
                                        onClick={() => setDelayUnit("s")}
                                        style={{
                                            padding: "8px 12px",
                                            fontSize: "12px",
                                            cursor: "pointer",
                                            background: delayUnit === "s" ? "rgba(255,255,255,0.1)" : "transparent",
                                            color: delayUnit === "s" ? "white" : "#b9bbbe",
                                            fontWeight: 600,
                                            transition: "all 0.2s"
                                        }}
                                    >
                                        s
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Slowmode Toggle */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div>
                                <div style={{ fontSize: "13px", color: "#dcddde", marginBottom: "2px" }}>Wait for Slowmode</div>
                                <div style={{ fontSize: "11px", color: "#72767d" }}>Respect channel slowmode limits</div>
                            </div>
                            <div
                                className={`selfbot-mini-toggle ${waitForSlowmode ? "on" : ""}`}
                                onClick={() => setWaitForSlowmode(!waitForSlowmode)}
                            >
                                <div className="selfbot-mini-toggle-slider" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Start Button */}
                <button
                    onClick={handleStart}
                    disabled={channels.length === 0 || messageQueue.length === 0}
                    style={{
                        width: "100%",
                        padding: "14px",
                        background: channels.length === 0 || messageQueue.length === 0
                            ? "rgba(194, 24, 24, 0.3)"
                            : "linear-gradient(135deg, #c21818 0%, #a01515 100%)",
                        color: "white",
                        border: "none",
                        borderRadius: "8px",
                        fontSize: "14px",
                        fontWeight: 700,
                        cursor: channels.length === 0 || messageQueue.length === 0 ? "not-allowed" : "pointer",
                        marginBottom: "20px",
                        transition: "all 0.2s",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        boxShadow: channels.length === 0 || messageQueue.length === 0
                            ? "none"
                            : "0 4px 12px rgba(194, 24, 24, 0.3)"
                    }}
                    onMouseEnter={e => {
                        if (channels.length > 0 && messageQueue.length > 0) {
                            e.currentTarget.style.transform = "translateY(-2px)";
                            e.currentTarget.style.boxShadow = "0 6px 16px rgba(194, 24, 24, 0.4)";
                        }
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.transform = "translateY(0)";
                        e.currentTarget.style.boxShadow = channels.length === 0 || messageQueue.length === 0
                            ? "none"
                            : "0 4px 12px rgba(194, 24, 24, 0.3)";
                    }}
                >
                    🚀 Start Spam
                </button>

            </div>
        </div>
    );
}
