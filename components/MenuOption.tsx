/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "../style.css";

import { ReactDOM, useEffect, useRef, useState } from "@webpack/common";

export interface MenuOptionProps {
    icon: React.ReactNode;
    label: string;
    description?: string;
    onClick?: () => void;
    toggled?: boolean;
    danger?: boolean;
    highlight?: boolean;
}

export function MenuOption({ icon, label, description, onClick, toggled, danger, highlight }: MenuOptionProps) {
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
        <div
            className={`selfbot-menu-option
                ${danger ? "selfbot-danger" : ""}
                ${toggled ? "selfbot-active" : ""}
                ${highlight ? "selfbot-highlight" : ""}
            `}
            onClick={onClick}
            role="button"
            tabIndex={0}
        >
            <div
                ref={iconRef}
                className="selfbot-option-icon"
                onMouseEnter={() => description && setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
            >
                {icon}
            </div>
            {description && showTooltip && ReactDOM.createPortal(
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
                    {description}
                </div>,
                document.body
            )}
            <span className="selfbot-option-label">{label}</span>
            <div className="selfbot-option-actions">
                {toggled !== undefined ? (
                    <div className={`selfbot-toggle ${toggled ? "selfbot-toggle-on" : ""}`}>
                        <div className="selfbot-toggle-slider" />
                    </div>
                ) : (
                    <div className="selfbot-arrow-btn">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
                        </svg>
                    </div>
                )}
            </div>
        </div>
    );
}
