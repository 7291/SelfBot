/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { settings } from "../utils/settings";

export function SelfBotIcon({ className }: { className?: string; }) {
    const customIconRaw = settings.store.customIcon;
    const paths: any[] = [];

    if (customIconRaw) {
        // Regex to match path components in the raw minified string
        // Looks for ("path", { ... }) pattern
        const pathRegex = /\("path",\s*\{([^}]+)\}/g;
        let match;
        while ((match = pathRegex.exec(customIconRaw)) !== null) {
            const propsStr = match[1];
            const dMatch = propsStr.match(/(?:d|["']d["'])\s*:\s*["']([^"']+)["']/);
            // In minified code, d might be the only thing, or mixed with others

            if (dMatch) {
                const d = dMatch[1];
                const fillRuleMatch = propsStr.match(/(?:fillRule|["']fillRule["'])\s*:\s*["']([^"']+)["']/);
                const clipRuleMatch = propsStr.match(/(?:clipRule|["']clipRule["'])\s*:\s*["']([^"']+)["']/);

                paths.push(
                    <path
                        key={paths.length}
                        d={d}
                        fillRule={fillRuleMatch ? (fillRuleMatch[1] as any) : undefined}
                        clipRule={clipRuleMatch ? (clipRuleMatch[1] as any) : undefined}
                    />
                );
            }
        }
    }

    if (paths.length > 0) {
        return (
            <svg
                className={className}
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
            >
                {paths}
            </svg>
        );
    }

    return (
        <svg
            className={className}
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="currentColor"
        >
            <path fill="none" d="M0 0h24v24H0z" />
            <path d="M4 5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v.18a1 1 0 1 0 2 0V5a3 3 0 0 0-3-3H5a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h.18a1 1 0 1 0 0-2H5a1 1 0 0 1-1-1V5Z" />
            <path fillRule="evenodd" clipRule="evenodd" d="M8 11a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-8a3 3 0 0 1-3-3v-8Zm2 0a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-8Z" />
        </svg>
    );
}
