/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "../style.css"; // Ensure styles are loaded

import { ModalCloseButton, ModalContent, ModalHeader, ModalProps, ModalRoot, ModalSize, openModal } from "@utils/modal";
import { Button, Forms, showToast, TextInput, Toasts, UserStore, useState } from "@webpack/common";

import { getCurrentVoiceChannel, getOtherUsersInChannel } from "../utils/autoMuteUtils";
import { Friend, settingsManager } from "../utils/settingsManager";
import { Icons } from "./Icons";

function FriendItem({ friend, onRemove, onToggleAutoPull }: { friend: Friend; onRemove: (id: string) => void; onToggleAutoPull: (id: string) => void; }) {
    const user = UserStore.getUser(friend.id);
    const avatarUrl = user?.getAvatarURL(null, 32) || friend.avatar || "https://cdn.discordapp.com/embed/avatars/0.png";

    return (
        <div className="selfbot-friend-item">
            <img src={avatarUrl} alt="" className="selfbot-friend-avatar" />
            <div className="selfbot-friend-info">
                <span className="selfbot-friend-name">{user?.username || friend.username}</span>
                <span className="selfbot-friend-id">{friend.id}</span>
            </div>
            <div className="selfbot-friend-actions">
                <Button
                    color={friend.autoPull ? Button.Colors.GREEN : Button.Colors.PRIMARY}
                    size={Button.Sizes.SMALL}
                    onClick={() => onToggleAutoPull(friend.id)}
                    className="selfbot-autopull-btn"
                    style={{ marginRight: "8px", minWidth: "120px" }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <Icons.Automation width={16} height={16} />
                        <span>Auto Pull: {friend.autoPull ? "ON" : "OFF"}</span>
                    </div>
                </Button>
                <Button
                    color={Button.Colors.RED}
                    size={Button.Sizes.SMALL}
                    onClick={() => onRemove(friend.id)}
                    className="selfbot-friend-remove-btn"
                >
                    Remove
                </Button>
            </div>
        </div>
    );
}

function FriendsModal({ modalProps }: { modalProps: ModalProps; }) {
    const [friends, setFriends] = useState<Friend[]>(settingsManager.getFriends());
    const [newFriendId, setNewFriendId] = useState("");
    const [vcUsers, setVcUsers] = useState<string[]>([]);

    useState(() => {
        const vcInfo = getCurrentVoiceChannel();
        if (vcInfo) {
            setVcUsers(getOtherUsersInChannel(vcInfo.channelId));
        }
    });

    const handleAddFriendFromId = (id: string) => {
        // Try to fetch user from store
        const user = UserStore.getUser(id);

        let friend: Friend;

        if (!user) {
            friend = {
                id: id,
                username: "Unknown User",
                avatar: "https://cdn.discordapp.com/embed/avatars/0.png"
            };
        } else {
            friend = {
                id: user.id,
                username: user.username,
                discriminator: user.discriminator,
                avatar: user.getAvatarURL(null, 32)
            };
        }

        if (settingsManager.addFriend(friend)) {
            setFriends([...settingsManager.getFriends()]);
            // Remove from VC list if present (visual cleanup, optional)
            setVcUsers(prev => prev.filter(uid => uid !== id));

            if (!user) {
                showToast("Added friend (User ID not in cache)", Toasts.Type.MESSAGE);
            } else {
                showToast(`Added ${user.username}`, Toasts.Type.SUCCESS);
            }
        } else {
            showToast("Friend already exists", Toasts.Type.FAILURE);
        }
    };

    const handleAddFriend = () => {
        if (!newFriendId) return;
        handleAddFriendFromId(newFriendId);
        setNewFriendId("");
    };

    const handleRemoveFriend = (id: string) => {
        if (settingsManager.removeFriend(id)) {
            setFriends([...settingsManager.getFriends()]);
            showToast("Friend removed", Toasts.Type.SUCCESS);
        }
    };

    const handleToggleAutoPull = (id: string) => {
        if (settingsManager.toggleFriendAutoPull(id)) {
            setFriends([...settingsManager.getFriends()]);
        }
    };

    return (
        <ModalRoot {...modalProps} size={ModalSize.MEDIUM}>
            <ModalHeader separator={false} className="selfbot-modal-header">
                <Forms.FormTitle tag="h2">Friends Whitelist</Forms.FormTitle>
                <ModalCloseButton onClick={modalProps.onClose} />
            </ModalHeader>
            <ModalContent className="selfbot-modal-content">
                <div className="selfbot-friends-input-container">
                    <TextInput
                        placeholder="Enter User ID"
                        value={newFriendId}
                        onChange={setNewFriendId}
                        className="selfbot-friend-input"
                    />
                    <Button onClick={handleAddFriend} disabled={!newFriendId}>
                        Add
                    </Button>
                </div>

                <div className="selfbot-section-divider" />

                {vcUsers.length > 0 && (
                    <>
                        <Forms.FormTitle tag="h5" className="selfbot-section-title">Users in Voice</Forms.FormTitle>
                        <div className="selfbot-friends-list" style={{ maxHeight: "150px", marginBottom: "20px" }}>
                            {vcUsers.map(userId => {
                                // Skip if already friend
                                if (settingsManager.isFriend(userId)) return null;

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
                                            color={Button.Colors.GREEN}
                                            size={Button.Sizes.SMALL}
                                            onClick={() => handleAddFriendFromId(userId)}
                                            className="selfbot-friend-add-btn"
                                        >
                                            Add
                                        </Button>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="selfbot-section-divider" />
                    </>
                )}

                <Forms.FormTitle tag="h5" className="selfbot-section-title">Friends List</Forms.FormTitle>
                <div className="selfbot-friends-list">
                    {friends.length === 0 ? (
                        <div className="selfbot-empty-state">No friends added</div>
                    ) : (
                        friends.map(friend => (
                            <FriendItem key={friend.id} friend={friend} onRemove={handleRemoveFriend} onToggleAutoPull={handleToggleAutoPull} />
                        ))
                    )}
                </div>
            </ModalContent>
        </ModalRoot>
    );
}

export function openFriendsModal() {
    openModal(props => <FriendsModal modalProps={props} />);
}
