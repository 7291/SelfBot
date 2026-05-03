/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const WebSocket = require("ws");
const { Client } = require("discord.js-selfbot-v13");
const { joinVoiceChannel, createAudioPlayer, createAudioResource, StreamType, AudioPlayerStatus, VoiceConnectionStatus, NoSubscriberBehavior } = require("@discordjs/voice");
const { Streamer, prepareStream, playStream, Utils } = require("@dank074/discord-video-stream");
const { spawn } = require("child_process");
const chalk = require("chalk");
const fs = require("fs");
const path = require("path");

// MONKEY PATCH to fix discord.js-selfbot-v13 crash on empty friend_source_flags
try {
    const ClientUserSettingManager = require("discord.js-selfbot-v13/src/managers/ClientUserSettingManager");
    const originalPatch = ClientUserSettingManager.prototype._patch;
    ClientUserSettingManager.prototype._patch = function (data) {
        if (data && !data.friend_source_flags) {
            data.friend_source_flags = { all: true }; // Default fallback
        }
        return originalPatch.call(this, data);
    };
} catch (e) {
    console.warn("Failed to patch ClientUserSettingManager:", e);
}

// Configuration
const PORT = 8999;
const CONFIG_FILE = path.join(__dirname, "config.json");

// State
let connectedClients = 0;
const activeBots = new Map(); // token -> { client, connection }
const activeVideoStreamers = new Map(); // token -> { streamer, command, playing, guildId, channelId }
let ffmpegProcess = null;
let audioStream = null;
let wss = null; // Global WebSocket Server reference

// Audio State
let currentAudioDevice = null;
let isMicEnabled = false;

// Persistence
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
        }
    } catch (e) { console.error("Error loading config:", e); }
    return {};
}

function saveConfig(data) {
    try {
        const current = loadConfig();
        const merged = { ...current, ...data };
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2));
    } catch (e) { console.error("Error saving config:", e); }
}

const config = loadConfig();

// Video State
let currentVideoDevice = config.lastVideoDevice || null;
let cameraEnabled = false;

function updateStatus() {
    console.log(chalk.gray(`[Status] Active bots: ${activeBots.size}`));
    if (wss) {
        const msg = JSON.stringify({ op: "status", connected: activeBots.size });
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(msg);
            }
        });
    }
}

// Send device list and current selection to specific client or all
function sendDeviceList(ws = null) {
    getAudioDevices().then(devices => {
        const msg = JSON.stringify({
            op: "device_list",
            devices,
            currentDevice: currentAudioDevice,
            micEnabled: isMicEnabled
        });

        if (ws) {
            ws.send(msg);
        } else if (wss) {
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(msg);
                }
            });
        }
    });
}

// Global Audio Player
const audioPlayer = createAudioPlayer({
    behaviors: {
        noSubscriber: NoSubscriberBehavior.Play // Keep playing even if no bots are connected
    }
});

audioPlayer.on("error", error => {
    // console.error(chalk.red('[Audio] Player Error:', error.message)); // Suppress premature close noise
});

// Start/Restart Audio Stream
function startAudioStream() {
    // Kill existing ffmpeg
    if (ffmpegProcess) {
        ffmpegProcess.kill("SIGINT");
        ffmpegProcess = null;
    }

    // Stop player if disabling
    if (!currentAudioDevice || !isMicEnabled) {
        audioPlayer.stop();
        if (audioStream) {
            audioStream = null;
        }
        return;
    }

    console.log(chalk.blue(`[Audio] Spawning FFmpeg for: "${currentAudioDevice}"`));

    const args = [
        "-y",
        "-f", "dshow",
        "-i", currentAudioDevice,
        "-ac", "2",
        "-ar", "48000",
        "-f", "s16le",
        "-acodec", "pcm_s16le",
        "-bufsize", "4096",
        "-" // Output to stdout
    ];

    ffmpegProcess = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });

    ffmpegProcess.stderr.on("data", data => {
        // console.log(chalk.gray(`[FFmpeg] ${data}`));
    });

    ffmpegProcess.on("close", code => {
        // if (code !== 0 && code !== null) console.log(chalk.yellow(`[FFmpeg] Exited with code ${code}`));
        ffmpegProcess = null;
    });

    // Create audio resource from FFmpeg stdout
    audioStream = createAudioResource(ffmpegProcess.stdout, {
        inputType: StreamType.Raw,
        inlineVolume: false
    });

    audioPlayer.play(audioStream);
    console.log(chalk.green("[Audio] Stream active & playing"));
}

