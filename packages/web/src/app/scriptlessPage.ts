// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/**
 * What a route exports as `handle` when its page runs no framework script. The
 * document is sent as server-rendered HTML and CSS: `root.tsx` leaves out
 * `<Scripts>` and `<ScrollRestoration>`, and with them the React Router state
 * and the `modulepreload` links, which React Router renders only from
 * `<Scripts>`. Such a page cannot be hydrated, so its links are plain anchors
 * (a client-side navigation to it would show markup that nothing runs), it
 * reports no client errors, and any behaviour it has comes from its own inline
 * scripts, each allowed by a hash in the content security policy. The product
 * page is the one: it reads without script, and every byte of script it did
 * not ship is a byte the audit's first paint did not wait for.
 */
export interface ScriptlessHandle {
  readonly scripts: "none";
}

/** Whether `handle` is a {@link ScriptlessHandle}. */
function isScriptlessHandle(handle: unknown): handle is ScriptlessHandle {
  return (
    typeof handle === "object" &&
    handle !== null &&
    (handle as { readonly scripts?: unknown }).scripts === "none"
  );
}

/**
 * Whether the page for `matches` runs no framework script: true when any
 * matched route, parent or child, sets `handle.scripts` to `"none"`, because
 * the document belongs to the page and not to one route.
 */
export function isScriptless(
  matches: ReadonlyArray<{ readonly handle?: unknown }>,
): boolean {
  return matches.some(({ handle }) => isScriptlessHandle(handle));
}
