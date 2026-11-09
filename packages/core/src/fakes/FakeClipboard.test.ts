import { describe, expect, it } from "vitest";
import {
  type ClipboardSubject,
  runClipboardContract,
} from "../contracts/clipboard.contract";
import { FakeClipboard } from "./FakeClipboard";

runClipboardContract("FakeClipboard", (): ClipboardSubject => {
  const clipboard = new FakeClipboard();
  return {
    clipboard,
    controls: {
      willSucceed: () => clipboard.succeed(),
      willFail: (reason) => clipboard.failWith(reason),
      written: () => clipboard.written,
    },
  };
});

describe("FakeClipboard", () => {
  it("records successful copies in written and every call in attempts", async () => {
    const clipboard = new FakeClipboard();
    await clipboard.writeText("one");
    clipboard.failWith("denied");
    await clipboard.writeText("two");
    clipboard.succeed();
    await clipboard.writeText("three");
    expect(clipboard.written).toEqual(["one", "three"]);
    expect(clipboard.attempts).toEqual(["one", "two", "three"]);
  });
});
