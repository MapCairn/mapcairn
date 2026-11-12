// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { buildThemeBootstrapScript } from "@mapcairn/core";

/**
 * The inline pre-paint theme script that `root.tsx` puts in the head. It is
 * the one place outside the `ThemeSource` adapter that resolves the theme,
 * and it is built by core so it cannot drift from it.
 *
 * @remarks Its SHA-256 is allowed by the content security policy in
 *   `public/_headers` and `constants/securityHeaders.ts`. A test hashes this
 *   exact string and checks both files, so any change here fails until the
 *   hash is updated in both.
 */
export const THEME_BOOTSTRAP_SCRIPT = buildThemeBootstrapScript();
