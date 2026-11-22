// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { focusIsLost, sameDocumentTarget } from "./returnFocus";

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

describe("sameDocumentTarget", () => {
  const here = { pathname: "/docs/tasks/add-a-layer/" };

  it("gives the id of a link to a heading on the page being read", () => {
    expect(
      sameDocumentTarget("/docs/tasks/add-a-layer/#turn-it-on", here),
    ).toBe("turn-it-on");
  });

  it("decodes the id", () => {
    expect(sameDocumentTarget("/docs/tasks/add-a-layer/#a%20b", here)).toBe(
      "a b",
    );
  });

  it("is null for another page, or for a link with no hash", () => {
    expect(sameDocumentTarget("/docs/api/map-view/#props", here)).toBeNull();
    expect(sameDocumentTarget("/docs/tasks/add-a-layer/", here)).toBeNull();
    expect(sameDocumentTarget("/docs/tasks/add-a-layer/#", here)).toBeNull();
  });
});
