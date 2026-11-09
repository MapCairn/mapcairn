import { describe, expect, it } from "vitest";
import { runFileSaverContract } from "../contracts/fileSaver.contract";
import { FakeFileSaver } from "./FakeFileSaver";

runFileSaverContract("FakeFileSaver", () => {
  const files = new FakeFileSaver();
  return {
    files,
    controls: {
      willSucceed: () => files.succeed(),
      willFail: (reason) => files.failWith(reason),
      saved: () => files.saved,
    },
  };
});

describe("FakeFileSaver", () => {
  it("records every attempt, including the ones that failed", async () => {
    const files = new FakeFileSaver();
    const file = { filename: "a.txt", mimeType: "text/plain", content: "a" };
    files.failWith("failed");
    await files.save(file);
    files.succeed();
    await files.save(file);
    expect(files.attempts).toHaveLength(2);
    expect(files.saved).toHaveLength(1);
  });
});
