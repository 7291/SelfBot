/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { settings } from "./settings";

export interface Friend {
    id: string;
    username: string;
    discriminator?: string;
    avatar?: string;
    autoPull?: boolean;
}

export interface Target {
    id: string;
    username: string;
    discriminator?: string;
    avatar?: string;
    enabled: boolean; // "Targeting toggle" per user
    voiceStalker?: boolean;
    messageMirror?: boolean;

    reactionSpeller?: boolean;
}

export interface ProfileBackup {
    slotId: 1 | 2 | 3;
    savedAt: number;
    bio?: string;
    displayName?: string;
    avatarBase64?: string;
    bannerBase64?: string;
    bannerColor?: string;
    accentColor?: number;
}

export interface Account {
    id: string;
    username: string;
    discriminator?: string;
    avatar?: string;
    token: string;
    isCurrentUser?: boolean;
}

export interface CallConfig {
    usePerms: boolean;
    command: string; // Base command like "hit!call"
    channelId: string;
    useVoiceChat?: boolean; // If true, send command to voice channel's text chat
}

export interface FollowUserSettings {
    executeOnFollow: boolean;
    onlyManualTrigger: boolean;
    followLeave: boolean;
    autoMoveBack: boolean;
    channelFull: boolean;
    followUserId: string;
}

export interface SelfBotSettings {
    friends: Friend[];
    targets: Target[];
    badMicLevel: number; // 0-100
    reactionSpellerText: string;
    profileBackups: ProfileBackup[];
    accounts: Account[];
    callConfigs: Record<string, CallConfig>;
    followUserSettings: FollowUserSettings;
    autoStatusSettings: { messages: string[], intervalMs: number };
    massJoinerPullerId?: string; // ID of the account to use for pulling
    toggles: {
        autoMute: boolean;
        autoDeafen: boolean;
        autoUnmute: boolean;
        autoUndeafen: boolean;
        autoStatus: boolean;
        fakeMute: boolean;
        fakeDeafen: boolean;
        fakeVideo: boolean;
        muteProtection: boolean;
        deafenProtection: boolean;
        cameraProtection: boolean;
        antiDisconnectProtection: boolean;
        autoPull: boolean;
        friendsMuteProtection: boolean;
        friendsDeafenProtection: boolean;
        autoMuteTarget: boolean;
        autoDeafenTarget: boolean;
        autoPullTarget: boolean;
        videoStrobe: boolean;
        badMic: boolean;
        hideLogo: boolean;
        silentSpeaker: boolean;
        [key: string]: boolean;
    };
}

const DEFAULT_FOLLOW_SETTINGS: FollowUserSettings = {
    executeOnFollow: true,
    onlyManualTrigger: false,
    followLeave: false,
    autoMoveBack: false,
    channelFull: true,
    followUserId: ""
};

const DEFAULT_AUTO_STATUS_SETTINGS = {
    messages: ["Hello World", "Vencord is awesome", "SelfBot Active"],
    intervalMs: 10000 // 10 seconds
};

const DEFAULT_TOGGLES = {
    autoMute: false,
    autoDeafen: false,
    autoUnmute: false,
    autoUndeafen: false,
    autoStatus: false,
    fakeMute: false,
    fakeDeafen: false,
    fakeVideo: false,
    muteProtection: false,
    deafenProtection: false,
    cameraProtection: false,
    antiDisconnectProtection: false,
    autoPull: false,
    friendsMuteProtection: false,
    friendsDeafenProtection: false,
    autoMuteTarget: false,
    autoDeafenTarget: false,
    autoPullTarget: false,
    videoStrobe: false,
    badMic: false,
    silentSpeaker: false,
    hideLogo: false,
    followPullAssist: false,
    massJoinerAutoJoin: false,
    massJoinerPullAssistEnabled: false
};

