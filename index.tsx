/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { UserAreaButtonFactory } from "@api/UserArea";
import ErrorBoundary from "@components/ErrorBoundary";
import { classes } from "@utils/misc";
import definePlugin from "@utils/types";
import { Channel, User } from "@vencord/discord-types";
import { findComponentByCodeLazy } from "@webpack";
import { Menu, React, showToast, Toasts, UserStore } from "@webpack/common";

import { SelfBotButton } from "./components/SelfBotButton";
import { SelfBotIcon } from "./components/SelfBotIcon";
import { prefetchUserProfile } from "./components/UserProfileCard";
import { accountManager } from "./utils/accountManagerUtils";
import { handleVoiceStateUpdateAutoDeafenTarget, startAutoDeafenTarget, stopAutoDeafenTarget } from "./utils/autoDeafenTargetUtils";
import { cleanupDeafen as cleanupAutoDeafen, handleVoiceStateUpdateDeafen, startAutoDeafen } from "./utils/autoDeafenUtils";
import { handleVoiceStateUpdateAutoDisconnectTarget, startAutoDisconnectTarget, stopAutoDisconnectTarget } from "./utils/autoDisconnectTargetUtils";
import { handleVoiceStateUpdateAutoDisconnect, startAutoDisconnect, stopAutoDisconnect } from "./utils/autoDisconnectUtils";
import { handleVoiceStateUpdateAutoElevatorTarget, startAutoElevatorTarget, stopAutoElevatorTarget } from "./utils/autoElevatorTargetUtils";
import { handleVoiceStateUpdateAutoElevator, startAutoElevator, stopAutoElevator } from "./utils/autoElevatorUtils";
import { handleVoiceStateUpdateAutoFuckAll, startAutoFuckAll, stopAutoFuckAll } from "./utils/autoFuckAllUtils";
import { handleVoiceStateUpdateAutoMuteTarget, startAutoMuteTarget, stopAutoMuteTarget } from "./utils/autoMuteTargetUtils";
import { cleanup as cleanupAutoMute, handleVoiceStateUpdate, startAutoMute } from "./utils/autoMuteUtils";
import { handleVoiceStateUpdateAutoPullTarget, startAutoPullTarget, stopAutoPullTarget } from "./utils/autoPullTargetUtils";
import { handleVoiceStateUpdateAutoPull, startAutoPull } from "./utils/autoPullUtils";
import { cleanupUndeafen as cleanupAutoUndeafen, handleVoiceStateUpdateUndeafen, startAutoUndeafen } from "./utils/autoUndeafenUtils";
import { cleanupUnmute as cleanupAutoUnmute, handleVoiceStateUpdateUnmute, startAutoUnmute } from "./utils/autoUnmuteUtils";
import { handleVoiceStateUpdateVoiceStalker } from "./utils/autoVoiceStalkerUtils";
import { FakeState } from "./utils/fakeStateUtils";
import { followPullIntegration } from "./utils/followPullIntegration";
import { followUser, handleFollowUserVoiceStateUpdates } from "./utils/followUser";
import { handleVoiceStateUpdateMassJoiner } from "./utils/massJoinerAutoJoinUtils";
import { handleMessageMirror } from "./utils/messageMirrorUtils";
import { handleProtectionVoiceChannelSelect, handleProtectionVoiceStateUpdate, setAntiDisconnectProtection, setCameraProtection, setDeafenProtection, setMuteProtection } from "./utils/protectionUtils";
import { handleReactionSpeller } from "./utils/reactionSpellerUtils";
import { settings } from "./utils/settings";
import { settingsManager } from "./utils/settingsManager";

const OWNER_ID = "1159205268442337413";
const SECOND_OWNER_ID = "1448796782342570089";

// HeaderBar icon component
const HeaderBarIcon = findComponentByCodeLazy(".HEADER_BAR_BADGE_TOP:", '.iconBadge,"top"');

interface BaseIconProps extends IconProps {
    viewBox: string;
}

interface IconProps extends React.SVGProps<SVGSVGElement> {
    className?: string;
    height?: string | number;
    width?: string | number;
}

