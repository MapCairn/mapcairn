import type { SavedFile } from "@mapcairn/core";
import { runFileSaverContract } from "@mapcairn/core/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserFileSaver } from "./BrowserFileSaver";

interface Rig {
  readonly files: BrowserFileSaver;
  readonly saved: SavedFile[];
  readonly revoked: string[];
  readonly clicked: HTMLAnchorElement[];
  readonly arrange: {
    succeed(): void;
    fail(reason: "unsupported" | "failed"): void;
  };
}

/**
 * Builds a saver over a scripted object URL API. The click is spied on,
 * because happy-dom would otherwise try to navigate to the blob URL.
 */
function rig(): Rig {
  const saved: SavedFile[] = [];
  const revoked: string[] = [];
  const clicked: HTMLAnchorElement[] = [];
  let mode: "succeed" | "unsupported" | "failed" = "succeed";
  const contents = new Map<Blob, string>();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    if (mode === "failed") {
      throw new Error("The click failed.");
    }
    clicked.push(this);
    const blob = [...contents.keys()].at(-1);
    saved.push({
      filename: this.download,
      mimeType: blob?.type ?? "",
      content: contents.get(blob as Blob) ?? "",
    });
  });
  const files = new BrowserFileSaver({
    getDocument: () => document,
    getObjectUrls: () =>
      mode === "unsupported"
        ? undefined
        : {
            createObjectURL: (blob) => {
              contents.set(blob, (blob as Blob & { text: string }).text);
              return `blob:test/${contents.size}`;
            },
            revokeObjectURL: (url) => {
              revoked.push(url);
            },
          },
    createBlob: (content, mimeType) => {
      const blob = new Blob([content], { type: mimeType });
      Object.defineProperty(blob, "text", { value: content });
      return blob;
    },
  });
  return {
    files,
    saved,
    revoked,
    clicked,
    arrange: {
      succeed: () => {
        mode = "succeed";
      },
      fail: (reason) => {
        mode = reason;
      },
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

runFileSaverContract("BrowserFileSaver", () => {
  const { files, saved, arrange } = rig();
  return {
    files,
    controls: {
      willSucceed: arrange.succeed,
      willFail: arrange.fail,
      saved: () => saved,
    },
  };
});

describe("BrowserFileSaver", () => {
  it("clicks a hidden download link and removes it afterwards", async () => {
    const { files, clicked } = rig();
    await files.save({
      filename: "shapes.csv",
      mimeType: "text/csv;charset=utf-8",
      content: "a,b",
    });
    expect(clicked).toHaveLength(1);
    expect(clicked[0]?.download).toBe("shapes.csv");
    expect(clicked[0]?.href).toBe("blob:test/1");
    expect(clicked[0]?.hidden).toBe(true);
    expect(document.querySelector("a")).toBeNull();
  });

  it("revokes the object URL after a delay, not at once", async () => {
    const { files, revoked } = rig();
    await files.save({
      filename: "a.txt",
      mimeType: "text/plain",
      content: "a",
    });
    expect(revoked).toEqual([]);
    vi.advanceTimersByTime(30_000);
    expect(revoked).toEqual(["blob:test/1"]);
  });

  it("revokes the object URL at once when the click throws", async () => {
    const { files, revoked, arrange } = rig();
    arrange.fail("failed");
    const result = await files.save({
      filename: "a.txt",
      mimeType: "text/plain",
      content: "a",
    });
    expect(result).toEqual({ ok: false, reason: "failed" });
    expect(revoked).toEqual(["blob:test/1"]);
  });

  it("is unsupported without a document, a body or the object URL functions", async () => {
    const file = { filename: "a.txt", mimeType: "text/plain", content: "a" };
    const noDocument = new BrowserFileSaver({ getDocument: () => undefined });
    expect(await noDocument.save(file)).toEqual({
      ok: false,
      reason: "unsupported",
    });
    const noBody = new BrowserFileSaver({
      getDocument: () => ({ body: null }) as unknown as Document,
      getObjectUrls: () => ({
        createObjectURL: () => "",
        revokeObjectURL: () => {},
      }),
    });
    expect(await noBody.save(file)).toEqual({
      ok: false,
      reason: "unsupported",
    });
    const noRevoke = new BrowserFileSaver({
      getDocument: () => document,
      getObjectUrls: () => ({ createObjectURL: () => "" }),
    });
    expect(await noRevoke.save(file)).toEqual({
      ok: false,
      reason: "unsupported",
    });
  });

  it("uses the real Blob and URL by default, and reports a failure instead of throwing", async () => {
    const created: Blob[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      created.push(blob as Blob);
      return "blob:default/1";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const result = await new BrowserFileSaver().save({
      filename: "a.json",
      mimeType: "application/json",
      content: "{}",
    });
    expect(result).toEqual({ ok: true });
    expect(created[0]?.type).toBe("application/json");
    expect(await created[0]?.text()).toBe("{}");
  });
});
