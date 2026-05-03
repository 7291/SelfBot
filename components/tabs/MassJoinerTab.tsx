/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { MassJoinerPage } from "../MassJoinerPage";

export function MassJoinerTab() {
    // Embed MassJoinerPage — onBack is a no-op since there's no separate page to return to
    return <MassJoinerPage onBack={() => {}} />;
}