function Icon({
    height = 24,
    width = 24,
    className,
    children,
    viewBox,
    ...svgProps
}: React.PropsWithChildren<BaseIconProps>) {
    return (
        <svg
            className={classes(className, "vc-icon")}
            role="img"
            width={width}
            height={height}
            viewBox={viewBox}
            {...svgProps}
        >
            {children}
        </svg>
    );
}

// Pull Me Here icon
function PullIcon(props: IconProps) {
    return (
        <Icon {...props} viewBox="0 0 24 24">
            <path
                fill="currentColor"
                d="M16.32 14.72a1 1 0 0 1 0-1.41l2.51-2.51a3.98 3.98 0 0 0-5.62-5.63l-2.52 2.51a1 1 0 0 1-1.41-1.41l2.52-2.52a5.98 5.98 0 0 1 8.45 8.46l-2.52 2.51a1 1 0 0 1-1.41 0ZM7.68 9.29a1 1 0 0 1 0 1.41l-2.52 2.51a3.98 3.98 0 1 0 5.63 5.63l2.51-2.52a1 1 0 0 1 1.42 1.42l-2.52 2.51a5.98 5.98 0 0 1-8.45-8.45l2.51-2.51a1 1 0 0 1 1.42 0Z"
            />
            <path fill="currentColor" d="M14.7 10.7a1 1 0 0 0-1.4-1.4l-4 4a1 1 0 1 0 1.4 1.4l4-4Z" />
        </Icon>
    );
}

// Follow User icons
function FollowIcon(props: IconProps) {
    return (
        <Icon {...props} className={classes(props.className, "vc-follow-icon")} viewBox="0 -960 960 960">
            <path
                fill="currentColor"
                d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Zm0-108q96-86 158-147.5t98-107q36-45.5 50-81t14-70.5q0-60-40-100t-100-40q-47 0-87 26.5T518-680h-76q-15-41-55-67.5T300-774q-60 0-100 40t-40 100q0 35 14 70.5t50 81q36 45.5 98 107T480-228Zm0-273Z"
            />
        </Icon>
    );
}

function UnfollowIcon(props: IconProps) {
    return (
        <Icon {...props} className={classes(props.className, "vc-unfollow-icon")} viewBox="0 -960 960 960">
            <path
                fill="currentColor"
                d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Z"
            />
        </Icon>
    );
}

// Voice Channel Context Menu - adds "Pull Me Here" option
interface ChannelContextProps {
    channel: Channel;
}

const VoiceChannelContext: NavContextMenuPatchCallback = (children, { channel }: ChannelContextProps) => {
    // Only show for voice channels (type 2 = voice, type 13 = stage)
    if (!channel || (channel.type !== 2 && channel.type !== 13)) return;

    const activeAccount = accountManager.getActiveAccount();
    if (!activeAccount?.token) return; // Only show if alt account is configured

    const currentUserId = UserStore.getCurrentUser()?.id;
    if (!currentUserId) return;

    const guildId = channel.guild_id;
    if (!guildId) return; // Only works in guilds

    children.push(
        <Menu.MenuSeparator />,
        <Menu.MenuItem
            id="selfbot-pull-here"
            label="Pull Me Here"
            action={async () => {
                try {
                    showToast("Pulling you to channel...", Toasts.Type.MESSAGE);

                    // Use followPullIntegration which auto-joins if not in a call
                    const success = await followPullIntegration.pullMeToChannel(channel.id);

                    if (success) {
                        showToast("Pulled to channel successfully!", Toasts.Type.SUCCESS);
                    } else {
                        showToast("Failed to pull. Alt account may lack permissions.", Toasts.Type.FAILURE);
                    }
                } catch (e) {
                    showToast("Error pulling to channel", Toasts.Type.FAILURE);
                }
            }}
            icon={PullIcon}
        />
    );
};

// User Context Menu - adds "Follow User" option for ANY user
interface UserContextProps {
    channel?: Channel;
    guildId?: string;
    user: User;
}

