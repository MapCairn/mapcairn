// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { wantsModulePreload, withoutModulePreloads } from "./modulePreload";

const PRELOAD = '<link rel="modulepreload" href="/assets/a.js" nonce="n"/>';
const FONT = '<link rel="preload" href="/f.woff2" as="font"/>';

/** Streams `chunks` through `withoutModulePreloads` and joins the output. */
async function run(chunks: readonly string[]): Promise<string> {
  const encoder = new TextEncoder();
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(withoutModulePreloads(source)).text();
}

describe("wantsModulePreload", () => {
  it("is true when no route says otherwise", () => {
    expect(wantsModulePreload([{}, { handle: { language: "en-GB" } }])).toBe(
      true,
    );
  });

  it("is false when the deepest route opts out", () => {
    expect(
      wantsModulePreload([
        { handle: undefined },
        { handle: { modulePreload: false } },
      ]),
    ).toBe(false);
  });

  it("ignores a handle whose modulePreload is not false", () => {
    expect(wantsModulePreload([{ handle: { modulePreload: "no" } }])).toBe(
      true,
    );
    expect(wantsModulePreload([{ handle: null }])).toBe(true);
  });
});

describe("withoutModulePreloads", () => {
  it("removes module preload links and keeps every other link and text", async () => {
    const html = `<head>${FONT}${PRELOAD}<link rel="stylesheet" href="/a.css"/></head><body>x</body>`;

    expect(await run([html])).toBe(
      `<head>${FONT}<link rel="stylesheet" href="/a.css"/></head><body>x</body>`,
    );
  });

  it("removes a link split across two chunks", async () => {
    const out = await run([
      `<head>${FONT}<link rel="module`,
      `preload" href="/a.js"/></head>`,
    ]);

    expect(out).toBe(`<head>${FONT}</head>`);
  });

  it("removes a link split inside its opening bracket", async () => {
    const out = await run([
      "<head>ok<",
      'link rel="modulepreload" href="/a.js"/>',
      "</head>",
    ]);

    expect(out).toBe("<head>ok</head>");
  });

  it("keeps multi-byte text that a chunk boundary splits", async () => {
    const bytes = new TextEncoder().encode("<p>é—ü</p>");
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 4));
        controller.enqueue(bytes.slice(4));
        controller.close();
      },
    });

    expect(await new Response(withoutModulePreloads(source)).text()).toBe(
      "<p>é—ü</p>",
    );
  });

  it("passes a lone angle bracket at the end of the stream through", async () => {
    expect(await run(["a < b"])).toBe("a < b");
  });

  it("removes preloads that come after the head", async () => {
    expect(await run([`<body>${PRELOAD}y</body>`])).toBe("<body>y</body>");
  });

  it("releases a long stray angle bracket before the stream ends", async () => {
    const text = `<${"x".repeat(5000)}`;
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(text));
      },
    });

    const first = await withoutModulePreloads(source).getReader().read();

    expect(new TextDecoder().decode(first.value)).toBe(text);
  });
});
