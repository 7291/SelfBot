/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "../style.css";

import { ReactDOM, useEffect, useRef, useState } from "@webpack/common";

export function InfoTooltip({ text }: { text: string; }) {
    const iconRef = useRef<HTMLDivElement>(null);
    const [showTooltip, setShowTooltip] = useState(false);
    const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });

    useEffect(() => {
        if (showTooltip && iconRef.current) {
            const rect = iconRef.current.getBoundingClientRect();
            setTooltipPos({
                top: rect.top - 8,
                left: rect.left + rect.width / 2
            });
        }
    }, [showTooltip]);

    return (
        <>
            <div
                ref={iconRef}
                className="selfbot-info-icon"
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
            >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
                </svg>
            </div>
            {showTooltip && ReactDOM.createPortal(
                <div
                    className="selfbot-portal-tooltip"
                    style={{
                        position: "fixed",
                        top: tooltipPos.top,
                        left: tooltipPos.left,
                        transform: "translate(-50%, -100%)",
                        zIndex: 2147483647
                    }}
                >
                    {text}
                </div>,
                document.body
            )}
        </>
    );
}