const UserContextMenuPatch: NavContextMenuPatchCallback = (children, { user }: UserContextProps) => {
    if (!user || user.id === UserStore.getCurrentUser()?.id) return;

    const isFollowed = followUser.getFollowedUserId() === user.id;
    const label = isFollowed ? "Unfollow User" : "Follow User";
    const icon = isFollowed ? UnfollowIcon : FollowIcon;

    children.splice(-1, 0,
        <Menu.MenuGroup>
            <Menu.MenuItem
                id="selfbot-follow-user"
                label={label}
                action={() => followUser.toggleFollow(user.id)}
                icon={icon}
            />
        </Menu.MenuGroup>
    );
};

// Follow Indicator Component for toolbar
function FollowIndicator() {
    // Use useState to force re-renders when following changes
    const [, forceUpdate] = React.useReducer(x => x + 1, 0);

    // Update every second to check follow status
    React.useEffect(() => {
        const interval = setInterval(() => forceUpdate(), 1000);
        return () => clearInterval(interval);
    }, []);

    // Get followed user from followUser module
    const followedUserId = followUser.getFollowedUserId();

    if (!followedUserId) return null;

    const user = UserStore.getUser(followedUserId);

    return (
        <HeaderBarIcon
            tooltip={`Following ${user?.username || followedUserId} (click to trigger, right-click to unfollow)`}
            icon={UnfollowIcon}
            onClick={() => {
                followUser.triggerFollow();
            }}
            onContextMenu={() => {
                followUser.stopFollowing();
                showToast("Stopped following", Toasts.Type.MESSAGE);
            }}
        />
    );
}

const SelfBotUserAreaButton: UserAreaButtonFactory = props => <SelfBotButton {...props} />;

