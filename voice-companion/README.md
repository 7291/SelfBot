# Voice Companion for Umbral Selfbot

This companion script enables **Audio Mirroring** for the Mass Joiner feature. It runs outside of the Discord client (as a standard Node.js application) to bypass browser sandbox limitations.

## Setup

1.  **Install Node.js**: Ensure you have Node.js installed on your computer.
2.  **Open Terminal**: Open a terminal in this folder (`voice-companion`).
3.  **Install Dependencies**:
    ```bash
    npm install
    ```

## Usage

1.  **Start the Server**:
    ```bash
    node index.js
    ```
    You should see `✅ Server listening on ws://localhost:8999`.

2.  **Use Mass Joiner**:
    - Go to Equicord -> Mass Joiner.
    - The UI should detect the companion automatically.
    - When you click "Join All", the companion will handle the connections and stream your microphone to all accounts.

## Troubleshooting

-   **Microphone**: Ensure your default system microphone is set correctly in Windows Sound Settings, as the script uses the default device.
-   **Dependencies**: If `npm install` fails on `sodium-native` or `mic`, ensure you have build tools installed or try waiting a moment.