class SettingsManager {
    public getSettings(): SelfBotSettings {
        let needsUpdate = false;

        // Ensure collections are initialized as plain objects/arrays to avoid Proxy issues
        if (!settings.store.friends) {
            settings.store.friends = [];
            needsUpdate = true;
        }

        if (!settings.store.targets) {
            settings.store.targets = [];
            needsUpdate = true;
        }

        if (!settings.store.profileBackups) {
            settings.store.profileBackups = [];
            needsUpdate = true;
        }

        if (!settings.store.accounts) {
            settings.store.accounts = [];
            needsUpdate = true;
        }

        if (!settings.store.callConfigs) {
            settings.store.callConfigs = {};
            needsUpdate = true;
        }

        if (settings.store.badMicLevel === undefined) {
            settings.store.badMicLevel = 50;
            needsUpdate = true;
        }

        if (!settings.store.reactionSpellerText) {
            settings.store.reactionSpellerText = "";
            needsUpdate = true;
        }

        if (!settings.store.followUserSettings) {
            settings.store.followUserSettings = { ...DEFAULT_FOLLOW_SETTINGS };
            needsUpdate = true;
        }

        if (!settings.store.autoStatusSettings) {
            settings.store.autoStatusSettings = { ...DEFAULT_AUTO_STATUS_SETTINGS };
            needsUpdate = true;
        }

        // Initialize toggles
        if (!settings.store.toggles) {
            settings.store.toggles = { ...DEFAULT_TOGGLES };
            needsUpdate = true;
        } else {
            // Check for missing keys in toggles
            let togglesChanged = false;
            const currentToggles = settings.store.toggles;
            const newToggles = { ...currentToggles };

            for (const key of Object.keys(DEFAULT_TOGGLES)) {
                if (newToggles[key] === undefined) {
                    newToggles[key] = DEFAULT_TOGGLES[key as keyof typeof DEFAULT_TOGGLES];
                    togglesChanged = true;
                }
            }

            if (togglesChanged) {
                settings.store.toggles = newToggles;
                needsUpdate = true;
            }
        }

        // Return a fresh cloned object for the UI
        return {
            friends: this.getFriends(),
            targets: this.getTargets(),
            badMicLevel: settings.store.badMicLevel ?? 50,
            reactionSpellerText: settings.store.reactionSpellerText || "LMAO",
            profileBackups: this.getProfileBackups(),
            accounts: this.getAccounts(),
            callConfigs: this.getCallConfigs(),
            followUserSettings: settings.store.followUserSettings || { ...DEFAULT_FOLLOW_SETTINGS },
            autoStatusSettings: settings.store.autoStatusSettings || { ...DEFAULT_AUTO_STATUS_SETTINGS },
            massJoinerPullerId: settings.store.massJoinerPullerId,
            toggles: { ...settings.store.toggles } as any
        };
    }

    private saveToStore(key: keyof typeof settings.store, value: any) {
        // Deep clone to strip proxies and ensure clean state in storage
        settings.store[key] = JSON.parse(JSON.stringify(value));
    }

    // Account Methods
    public getAccounts(): Account[] {
        if (!settings.store.accounts) {
            settings.store.accounts = [];
        }
        return JSON.parse(JSON.stringify(settings.store.accounts));
    }

    public saveAccounts(accounts: Account[]): void {
        this.saveToStore("accounts", accounts);
    }

    // Call Config Methods
    public getCallConfigs(): Record<string, CallConfig> {
        return settings.store.callConfigs ? JSON.parse(JSON.stringify(settings.store.callConfigs)) : {};
    }

    public getCallConfig(guildId: string): CallConfig | null {
        return this.getCallConfigs()[guildId] || null;
    }

    public setCallConfig(guildId: string, config: CallConfig): void {
        const current = this.getCallConfigs();
        current[guildId] = JSON.parse(JSON.stringify(config));
        this.saveToStore("callConfigs", current);
    }

    // Friend Methods
    public addFriend(user: Friend): boolean {
        if (this.isFriend(user.id)) return false;

        // Create a CLEAN object to avoid Proxy cloning issues
        const newFriend = {
            id: user.id || "",
            username: user.username || "",
            discriminator: user.discriminator || "",
            avatar: user.avatar || ""
        };

        // Get current friends and DEEP CLONE them to strip proxies
        const currentFriends = settings.store.friends ? JSON.parse(JSON.stringify(settings.store.friends)) : [];

        // Update store with new array of PLAIN objects
        settings.store.friends = [...currentFriends, newFriend];
        this.saveToStore("friends", settings.store.friends);
        return true;
    }

    public removeFriend(userId: string): boolean {
        // Get current friends and DEEP CLONE them to strip proxies
        const currentFriends = settings.store.friends ? JSON.parse(JSON.stringify(settings.store.friends)) : [];
        const initialLength = currentFriends.length;

        const newFriends = currentFriends.filter((f: Friend) => f.id !== userId);

        if (newFriends.length !== initialLength) {
            this.saveToStore("friends", newFriends);
            return true;
        }
        return false;
    }

    public isFriend(userId: string): boolean {
        const { friends } = settings.store;
        if (!friends) return false;
        return friends.some((f: any) => f.id === userId);
    }

    public toggleFriendAutoPull(userId: string): boolean {
        const { friends } = settings.store;
        if (!friends) return false;

        const friendIndex = friends.findIndex(f => f.id === userId);
        if (friendIndex === -1) return false;

        // Clean update to avoid proxy issues, similar to add/remove
        const currentFriends = JSON.parse(JSON.stringify(friends));
        currentFriends[friendIndex].autoPull = !currentFriends[friendIndex].autoPull;

        settings.store.friends = currentFriends;
        return true;
    }

    public getFriends(): Friend[] {
        return settings.store.friends ? JSON.parse(JSON.stringify(settings.store.friends)) : [];
    }

    // Toggle Methods
    public setToggle(key: string, value: boolean): void {
        const currentToggles = settings.store.toggles || { ...DEFAULT_TOGGLES };
        // Clean update
        settings.store.toggles = { ...currentToggles, [key]: value };
    }

    public getToggle(key: string): boolean {
        const { toggles } = settings.store;
        const val = toggles?.[key];
        return val ?? DEFAULT_TOGGLES[key as keyof typeof DEFAULT_TOGGLES] ?? false;
    }

    public setBadMicLevel(level: number): void {
        settings.store.badMicLevel = level;
    }

