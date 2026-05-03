/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "../style.css";

import { useCallback, useEffect, UserStore, useState } from "@webpack/common";

import {
    backupProfileToSlot,
    copyProfile,
    deleteBackupSlot,
    getBackupSlots,
    hasNitro,
    ProfileBackup,
    restoreProfileFromSlot
} from "../utils/profileBackupUtils";
import { Icons } from "./Icons";

// ═══════════════════════════════════════════════════════════════════════════
// PROFILE BACKUP PAGE
// ═══════════════════════════════════════════════════════════════════════════
export function ProfileBackupPage({ onBack }: { onBack: () => void; }) {
    const [slots, setSlots] = useState<(ProfileBackup | null)[]>(() => getBackupSlots());
    const [isLoading, setIsLoading] = useState<number | null>(null);
    const userHasNitro = hasNitro();
    const currentUser = UserStore.getCurrentUser();

    const refreshSlots = useCallback(() => {
        setSlots(getBackupSlots());
    }, []);

    useEffect(() => {
        refreshSlots();
    }, [refreshSlots]);

    const handleBackup = async (slotId: 1 | 2 | 3) => {
        setIsLoading(slotId);
        await backupProfileToSlot(slotId);
        refreshSlots();
        setIsLoading(null);
    };

    const handleRestore = async (slotId: 1 | 2 | 3) => {
        setIsLoading(slotId);
        await restoreProfileFromSlot(slotId);
        setIsLoading(null);
    };

    const handleDelete = (slotId: 1 | 2 | 3) => {
        deleteBackupSlot(slotId);
        refreshSlots();
    };

    const formatDate = (timestamp: number) => {
        const date = new Date(timestamp);
        return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    };

    return (
        <div className="selfbot-profile-backup-page">
            {/* Header */}
            <div className="selfbot-profile-backup-header">
                <div className="selfbot-profile-backup-back" onClick={onBack}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
                    </svg>
                </div>
                <div className="selfbot-profile-backup-title">
                    <h3>Profile Backup</h3>
                    <span>Save and restore your Discord profile</span>
                </div>
            </div>

            {/* Current Profile Preview */}
            <div className="selfbot-profile-current">
                <div className="selfbot-profile-current-avatar">
                    <img
                        src={currentUser?.getAvatarURL?.(undefined, 64) || "https://cdn.discordapp.com/embed/avatars/0.png"}
                        alt="Your avatar"
                    />
                </div>
                <div className="selfbot-profile-current-info">
                    <span className="selfbot-profile-current-name">
                        {(currentUser as any)?.globalName || currentUser?.username || "Unknown"}
                    </span>
                    <span className="selfbot-profile-current-hint">Current Profile</span>
                </div>
            </div>

            {/* Backup Slots */}
            <div className="selfbot-profile-slots">
                {[1, 2, 3].map(slotNum => {
                    const slotId = slotNum as 1 | 2 | 3;
                    const slot = slots[slotNum - 1];
                    const loading = isLoading === slotId;

                    return (
                        <div key={slotId} className={`selfbot-profile-slot ${slot ? "filled" : "empty"}`}>
                            <div className="selfbot-profile-slot-header">
                                <div className="selfbot-profile-slot-icon">
                                    <Icons.Backup />
                                </div>
                                <div className="selfbot-profile-slot-title">
                                    <span>Slot {slotId}</span>
                                    {slot && <span className="selfbot-profile-slot-date">{formatDate(slot.savedAt)}</span>}
                                </div>
                            </div>

                            {slot ? (
                                <>
                                    <div className="selfbot-profile-slot-preview">
                                        {slot.avatarBase64 && (
                                            <img
                                                src={slot.avatarBase64}
                                                alt="Backup avatar"
                                                className="selfbot-profile-slot-avatar"
                                            />
                                        )}
                                        <div className="selfbot-profile-slot-info">
                                            <span className="selfbot-profile-slot-name">{slot.displayName || "Unknown"}</span>
                                            {slot.bio && (
                                                <span className="selfbot-profile-slot-bio">
                                                    {slot.bio.length > 50 ? slot.bio.substring(0, 50) + "..." : slot.bio}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="selfbot-profile-slot-actions">
                                        <button
                                            className="selfbot-profile-slot-btn restore"
                                            onClick={() => handleRestore(slotId)}
                                            disabled={loading}
                                        >
                                            {loading ? "..." : "Restore"}
                                        </button>
                                        <button
                                            className="selfbot-profile-slot-btn overwrite"
                                            onClick={() => handleBackup(slotId)}
                                            disabled={loading}
                                        >
                                            {loading ? "..." : "Overwrite"}
                                        </button>
                                        <button
                                            className="selfbot-profile-slot-btn delete"
                                            onClick={() => handleDelete(slotId)}
                                            disabled={loading}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div className="selfbot-profile-slot-empty">
                                    <span>Empty Slot</span>
                                    <button
                                        className="selfbot-profile-slot-btn backup"
                                        onClick={() => handleBackup(slotId)}
                                        disabled={loading}
                                    >
                                        {loading ? "Backing up..." : "Backup Current Profile"}
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            <div className="selfbot-menu-footer">
                <span className="selfbot-footer-text">SelfBot v1.0</span>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// COPY PROFILE HANDLER (for target cards)
// ═══════════════════════════════════════════════════════════════════════════
export async function handleCopyProfile(userId: string, username: string): Promise<void> {
    const hasBackups = getBackupSlots().some(s => s !== null);

    if (!hasBackups) {
        // Warn user they have no backups
        if (!window.confirm(`You have no profile backups!\n\nCopying ${username}'s profile will change your current profile. Do you want to continue without a backup?`)) {
            return;
        }
    } else {
        if (!window.confirm(`Copy ${username}'s profile?\n\nThis will change your bio, display name, and avatar.`)) {
            return;
        }
    }

    await copyProfile(userId);
}
