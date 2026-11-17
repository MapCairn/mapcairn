// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/**
 * The most of the screen's height the draw toolbar may take, as a fraction.
 * Half: the idle toolbar is at most 41 percent of a 320 by 568 screen at the
 * default text size, so the default layouts never reach the cap, while at large
 * text the other half stays for the search pill, the end stack and the map. It
 * lives in a file with no styles so the browser tests can read it too.
 */
export const TOOLBAR_MAX_SCREEN_SHARE = 0.5;

/** {@link TOOLBAR_MAX_SCREEN_SHARE} as a CSS length of the dynamic viewport height. */
export const TOOLBAR_MAX_SCREEN_SHARE_CSS = `${TOOLBAR_MAX_SCREEN_SHARE * 100}dvh`;
