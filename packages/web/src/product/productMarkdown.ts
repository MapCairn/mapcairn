// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { SITE_URL } from "../constants/siteConfig";
import {
  type Block,
  GITHUB_ACTION,
  HEADLINE,
  HERO_INSTALL,
  HERO_NOTE,
  type Inline,
  LEDE,
  type Line,
  NPM_ACTION,
  PLATES,
  PLAYGROUND_ACTION,
  plateCreditsText,
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

/** The actions, as a list of links. */
const ACTIONS = linkList([GITHUB_ACTION, PLAYGROUND_ACTION, NPM_ACTION]);

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
      return `\`${item.label}\`:\n\n\`\`\`${item.language}\n${item.code}\n\`\`\``;
    case "install":
      return `\`\`\`bash\n${item.options.map((option) => option.command).join("\n")}\n\`\`\``;
    case "details":
      return item.items
        .map(
          ({ summary, detail }) =>
            `### ${summary}\n\n${detail.map(lineToMarkdown).join("\n\n")}`,
        )
        .join("\n\n");
    case "legend":
      return item.items
        .map(({ name, text }) => `### ${name}\n\n${lineToMarkdown(text)}`)
        .join("\n\n");
    case "plate":
      return `${PLATES[item.id].description} ${plateCreditsText(item.id)}`;
    case "deepLinks":
      return linkList(item.links);
  }
}

/** One section as Markdown: its heading and its blocks. */
function section({ heading, blocks }: Section): string {
  return [`## ${heading}`, ...blocks.map(block)].join("\n\n");
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
    block(HERO_INSTALL),
    ACTIONS,
    lineToMarkdown(HERO_NOTE),
    block({ kind: "plate", id: "hero" }),
    ...SECTIONS.map(section),
  ].join("\n\n")}\n`;
}
