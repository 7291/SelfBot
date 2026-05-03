/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// We'll use JSZip for ZIP extraction (bundled with Discord/Electron)
// @ts-ignore - JSZip is available in the environment
import JSZip from "jszip";

export interface PackageMessage {
    id: string;
    channelId: string;
    channelName: string;
    timestamp: Date;
    content: string;
}

export interface PackageChannel {
    id: string;
    type: string;
    name: string;
    messageCount: number;
    messages: PackageMessage[];
}

export interface ParsedPackage {
    channels: PackageChannel[];
    totalMessages: number;
    parseErrors: string[];
}

interface RawChannelJson {
    id: string;
    type: string;
    recipients?: string[];
    name?: string;
}

interface RawMessageJson {
    ID: number;
    Timestamp: string;
    Contents: string;
    Attachments: string;
}

// Parse the Discord data package ZIP file
export async function parseDiscordPackage(file: File): Promise<ParsedPackage> {
    const result: ParsedPackage = {
        channels: [],
        totalMessages: 0,
        parseErrors: []
    };

    try {
        const zip = new JSZip();
        const contents = await zip.loadAsync(file);

        // First, try to find and parse index.json for channel names
        const channelNames: Record<string, string> = {};

        // Look for index.json in Mensagens/ or messages/ folder
        const indexPaths = [
            "Mensagens/index.json",
            "messages/index.json",
            "index.json"
        ];

        for (const indexPath of indexPaths) {
            const indexFile = contents.file(indexPath);
            if (indexFile) {
                try {
                    const indexContent = await indexFile.async("text");
                    const indexData = JSON.parse(indexContent);
                    Object.assign(channelNames, indexData);
                } catch (e) {
                    result.parseErrors.push(`Failed to parse ${indexPath}`);
                }
                break;
            }
        }

        // Find all channel folders by looking for messages.json files
        const channelFolders = new Map<string, string>(); // folderName -> basePath
        contents.forEach(relativePath => {
            // Match patterns like "Mensagens/xxx/messages.json" or "messages/xxx/messages.json"
            const match = relativePath.match(/^((?:Mensagens|messages)\/([^\/]+))\/messages\.json$/i);
            if (match) {
                const basePath = match[1];
                const folderName = match[2];
                channelFolders.set(folderName, basePath);
            }
        });

        // Process each channel folder
        for (const [folderName, basePath] of channelFolders) {
            // Extract channel ID - remove 'c' prefix if present
            const channelId = folderName.startsWith("c") ? folderName.substring(1) : folderName;

            const channelJsonFile = contents.file(`${basePath}/channel.json`);
            const messagesJsonFile = contents.file(`${basePath}/messages.json`);

            if (!messagesJsonFile) continue;

            try {
                // Parse channel info
                let channelInfo: RawChannelJson = { id: channelId, type: "UNKNOWN" };
                if (channelJsonFile) {
                    const channelContent = await channelJsonFile.async("text");
                    channelInfo = JSON.parse(channelContent);
                }

                // Parse messages
                const messagesContent = await messagesJsonFile.async("text");
                const rawMessages: RawMessageJson[] = JSON.parse(messagesContent);

                if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
                    continue;
                }

                // Get channel name from index or generate one
                const channelName = channelNames[channelId] ||
                    channelInfo.name ||
                    `${channelInfo.type || "Channel"} (${channelId})`;

                // Convert raw messages to our format
                const messages: PackageMessage[] = rawMessages.map(raw => ({
                    id: String(raw.ID),
                    channelId: channelId,
                    channelName: channelName,
                    timestamp: parseTimestamp(raw.Timestamp),
                    content: raw.Contents || ""
                }));

                const channel: PackageChannel = {
                    id: channelId,
                    type: channelInfo.type || "UNKNOWN",
                    name: channelName,
                    messageCount: messages.length,
                    messages: messages
                };

                result.channels.push(channel);
                result.totalMessages += messages.length;

            } catch (e) {
                result.parseErrors.push(`Failed to parse ${basePath}: ${e}`);
            }
        }

        // Sort channels by message count (descending)
        result.channels.sort((a, b) => b.messageCount - a.messageCount);

    } catch (e) {
        result.parseErrors.push(`Failed to read ZIP file: ${e}`);
    }

    return result;
}

// Parse Discord's timestamp format: "2026-01-16 18:42:33"
function parseTimestamp(timestampStr: string): Date {
    try {
        // Try ISO format first
        const isoDate = new Date(timestampStr);
        if (!isNaN(isoDate.getTime())) {
            return isoDate;
        }

        // Try Discord's format: "YYYY-MM-DD HH:MM:SS"
        const [datePart, timePart] = timestampStr.split(" ");
        if (datePart && timePart) {
            return new Date(`${datePart}T${timePart}`);
        }

        return new Date(0);
    } catch {
        return new Date(0);
    }
}

// Get all message IDs from parsed package, grouped by channel
export function getMessagesByChannel(pkg: ParsedPackage): Map<string, string[]> {
    const result = new Map<string, string[]>();

    for (const channel of pkg.channels) {
        const messageIds = channel.messages.map(m => m.id);
        result.set(channel.id, messageIds);
    }

    return result;
}

// Get all messages as a flat array sorted by timestamp (newest first)
export function getAllMessagesSorted(pkg: ParsedPackage, newestFirst: boolean = true): PackageMessage[] {
    const allMessages: PackageMessage[] = [];

    for (const channel of pkg.channels) {
        allMessages.push(...channel.messages);
    }

    allMessages.sort((a, b) => {
        const diff = b.timestamp.getTime() - a.timestamp.getTime();
        return newestFirst ? diff : -diff;
    });

    return allMessages;
}

// Format package summary for display
export function formatPackageSummary(pkg: ParsedPackage): string {
    const channelCount = pkg.channels.length;
    const messageCount = pkg.totalMessages;

    if (messageCount === 0) {
        return "No messages found in package";
    }

    return `${messageCount.toLocaleString()} messages in ${channelCount} channels`;
}
