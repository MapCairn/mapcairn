// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

import { SITE_URL } from "../constants/siteConfig";
import {
  BADGES,
  type Block,
  CAIRN_LINE,
  DEMO_PLATES,
  GITHUB_ACTION,
  HEADLINE,
  INSTALL_OPTIONS,
  INSTALL_REQUIREMENTS,
  type Inline,
  LEDE,
  type Line,
  PLATES,
  PLAYGROUND_ACTION,
  plateCreditsText,
  RELEASE_TEXT,
  SECTIONS,
  type Section,
} from "./productContent";
import { formatReleaseDate } from "./releaseDate";
import { RELEASE } from "./releaseFacts.server";

/** A line break, and the blank line between Markdown paragraphs. */
const NEWLINE = String.fromCharCode(10);
const PARAGRAPH = NEWLINE + NEWLINE;

/** An address as an absolute URL: a path on this site gets the site's origin, and a section of the page the page's address. */
function absoluteUrl(href: string): string {
  if (href.startsWith("#")) {
    return `${SITE_URL}/${href}`;
  }
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

/** The latest release, as the page's sentence says it. */
const RELEASE_LINE = RELEASE_TEXT.line(
  RELEASE.version,
  formatReleaseDate(RELEASE.date),
);

/** The install commands, one for each package manager, as one block. */
const INSTALL_BLOCK = `\`\`\`bash\n${INSTALL_OPTIONS.map((option) => option.command).join("\n")}\n\`\`\``;

/** The picture of the playground, as words: what it shows and its credits. */
const DEMO = `${PLATES[DEMO_PLATES.wide].description} ${plateCreditsText(DEMO_PLATES.wide)}`;

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
    case "details":
      return item.items
        .map(
          ({ summary, detail }) =>
            `### ${summary}\n\n${detail.map(lineToMarkdown).join("\n\n")}`,
        )
        .join("\n\n");
    case "features":
      return item.items
        .map(({ name, text }) => `### ${name}\n\n${lineToMarkdown(text)}`)
        .join("\n\n");
    case "groups":
      return item.items
        .map(({ heading, text, list }) => {
          const lines =
            list === true
              ? text.map((line) => `- ${lineToMarkdown(line)}`).join(NEWLINE)
              : text.map(lineToMarkdown).join(PARAGRAPH);
          return `### ${heading}${PARAGRAPH}${lines}`;
        })
        .join(PARAGRAPH);
  }
}

/** One section as Markdown: its heading and its blocks. */
function section({ heading, blocks }: Section): string {
  return [`## ${heading}`, ...blocks.map(block)].join("\n\n");
}

/**
 * The product page as Markdown, from the same content the page renders, with
 * every link absolute and every disclosure open: the hero (the playground,
 * the install commands, the repository, the badges and the latest release),
 * the picture in words, then the sections. Served at `/index.md` and
 * included in `/llms-full.txt`.
 */
export function productMarkdown(): string {
  return `${[
    `# ${HEADLINE}`,
    lineToMarkdown(LEDE),
    lineToMarkdown(CAIRN_LINE),
    linkList([PLAYGROUND_ACTION]),
    INSTALL_BLOCK,
    lineToMarkdown(INSTALL_REQUIREMENTS),
    linkList([GITHUB_ACTION]),
    BADGES.map((badge) => badge.text).join(" · "),
    `${RELEASE_LINE} ${inline(RELEASE_TEXT.readiness)}`,
    DEMO,
    ...SECTIONS.map(section),
  ].join("\n\n")}\n`;
}
