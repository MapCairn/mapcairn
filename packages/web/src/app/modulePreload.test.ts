// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it, vi } from "vitest";
import {
  MAX_HELD_TAG_LENGTH,
  movePreloadsToEnd,
  preloadsAtEnd,
} from "./modulePreload";

const A = '<link rel="modulepreload" href="/assets/a.js" nonce="n"/>';
const B = '<link rel="modulepreload" href="/assets/b.js" nonce="n"/>';
const FONT = '<link rel="preload" href="/f.woff2" as="font"/>';

/** A stream of `chunks` that closes after the last one. */
function streamOf(chunks: readonly (string | Uint8Array)[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(
          typeof chunk === "string" ? encoder.encode(chunk) : chunk,
        );
      }
      controller.close();
    },
  });
}

/** Streams `chunks` through `movePreloadsToEnd` and joins the output. */
async function run(chunks: readonly (string | Uint8Array)[]) {
  return new Response(movePreloadsToEnd(streamOf(chunks))).text();
}

describe("preloadsAtEnd", () => {
  it("is false when no route asks for it", () => {
    expect(preloadsAtEnd([{}, { handle: { language: "en-GB" } }])).toBe(false);
  });

  it("is true when any matched route asks for it, parent or child", () => {
    expect(
      preloadsAtEnd([{ handle: { modulePreload: "end" } }, { handle: {} }]),
    ).toBe(true);
    expect(
      preloadsAtEnd([
        { handle: undefined },
        { handle: { modulePreload: "end" } },
      ]),
    ).toBe(true);
  });

  it("ignores any other value", () => {
    expect(preloadsAtEnd([{ handle: { modulePreload: "head" } }])).toBe(false);
    expect(preloadsAtEnd([{ handle: null }])).toBe(false);
  });
});

describe("movePreloadsToEnd", () => {
  it("moves the links, in order, to just before the closing body tag", async () => {
    const html = `<head>${FONT}${A}${B}</head><body>x<script>1</script></body>`;

    expect(await run([html])).toBe(
      `<head>${FONT}</head><body>x<script>1</script>${A}${B}</body>`,
    );
  });

  it("appends them to the end when the document has no closing body tag", async () => {
    expect(await run([`<head>${A}</head>text`])).toBe(`<head></head>text${A}`);
  });

  it("leaves a document without module preloads exactly as it was", async () => {
    const html = `<head>${FONT}</head><body>x</body>`;

    expect(await run([html])).toBe(html);
  });

  it("moves a link split across two chunks", async () => {
    const out = await run([
      `<head>${FONT}<link rel="module`,
      `preload" href="/assets/a.js"/></head><body></body>`,
    ]);

    expect(out).toBe(
      `<head>${FONT}</head><body><link rel="modulepreload" href="/assets/a.js"/></body>`,
    );
  });

  it("moves a link split inside its opening bracket", async () => {
    const out = await run([
      "<head>ok<",
      'link rel="modulepreload" href="/a.js"/>',
      "</head><body></body>",
    ]);

    expect(out).toBe(
      '<head>ok</head><body><link rel="modulepreload" href="/a.js"/></body>',
    );
  });

  it("finds a closing body tag split across chunks", async () => {
    expect(await run([`<head>${A}</head><body>x</bo`, "dy>"])).toBe(
      `<head></head><body>x${A}</body>`,
    );
  });

  it("does not touch a link written inside a script", async () => {
    const script = `<script>var s = '${A}';</script>`;
    const html = `<head>${A}</head><body>${script}</body>`;

    expect(await run([html])).toBe(`<head></head><body>${script}${A}</body>`);
  });

  it("does not mistake a closing body tag written inside a script for the end of the body", async () => {
    const script = `<script>var s = '</body>';</script>`;
    const html = `<head>${A}</head><body>${script}</body>`;

    expect(await run([html])).toBe(`<head></head><body>${script}${A}</body>`);
  });

  it("reads tag names in any letter case", async () => {
    const script = `<SCRIPT>var s = '${A}';</SCRIPT >`;
    const html = `<head>${A}</head><BODY>${script}</BODY>`;

    expect(await run([html])).toBe(`<head></head><BODY>${script}${A}</BODY>`);
  });

  it("does not touch a link inside a script that spans chunks", async () => {
    const out = await run([
      `<head>${A}</head><body><script>var s = '`,
      `${B}</scr`,
      `ipt>${FONT}</body>`,
    ]);

    expect(out).toBe(
      `<head></head><body><script>var s = '${B}</script>${FONT}${A}</body>`,
    );
  });

  it("keeps multi-byte text that a chunk boundary splits", async () => {
    const bytes = new TextEncoder().encode("<p>é—ü</p>");

    expect(await run([bytes.slice(0, 4), bytes.slice(4)])).toBe("<p>é—ü</p>");
  });

  it("passes a lone angle bracket at the end of the stream through", async () => {
    expect(await run(["a < b"])).toBe("a < b");
  });

  it("holds an unfinished tag of the largest length and releases a longer one early", async () => {
    const held = `<${"x".repeat(MAX_HELD_TAG_LENGTH - 1)}`;
    const released = `<${"x".repeat(MAX_HELD_TAG_LENGTH)}`;

    for (const [text, comes] of [
      [held, false],
      [released, true],
    ] as const) {
      const reader = movePreloadsToEnd(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(text));
          },
        }),
      ).getReader();
      const first = await reader.read();

      expect(new TextDecoder().decode(first.value).length > 0).toBe(comes);
      await reader.cancel();
    }
  });

  it("passes an error in the source on to the reader", async () => {
    const failing = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error("render failed"));
      },
    });

    await expect(
      new Response(movePreloadsToEnd(failing)).text(),
    ).rejects.toThrow("render failed");
  });

  it("cancels the source when the reader cancels", async () => {
    let cancelled: unknown;
    const source = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new TextEncoder().encode("<p>x</p>"));
      },
      cancel(reason) {
        cancelled = reason;
      },
    });

    await movePreloadsToEnd(source).cancel("client went away");

    await vi.waitFor(() => expect(cancelled).toBeDefined());
    expect(cancelled).toBe("client went away");
  });
});
