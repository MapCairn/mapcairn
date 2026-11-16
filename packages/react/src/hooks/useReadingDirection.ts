// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { useSyncExternalStore } from "react";

/** The reading direction of a page: left to right or right to left. */
export type ReadingDirection = "ltr" | "rtl";

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["dir"],
  });
  return () => observer.disconnect();
}

function readDirection(): ReadingDirection {
  return document.documentElement.getAttribute("dir") === "rtl" ? "rtl" : "ltr";
}

function serverDirection(): ReadingDirection {
  return "ltr";
}

/**
 * The reading direction of the page, from `dir` on `<html>`, for the few
 * components that hand a direction to a library (a slider's thumb, a group's
 * arrow keys) rather than rely on CSS logical properties. It is `"ltr"` on
 * the server and during hydration, then follows the page, including a change
 * made while the page is open.
 */
export function useReadingDirection(): ReadingDirection {
  return useSyncExternalStore(subscribe, readDirection, serverDirection);
}