// Dynamic Device Name (Process Arg -> Config -> Default)
currentAudioDevice = process.argv[2] ?
    (process.argv[2].startsWith("audio=") ? process.argv[2] : `audio=${process.argv[2]}`)
    : (config.lastDevice || "audio=Microphone (Realtek(R) Audio)");

console.log(chalk.cyan("🎤 Equicord Voice Companion Starting..."));
console.log(chalk.gray(`Initial Device: "${currentAudioDevice}"`));

// -----------------------------------------------------------------------------
// HELPER: LIST DEVICES
// -----------------------------------------------------------------------------

function getAudioDevices() {
    return new Promise(resolve => {
        const p = spawn("ffmpeg", ["-list_devices", "true", "-f", "dshow", "-i", "dummy"], { stdio: ["ignore", "pipe", "pipe"] });
        let output = "";

        p.stderr.on("data", d => { output += d.toString(); });

        p.on("close", () => {
            const lines = output.split("\n");
            const devices = [];
            let inAudioSection = false;

            for (const line of lines) {
                // Toggle sections
                if (line.includes("DirectShow audio devices")) {
                    inAudioSection = true;
                    continue;
                }
                if (line.includes("DirectShow video devices")) {
                    inAudioSection = false;
                    continue;
                }

                if (inAudioSection) {
                    const match = line.match(/"([^"]+)"/);
                    if (match && match[1]) {
                        const name = match[1];
                        if (!devices.includes(name)) {
                            devices.push(name);
                        }
                    }
                }
            }

            // Fallback loose parsing
            if (devices.length === 0) {
                console.log(chalk.gray("[Audio] Debug: Strict parsing found 0 devices. Trying loose parsing..."));
                const allMatches = output.matchAll(/"([^"]+)"/g);
                for (const m of allMatches) {
                    if (m[1] !== "dshow" && m[1] !== "dummy") {
                        if (!devices.includes(m[1])) devices.push(m[1]);
                    }
                }
            }

            console.log(chalk.gray(`[Audio] Found ${devices.length} devices.`));
            resolve(devices);
        });
    });
}

function listDevicesCLI() {
    getAudioDevices().then(devices => {
        console.log(chalk.yellow("\nAVAILABLE AUDIO DEVICES:"));
        devices.forEach(d => console.log(chalk.white(` - "${d}"`)));
        console.log("");
    });
}

if (process.argv[2] === "list") {
    listDevicesCLI();
    setTimeout(() => process.exit(0), 4000);
}

// -----------------------------------------------------------------------------
// VIDEO DEVICE DETECTION
// -----------------------------------------------------------------------------

function getVideoDevices() {
    return new Promise(resolve => {
        const p = spawn("ffmpeg", ["-list_devices", "true", "-f", "dshow", "-i", "dummy"], { stdio: ["ignore", "pipe", "pipe"] });
        let output = "";

        p.stderr.on("data", d => { output += d.toString(); });

        p.on("close", () => {
            const lines = output.split("\n");
            const devices = [];

            for (const line of lines) {
                if (line.toLowerCase().includes("alternative name")) continue;
                if (line.includes("(video)")) {
                    const match = line.match(/"([^"]+)"/);
                    if (match && match[1]) {
                        const name = match[1];
                        if (!devices.includes(name)) {
                            devices.push(name);
                            console.log(chalk.green(`[Video] Found camera: "${name}"`));
                        }
                    }
                }
            }

            console.log(chalk.gray(`[Video] Total: ${devices.length} cameras found.`));
            resolve(devices);
        });
    });
}

// Send video device list and status to all connected clients
function broadcastVideoStatus() {
    if (wss) {
        const msg = JSON.stringify({
            op: "video_status",
            cameraEnabled,
            currentVideoDevice
        });
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(msg);
            }
        });
    }
}

// -----------------------------------------------------------------------------
// VIDEO STREAMING
// -----------------------------------------------------------------------------

