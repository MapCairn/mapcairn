// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { LitElement } from "lit";

const mounted: Element[] = [];

/**
 * Adds a Lit element to the page and waits for its first render. Test support:
 * nothing in the package's entry point imports it.
 */
export async function mountElement<T extends LitElement>(
  element: T,
): Promise<T> {
  document.body.append(element);
  mounted.push(element);
  await element.updateComplete;
  return element;
}

/** Removes every element {@link mountElement} added. Call it after each test. */
export function unmountElements(): void {
  for (const element of mounted.splice(0)) {
    element.remove();
  }
}
