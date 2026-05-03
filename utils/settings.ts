/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    friends: {
        type: OptionType.CUSTOM,
        description: "Friends list",
        restartNeeded: false,
        hidden: true,
        default: []
    },
    targets: {
        type: OptionType.CUSTOM,
        description: "Targets list",
        restartNeeded: false,
        hidden: true,
        default: []
    },
    badMicLevel: {
        type: OptionType.NUMBER,
        description: "Bad Mic Level",
        restartNeeded: false,
        hidden: true,
        default: 50
    },
    reactionSpellerText: {
        type: OptionType.STRING,
        description: "Reaction Speller Text",
        restartNeeded: false,
        hidden: true,
        default: "LMAO"
    },
    profileBackups: {
        type: OptionType.CUSTOM,
        description: "Profile Backups",
        restartNeeded: false,
        hidden: true,
        default: []
    },
    accounts: {
        type: OptionType.CUSTOM,
        description: "Account History",
        restartNeeded: false,
        hidden: true,
        default: []
    },
    callConfigs: {
        type: OptionType.CUSTOM,
        description: "Call Configurations",
        restartNeeded: false,
        hidden: true,
        default: {}
    },
    toggles: {
        type: OptionType.CUSTOM,
        description: "Feature Toggles",
        restartNeeded: false,
        hidden: true,
        default: {
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
            silentSpeaker: false
        }
    },
    customIcon: {
        type: OptionType.STRING,
        description: "Custom Panel Icon (SVG Path String)",
        restartNeeded: false,
        hidden: true,
        default: ""
    }
});
