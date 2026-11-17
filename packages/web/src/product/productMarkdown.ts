// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { SITE_URL } from "../constants/siteConfig";
import {
  type Block,
  GITHUB_ACTION,
  HEADLINE,
  HERO_NOTE,
  type Inline,
  LEDE,
  type Line,
  PLAYGROUND_ACTION,
  SECTIONS,
  type Section,
} from "./productContent";

/** An address as an absolute URL: a path on this site gets the site's origin. */
function absoluteUrl(href: string): string {
  return href.startsWith("/") ? `${SITE_URL}${href}` : href;
}

/** One run of text as Markdown. */
function inline(run: Inline): string {
  if (typeof run === "string") {
    return run;
  }
  if ("code" in run) {
    return `\`${run.code}\``;
  }
  return `[${run.text}](${absoluteUrl(run.href)})`;
}

/** A line of runs as Markdown. */
function lineToMarkdown(line: Line): string {
  return line.map(inline).join("");
}

/** A list of links as a Markdown list. */
function linkList(links: readonly { text: string; href: string }[]): string {
  return links
    .map((link) => `- [${link.text}](${absoluteUrl(link.href)})`)
    .join("\n");
}

/** The two actions, as a list of links. */
const ACTIONS = linkList([GITHUB_ACTION, PLAYGROUND_ACTION]);

/** One block as Markdown. */
function block(item: Block): string {
  switch (item.kind) {
    case "paragraph":
      return lineToMarkdown(item.text);
    case "list":
      return item.items.map((line) => `- ${lineToMarkdown(line)}`).join("\n");
    case "subheading":
      return `### ${item.text}`;
    case "code":
      return `\`\`\`${item.language}\n${item.code}\n\`\`\``;
    case "details":
      return item.items
        .map(
          ({ summary, detail }) =>
            `### ${summary}\n\n${detail.map(lineToMarkdown).join("\n\n")}`,
        )
        .join("\n\n");
    case "actions":
      return ACTIONS;
    case "deepLinks":
      return linkList(item.links);
  }
}

/** One section as Markdown: its heading, its blocks and where to read more. */
function section({ heading, blocks, further }: Section): string {
  const parts = [`## ${heading}`, ...blocks.map(block)];
  if (further.length > 0) {
    parts.push(linkList(further));
  }
  return parts.join("\n\n");
}

/**
 * The product page as Markdown, from the same content the page renders, with
 * every link absolute and every disclosure open. Served at `/index.md` and
 * included in `/llms-full.txt`.
 */
export function productMarkdown(): string {
  return `${[
    `# ${HEADLINE}`,
    lineToMarkdown(LEDE),
    ACTIONS,
    lineToMarkdown(HERO_NOTE),
    ...SECTIONS.map(section),
  ].join("\n\n")}\n`;
}
