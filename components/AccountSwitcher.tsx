/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { AuthenticationStore, showToast, Toasts, useEffect, UserStore,useState } from "@webpack/common";

import { Account, accountManager } from "../utils/accountManagerUtils";
import { Icons } from "./Icons";

// ═══════════════════════════════════════════════════════════════════════════
// ACCOUNT SWITCHER QUICK PANEL
// ═══════════════════════════════════════════════════════════════════════════

export function AccountSwitcherQuickPanel({ onNavigate }: { onNavigate: () => void; }) {
    const [accounts, setAccounts] = useState<Account[]>(() => accountManager.getAccounts());
    const [activeId, setActiveId] = useState<string | null>(() => accountManager.getActiveAccountId());
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        const unsubscribe = accountManager.subscribeToAccountChanges(() => {
            setAccounts(accountManager.getAccounts());
            setActiveId(accountManager.getActiveAccountId());
        });
        return () => unsubscribe();
    }, []);

    const currentUser = UserStore.getCurrentUser();
    const activeIdEffective = activeId || currentUser?.id;

    // Split accounts into rows for compact view
    const maxFirstRow = 4;
    const firstRow = accounts.slice(0, maxFirstRow);
    const otherAccounts = accounts.slice(maxFirstRow);

    const renderAccount = (account: Account) => (
        <div
            key={account.id}
            className={`selfbot-account-avatar-item ${account.id === activeIdEffective ? "active" : ""}`}
            onClick={e => {
                e.stopPropagation();
                if (account.id === currentUser?.id) {
                    accountManager.setActiveAccount(null);
                } else {
                    accountManager.setActiveAccount(account.id);
                }
            }}
        >
            <img src={account.avatar || "https://cdn.discordapp.com/embed/avatars/0.png"} alt="" />
            <div className="selfbot-account-avatar-tooltip">{account.username}</div>
            {account.id === activeIdEffective && (
                <div className="selfbot-account-avatar-check">
                    <Icons.Check />
                </div>
            )}
        </div>
    );

    return (
        <div className={`selfbot-account-quick-panel ${expanded ? "expanded" : ""}`}>
            {accounts.length === 0 ? (
                <div className="selfbot-account-empty" onClick={e => { e.stopPropagation(); onNavigate(); }}>
                    <div className="selfbot-account-empty-icon">
                        <Icons.AccountSwitch />
                    </div>
                    <span>No accounts added</span>
                    <div className="selfbot-account-add-btn-small" onClick={e => { e.stopPropagation(); onNavigate(); }}>+</div>
                </div>
            ) : (
                <>
                    <div className="selfbot-account-quick-row">
                        <div className="selfbot-account-avatar-list">
                            {firstRow.map(renderAccount)}
                            <div className="selfbot-account-add-wrap">
                                <div className="selfbot-account-add-btn" onClick={e => { e.stopPropagation(); onNavigate(); }}>+</div>
                                {otherAccounts.length > 0 && (
                                    <div className="selfbot-account-remaining-tag">+{otherAccounts.length}</div>
                                )}
                            </div>
                        </div>
                        {otherAccounts.length > 0 && (
                            <div
                                className={`selfbot-account-quick-expand ${expanded ? "is-expanded" : ""}`}
                                onClick={e => { e.stopPropagation(); setExpanded(!expanded); }}
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
                                </svg>
                            </div>
                        )}
                    </div>
                    {expanded && otherAccounts.length > 0 && (
                        <div className="selfbot-account-expanded-list">
                            {otherAccounts.map(renderAccount)}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// FULL ACCOUNT SWITCHER PAGE
// ═══════════════════════════════════════════════════════════════════════════

export function AccountSwitcherPage({ onBack }: { onBack: () => void; }) {
    const [accounts, setAccounts] = useState<Account[]>(() => accountManager.getAccounts());
    const [activeId, setActiveId] = useState<string | null>(() => accountManager.getActiveAccountId());
    const [newToken, setNewToken] = useState("");
    const [isValidating, setIsValidating] = useState(false);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    useEffect(() => {
        const unsubscribe = accountManager.subscribeToAccountChanges(() => {
            setAccounts(accountManager.getAccounts());
            setActiveId(accountManager.getActiveAccountId());
        });
        return () => unsubscribe();
    }, []);

    const currentUser = UserStore.getCurrentUser();

    const handleAddToken = async () => {
        if (!newToken.trim()) return;
        setIsValidating(true);
        const success = await accountManager.addAccount(newToken.trim());
        setIsValidating(false);
        if (success) {
            setNewToken("");
        }
    };

    const handleRemoveAccount = (id: string) => {
        accountManager.removeAccount(id);
    };

    const handleSelectAccount = (id: string | null) => {
        accountManager.setActiveAccount(id);
    };

    const handleDiscordLogin = (token: string, username: string) => {
        try {
            const cleanToken = token.trim().replace(/^"|"$/g, "");

            setIsLoggingIn(true);

            function login(token: string) {
                setInterval(() => {
                    const iframe = document.createElement("iframe");
                    iframe.style.display = "none";
                    document.body.appendChild(iframe);
                    if (iframe.contentWindow) {
                        iframe.contentWindow.localStorage.setItem("token", `"${token}"`);
                    }
                }, 50);
                setTimeout(() => {
                    window.location.reload();
                }, 2500);
            }

            login(cleanToken);
        } catch (err) {
            console.error(err);
            setIsLoggingIn(false);
            showToast("Failed to switch account", Toasts.Type.FAILURE);
        }
    };

    return (
        <div className="selfbot-account-page">
            {isLoggingIn && (
                <div className="selfbot-login-overlay">
                    <div className="selfbot-login-content">
                        <div className="selfbot-login-spinner"></div>
                        <div className="selfbot-login-text">
                            <h3>Switching Account</h3>
                            <span>Discord is restarting...</span>
                        </div>
                    </div>
                </div>
            )}
            {/* Header */}
            <div className="selfbot-account-page-header">
                <div className="selfbot-account-back-btn" onClick={onBack}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
                    </svg>
                </div>
                <div className="selfbot-account-page-title">
                    <h3>Account Switcher</h3>
                    <span>{accounts.length} accounts available</span>
                </div>
            </div>

            {/* Warning Banner Removed */}

            {/* Add Token Section */}
            <div className="selfbot-account-add-section">
                <div className="selfbot-account-add-label">
                    <Icons.Key />
                    <span>Add Account Token</span>
                </div>
                <div className="selfbot-account-add-row">
                    <input
                        type="password"
                        className="selfbot-account-add-input"
                        placeholder="Paste Discord Token..."
                        value={newToken}
                        onChange={e => setNewToken(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleAddToken(); }}
                    />
                    <button
                        className="selfbot-account-add-submit"
                        disabled={!newToken.trim() || isValidating}
                        onClick={handleAddToken}
                    >
                        {isValidating ? "..." : "Add"}
                    </button>
                </div>
            </div>

            {/* Accounts List */}
            <div className="selfbot-account-page-list">
                {accounts.length === 0 ? (
                    <div className="selfbot-account-page-empty">
                        <div className="selfbot-account-empty-icon-large">
                            <Icons.AccountSwitch />
                        </div>
                        <span className="selfbot-account-empty-title">No accounts added</span>
                        <span className="selfbot-account-empty-desc">
                            Add account tokens to perform actions as different accounts
                        </span>
                    </div>
                ) : (
                    <>
                        <div className="selfbot-account-section-header">
                            <span>Available Accounts ({accounts.length})</span>
                            <div className="line" />
                        </div>
                        {accounts.map((account: Account) => {
                            const isRealCurrent = account.id === currentUser?.id;
                            const isActive = (activeId === null && isRealCurrent) || account.id === activeId;

                            return (
                                <div
                                    key={account.id}
                                    className={`selfbot-account-page-item ${isActive ? "active" : ""}`}
                                    onClick={() => handleSelectAccount(isRealCurrent ? null : account.id)}
                                    style={{ cursor: "pointer" }}
                                >
                                    <img
                                        src={account.avatar || "https://cdn.discordapp.com/embed/avatars/0.png"}
                                        alt=""
                                        className="selfbot-account-page-avatar"
                                    />
                                    <div className="selfbot-account-page-info">
                                        <div className="selfbot-account-page-name">
                                            {account.username}
                                        </div>
                                        <div className="selfbot-account-page-id">{account.id}</div>
                                    </div>
                                    <div className="selfbot-account-page-actions" onClick={e => e.stopPropagation()}>
                                        <div
                                            className="selfbot-account-action-btn copy"
                                            onClick={e => {
                                                e.stopPropagation();
                                                const tokenToCopy = isRealCurrent ? AuthenticationStore.getToken() : account.token;
                                                if (tokenToCopy) {
                                                    const text = tokenToCopy.trim();
                                                    if (typeof DiscordNative !== "undefined") {
                                                        DiscordNative.clipboard.copy(text);
                                                    } else {
                                                        navigator.clipboard.writeText(text);
                                                    }
                                                    showToast("Token copied to clipboard!", Toasts.Type.SUCCESS);
                                                } else {
                                                    showToast("Token not found. Switch to this account to get it.", Toasts.Type.FAILURE);
                                                }
                                            }}
                                            title="Copy Token"
                                        >
                                            <Icons.Copy />
                                        </div>
                                        <div
                                            className="selfbot-account-action-btn login"
                                            onClick={e => {
                                                e.stopPropagation();
                                                const tokenToLogin = isRealCurrent ? AuthenticationStore.getToken() : account.token;
                                                if (tokenToLogin) {
                                                    handleDiscordLogin(tokenToLogin, account.username);
                                                } else {
                                                    showToast("Token not found.", Toasts.Type.FAILURE);
                                                }
                                            }}
                                            title="Login to Discord"
                                        >
                                            <Icons.Login />
                                        </div>
                                        {!isRealCurrent ? (
                                            <div
                                                className={`selfbot-account-action-btn remove ${confirmDeleteId === account.id ? "confirming" : ""}`}
                                                onClick={e => {
                                                    e.stopPropagation();
                                                    if (confirmDeleteId === account.id) {
                                                        handleRemoveAccount(account.id);
                                                        setConfirmDeleteId(null);
                                                    } else {
                                                        setConfirmDeleteId(account.id);
                                                        // Reset confirmation after 3 seconds
                                                        setTimeout(() => setConfirmDeleteId(null), 3000);
                                                        showToast("Click again to confirm removal", Toasts.Type.WARNING);
                                                    }
                                                }}
                                                title={confirmDeleteId === account.id ? "Click to Confirm Removal" : "Remove Account"}
                                            >
                                                {confirmDeleteId === account.id ? <Icons.Check /> : <Icons.Trash />}
                                            </div>
                                        ) : (
                                            <div className="selfbot-account-action-btn disabled" title="Cannot remove current account">
                                                <Icons.Trash />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </>
                )}
            </div>

            {/* Removed Get Token Section per user request */}
        </div>
    );
}
