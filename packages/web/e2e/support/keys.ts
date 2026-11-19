// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/**
 * The key combination that moves focus to the next (or, with `backward`, the
 * previous) focusable element, buttons included.
 *
 * WebKit on macOS leaves buttons and links out of the plain Tab order unless
 * the user turns on "Press Tab to highlight each item"; Option+Tab reaches
 * them. WebKit on Linux and every other engine follow plain Tab.
 */
export function tabKey(browserName: string, backward = false): string {
  const tab = backward ? "Shift+Tab" : "Tab";
  if (browserName === "webkit" && process.platform === "darwin") {
    return `Alt+${tab}`;
  }
  return tab;
}
