// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  checkPlans,
  runPlansCheck,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/plans-check.mjs";

const plan = (file: string, status: string, tracking: string) => ({
  file,
  text: `# Plan\n\nStatus: ${status}. Tracking issue: ${tracking}.\n\nBody.`,
});

const states = (...entries: Array<[number, string]>) =>
  new Map<number, string>(entries);

describe("checkPlans", () => {
  it("accepts a plan whose tracking issue is open", () => {
    expect(
      checkPlans(
        [plan("0001-a.md", "in progress", "[#5](https://x/issues/5)")],
        states([5, "OPEN"], [9, "OPEN"]),
      ),
    ).toEqual([]);
  });

  it("accepts a plan marked done whose tracking issue is closed", () => {
    expect(
      checkPlans(
        [plan("0001-a.md", "done: both slices merged", "#5")],
        states([5, "CLOSED"], [9, "OPEN"]),
      ),
    ).toEqual([]);
  });

  it("warns for a plan whose tracking issue is closed and whose status is not done", () => {
    expect(
      checkPlans(
        [plan("0002-b.md", "in progress", "#6")],
        states([6, "CLOSED"], [9, "OPEN"]),
      ),
    ).toEqual([
      'warning: docs/plans/0002-b.md: tracking issue #6 is closed, but the status is "in progress"; mark the plan done, or delete or fold it into the guides',
    ]);
  });

  it("reads the issue from a link or a bare number, and the status case-insensitively", () => {
    expect(
      checkPlans(
        [plan("0003-c.md", "Done", "[#7](https://x/issues/7)")],
        states([7, "CLOSED"], [9, "OPEN"]),
      ),
    ).toEqual([]);
    expect(
      checkPlans(
        [plan("0004-d.md", "proposed", "[#7](https://x/issues/7)")],
        states([7, "CLOSED"], [9, "OPEN"]),
      ),
    ).toHaveLength(1);
  });

  it("skips a plan with no status line or no tracking issue, and an unknown issue", () => {
    expect(
      checkPlans(
        [
          { file: "0005-e.md", text: "# Plan\n\nNo status here." },
          plan("0006-f.md", "in progress", "none yet"),
          plan("0007-g.md", "in progress", "#500"),
        ],
        states([9, "OPEN"]),
      ),
    ).toEqual([]);
  });
});

describe("runPlansCheck", () => {
  const plans = [plan("0002-b.md", "in progress", "#6")];

  it("prints each warning with a prefix and exits 0", () => {
    const out: string[] = [];
    const code = runPlansCheck({
      plans,
      states: states([6, "CLOSED"], [9, "OPEN"]),
      log: (line: string) => out.push(line),
    });
    expect(code).toBe(0);
    expect(out).toEqual([
      expect.stringMatching(
        /^plans check: warning: docs\/plans\/0002-b\.md: tracking issue #6/,
      ),
    ]);
  });

  it("says that the issue states were not checked when they could not be read", () => {
    const out: string[] = [];
    const code = runPlansCheck({
      plans,
      states: null,
      log: (line: string) => out.push(line),
    });
    expect(code).toBe(0);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/^plans check: issue states were not checked/);
  });
});
