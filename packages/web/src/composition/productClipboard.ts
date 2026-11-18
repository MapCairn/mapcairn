// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { ClipboardPort } from "@mapcairn/core";
import { BrowserClipboard } from "../adapters/clipboard/BrowserClipboard";

/**
 * The product page's clipboard, for its copy button. It is built on its own,
 * not through `createServices`, so the product page loads no map code.
 */
export function createProductClipboard(): ClipboardPort {
  return new BrowserClipboard();
}
