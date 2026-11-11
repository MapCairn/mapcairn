import { describe, expect, it } from "vitest";
import { runFileOpenerContract } from "../contracts/fileOpener.contract";
import { FakeFileOpener } from "./FakeFileOpener";

runFileOpenerContract("FakeFileOpener", () => {
  const opener = new FakeFileOpener();
  return {
    opener,
    controls: {
      choose: (file) => opener.choose(file),
      cancel: () => opener.cancel(),
      willFail: (kind) => opener.failWith(kind),
    },
  };
});

describe("FakeFileOpener", () => {
  it("records every open and whether a picker is waiting", async () => {
    const opener = new FakeFileOpener();
    expect(opener.waiting).toBe(false);
    const opened = opener.open({ accept: [".csv"], maxBytes: 10 });
    expect(opener.waiting).toBe(true);
    expect(opener.opens).toEqual([{ accept: [".csv"], maxBytes: 10 }]);
    opener.choose({ name: "a.csv", text: "a" });
    await opened;
    expect(opener.waiting).toBe(false);
  });

  it("ignores a choice or a cancel with no picker open", () => {
    const opener = new FakeFileOpener();
    opener.choose({ name: "a.csv", text: "a" });
    opener.cancel();
    expect(opener.waiting).toBe(false);
  });

  it("works again after succeed", async () => {
    const opener = new FakeFileOpener();
    opener.failWith("unsupported");
    await expect(
      opener.open({ accept: [], maxBytes: 10 }),
    ).rejects.toMatchObject({ kind: "unsupported" });
    opener.succeed();
    const opened = opener.open({ accept: [], maxBytes: 10 });
    opener.choose({ name: "a", text: "b" });
    await expect(opened).resolves.toEqual({ name: "a", text: "b" });
  });

  it("stops listening to the signal once it settles", async () => {
    const opener = new FakeFileOpener();
    const controller = new AbortController();
    const opened = opener.open({
      accept: [],
      maxBytes: 10,
      signal: controller.signal,
    });
    opener.choose({ name: "a", text: "b" });
    await opened;
    const next = opener.open({ accept: [], maxBytes: 10 });
    controller.abort();
    expect(opener.waiting).toBe(true);
    opener.cancel();
    await expect(next).rejects.toMatchObject({ kind: "cancelled" });
  });
});
