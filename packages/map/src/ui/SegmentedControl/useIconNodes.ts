// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { type ReactNode, useState } from "react";

/**
 * A stable node for each option that has an icon. React fills it through a
 * portal and the private element places it, so a React icon reaches a Lit
 * template without Lit rendering React. The node is decorative, and hidden
 * from assistive technology. For client-only parts: it reads the document.
 */
export function useIconNodes(
  options: readonly { readonly value: string; readonly icon?: ReactNode }[],
  className: string,
): ReadonlyMap<string, HTMLElement> {
  const [made] = useState(() => new Map<string, HTMLElement>());
  const shown = new Map<string, HTMLElement>();
  for (const { value, icon } of options) {
    if (!icon) {
      continue;
    }
    let node = made.get(value);
    if (node === undefined) {
      node = document.createElement("span");
      node.className = className;
      node.setAttribute("aria-hidden", "true");
      made.set(value, node);
    }
    shown.set(value, node);
  }
  return shown;
}