export default definePlugin({
    name: "Umbral Selfbot",
    description: "Umbral Selfbot is a specialized utility for the Umbral community, featuring advanced voice automation, account switching, and powerful selfbot controls.",
    authors: [
        { name: "7gif", id: 1159205268442337413n },
        { name: "Plugg", id: 1448796782342570089n }
    ],
    settings,

    patches: [
        // Fake state patch
        {
            find: "}voiceStateUpdate(",
            replacement: {
                match: /self_mute:([^,]+),self_deaf:([^,]+),self_video:([^,]+)/,
                replace: "self_mute:$self.toggleFake($1, 'mute'),self_deaf:$self.toggleFake($2, 'deaf'),self_video:$self.toggleFake($3, 'video'),self_stream:$self.toggleFake(false, 'stream')"
            }
        },
        // Add Follow Indicator to toolbar
        {
            find: ".controlButtonWrapper,",
            replacement: {
                match: /(function \i\(\i\){)(.{1,200}toolbar.{1,100}mobileToolbar)/,
                replace: "$1$self.addIconToToolBar(arguments[0]);$2"
            }
        }
    ],

    userAreaButton: {
        icon: SelfBotIcon,
        render: SelfBotUserAreaButton
    },

    contextMenus: {
        "channel-context": VoiceChannelContext,
        "user-context": UserContextMenuPatch,
        "user-profile-actions": UserContextMenuPatch,
        "user-profile-overflow-menu": UserContextMenuPatch,
        "gdm-context": UserContextMenuPatch
    },

    toggleFake: FakeState.shouldApplyFakeState,

    addIconToToolBar(e: { toolbar: React.ReactNode[] | React.ReactNode; }) {
        if (Array.isArray(e.toolbar)) {
            return e.toolbar.unshift(
                <ErrorBoundary noop={true} key="selfbot-follow-indicator">
                    <FollowIndicator />
                </ErrorBoundary>
            );
        }

        e.toolbar = [
            <ErrorBoundary noop={true} key="selfbot-follow-indicator">
                <FollowIndicator />
            </ErrorBoundary>,
            e.toolbar,
        ];
    },

    flux: {
        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: Array<{ userId: string; channelId?: string; oldChannelId?: string; mute?: boolean; deaf?: boolean; selfVideo?: boolean; suppress?: boolean; guildId?: string; }>; }) {
            handleVoiceStateUpdate(voiceStates);
            handleVoiceStateUpdateDeafen(voiceStates);
            handleVoiceStateUpdateUnmute(voiceStates);
            handleVoiceStateUpdateUndeafen(voiceStates);
            handleVoiceStateUpdateAutoPull(voiceStates);
            handleVoiceStateUpdateAutoMuteTarget(voiceStates);
            handleVoiceStateUpdateAutoDeafenTarget(voiceStates);
            handleVoiceStateUpdateAutoPullTarget(voiceStates);
            handleVoiceStateUpdateAutoDisconnect(voiceStates);
            handleVoiceStateUpdateAutoDisconnectTarget(voiceStates);
            handleVoiceStateUpdateAutoElevator(voiceStates);
            handleVoiceStateUpdateAutoElevatorTarget(voiceStates);
            handleVoiceStateUpdateAutoFuckAll(voiceStates);
            handleVoiceStateUpdateVoiceStalker(voiceStates);
            handleVoiceStateUpdateMassJoiner(voiceStates);
            handleProtectionVoiceStateUpdate(voiceStates);

            // Handle follow user voice state updates
            handleFollowUserVoiceStateUpdates(voiceStates as any);

            // Handle follow pull - monitor if followed user moves to a full channel
            followPullIntegration.handleVoiceStateForFollowPull(voiceStates);
        },
        MESSAGE_CREATE({ message }: { message: any; }) {
            handleMessageMirror(message);
            handleReactionSpeller(message);
        },

        VOICE_CHANNEL_SELECT(args: { guildId: string | null; channelId: string | null; }) {
            handleProtectionVoiceChannelSelect(args);
        },

        // Auto-save account when Discord connects/switches user
        CONNECTION_OPEN() {
            // Delay to ensure UserStore is populated
            setTimeout(() => {
                accountManager.saveCurrentAccount(true);
                console.log("[SelfBot] Auto-saved current account after connection");
            }, 2000);
        }
    },

    start() {
        // Pre-fetch owner profiles
        prefetchUserProfile(OWNER_ID);
        prefetchUserProfile(SECOND_OWNER_ID);

        // Auto-save current account to history
        setTimeout(() => accountManager.saveCurrentAccount(true), 2000);

        // Restore settings
        const { toggles } = settingsManager.getSettings();

        // Restore Fake State (module level state)
        if (toggles.fakeMute) FakeState.toggleFakeMute(true);
        if (toggles.fakeDeafen) FakeState.toggleFakeDeafen(true);
        if (toggles.fakeVideo) FakeState.toggleFakeVideo(true);

        // Restore Protections
        setMuteProtection(toggles.muteProtection);
        setDeafenProtection(toggles.deafenProtection);
        setCameraProtection(toggles.cameraProtection);
        setAntiDisconnectProtection(toggles.antiDisconnectProtection);

        // Start follow pull monitor if enabled
        if (toggles.followPullAssist) {
            followPullIntegration.startFollowPullMonitor();
        }

        // Restore Auto Features
        // We delay slightly to ensure we have connection/permissions if immediate
        setTimeout(() => {
            if (toggles.autoMute) startAutoMute();
            if (toggles.autoDeafen) startAutoDeafen();
            if (toggles.autoUnmute) startAutoUnmute();
            if (toggles.autoUndeafen) startAutoUndeafen();
            if (toggles.autoPull) startAutoPull();
            if (toggles.autoMuteTarget) startAutoMuteTarget();
            if (toggles.autoDeafenTarget) startAutoDeafenTarget();
            if (toggles.autoPullTarget) startAutoPullTarget();
            if (toggles.autoDisconnectTarget) startAutoDisconnectTarget();
            if (toggles.autoElevatorTarget) startAutoElevatorTarget();
            if (toggles.autoDisconnect) startAutoDisconnect();
            if (toggles.autoElevator) startAutoElevator();
            if (toggles.autoElevator) startAutoElevator();
            if (toggles.autoFuckAll) startAutoFuckAll();
        }, 1000);
    },

    stop() {
        cleanupAutoMute();
        cleanupAutoDeafen();
        cleanupAutoUnmute();
        cleanupAutoUndeafen();
        stopAutoMuteTarget();
        stopAutoDeafenTarget();
        stopAutoPullTarget();
        stopAutoDisconnectTarget();
        stopAutoElevatorTarget();
        stopAutoDisconnect();
        stopAutoElevator();
        stopAutoElevator();
        stopAutoFuckAll();
        followPullIntegration.stopFollowPullMonitor();
        // protections, fake state, etc don't strictly need cleanup if they are just flags
    }
});
