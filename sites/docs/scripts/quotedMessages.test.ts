// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  messageFragments,
  missingMessages,
  quotedMessages,
} from "./quotedMessages";

const REPO = fileURLToPath(new URL("../../..", import.meta.url));

const PAGE = [
  "## Errors",
  "",
  "### `Something broke: ...`",
  "",
  "Reason `load-failed`. Not a message.",
  "",
  '### `The id "<id>" is used twice.`',
  "",
  "Also `A second one.` and `Third, with <tag> inside.`.",
  "A line with `not quoted` prose.",
  "",
  "### A heading without a message",
  "",
].join("\n");

describe("quotedMessages", () => {
  it("reads each heading that is a code span, and each code span after Also", () => {
    expect(quotedMessages(PAGE)).toEqual([
      "Something broke: ...",
      'The id "<id>" is used twice.',
      "A second one.",
      "Third, with <tag> inside.",
    ]);
  });
});

describe("messageFragments", () => {
  it("splits a message at the parts that depend on the app", () => {
    expect(messageFragments("Something broke: ...")).toEqual([
      "Something broke: ",
    ]);
    expect(messageFragments('The id "<id>" is used twice.')).toEqual([
      'The id "',
      '" is used twice.',
    ]);
  });

  it("drops a fragment too short to identify a message", () => {
    expect(messageFragments("<a> b <c>")).toEqual([]);
  });
});

describe("missingMessages", () => {
  // biome-ignore lint/suspicious/noTemplateCurlyInString: the string is source code that holds a template literal.
  const source = 'throw new Error(`The id "${id}" is used twice.`);';

  it("passes a message whose fixed parts are in the source", () => {
    expect(missingMessages(['The id "<id>" is used twice.'], source)).toEqual(
      [],
    );
  });

  it("names a message that is not in the source", () => {
    expect(missingMessages(["It stopped: its worker failed."], source)).toEqual(
      ["It stopped: its worker failed."],
    );
  });
});

/** The text of every source file under the SDK packages, tests left out. */
function packageSources(): string {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) {
        found.push(readFileSync(path, "utf8"));
      }
    }
  };
  for (const name of readdirSync(join(REPO, "packages"))) {
    if (name !== "web") {
      walk(join(REPO, "packages", name, "src"));
    }
  }
  return found.join("\n");
}

describe("the troubleshooting page", () => {
  const page = readFileSync(
    join(REPO, "sites/docs/docs/troubleshooting.md"),
    "utf8",
  );

  it("quotes at least the messages it is about", () => {
    expect(quotedMessages(page).length).toBeGreaterThan(10);
  });

  it("quotes only messages that are still strings in packages/*/src", () => {
    expect(missingMessages(quotedMessages(page), packageSources())).toEqual([]);
  });
});
