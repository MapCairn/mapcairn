// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { isSearchShortcut } from "./shortcut";

const press = (
  key: string,
  extra: Partial<Parameters<typeof isSearchShortcut>[0]> = {},
) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  typing: false,
  ...extra,
});

describe("isSearchShortcut", () => {
  it("opens on a bare slash", () => {
    expect(isSearchShortcut(press("/"))).toBe(true);
  });

  it("opens on the command or control key with K, either case", () => {
    expect(isSearchShortcut(press("k", { metaKey: true }))).toBe(true);
    expect(isSearchShortcut(press("K", { ctrlKey: true }))).toBe(true);
  });

  it("leaves a slash alone while someone is typing in a field", () => {
    expect(isSearchShortcut(press("/", { typing: true }))).toBe(false);
  });

  it("still opens on the command key with K while typing", () => {
    expect(isSearchShortcut(press("k", { metaKey: true, typing: true }))).toBe(
      true,
    );
  });

  it("ignores a slash with a modifier, which is another shortcut", () => {
    expect(isSearchShortcut(press("/", { ctrlKey: true }))).toBe(false);
    expect(isSearchShortcut(press("/", { altKey: true }))).toBe(false);
  });

  it("ignores other keys and a bare K", () => {
    expect(isSearchShortcut(press("k"))).toBe(false);
    expect(isSearchShortcut(press("a"))).toBe(false);
  });
});
