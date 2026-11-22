// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { focusIsLost } from "./returnFocus";

const page = { body: { name: "body" }, documentElement: { name: "html" } };

describe("focusIsLost", () => {
  it("is lost on the body, the root or nothing", () => {
    expect(focusIsLost(page.body, page)).toBe(true);
    expect(focusIsLost(page.documentElement, page)).toBe(true);
    expect(focusIsLost(null, page)).toBe(true);
    expect(focusIsLost(undefined, page)).toBe(true);
  });

  it("is kept on any other element, such as the button that opened search", () => {
    expect(focusIsLost({ name: "button" }, page)).toBe(false);
  });
});
