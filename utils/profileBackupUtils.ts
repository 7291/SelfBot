/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { RestAPI, showToast, Toasts, UserStore, PresenceStore } from "@webpack/common";

import { settingsManager } from "./settingsManager";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════
export interface ProfileBackup {
    slotId: 1 | 2 | 3;
    savedAt: number;
    bio?: string;
    displayName?: string;
    avatarBase64?: string;
    bannerBase64?: string;
    bannerColor?: string;
    accentColor?: number;
    statusText?: string;
    statusEmojiId?: string;
    statusEmojiName?: string;
}

export interface UserProfile {
    bio?: string;
    displayName?: string;
    avatarUrl?: string;
    bannerUrl?: string;
    bannerColor?: string;
    accentColor?: number;
    hasNitro?: boolean;
    statusText?: string;
    statusEmojiId?: string;
    statusEmojiName?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function urlToBase64(url: string): Promise<string | null> {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error("[ProfileBackup] Failed to convert URL to Base64:", error);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// CHECK NITRO STATUS
// ═══════════════════════════════════════════════════════════════════════════
export function hasNitro(): boolean {
    const currentUser = UserStore.getCurrentUser();
    if (!currentUser) return false;
    // Check for premium type: 1 = Nitro Classic, 2 = Nitro, 3 = Nitro Basic
    return (currentUser as any).premiumType > 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// GET CURRENT USER PROFILE
// ═══════════════════════════════════════════════════════════════════════════
export async function getCurrentUserProfile(): Promise<UserProfile | null> {
    try {
        const currentUser = UserStore.getCurrentUser();
        if (!currentUser) return null;

        // Fetch user profile for bio
        const profileResponse = await RestAPI.get({
            url: `/users/${currentUser.id}/profile`
        });

        const profile = profileResponse.body;
        const userHasNitro = hasNitro();

        // Fetch custom status from user settings
        let statusText, statusEmojiId, statusEmojiName;
        try {
            const settingsRes = await RestAPI.get({ url: "/users/@me/settings" });
            const cs = settingsRes.body?.custom_status;
            if (cs) {
                statusText = cs.text;
                statusEmojiId = cs.emoji_id;
                statusEmojiName = cs.emoji_name;
            }
        } catch (e) {
            console.error("[ProfileBackup] Failed to get custom status from settings:", e);
        }

        return {
            bio: profile?.user_profile?.bio || "",
            displayName: (currentUser as any).globalName || currentUser.username,
            avatarUrl: currentUser.getAvatarURL(undefined, 512, true) || undefined,
            bannerUrl: userHasNitro ? (currentUser as any).getBannerURL?.(undefined, 600, true) : undefined,
            bannerColor: profile?.user_profile?.banner_color || undefined,
            accentColor: profile?.user_profile?.accent_color || undefined,
            hasNitro: userHasNitro,
            statusText,
            statusEmojiId,
            statusEmojiName
        };
    } catch (error) {
        console.error("[ProfileBackup] Failed to get current user profile:", error);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// GET TARGET USER PROFILE
// ═══════════════════════════════════════════════════════════════════════════
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
    try {
        const response = await RestAPI.get({
            url: `/users/${userId}/profile`,
            query: { with_mutual_guilds: false, with_mutual_friends_count: false }
        });

        const profile = response.body;
        const user = profile?.user;

        if (!user) return null;

        // Build avatar and banner URLs
        const avatarUrl = user.avatar
            ? `https://cdn.discordapp.com/avatars/${userId}/${user.avatar}.${user.avatar.startsWith("a_") ? "gif" : "png"}?size=512`
            : `https://cdn.discordapp.com/embed/avatars/${parseInt(userId) % 5}.png`;

        const bannerUrl = user.banner
            ? `https://cdn.discordapp.com/banners/${userId}/${user.banner}.${user.banner.startsWith("a_") ? "gif" : "png"}?size=600`
            : undefined;

        // Try to get custom status from PresenceStore if user is cached/visible
        let statusText, statusEmojiId, statusEmojiName;
        const customStatusAct = PresenceStore.getCustomStatusActivity(userId);
        if (customStatusAct) {
            statusText = customStatusAct.state;
            if (customStatusAct.emoji) {
                statusEmojiId = customStatusAct.emoji.id;
                statusEmojiName = customStatusAct.emoji.name;
            }
        }

        return {
            bio: profile?.user_profile?.bio || "",
            displayName: user.global_name || user.username,
            avatarUrl,
            bannerUrl,
            bannerColor: profile?.user_profile?.banner_color || undefined,
            accentColor: profile?.user_profile?.accent_color || undefined,
            hasNitro: (user as any).premium_type > 0,
            statusText,
            statusEmojiId,
            statusEmojiName
        };
    } catch (error) {
        console.error("[ProfileBackup] Failed to get user profile:", error);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// BACKUP PROFILE TO SLOT
// ═══════════════════════════════════════════════════════════════════════════
export async function backupProfileToSlot(slotId: 1 | 2 | 3): Promise<boolean> {
    try {
        showToast(`Backing up profile to Slot ${slotId}...`, Toasts.Type.MESSAGE);

        const profile = await getCurrentUserProfile();
        if (!profile) {
            showToast("Failed to get current profile", Toasts.Type.FAILURE);
            return false;
        }

        // Convert avatar to base64
        let avatarBase64: string | undefined;
        if (profile.avatarUrl) {
            avatarBase64 = await urlToBase64(profile.avatarUrl) || undefined;
        }

        // Convert banner to base64 (only if user has Nitro)
        let bannerBase64: string | undefined;
        if (profile.hasNitro && profile.bannerUrl) {
            bannerBase64 = await urlToBase64(profile.bannerUrl) || undefined;
        }

        const backup: ProfileBackup = {
            slotId,
            savedAt: Date.now(),
            bio: profile.bio,
            displayName: profile.displayName,
            avatarBase64,
            bannerBase64,
            bannerColor: profile.bannerColor,
            accentColor: profile.accentColor,
            statusText: profile.statusText,
            statusEmojiId: profile.statusEmojiId,
            statusEmojiName: profile.statusEmojiName
        };

        settingsManager.saveProfileBackup(backup);
        showToast(`Profile backed up to Slot ${slotId}!`, Toasts.Type.SUCCESS);
        return true;
    } catch (error) {
        console.error("[ProfileBackup] Failed to backup profile:", error);
        showToast("Failed to backup profile", Toasts.Type.FAILURE);
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// RESTORE PROFILE FROM SLOT
// ═══════════════════════════════════════════════════════════════════════════
export async function restoreProfileFromSlot(slotId: 1 | 2 | 3): Promise<boolean> {
    try {
        const backup = settingsManager.getProfileBackupSlot(slotId);
        if (!backup) {
            showToast(`Slot ${slotId} is empty`, Toasts.Type.FAILURE);
            return false;
        }

        showToast(`Restoring profile from Slot ${slotId}...`, Toasts.Type.MESSAGE);

        const updatePayload: any = {};

        // Update bio
        if (backup.bio !== undefined) {
            updatePayload.bio = backup.bio;
        }

        // Update display name (global_name)
        if (backup.displayName !== undefined) {
            updatePayload.global_name = backup.displayName;
        }

        // Update avatar (needs to be data URI or null)
        if (backup.avatarBase64) {
            updatePayload.avatar = backup.avatarBase64;
        }

        // Update banner (only if user has Nitro)
        if (hasNitro()) {
            if (backup.bannerBase64) {
                updatePayload.banner = backup.bannerBase64;
            } else if (backup.bannerColor) {
                // Clear banner but keep color
                updatePayload.banner = null;
            }
        }

        // Update accent color
        if (backup.accentColor !== undefined) {
            updatePayload.accent_color = backup.accentColor;
        }

        await RestAPI.patch({
            url: "/users/@me",
            body: updatePayload
        });

        // Update custom status if present
        if (backup.statusText !== undefined || backup.statusEmojiName !== undefined) {
            await RestAPI.patch({
                url: "/users/@me/settings",
                body: {
                    custom_status: {
                        text: backup.statusText || "",
                        emoji_id: backup.statusEmojiId || null,
                        emoji_name: backup.statusEmojiName || ""
                    }
                }
            }).catch(err => console.error("Failed to update status", err));
        }

        await delay(500);
        showToast(`Profile restored from Slot ${slotId}!`, Toasts.Type.SUCCESS);
        return true;
    } catch (error: any) {
        console.error("[ProfileBackup] Failed to restore profile:", error);
        if (error.status === 429) {
            showToast("Rate limited! Please wait before trying again.", Toasts.Type.FAILURE);
        } else {
            showToast(`Failed to restore profile: ${error.body?.message || "Unknown error"}`, Toasts.Type.FAILURE);
        }
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// COPY TARGET USER'S PROFILE
// ═══════════════════════════════════════════════════════════════════════════
export async function copyProfile(userId: string): Promise<boolean> {
    try {
        showToast("Copying profile...", Toasts.Type.MESSAGE);

        const targetProfile = await getUserProfile(userId);
        if (!targetProfile) {
            showToast("Failed to get target profile", Toasts.Type.FAILURE);
            return false;
        }

        const updatePayload: any = {};

        // Copy bio
        if (targetProfile.bio) {
            updatePayload.bio = targetProfile.bio;
        }

        // Copy display name
        if (targetProfile.displayName) {
            updatePayload.global_name = targetProfile.displayName;
        }

        // Copy avatar
        if (targetProfile.avatarUrl) {
            const avatarBase64 = await urlToBase64(targetProfile.avatarUrl);
            if (avatarBase64) {
                updatePayload.avatar = avatarBase64;
            }
        }

        // Copy banner (only if current user has Nitro)
        if (hasNitro() && targetProfile.bannerUrl) {
            const bannerBase64 = await urlToBase64(targetProfile.bannerUrl);
            if (bannerBase64) {
                updatePayload.banner = bannerBase64;
            }
        } else if (hasNitro() && targetProfile.bannerColor) {
            // If target has no banner but has accent color, we can at least set that
            updatePayload.accent_color = targetProfile.accentColor;
        }

        if (Object.keys(updatePayload).length > 0) {
            await RestAPI.patch({
                url: "/users/@me",
                body: updatePayload
            });
        }

        // Copy Custom Status
        if (targetProfile.statusText !== undefined || targetProfile.statusEmojiName !== undefined) {
            await RestAPI.patch({
                url: "/users/@me/settings",
                body: {
                    custom_status: {
                        text: targetProfile.statusText || "",
                        emoji_id: targetProfile.statusEmojiId || null,
                        emoji_name: targetProfile.statusEmojiName || ""
                    }
                }
            }).catch(err => console.error("Failed to copy custom status", err));
        }

        await delay(500);
        showToast("Profile copied successfully!", Toasts.Type.SUCCESS);
        return true;
    } catch (error: any) {
        console.error("[ProfileBackup] Failed to copy profile:", error);
        if (error.status === 429) {
            showToast("Rate limited! Please wait before trying again.", Toasts.Type.FAILURE);
        } else {
            showToast(`Failed to copy profile: ${error.body?.message || "Unknown error"}`, Toasts.Type.FAILURE);
        }
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// SLOT MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════
export function getBackupSlots(): (ProfileBackup | null)[] {
    return [
        settingsManager.getProfileBackupSlot(1),
        settingsManager.getProfileBackupSlot(2),
        settingsManager.getProfileBackupSlot(3)
    ];
}

export function deleteBackupSlot(slotId: 1 | 2 | 3): boolean {
    settingsManager.deleteProfileBackup(slotId);
    showToast(`Slot ${slotId} cleared`, Toasts.Type.SUCCESS);
    return true;
}

export function getFilledSlotCount(): number {
    const slots = getBackupSlots();
    return slots.filter(s => s !== null).length;
}

export function getFirstEmptySlot(): 1 | 2 | 3 | null {
    const slots = getBackupSlots();
    for (let i = 0; i < 3; i++) {
        if (!slots[i]) return (i + 1) as 1 | 2 | 3;
    }
    return null;
}
