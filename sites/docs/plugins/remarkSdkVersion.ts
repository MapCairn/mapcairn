// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/** The text a page writes where the SDK's version belongs. */
export const SDK_VERSION_TOKEN = "%sdkVersion%";

/** A node of the Markdown tree, in the little this plugin reads. */
interface MarkdownNode {
  type: string;
  value?: string;
  children?: MarkdownNode[];
}

/**
 * Replaces {@link SDK_VERSION_TOKEN} in a page's text and inline code with a
 * version, so a page can say which release it was checked against without the
 * number being written in every page, and a release does not need to edit them.
 * @param version - The SDK package's version.
 * @returns A remark plugin.
 */
export function remarkSdkVersion(
  version: string,
): () => (tree: MarkdownNode) => void {
  const replace = (node: MarkdownNode): void => {
    if (
      (node.type === "text" || node.type === "inlineCode") &&
      node.value?.includes(SDK_VERSION_TOKEN)
    ) {
      node.value = node.value.split(SDK_VERSION_TOKEN).join(version);
    }
    for (const child of node.children ?? []) {
      replace(child);
    }
  };
  return () => replace;
}
