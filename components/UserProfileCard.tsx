/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "../style.css";

import { RestAPI, useEffect, UserProfileActions, UserStore,useState } from "@webpack/common";

// Persistent cache for owner profiles to avoid re-loading on every mount
const persistentUserCache: Record<string, any> = {};

export async function prefetchUserProfile(userId: string) {
    if (persistentUserCache[userId]) return;
    const storeUser = UserStore.getUser(userId);
    if (storeUser) {
        persistentUserCache[userId] = storeUser;
        return;
    }
    try {
        const res: any = await RestAPI.get({ url: `/users/${userId}` });
        if (res.body) persistentUserCache[userId] = res.body;
    } catch { }
}

export function UserProfileCard({ userId, role, isOwner, onClose }: { userId: string; role: string; isOwner?: boolean; onClose?: () => void; }) {
    // Initial state: 1. Persistent cache, 2. UserStore, 3. null
    const [user, setUser] = useState<any>(() => persistentUserCache[userId] || UserStore.getUser(userId));

    useEffect(() => {
        const updateUser = () => {
            const foundUser = UserStore.getUser(userId);
            if (foundUser) {
                persistentUserCache[userId] = foundUser;
                setUser(foundUser);
            }
        };

        // Try to update from store immediately
        updateUser();

        // If user not in cache or store, fallback to manual fetch via RestAPI
        if (!user || (!user.getAvatarURL && !user.avatar)) {
            RestAPI.get({ url: `/users/${userId}` })
                .then((res: any) => {
                    if (res.body) {
                        persistentUserCache[userId] = res.body;
                        setUser((prev: any) => {
                            // If we already have a full User object (from store listener), keep it.
                            // Otherwise, use the raw data from API as fallback.
                            return (prev && prev.getAvatarURL) ? prev : res.body;
                        });
                    }
                })
                .catch(() => { });
        }

        // Listen for store updates
        UserStore.addChangeListener(updateUser);
        return () => UserStore.removeChangeListener(updateUser);
    }, [userId]);

    // Format data handling both User class and Raw API object
    const getAvatar = () => {
        if (user?.getAvatarURL) return user.getAvatarURL(undefined, 64);
        if (user?.avatar) return `https://cdn.discordapp.com/avatars/${userId}/${user.avatar}.png?size=64`;
        return `https://cdn.discordapp.com/embed/avatars/${parseInt(userId) % 5}.png`;
    };

    const getName = () => user?.globalName || user?.global_name || user?.username || "Loading...";

    const avatarUrl = getAvatar();
    const displayName = getName();

    const handleClick = () => {
        if (isOwner) {
            UserProfileActions.openUserProfileModal({ userId });
            onClose?.();
        }
    };

    return (
        <div
            className={`selfbot-profile-card ${isOwner ? "selfbot-profile-owner" : "selfbot-profile-customer"}`}
            role={isOwner ? "group" : undefined}
            tabIndex={-1}
        >
            <img
                className="selfbot-profile-avatar"
                src={avatarUrl}
                alt={displayName}
                onClick={handleClick}
                style={isOwner ? { cursor: "pointer" } : undefined}
                title={isOwner ? "View Profile" : undefined}
            />
            <div className="selfbot-profile-info">
                <span className="selfbot-profile-name">{displayName}</span>
                <span className={`selfbot-profile-role ${isOwner ? "role-owner" : "role-customer"}`}>
                    {role}
                </span>
            </div>
        </div>
    );
}
