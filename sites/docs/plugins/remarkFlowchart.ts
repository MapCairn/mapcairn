// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { renderFlowchart } from "./flowchart/renderFlowchart";

/** The language a code block names to be drawn as a diagram. */
export const DIAGRAM_LANGUAGE = "mermaid";

/** A node of the Markdown tree, in the little this plugin reads. */
interface MarkdownNode {
  type: string;
  lang?: string | null;
  value?: string;
  children?: MarkdownNode[];
}

/**
 * Replaces each `mermaid` code block with the diagram drawn as inline SVG
 * (see `renderFlowchart`), so a document that GitHub draws itself shows as a
 * picture here too, with no script. The source stays in the document and in
 * its Markdown copy.
 * @returns A remark plugin.
 */
export function remarkFlowchart(): () => (tree: MarkdownNode) => void {
  return () => (tree) => {
    let count = 0;
    const replace = (node: MarkdownNode): void => {
      node.children?.forEach((child, index) => {
        if (child.type === "code" && child.lang === DIAGRAM_LANGUAGE) {
          count += 1;
          node.children?.splice(index, 1, {
            type: "html",
            value: renderFlowchart(child.value ?? "", `flowchart-${count}`),
          });
          return;
        }
        replace(child);
      });
    };
    replace(tree);
  };
}
