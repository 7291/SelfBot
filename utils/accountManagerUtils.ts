/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { AuthenticationStore, showToast, Toasts, UserStore } from "@webpack/common";

import { Account, settingsManager } from "./settingsManager";

// Re-export Account type for consumers
export type { Account };

interface AccountManagerState {
    accounts: Account[];
    activeAccountId: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

// Local state cache
const state: AccountManagerState = {
    accounts: [],
    activeAccountId: null
};

let isInitialized = false;

function ensureInitialized() {
    if (isInitialized) return;
    try {
        state.accounts = settingsManager.getAccounts();
        if (typeof localStorage !== "undefined") {
            state.activeAccountId = localStorage.getItem("selfbot_active_account_id");
        }
    } catch (e) {
        console.error("[AccountManager] Initialization error:", e);
    }
    isInitialized = true;
}

const listeners: Set<() => void> = new Set();

function notifyListeners(): void {
    listeners.forEach(listener => listener());
}

function saveState() {
    try {
        settingsManager.saveAccounts(state.accounts);
        if (typeof localStorage !== "undefined") {
            if (state.activeAccountId) {
                localStorage.setItem("selfbot_active_account_id", state.activeAccountId);
            } else {
                localStorage.removeItem("selfbot_active_account_id");
            }
        }
    } catch (e) {
        console.error("[AccountManager] Save error:", e);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// API - Validate Token
// ═══════════════════════════════════════════════════════════════════════════

export async function validateToken(token: string): Promise<Account | null> {
    try {
        const response = await fetch("https://discord.com/api/v9/users/@me", {
            method: "GET",
            headers: {
                "Authorization": token,
                "Content-Type": "application/json"
            }
        });

        if (!response.ok) {
            return null;
        }

        const user = await response.json();
        return {
            id: user.id,
            username: user.username,
            discriminator: user.discriminator,
            avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : "https://cdn.discordapp.com/embed/avatars/0.png",
            token: token
        };
    } catch (e) {
        console.error("[AccountManager] Error validating token:", e);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// ACCOUNT MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

export function saveCurrentAccount(silent: boolean = false): boolean {
    ensureInitialized();
    const currentUser = UserStore.getCurrentUser();
    const token = AuthenticationStore.getToken();

    if (!currentUser || !token) {
        return false;
    }

    const account: Account = {
        id: currentUser.id,
        username: currentUser.username,
        discriminator: currentUser.discriminator,
        avatar: currentUser.getAvatarURL(undefined, 80) || "https://cdn.discordapp.com/embed/avatars/0.png",
        token: token,
        isCurrentUser: true
    };

    // Reload latest accounts from settings before changing
    const prevAccounts = settingsManager.getAccounts();
    state.accounts = prevAccounts;

    const existingIndex = state.accounts.findIndex(a => a.id === account.id);
    if (existingIndex !== -1) {
        // Update keeping properties, but refreshing token/avatar
        state.accounts[existingIndex] = { ...state.accounts[existingIndex], ...account };
    } else {
        state.accounts.push(account);
    }

    console.log(`[AccountManager] Saving current account: ${account.username}. Total accounts: ${state.accounts.length} (Previous: ${prevAccounts.length})`);

    saveState();
    notifyListeners();

    if (!silent) {
        showToast(`Account saved: ${account.username}`, Toasts.Type.SUCCESS);
    }

    return true;
}

export async function addAccount(token: string, silent: boolean = false): Promise<boolean> {
    ensureInitialized();
    const account = await validateToken(token);
    if (!account) {
        if (!silent) showToast("Invalid token or failed to validate", Toasts.Type.FAILURE);
        return false;
    }

    // Refresh state
    state.accounts = settingsManager.getAccounts();

    // Check if account already exists
    if (state.accounts.find(a => a.id === account.id)) {
        // Update token
        state.accounts = state.accounts.map(a =>
            a.id === account.id ? { ...a, token, username: account.username, avatar: account.avatar } : a
        );
        saveState();
        notifyListeners();
        if (!silent) showToast(`Updated token for ${account.username}`, Toasts.Type.SUCCESS);
        return true;
    }

    // Check if this is the current user
    const currentUser = UserStore.getCurrentUser();
    if (currentUser && account.id === currentUser.id) {
        account.isCurrentUser = true;
    }

    state.accounts.push(account);
    saveState();
    notifyListeners();
    if (!silent) showToast(`Added account: ${account.username}`, Toasts.Type.SUCCESS);
    return true;
}

export function removeAccount(id: string): void {
    ensureInitialized();
    state.accounts = settingsManager.getAccounts();
    const account = state.accounts.find(a => a.id === id);
    state.accounts = state.accounts.filter(a => a.id !== id);

    // If we removed the active account, reset to current user
    if (state.activeAccountId === id) {
        state.activeAccountId = null;
    }

    saveState();
    notifyListeners();
    showToast(account ? `Removed ${account.username}` : "Account removed", Toasts.Type.SUCCESS);
}

export function getAccounts(): Account[] {
    ensureInitialized();
    // Refresh
    state.accounts = settingsManager.getAccounts();

    // Add current user to the list if not already there (Dynamically)
    const currentUser = UserStore.getCurrentUser();
    if (currentUser) {
        const currentInList = state.accounts.find(a => a.id === currentUser.id);
        if (!currentInList) {
            // Return with current user as first option (virtual)
            return [{
                id: currentUser.id,
                username: currentUser.username,
                discriminator: currentUser.discriminator,
                avatar: currentUser.getAvatarURL(null, 80) || "https://cdn.discordapp.com/embed/avatars/0.png",
                token: "",
                isCurrentUser: true
            }, ...state.accounts];
        }
    }
    return state.accounts;
}

export function setActiveAccount(id: string | null): void {
    ensureInitialized();
    state.activeAccountId = id;
    saveState();
    notifyListeners();

    if (id === null) {
        const currentUser = UserStore.getCurrentUser();
        showToast(`Switched to ${currentUser?.username || "current user"}`, Toasts.Type.SUCCESS);
    } else {
        const account = state.accounts.find(a => a.id === id);
        if (account) {
            showToast(`Now acting as: ${account.username}`, Toasts.Type.SUCCESS);
        }
    }
}

export function getActiveAccount(): Account | null {
    ensureInitialized();
    if (state.activeAccountId === null) {
        return null; // Use current user
    }
    // Refresh settings just in case
    state.accounts = settingsManager.getAccounts();
    return state.accounts.find(a => a.id === state.activeAccountId) || null;
}

export function getActiveAccountId(): string | null {
    ensureInitialized();
    return state.activeAccountId;
}

export function getActiveToken(): string | null {
    const account = getActiveAccount();
    return account?.token || null;
}

export function isUsingAlternateAccount(): boolean {
    ensureInitialized();
    return state.activeAccountId !== null;
}

// ═══════════════════════════════════════════════════════════════════════════
// SUBSCRIPTION
// ═══════════════════════════════════════════════════════════════════════════

export function subscribeToAccountChanges(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT FOR UI
// ═══════════════════════════════════════════════════════════════════════════

export const accountManager = {
    addAccount,
    removeAccount,
    getAccounts,
    setActiveAccount,
    getActiveAccount,
    getActiveAccountId,
    getActiveToken,
    isUsingAlternateAccount,
    validateToken,
    subscribeToAccountChanges,
    saveCurrentAccount
};
