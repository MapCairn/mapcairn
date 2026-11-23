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
export function remarkFlowchart(): () => (
  tree: MarkdownNode,
  file?: { readonly path?: string },
) => void {
  return () => (tree, file) => {
    let count = 0;
    const draw = (source: string): string => {
      try {
        return renderFlowchart(source, `flowchart-${count}`);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(
          `${file?.path ?? "A document"}, diagram ${count}: ${reason}`,
          { cause: error },
        );
      }
    };
    const replace = (node: MarkdownNode): void => {
      node.children?.forEach((child, index) => {
        if (child.type === "code" && child.lang === DIAGRAM_LANGUAGE) {
          count += 1;
          node.children?.splice(index, 1, {
            type: "html",
            value: draw(child.value ?? ""),
          });
          return;
        }
        replace(child);
      });
    };
    replace(tree);
  };
}