// Start camera stream for a single bot
async function startCameraStream(token, guildId, channelId) {
    if (!currentVideoDevice || !cameraEnabled) return;

    // Check if already streaming
    if (activeVideoStreamers.has(token)) {
        console.log(chalk.yellow("[Video] Already streaming for this token"));
        return;
    }

    try {
        const streamer = new Streamer(new Client({ checkUpdate: false }));

        await streamer.client.login(token);
        console.log(chalk.blue(`[Video] Streamer logged in: ${streamer.client.user.tag}`));

        // Join voice channel with video support
        await streamer.joinVoice(guildId, channelId);
        console.log(chalk.green("[Video] Joined voice channel for video streaming"));

        // Signal that we're turning on camera
        if (typeof streamer.signalVideo === "function") {
            streamer.signalVideo(guildId, channelId, true);
        } else {
            streamer.client.ws.broadcast({
                op: 4,
                d: {
                    guild_id: guildId,
                    channel_id: channelId,
                    self_mute: false,
                    self_deaf: false,
                    self_video: true
                }
            });
        }

        console.log(chalk.cyan(`[Video] Spawning FFmpeg manually for: "${currentVideoDevice}"`));

        // Manual FFmpeg spawn
        const args = [
            "-f", "dshow",
            "-rtbufsize", "100M",
            "-i", `video=${currentVideoDevice}`,
        ];

        // If mic is enabled and device selected, mix it in to avoid audio silence
        if (isMicEnabled && currentAudioDevice) {
            console.log(chalk.cyan(`[Video] Adding audio input (mux): "${currentAudioDevice}"`));
            args.push("-f", "dshow", "-i", currentAudioDevice);
            // Map video from input 0, audio from input 1
            args.push("-map", "0:v", "-map", "1:a");
            // Audio encoding for Discord (Opus) - embedded in MPEGTS
            args.push("-c:a", "libopus", "-b:a", "96k", "-ac", "2", "-ar", "48000");
        } else {
            // Only video map
            args.push("-map", "0:v");
        }

        // Common video encoding
        args.push(
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-tune", "zerolatency",
            "-pix_fmt", "yuv420p",
            "-g", "30",
            "-f", "mpegts", // Use MPEG-TS container for better robustness
            "-" // Output to stdout
        );

        const ffmpegVideo = spawn("ffmpeg", args);

        ffmpegVideo.stderr.on("data", data => {
            // console.log(chalk.gray(`[Video FFmpeg] ${data}`));
        });

        ffmpegVideo.on("close", code => {
            console.log(chalk.yellow(`[Video] FFmpeg exited with code ${code}`));
        });

        // Start playing the stream
        // playStream accepts a Readable Stream (stdout)
        playStream(ffmpegVideo.stdout, streamer, { type: "camera" })
            .then(() => {
                console.log(chalk.yellow(`[Video] Camera stream ended for ${streamer.client.user.tag}`));
                stopCameraStream(token);
            })
            .catch(err => {
                console.error(chalk.red(`[Video] Play error: ${err.message}`));
                stopCameraStream(token);
            });

        activeVideoStreamers.set(token, { streamer, command: ffmpegVideo, playing: true, guildId, channelId });
        console.log(chalk.green(`[Video] Started camera stream: ${currentVideoDevice}`));

    } catch (err) {
        console.error(chalk.red(`[Video] Failed to start stream: ${err.message}`));
    }
}

// Stop camera stream for a single bot
function stopCameraStream(token) {
    const entry = activeVideoStreamers.get(token);
    if (entry) {
        try {
            if (entry.command) entry.command.kill("SIGINT");
            if (entry.streamer) {
                entry.streamer.stopStream();
                entry.streamer.client.destroy();
            }
        } catch (e) { }
        activeVideoStreamers.delete(token);
        console.log(chalk.yellow("[Video] Stopped camera stream"));

        // AUTO-RESTORE AUDIO CONNECTION
        // If we still have a valid mic and channel info, reconnect audio bot
        if (entry.guildId && entry.channelId) {
            console.log(chalk.blue("[Audio] Restoring audio connection..."));

            // Clean up old audio bot reference if it exists (it's dead anyway)
            const oldBot = activeBots.get(token);
            if (oldBot) {
                try { oldBot.client.destroy(); } catch { }
                activeBots.delete(token);
            }

            // Reconnect
            setTimeout(() => connectBot(token, entry.guildId, entry.channelId), 1000);
        }
    }
}

// Stop all camera streams
function stopAllCameraStreams() {
    for (const [token] of activeVideoStreamers) {
        stopCameraStream(token);
    }
}

