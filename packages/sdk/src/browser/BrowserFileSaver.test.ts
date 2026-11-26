// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserFileSaver } from "./BrowserFileSaver";

const FILE = {
  filename: "layer.geojson",
  mimeType: "application/geo+json",
  content: "{}",
};

interface Clicked {
  readonly href: string;
  readonly download: string;
  readonly parent: ParentNode | null;
}

function watchClicks(): Clicked[] {
  const clicked: Clicked[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push({
      href: this.getAttribute("href") ?? "",
      download: this.download,
      parent: this.parentNode,
    });
  });
  return clicked;
}

function objectUrls() {
  const created: Blob[] = [];
  const revoked: string[] = [];
  vi.stubGlobal(
    "URL",
    Object.assign(function Url() {}, {
      createObjectURL: (blob: Blob) => {
        created.push(blob);
        return `blob:test/${created.length}`;
      },
      revokeObjectURL: (url: string) => revoked.push(url),
    }),
  );
  return { created, revoked };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("BrowserFileSaver", () => {
  it("offers the text as a download named as asked, from a link inside the element", async () => {
    const urls = objectUrls();
    const clicked = watchClicks();
    const element = document.createElement("div");
    document.body.append(element);
    const result = await new BrowserFileSaver(element).save(FILE);
    expect(result).toEqual({ ok: true });
    expect(await urls.created[0]?.text()).toBe("{}");
    expect(urls.created[0]?.type).toBe("application/geo+json");
    expect(clicked).toEqual([
      { href: "blob:test/1", download: "layer.geojson", parent: element },
    ]);
    expect(element.children).toHaveLength(0);
    expect(document.body.querySelector("a")).toBeNull();
  });

  it("keeps the file's address for a while, then lets it go", async () => {
    vi.useFakeTimers();
    const urls = objectUrls();
    watchClicks();
    await new BrowserFileSaver(document.createElement("div")).save(FILE);
    expect(urls.revoked).toEqual([]);
    await vi.runAllTimersAsync();
    expect(urls.revoked).toEqual(["blob:test/1"]);
  });

  it("lets go at once, with no timer left, when it is disposed", async () => {
    vi.useFakeTimers();
    const urls = objectUrls();
    watchClicks();
    const saver = new BrowserFileSaver(document.createElement("div"));
    await saver.save(FILE);
    saver.dispose();
    expect(urls.revoked).toEqual(["blob:test/1"]);
    expect(vi.getTimerCount()).toBe(0);
    saver.dispose();
    expect(urls.revoked).toEqual(["blob:test/1"]);
  });

  it("says it failed, and lets go, when the click throws", async () => {
    const urls = objectUrls();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      throw new Error("blocked");
    });
    const result = await new BrowserFileSaver(
      document.createElement("div"),
    ).save(FILE);
    expect(result).toEqual({ ok: false, reason: "failed" });
    expect(urls.revoked).toEqual(["blob:test/1"]);
  });

  it("says it is unsupported where object addresses cannot be made", async () => {
    vi.stubGlobal("URL", function Url() {});
    const result = await new BrowserFileSaver(
      document.createElement("div"),
    ).save(FILE);
    expect(result).toEqual({ ok: false, reason: "unsupported" });
  });
});
