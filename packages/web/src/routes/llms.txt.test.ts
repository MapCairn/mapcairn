import { describe, expect, it } from "vitest";
import { loader } from "./llms.txt";

describe("llms.txt", () => {
  it("describes map controls without advertising datasets", async () => {
    const response = loader();
    expect(response.headers.get("content-type")).toContain("text/plain");
    const text = await response.text();
    expect(text).toContain("# Karta");
    expect(text).toContain("measure distances or areas");
    expect(text).toContain("/privacy");
    expect(text).not.toMatch(/## (Story|Map layers)|township|transit/i);
  });
});
