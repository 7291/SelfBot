/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "../style.css";

import { useEffect, useState } from "@webpack/common";

export function InitializingOverlay({ onComplete }: { onComplete: () => void; }) {
    const [lines, setLines] = useState<string[]>([]);
    const initLines = [
        "> Connecting to Discord API...",
        "> Authenticating session...",
        "> Loading modules...",
        "> Injecting patches...",
        "> SelfBot ready."
    ];

    useEffect(() => {
        let i = 0;
        const interval = setInterval(() => {
            if (i < initLines.length) {
                setLines(prev => [...prev, initLines[i]]);
                i++;
            } else {
                clearInterval(interval);
                setTimeout(onComplete, 400);
            }
        }, 300);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="selfbot-init-overlay">
            <div className="selfbot-init-terminal">
                <div className="selfbot-init-header">
                    <span className="selfbot-init-dot red" />
                    <span className="selfbot-init-dot yellow" />
                    <span className="selfbot-init-dot green" />
                    <span className="selfbot-init-title">SelfBot v1.0</span>
                </div>
                <div className="selfbot-init-content">
                    {lines.map((line, idx) => (
                        <div key={idx} className={`selfbot-init-line ${idx === lines.length - 1 ? "typing" : ""}`}>
                            {line}
                        </div>
                    ))}
                    {lines.length < initLines.length && (
                        <span className="selfbot-init-cursor">█</span>
                    )}
                </div>
            </div>
        </div>
    );
}
