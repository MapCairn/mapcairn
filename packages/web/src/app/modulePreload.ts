// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/**
 * What a route exports as `handle` when its page should not preload the
 * app's scripts in the document head. React Router lists every script the
 * page needs as a `modulepreload` link there, and those downloads compete with
 * the stylesheets and font for the first paint. A page that is readable
 * without script (the product page) opts out: the scripts still load, but
 * once the document has been parsed rather than beside the stylesheets.
 */
export interface ModulePreloadHandle {
  readonly modulePreload: false;
}

/** Whether `handle` is a {@link ModulePreloadHandle}. */
function isModulePreloadHandle(handle: unknown): handle is ModulePreloadHandle {
  return (
    typeof handle === "object" &&
    handle !== null &&
    (handle as { readonly modulePreload?: unknown }).modulePreload === false
  );
}

/**
 * Whether the page for `matches` keeps React Router's `modulepreload` links:
 * true unless a matched route's `handle` sets `modulePreload` to `false`.
 */
export function wantsModulePreload(
  matches: ReadonlyArray<{ readonly handle?: unknown }>,
): boolean {
  return !matches.some(({ handle }) => isModulePreloadHandle(handle));
}

const MODULE_PRELOAD_LINK = /<link\b[^>]*\brel="modulepreload"[^>]*>/g;

/**
 * The longest unfinished tag held back between chunks. Real tags are far
 * shorter; the cap only stops a stray `<` in text from holding output back.
 */
const MAX_HELD_TAG_LENGTH = 4096;

/**
 * Splits `text` into the part that is safe to rewrite and a trailing piece
 * that may be the start of a tag whose end has not arrived.
 */
function splitAtOpenTag(text: string): readonly [string, string] {
  const open = text.lastIndexOf("<");
  if (open === -1 || text.includes(">", open)) {
    return [text, ""];
  }
  if (text.length - open > MAX_HELD_TAG_LENGTH) {
    return [text, ""];
  }
  return [text.slice(0, open), text.slice(open)];
}

/**
 * Returns `body` without its `<link rel="modulepreload">` tags, which may be
 * split across chunks. Every other byte passes through unchanged.
 */
export function withoutModulePreloads(
  body: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let held = "";

  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        const [ready, rest] = splitAtOpenTag(
          held + decoder.decode(chunk, { stream: true }),
        );
        held = rest;
        controller.enqueue(
          encoder.encode(ready.replace(MODULE_PRELOAD_LINK, "")),
        );
      },
      flush(controller) {
        controller.enqueue(
          encoder.encode(
            (held + decoder.decode()).replace(MODULE_PRELOAD_LINK, ""),
          ),
        );
      },
    }),
  );
}
