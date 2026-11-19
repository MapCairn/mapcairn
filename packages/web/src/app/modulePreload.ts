// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/**
 * What a route exports as `handle` when its page should list the app's
 * scripts for preloading at the end of the document rather than in the head.
 * React Router writes one `modulepreload` link for every script the page needs
 * into the head, where those downloads compete with the stylesheets and font
 * for the first paint. A page that reads without script (the product page)
 * opts in: the same links, in the same order, follow the content, so the
 * stylesheets and font are fetched first and the script graph is still
 * flattened in one round.
 */
export interface ModulePreloadHandle {
  readonly modulePreload: "end";
}

/** Whether `handle` is a {@link ModulePreloadHandle}. */
function isModulePreloadHandle(handle: unknown): handle is ModulePreloadHandle {
  return (
    typeof handle === "object" &&
    handle !== null &&
    (handle as { readonly modulePreload?: unknown }).modulePreload === "end"
  );
}

/**
 * Whether the page for `matches` moves its `modulepreload` links to the end of
 * the document: true when any matched route, parent or child, sets
 * `handle.modulePreload` to `"end"`, because the links belong to the page and
 * not to one route.
 */
export function preloadsAtEnd(
  matches: ReadonlyArray<{ readonly handle?: unknown }>,
): boolean {
  return matches.some(({ handle }) => isModulePreloadHandle(handle));
}

/**
 * Matches, in order of preference at each position: a whole script element
 * opening tag (whose body must not be rewritten), a `modulepreload` link, and
 * the end of the body.
 */
const MARKUP =
  /<script\b[^>]*>|<link\b[^>]*\brel="modulepreload"[^>]*>|<\/body>/g;

const SCRIPT_END = "</script>";

/**
 * The longest unfinished tag held back between chunks. Real tags are far
 * shorter; the cap only stops a stray `<` in text from holding output back.
 */
export const MAX_HELD_TAG_LENGTH = 4096;

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
 * Returns `body` with every `<link rel="modulepreload">` moved to just before
 * `</body>`, or to the end if there is none, in their original order. Tags may
 * be split across chunks; text inside a `<script>` element is never rewritten;
 * every other byte passes through unchanged. Errors and cancellation pass
 * through to the source.
 */
export function movePreloadsToEnd(
  body: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const moved: string[] = [];
  let held = "";
  let inScript = false;

  /** Rewrites `text`, which ends outside any unfinished tag. */
  function rewrite(text: string): string {
    let out = "";
    let position = 0;

    while (position < text.length) {
      if (inScript) {
        const end = text.indexOf(SCRIPT_END, position);
        if (end === -1) {
          return out + text.slice(position);
        }
        out += text.slice(position, end + SCRIPT_END.length);
        position = end + SCRIPT_END.length;
        inScript = false;
        continue;
      }

      MARKUP.lastIndex = position;
      const found = MARKUP.exec(text);
      if (found === null) {
        return out + text.slice(position);
      }
      out += text.slice(position, found.index);
      position = found.index + found[0].length;
      if (found[0].startsWith("<script")) {
        out += found[0];
        inScript = true;
      } else if (found[0] === "</body>") {
        out += moved.join("") + found[0];
        moved.length = 0;
      } else {
        moved.push(found[0]);
      }
    }
    return out;
  }

  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        const [ready, rest] = splitAtOpenTag(
          held + decoder.decode(chunk, { stream: true }),
        );
        held = rest;
        controller.enqueue(encoder.encode(rewrite(ready)));
      },
      flush(controller) {
        const tail = rewrite(held + decoder.decode());
        controller.enqueue(encoder.encode(tail + moved.join("")));
      },
    }),
  );
}