// Start camera for all connected bots
async function startCameraForAllBots() {
    if (!currentVideoDevice || !cameraEnabled) return;

    // Iterate over activeBots - but wait, activeBots might be empty if we transitioned?
    // activeBots contains the AUDIO connected bots.
    // If we start camera, we transition them to video streamers.

    // We need to copy the map before iterating because startCameraStream might modify it?
    // No, startCameraStream doesn't touch activeBots directly, but stopCameraStream does.

    for (const [token, bot] of activeBots) {
        if (!activeVideoStreamers.has(token)) {
            const guildId = bot.connection?.joinConfig?.guildId;
            const channelId = bot.connection?.joinConfig?.channelId;
            if (guildId && channelId) {
                await startCameraStream(token, guildId, channelId);
            }
        }
    }
}

// -----------------------------------------------------------------------------
// BOT MANAGEMENT
// -----------------------------------------------------------------------------

async function connectBot(token, guildId, channelId) {
    if (activeBots.has(token)) return;
    const client = new Client({ checkUpdate: false });

    // Increase listener limit to avoid warnings with many bots
    client.setMaxListeners(50);

    client.on("ready", async () => {
        console.log(chalk.blue(`[Bot] Login: ${client.user.tag}`));
        try {
            const channel = await client.channels.fetch(channelId);
            if (!channel) return;
            const connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: channel.guild.id,
                adapterCreator: channel.guild.voiceAdapterCreator,
                selfDeaf: false,
                selfMute: false,
                group: client.user.id // distinct connection group
            });

            // Subscribe to the global player
            const subscription = connection.subscribe(audioPlayer);

            if (!subscription) {
                // console.log(chalk.red(`[Bot] ${client.user.tag} failed to subscribe`));
            }

            connection.on(VoiceConnectionStatus.Disconnected, () => {
                console.log(chalk.yellow(`[Bot] ${client.user.tag} disconnected (audio).`));
                try { connection.destroy(); } catch { }
                try { client.destroy(); } catch { }
                activeBots.delete(token);
                updateStatus();
            });

            activeBots.set(token, { client, connection });
            updateStatus();

        } catch (e) {
            console.error(chalk.red(`[Bot] Error connecting ${client.user ? client.user.tag : "unknown"}: ${e.message}`));
            try { client.destroy(); } catch { }
            activeBots.delete(token);
            updateStatus();
        }
    });

    client.login(token).catch(e => {
        console.error(chalk.red(`[Bot] Login Failed for token starting with ${token.substring(0, 5)}...: ${e.message}`));
        activeBots.delete(token);
        updateStatus();
    });
}

function disconnectAllBots() {
    for (const [t, d] of activeBots) {
        try { d.connection.destroy(); } catch { }
        try { d.client.destroy(); } catch { }
    }
    activeBots.clear();
    updateStatus();
}

// -----------------------------------------------------------------------------
// WEBSOCKET SERVER
// -----------------------------------------------------------------------------

