// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { DOCUMENT_SCROLL_ATTRIBUTE } from "../global.css";

/**
 * Spread on a full page's scrolling container (the product page, the privacy
 * policy) so the document scrolls instead of the map's fixed frame, and the
 * keyboard scrolls the page from the first key press (see `global.css.ts`).
 */
export const DOCUMENT_SCROLL = { [DOCUMENT_SCROLL_ATTRIBUTE]: "" } as const;
