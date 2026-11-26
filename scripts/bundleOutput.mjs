// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/**
 * The ids of the modules that reached the output of a bundler build, from the
 * chunks of its bundle (a stylesheet or other asset names none).
 *
 * @param {Record<string, { type: string, modules?: Record<string, unknown> }>} bundle
 * @returns {string[]} Each id once.
 */
export function moduleIdsOf(bundle) {
  const ids = new Set();
  for (const file of Object.values(bundle)) {
    if (file.type === "chunk") {
      for (const id of Object.keys(file.modules ?? {})) {
        ids.add(id);
      }
    }
  }
  return [...ids];
}

/**
 * The bundle's stylesheet with the engine's own rules in front, so the
 * interface's rules, which come after, win where they meet.
 *
 * @param {string} engineRules The engine's stylesheet.
 * @param {{ type: string, source?: unknown } | undefined} asset The stylesheet asset of the bundle.
 * @param {string} name The stylesheet's file name, for the message.
 * @returns {string}
 * @throws {Error} When the bundle has no stylesheet to merge into.
 */
export function mergedStylesheet(engineRules, asset, name) {
  if (asset === undefined || asset.type !== "asset") {
    throw new Error(
      `The bundle has no ${name} to merge the engine's stylesheet into.`,
    );
  }
  return `${engineRules}\n${String(asset.source)}`;
}

/**
 * A copied script without its closing `//# sourceMappingURL=` line, which
 * names a map the package does not ship.
 *
 * @param {string} text
 * @returns {string}
 */
export function withoutSourceMapComment(text) {
  return text.replace(/\n?\/\/# sourceMappingURL=\S+\s*$/, "\n");
}
