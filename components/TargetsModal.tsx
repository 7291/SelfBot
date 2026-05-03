/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "../style.css"; // Ensure styles are loaded

import { ModalCloseButton, ModalContent, ModalHeader, ModalProps, ModalRoot, ModalSize, openModal } from "@utils/modal";
import { Button, Forms, showToast, TextInput, Toasts, UserStore, useState } from "@webpack/common";

import { getCurrentVoiceChannel, getOtherUsersInChannel } from "../utils/autoMuteUtils";
import { settingsManager, Target } from "../utils/settingsManager";
import { Icons } from "./Icons";

function TargetItem({ target, onRemove, onToggleEnabled }: { target: Target; onRemove: (id: string) => void; onToggleEnabled: (id: string) => void; }) {
    const user = UserStore.getUser(target.id);
    const avatarUrl = user?.getAvatarURL(null, 32) || target.avatar || "https://cdn.discordapp.com/embed/avatars/0.png";

    return (
        <div className="selfbot-friend-item">
            <img src={avatarUrl} alt="" className="selfbot-friend-avatar" />
            <div className="selfbot-friend-info">
                <span className="selfbot-friend-name">{user?.username || target.username}</span>
                <span className="selfbot-friend-id">{target.id}</span>
            </div>
            <div className="selfbot-friend-actions">
                <Button
                    color={target.enabled ? Button.Colors.GREEN : Button.Colors.PRIMARY}
                    size={Button.Sizes.SMALL}
                    onClick={() => onToggleEnabled(target.id)}
                    className="selfbot-autopull-btn"
                    style={{ marginRight: "8px", minWidth: "100px" }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <Icons.Target />
                        <span>Active: {target.enabled ? "ON" : "OFF"}</span>
                    </div>
                </Button>
                <Button
                    color={Button.Colors.RED}
                    size={Button.Sizes.SMALL}
                    onClick={() => onRemove(target.id)}
                    className="selfbot-friend-remove-btn"
                >
                    Remove
                </Button>
            </div>
        </div>
    );
}

function TargetsModal({ modalProps }: { modalProps: ModalProps; }) {
    const [targets, setTargets] = useState<Target[]>(settingsManager.getTargets());
    const [newTargetId, setNewTargetId] = useState("");
    const [vcUsers, setVcUsers] = useState<string[]>([]);

    useState(() => {
        const vcInfo = getCurrentVoiceChannel();
        if (vcInfo) {
            setVcUsers(getOtherUsersInChannel(vcInfo.channelId));
        }
    });

    const handleAddTargetFromId = (id: string) => {
        // Try to fetch user from store
        const user = UserStore.getUser(id);

        let target: Target;

        if (!user) {
            target = {
                id: id,
                username: "Unknown User",
                avatar: "https://cdn.discordapp.com/embed/avatars/0.png",
                enabled: true
            };
        } else {
            target = {
                id: user.id,
                username: user.username,
                discriminator: user.discriminator,
                avatar: user.getAvatarURL(null, 32),
                enabled: true
            };
        }

        if (settingsManager.addTarget(target)) {
            setTargets([...settingsManager.getTargets()]);
            // Remove from VC list if present (visual cleanup, optional)
            setVcUsers(prev => prev.filter(uid => uid !== id));

            if (!user) {
                showToast("Added target (User ID not in cache)", Toasts.Type.MESSAGE);
            } else {
                showToast(`Added Target ${user.username}`, Toasts.Type.SUCCESS);
            }
        } else {
            showToast("Target already exists", Toasts.Type.FAILURE);
        }
    };

    const handleAddTarget = () => {
        if (!newTargetId) return;
        handleAddTargetFromId(newTargetId);
        setNewTargetId("");
    };

    const handleRemoveTarget = (id: string) => {
        if (settingsManager.removeTarget(id)) {
            setTargets([...settingsManager.getTargets()]);
            showToast("Target removed", Toasts.Type.SUCCESS);
        }
    };

    const handleToggleEnabled = (id: string) => {
        if (settingsManager.toggleTargetEnabled(id)) {
            setTargets([...settingsManager.getTargets()]);
        }
    };

    return (
        <ModalRoot {...modalProps} size={ModalSize.MEDIUM}>
            <ModalHeader separator={false} className="selfbot-modal-header">
                <Forms.FormTitle tag="h2">Manage Targets</Forms.FormTitle>
                <ModalCloseButton onClick={modalProps.onClose} />
            </ModalHeader>
            <ModalContent className="selfbot-modal-content">
                <div className="selfbot-friends-input-container">
                    <TextInput
                        placeholder="Enter User ID"
                        value={newTargetId}
                        onChange={setNewTargetId}
                        className="selfbot-friend-input"
                    />
                    <Button onClick={handleAddTarget} disabled={!newTargetId}>
                        Add Target
                    </Button>
                </div>

                <div className="selfbot-section-divider" />

                {vcUsers.length > 0 && (
                    <>
                        <Forms.FormTitle tag="h5" className="selfbot-section-title">Users in Voice</Forms.FormTitle>
                        <div className="selfbot-friends-list" style={{ maxHeight: "150px", marginBottom: "20px" }}>
                            {vcUsers.map(userId => {
                                // Skip if already target
                                if (settingsManager.isTarget(userId)) return null;

                                const user = UserStore.getUser(userId);
                                const avatarUrl = user?.getAvatarURL(null, 32) || "https://cdn.discordapp.com/embed/avatars/0.png";

                                return (
                                    <div key={userId} className="selfbot-friend-item">
                                        <img src={avatarUrl} alt="" className="selfbot-friend-avatar" />
                                        <div className="selfbot-friend-info">
                                            <span className="selfbot-friend-name">{user?.username || "Unknown"}</span>
                                            <span className="selfbot-friend-id">{userId}</span>
                                        </div>
                                        <Button
                                            color={Button.Colors.RED}
                                            size={Button.Sizes.SMALL}
                                            onClick={() => handleAddTargetFromId(userId)}
                                            className="selfbot-friend-add-btn"
                                        >
                                            Add as Target
                                        </Button>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="selfbot-section-divider" />
                    </>
                )}

                <Forms.FormTitle tag="h5" className="selfbot-section-title">Targets List</Forms.FormTitle>
                <div className="selfbot-friends-list">
                    {targets.length === 0 ? (
                        <div className="selfbot-empty-state">No targets added</div>
                    ) : (
                        targets.map(target => (
                            <TargetItem key={target.id} target={target} onRemove={handleRemoveTarget} onToggleEnabled={handleToggleEnabled} />
                        ))
                    )}
                </div>
            </ModalContent>
        </ModalRoot>
    );
}

export function openTargetsModal() {
    openModal(props => <TargetsModal modalProps={props} />);
}
