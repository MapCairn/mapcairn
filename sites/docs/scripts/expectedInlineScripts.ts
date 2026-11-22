// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/** An inline script the built pages are expected to carry. */
export interface ExpectedInlineScript {
  /** What the script is, for the message when it goes missing. */
  readonly name: string;
  /** Its Content-Security-Policy hash, `sha256-<base64>`, of the text as built. */
  readonly hash: string;
}

/**
 * The inline scripts the built pages may carry, committed by hash: the theme
 * bridge (`src/themeBridge.ts`, minified by the build) and the framework's
 * colour-mode script. `_headers` allows exactly these, and `verifyBuild.ts`
 * fails the build on any other inline script and on one of these that is no
 * longer there. When a framework upgrade or a change to the bridge changes the
 * text, the build says which hash is new; read the script, then replace the
 * hash here.
 */
export const EXPECTED_INLINE_SCRIPTS: readonly ExpectedInlineScript[] = [
  {
    name: "theme bridge",
    hash: "sha256-+UN1Y+Sk6xYbT+L6HN8JfvuyISurt05ASi71uKkkapU=",
  },
  {
    name: "framework colour-mode script",
    hash: "sha256-0xt7rjlfRsoD7aukiSWSNvMBWU159Lh5cl3WNaV1g+w=",
  },
];
