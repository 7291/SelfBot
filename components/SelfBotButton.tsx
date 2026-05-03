/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { UserAreaButton, UserAreaRenderProps } from "@api/UserArea";
import { ReactDOM, useEffect, useRef, useState } from "@webpack/common";

import { SelfBotIcon } from "./SelfBotIcon";
import { SelfBotMenu } from "./SelfBotMenu";

export function SelfBotButton({ iconForeground, hideTooltips, nameplate }: UserAreaRenderProps) {
    const buttonRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);

    const toggleOpen = () => setOpen(!open);
    const close = () => setOpen(false);

    useEffect(() => {
        if (!open) return;

        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            // Don't close if clicking the button or the menu itself
            if (buttonRef.current?.contains(target)) return;
            if (target.closest(".selfbot-menu-container")) return;

            close();
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [open]);

    return (
        <div ref={buttonRef}>
            <UserAreaButton
                onClick={toggleOpen}
                tooltipText={hideTooltips ? undefined : "Open Panel"}
                icon={<SelfBotIcon className={iconForeground} />}
                plated={nameplate != null}
            />
            {open && ReactDOM.createPortal(
                <SelfBotMenu closePopout={close} />,
                document.body
            )}
        </div>
    );
}