    public setReactionSpellerText(text: string): void {
        settings.store.reactionSpellerText = text;
    }

    // Target Methods
    public addTarget(user: Target): boolean {
        if (this.isTarget(user.id)) return false;

        const newTarget = {
            id: user.id || "",
            username: user.username || "",
            discriminator: user.discriminator || "",
            avatar: user.avatar || "",
            enabled: true,
            voiceStalker: false,
            messageMirror: false,

            reactionSpeller: false
        };

        const currentTargets = settings.store.targets ? JSON.parse(JSON.stringify(settings.store.targets)) : [];
        this.saveToStore("targets", [...currentTargets, newTarget]);
        return true;
    }

    public removeTarget(userId: string): boolean {
        const currentTargets = settings.store.targets ? JSON.parse(JSON.stringify(settings.store.targets)) : [];
        const initialLength = currentTargets.length;
        const newTargets = currentTargets.filter((t: Target) => t.id !== userId);

        if (newTargets.length !== initialLength) {
            this.saveToStore("targets", newTargets);
            return true;
        }
        return false;
    }

    public isTarget(userId: string): boolean {
        const { targets } = settings.store;
        if (!targets) return false;
        return targets.some((t: any) => t.id === userId);
    }

    public toggleTargetEnabled(userId: string): boolean {
        const { targets } = settings.store;
        if (!targets) return false;

        const targetIndex = targets.findIndex(t => t.id === userId);
        if (targetIndex === -1) return false;

        const currentTargets = JSON.parse(JSON.stringify(targets));
        currentTargets[targetIndex].enabled = !currentTargets[targetIndex].enabled;

        settings.store.targets = currentTargets;
        return true;
    }

    public toggleTargetVoiceStalker(userId: string): boolean {
        const { targets } = settings.store;
        if (!targets) return false;

        const targetIndex = targets.findIndex(t => t.id === userId);
        if (targetIndex === -1) return false;

        const currentTargets = JSON.parse(JSON.stringify(targets));
        currentTargets[targetIndex].voiceStalker = !currentTargets[targetIndex].voiceStalker;

        settings.store.targets = currentTargets;
        return true;
    }

    public toggleTargetMessageMirror(userId: string): boolean {
        const { targets } = settings.store;
        if (!targets) return false;

        const targetIndex = targets.findIndex(t => t.id === userId);
        if (targetIndex === -1) return false;

        const currentTargets = JSON.parse(JSON.stringify(targets));
        currentTargets[targetIndex].messageMirror = !currentTargets[targetIndex].messageMirror;

        settings.store.targets = currentTargets;
        return true;
    }

    public toggleTargetReactionSpeller(userId: string): boolean {
        const { targets } = settings.store;
        if (!targets) return false;

        const targetIndex = targets.findIndex(t => t.id === userId);
        if (targetIndex === -1) return false;

        const currentTargets = JSON.parse(JSON.stringify(targets));
        currentTargets[targetIndex].reactionSpeller = !currentTargets[targetIndex].reactionSpeller;

        settings.store.targets = currentTargets;
        return true;
    }

    public getTargets(): Target[] {
        return settings.store.targets ? JSON.parse(JSON.stringify(settings.store.targets)) : [];
    }

    // Profile Backup Methods
    public getProfileBackups(): ProfileBackup[] {
        return settings.store.profileBackups ? JSON.parse(JSON.stringify(settings.store.profileBackups)) : [];
    }

    public getProfileBackupSlot(slotId: 1 | 2 | 3): ProfileBackup | null {
        const backups = this.getProfileBackups();
        return backups.find(b => b.slotId === slotId) || null;
    }

    public saveProfileBackup(backup: ProfileBackup): void {
        const currentBackups = this.getProfileBackups();
        const existingIndex = currentBackups.findIndex(b => b.slotId === backup.slotId);

        // Create clean backup object
        const cleanBackup: ProfileBackup = {
            slotId: backup.slotId,
            savedAt: backup.savedAt,
            bio: backup.bio,
            displayName: backup.displayName,
            avatarBase64: backup.avatarBase64,
            bannerBase64: backup.bannerBase64,
            bannerColor: backup.bannerColor,
            accentColor: backup.accentColor
        };

        if (existingIndex !== -1) {
            currentBackups[existingIndex] = cleanBackup;
        } else {
            currentBackups.push(cleanBackup);
        }

        settings.store.profileBackups = currentBackups;
    }

    public deleteProfileBackup(slotId: 1 | 2 | 3): void {
        const currentBackups = this.getProfileBackups();
        const newBackups = currentBackups.filter(b => b.slotId !== slotId);
        this.saveToStore("profileBackups", newBackups);
    }

    public getSetting(key: string): any {
        return (settings.store as any)[key];
    }

    public setSetting(key: string, value: any): void {
        this.saveToStore(key as any, value);
    }

    public getMassJoinerPullerId(): string | undefined {
        return settings.store.massJoinerPullerId;
    }

    public setMassJoinerPullerId(id: string) {
        settings.store.massJoinerPullerId = id;
    }
}

export const settingsManager = new SettingsManager();