if (process.argv[2] !== "list") {
    wss = new WebSocket.Server({ port: PORT });

    wss.on("connection", ws => {
        connectedClients++;
        ws.send(JSON.stringify({ op: "hello", message: "Ready", currentDevice: currentAudioDevice }));

        ws.on("message", async message => {
            try {
                const data = JSON.parse(message);

                if (data.op === "get_devices") {
                    const devices = await getAudioDevices();
                    ws.send(JSON.stringify({ op: "device_list", devices, currentDevice: currentAudioDevice, micEnabled: isMicEnabled }));
                }
                else if (data.op === "set_device") {
                    if (data.device) {
                        console.log(chalk.magenta(`[WS] Switching device to: "${data.device}"`));
                        // Format: needs audio= prefix
                        currentAudioDevice = data.device.startsWith("audio=") ? data.device : `audio=${data.device}`;

                        // Save persistence
                        saveConfig({ lastDevice: currentAudioDevice });

                        // Restart stream if enabled
                        startAudioStream();
                    }
                }
                else if (data.op === "toggle_mic") {
                    isMicEnabled = !!data.value;
                    console.log(chalk.magenta(`[Audio] Mic enabled: ${isMicEnabled}`));
                    startAudioStream();
                    sendDeviceList();
                }
                else if (data.op === "check_permissions") {
                    // Check if accounts can join the channel before actually connecting
                    const results = [];
                    const tokens = data.tokens || [];
                    const { channelId } = data;
                    const { guildId } = data;

                    console.log(chalk.magenta(`[WS] Checking permissions for ${tokens.length} accounts...`));

                    for (const token of tokens) {
                        try {
                            const tempClient = new Client({ checkUpdate: false });
                            await new Promise((resolve, reject) => {
                                tempClient.once("ready", async () => {
                                    try {
                                        const channel = await tempClient.channels.fetch(channelId);
                                        if (!channel) {
                                            results.push({ token, canJoin: false, reason: "Channel not found" });
                                        } else if (!channel.permissionsFor) {
                                            results.push({ token, canJoin: true, reason: "DM/Group call" });
                                        } else {
                                            const perms = channel.permissionsFor(tempClient.user);
                                            const canConnect = perms && perms.has("CONNECT");
                                            results.push({
                                                token,
                                                username: tempClient.user.username,
                                                canJoin: canConnect,
                                                reason: canConnect ? "OK" : "Missing CONNECT permission"
                                            });
                                        }
                                    } catch (e) {
                                        results.push({ token, canJoin: false, reason: e.message });
                                    }
                                    tempClient.destroy();
                                    resolve();
                                });
                                tempClient.once("error", e => {
                                    results.push({ token, canJoin: false, reason: "Login failed" });
                                    reject(e);
                                });
                                tempClient.login(token).catch(e => {
                                    results.push({ token, canJoin: false, reason: "Invalid token" });
                                    resolve();
                                });
                                setTimeout(() => {
                                    tempClient.destroy();
                                    resolve();
                                }, 10000);
                            }).catch(() => { });
                        } catch (e) {
                            results.push({ token, canJoin: false, reason: e.message });
                        }
                    }

                    const canJoinCount = results.filter(r => r.canJoin).length;
                    console.log(chalk.magenta(`[WS] Permission check done: ${canJoinCount}/${tokens.length} can join`));

                    ws.send(JSON.stringify({
                        op: "permission_results",
                        results,
                        canJoinCount,
                        totalCount: tokens.length
                    }));
                }
                else if (data.op === "connect_voice") {
                    // Start audio if enabled
                    startAudioStream();

                    // Connect bots with a small delay
                    setTimeout(() => {
                        if (data.tokens) for (const t of data.tokens) connectBot(t, data.guildId, data.channelId);
                    }, 500);
                }
                else if (data.op === "disconnect_all") {
                    disconnectAllBots();
                    isMicEnabled = false;
                    ws.send(JSON.stringify({ op: "status", connected: 0 }));
                }
                else if (data.op === "connect_account") {
                    const { token, guildId, channelId } = data;
                    if (token && guildId && channelId) {
                        startAudioStream();
                        setTimeout(() => connectBot(token, guildId, channelId), 300);
                        console.log(chalk.cyan("[WS] Connecting single account..."));
                    }
                }
                else if (data.op === "disconnect_account") {
                    const { token } = data;
                    if (token && activeBots.has(token)) {
                        const bot = activeBots.get(token);
                        try { bot.connection.destroy(); } catch { }
                        try { bot.client.destroy(); } catch { }
                        activeBots.delete(token);
                        console.log(chalk.yellow("[WS] Disconnected account"));
                        updateStatus();
                    }
                }
                else if (data.op === "connect_all") {
                    const { tokens, guildId, channelId } = data;
                    if (tokens && guildId && channelId) {
                        startAudioStream();
                        setTimeout(() => {
                            for (const t of tokens) {
                                if (!activeBots.has(t)) {
                                    connectBot(t, guildId, channelId);
                                }
                            }
                        }, 500);
                        console.log(chalk.cyan(`[WS] Connecting ${tokens.length} accounts...`));
                    }
                }
                else if (data.op === "mute_all") {
                    const val = !!data.value;
                    console.log(chalk.magenta(`[WS] Mute All: ${val}`));
                    for (const [token, bot] of activeBots) {
                        try {
                            const { guildId } = bot.connection.joinConfig;
                            const { channelId } = bot.connection.joinConfig;
                            // Send voice state update via gateway
                            bot.client.ws.broadcast({
                                op: 4,
                                d: {
                                    guild_id: guildId,
                                    channel_id: channelId,
                                    self_mute: val,
                                    self_deaf: false
                                }
                            });
                        } catch (e) { console.error(e); }
                    }
                }
                else if (data.op === "deaf_all") {
                    const val = !!data.value;
                    console.log(chalk.magenta(`[WS] Deaf All: ${val}`));
                    for (const [token, bot] of activeBots) {
                        try {
                            const { guildId } = bot.connection.joinConfig;
                            const { channelId } = bot.connection.joinConfig;
                            bot.client.ws.broadcast({
                                op: 4,
                                d: {
                                    guild_id: guildId,
                                    channel_id: channelId,
                                    self_mute: false,
                                    self_deaf: val
                                }
                            });
                        } catch (e) { console.error(e); }
                    }
                }
                else if (data.op === "video_all") {
                    const val = !!data.value;
                    console.log(chalk.magenta(`[WS] Video All: ${val}`));
                    for (const [token, bot] of activeBots) {
                        try {
                            const { guildId } = bot.connection.joinConfig;
                            const { channelId } = bot.connection.joinConfig;
                            bot.client.ws.broadcast({
                                op: 4,
                                d: {
                                    guild_id: guildId,
                                    channel_id: channelId,
                                    self_mute: false,
                                    self_deaf: false,
                                    self_video: val
                                }
                            });
                        } catch (e) { console.error(e); }
                    }
                }
                else if (data.op === "mute_account") {
                    const bot = activeBots.get(data.token);
                    if (bot) {
                        try {
                            const { guildId } = bot.connection.joinConfig;
                            const { channelId } = bot.connection.joinConfig;
                            bot.client.ws.broadcast({
                                op: 4,
                                d: { guild_id: guildId, channel_id: channelId, self_mute: !!data.value, self_deaf: false }
                            });
                            console.log(chalk.magenta(`[WS] Mute Account: ${!!data.value}`));
                        } catch (e) { console.error(e); }
                    }
                }
                else if (data.op === "deaf_account") {
                    const bot = activeBots.get(data.token);
                    if (bot) {
                        try {
                            const { guildId } = bot.connection.joinConfig;
                            const { channelId } = bot.connection.joinConfig;
                            bot.client.ws.broadcast({
                                op: 4,
                                d: { guild_id: guildId, channel_id: channelId, self_mute: false, self_deaf: !!data.value }
                            });
                            console.log(chalk.magenta(`[WS] Deaf Account: ${!!data.value}`));
                        } catch (e) { console.error(e); }
                    }
                }
                else if (data.op === "video_account") {
                    const bot = activeBots.get(data.token);
                    if (bot) {
                        try {
                            const { guildId } = bot.connection.joinConfig;
                            const { channelId } = bot.connection.joinConfig;
                            bot.client.ws.broadcast({
                                op: 4,
                                d: { guild_id: guildId, channel_id: channelId, self_mute: false, self_deaf: false, self_video: !!data.value }
                            });
                            console.log(chalk.magenta(`[WS] Video Account: ${!!data.value}`));
                        } catch (e) { console.error(e); }
                    }
                }
                // ═══════════════════════════════════════════════════════════════
                // VIDEO/CAMERA CONTROL
                // ═══════════════════════════════════════════════════════════════
                else if (data.op === "get_video_devices") {
                    const devices = await getVideoDevices();
                    ws.send(JSON.stringify({
                        op: "video_devices",
                        devices,
                        currentDevice: currentVideoDevice,
                        enabled: cameraEnabled
                    }));
                }
                else if (data.op === "set_video_device") {
                    currentVideoDevice = data.device || null;
                    console.log(chalk.cyan(`[Video] Device set to: "${currentVideoDevice}"`));
                    // Save to config
                    saveConfig({ lastVideoDevice: currentVideoDevice });
                    broadcastVideoStatus();
                }
                else if (data.op === "toggle_camera") {
                    cameraEnabled = !!data.value;
                    console.log(chalk.magenta(`[Video] Camera enabled: ${cameraEnabled}`));

                    if (cameraEnabled && currentVideoDevice) {
                        // Start real video streaming for all connected bots
                        startCameraForAllBots().catch(err => {
                            console.error(chalk.red(`[Video] Failed to start camera for all bots: ${err.message}`));
                        });
                    } else {
                        // Stop all video streams
                        stopAllCameraStreams();
                    }
                    broadcastVideoStatus();
                }
            } catch (e) { }
        });

        ws.on("close", () => connectedClients--);
    });
    console.log(chalk.cyan(`✅ Server listening on ws://localhost:${PORT}`));
}
