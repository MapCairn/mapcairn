// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { ClipboardPort } from "@mapcairn/core";
import { Icon, LiveRegionProvider, SkipLink } from "@mapcairn/map";
import { CaretDown, Heart } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Brand } from "../app/Brand";
import { DOCUMENT_SCROLL } from "../app/documentScroll";
import { MAP_LINK_REDIRECT_SCRIPT } from "../app/mapLinkRedirect";
import {
  MASTODON_PROFILE_URL,
  PLAYGROUND_PATH,
  PRODUCT_PATH,
  SOURCE_REPOSITORY_URL,
} from "../constants/siteConfig";
import { CopyCodeButton } from "./CopyCodeButton";
import { CONTOUR_VIEW_BOX, CONTOURS } from "./contours";
import { DemoFigure } from "./DemoFigure";
import { type CodeTokenKind, highlightCode } from "./highlightCode";
import { InstallBlock } from "./InstallBlock";
import * as styles from "./ProductPage.css";
import {
  BADGES,
  BADGES_LABEL,
  type Block,
  CAIRN_LINE,
  type Disclosure,
  type Feature,
  GITHUB_ACTION,
  type Group,
  HEADER_LINKS,
  HEADLINE,
  INSTALL_GROUP_LABEL,
  INSTALL_OPTIONS,
  INSTALL_REQUIREMENTS,
  type Inline,
  LEDE,
  type Line,
  PLAYGROUND_ACTION,
  RELEASE_TEXT,
  REPOSITORY_PAGES,
  SECTIONS,
  type Section,
} from "./productContent";
import { formatReleaseDate, type ReleaseFacts } from "./releaseDate";
import { SurveyArt } from "./SurveyArt";

/** The id of the main landmark, the skip link's target. */
const MAIN_ID = "content";

/** One run of text: words, a link or a name from the code. */
function Run({ run }: { readonly run: Inline }) {
  if (typeof run === "string") {
    return run;
  }
  if ("code" in run) {
    return <code className={styles.code}>{run.code}</code>;
  }
  return (
    <a className={styles.link} href={run.href}>
      {run.text}
    </a>
  );
}

/** A line of runs. */
function Text({ line }: { readonly line: Line }) {
  return line.map((run, index) => (
    // The runs of a line never move, so their position is their identity.
    // biome-ignore lint/suspicious/noArrayIndexKey: a fixed line of text
    <Run key={index} run={run} />
  ));
}

/** The class each kind of code token is drawn with. */
const CODE_TOKEN_CLASS: Readonly<Record<CodeTokenKind, string>> = {
  keyword: styles.codeKeyword,
  string: styles.codeMuted,
  number: styles.codeMuted,
  comment: styles.codeMuted,
  name: styles.codeName,
};

/** The one language the highlighter reads; HTML and CSS stay plain, which its keyword list would only mislead. */
const HIGHLIGHTED_LANGUAGE = "tsx";

/** Code with its syntax highlighted by class; its text is the source exactly. */
function HighlightedCode({ source }: { readonly source: string }) {
  return highlightCode(source).map((run, index) =>
    typeof run === "string" ? (
      run
    ) : (
      // The runs of a fixed source never move, so their position is their identity.
      // biome-ignore lint/suspicious/noArrayIndexKey: a fixed run of code
      <span key={index} className={CODE_TOKEN_CLASS[run.kind]}>
        {run.text}
      </span>
    ),
  );
}

/** The latest release and its date, as one sentence. */
function releaseLine(release: ReleaseFacts): string {
  return RELEASE_TEXT.line(release.version, formatReleaseDate(release.date));
}

/**
 * The hero's background: the contours of the page's survey sheet, the land
 * round the summit where a cairn would stand, drawn faint in the hairline ink
 * behind the words. Decoration only, hidden from assistive technology, and
 * set in the same grid cell as the words rather than positioned, so it never
 * moves them.
 */
function ContourMotif() {
  return (
    <svg
      className={styles.heroMotif}
      viewBox={`0 0 ${CONTOUR_VIEW_BOX.width} ${CONTOUR_VIEW_BOX.height}`}
      preserveAspectRatio="xMaxYMid slice"
      aria-hidden="true"
      focusable="false"
      data-testid="hero-motif"
    >
      {CONTOURS.map(({ index, d }) => (
        <path
          key={d}
          className={index ? styles.motifIndex : styles.motifLine}
          d={d}
        />
      ))}
    </svg>
  );
}

/** A code example in a box: its name at the top, a small copy button in the corner, and the code, which scrolls inside the box. */
function CodeExample({
  block,
  clipboard,
}: {
  readonly block: Extract<Block, { kind: "code" }>;
  readonly clipboard: ClipboardPort;
}) {
  return (
    <div className={styles.codeExample}>
      <div className={styles.codeHeader}>
        <span className={styles.codeFile}>{block.label}</span>
        <CopyCodeButton
          code={block.code}
          label={block.label}
          clipboard={clipboard}
        />
      </div>
      {/* A named region the keyboard can reach and scroll (WCAG 2.1.1). It stays a
          pre, which keeps the code's whitespace, rather than becoming a section. */}
      {/* biome-ignore lint/a11y/useSemanticElements: a pre keeps the code's whitespace; a section would not */}
      <pre
        className={styles.codeBlock}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must take focus to be scrolled from the keyboard
        tabIndex={0}
        role="region"
        aria-label={block.label}
      >
        <code>
          {block.language === HIGHLIGHTED_LANGUAGE ? (
            <HighlightedCode source={block.code} />
          ) : (
            block.code
          )}
        </code>
      </pre>
    </div>
  );
}

/** Questions that open to show their answer: native disclosures, in the page's markup whether open or not, the whole row the target. */
function Disclosures({ items }: { readonly items: readonly Disclosure[] }) {
  return (
    <div className={styles.disclosures}>
      {items.map(({ summary, detail }) => (
        <details key={summary} className={styles.disclosure}>
          <summary className={styles.summary}>
            <span>{summary}</span>
            <Icon icon={CaretDown} className={styles.marker} />
          </summary>
          <div className={styles.detailBody}>
            {detail.map((line) => (
              <p key={JSON.stringify(line)} className={styles.detail}>
                <Text line={line} />
              </p>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

/**
 * Short groups of a section, each an h3 and its lines (paragraphs, or the items
 * of a list), set one under another on a phone and side by side on a wide
 * screen, so the section scans instead of reading as one long column.
 */
function Groups({ items }: { readonly items: readonly Group[] }) {
  return (
    <div className={styles.groups}>
      {items.map(({ heading, text, list }) => (
        <div key={heading} className={styles.group}>
          <h3 className={styles.subheading}>{heading}</h3>
          {list === true ? (
            <ul className={styles.list}>
              {text.map((line) => (
                <li key={JSON.stringify(line)}>
                  <Text line={line} />
                </li>
              ))}
            </ul>
          ) : (
            text.map((line) => (
              <p key={JSON.stringify(line)} className={styles.paragraph}>
                <Text line={line} />
              </p>
            ))
          )}
        </div>
      ))}
    </div>
  );
}

/** What you get: a few benefits, each a short heading and what it lets you do, always shown. */
function Features({ items }: { readonly items: readonly Feature[] }) {
  return (
    <ul className={styles.features}>
      {items.map(({ name, text }) => (
        <li key={name} className={styles.feature}>
          <h3 className={styles.featureName}>{name}</h3>
          <p className={styles.featureText}>
            <Text line={text} />
          </p>
        </li>
      ))}
    </ul>
  );
}

/** One block of a section. */
function BlockView({
  block,
  clipboard,
}: {
  readonly block: Block;
  readonly clipboard: ClipboardPort;
}): ReactNode {
  switch (block.kind) {
    case "paragraph":
      return (
        <p className={styles.paragraph}>
          <Text line={block.text} />
        </p>
      );
    case "list":
      return (
        <ul className={styles.list}>
          {block.items.map((item) => (
            <li key={JSON.stringify(item)}>
              <Text line={item} />
            </li>
          ))}
        </ul>
      );
    case "subheading":
      return <h3 className={styles.subheading}>{block.text}</h3>;
    case "code":
      return <CodeExample block={block} clipboard={clipboard} />;
    case "details":
      return <Disclosures items={block.items} />;
    case "features":
      return <Features items={block.items} />;
    case "groups":
      return <Groups items={block.items} />;
  }
}

/** One section: its heading and its blocks. */
function SectionView({
  section,
  clipboard,
}: {
  readonly section: Section;
  readonly clipboard: ClipboardPort;
}) {
  const headingId = `${section.id}-heading`;
  return (
    <section
      id={section.id}
      className={styles.section}
      aria-labelledby={headingId}
    >
      <h2 id={headingId} className={styles.sectionHeading}>
        {section.heading}
      </h2>
      {section.blocks.map((block, index) => (
        <BlockView
          // A section's blocks are fixed, so their order is their identity.
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list of blocks
          key={index}
          block={block}
          clipboard={clipboard}
        />
      ))}
    </section>
  );
}

/**
 * The header: a slim bar that stays at the top while the page scrolls, with
 * the brand and three text links, the playground, the documentation and the
 * repository, at every width and never behind a menu.
 */
function ProductHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.headerBar}>
        <a className={styles.brand} href={PRODUCT_PATH}>
          <Brand />
        </a>
        <nav aria-label="Main" className={styles.navBox}>
          <ul className={styles.nav}>
            {HEADER_LINKS.map(({ text, href }) => (
              <li key={href}>
                <a
                  className={styles.navLink}
                  href={href}
                  data-testid={`nav-${text.toLowerCase()}`}
                >
                  {text}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}

/**
 * The hero: what MapCairn is in a heading and one sentence, the playground as
 * the page's one filled button, the install command as the second action, the
 * repository as a quiet link, then three badges and the latest release, the
 * page's one statement of it, which links the readiness section. The
 * contour motif sits behind the words in the same grid cell.
 */
function Hero({
  clipboard,
  release,
}: {
  readonly clipboard: ClipboardPort;
  readonly release: ReleaseFacts;
}) {
  return (
    <div className={styles.hero}>
      <ContourMotif />
      <div className={styles.heroText}>
        <h1 className={styles.headline}>{HEADLINE}</h1>
        <p className={styles.lede}>
          <Text line={LEDE} />
        </p>
        <p className={styles.cairnLine}>
          <Text line={CAIRN_LINE} />
        </p>
        <a
          className={styles.primaryAction}
          href={PLAYGROUND_ACTION.href}
          data-testid="action-playground"
        >
          {PLAYGROUND_ACTION.text}
        </a>
        <div className={styles.installArea}>
          <InstallBlock
            label={INSTALL_GROUP_LABEL}
            options={INSTALL_OPTIONS}
            clipboard={clipboard}
          />
          <p className={styles.requirements}>
            <Text line={INSTALL_REQUIREMENTS} />
          </p>
        </div>
        <a
          className={styles.tertiaryLink}
          href={GITHUB_ACTION.href}
          data-testid="action-github"
        >
          {GITHUB_ACTION.text}
        </a>
        <div className={styles.trust}>
          <ul className={styles.badges} aria-label={BADGES_LABEL}>
            {BADGES.map(({ text, href }) => (
              <li key={text} className={styles.badge}>
                {href === undefined ? (
                  text
                ) : (
                  <a className={styles.badgeLink} href={href}>
                    {text}
                  </a>
                )}
              </li>
            ))}
          </ul>
          <p className={styles.trustLine} data-testid="hero-release">
            {releaseLine(release)}{" "}
            <a className={styles.link} href={RELEASE_TEXT.readiness.href}>
              {RELEASE_TEXT.readiness.text}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

/** The footer: where the project is made, the licence, the source and the pages an adopter looks for next, the playground and the privacy policy. */
function ProductFooter() {
  return (
    <footer className={styles.footer}>
      <p className={styles.made}>
        <Icon icon={Heart} filled className={styles.heart} />
        Built with love in South Africa.
      </p>
      <p className={styles.footerLine}>
        MapCairn is open source under the AGPL-3.0.
      </p>
      <nav aria-label="Footer" className={styles.footerNav}>
        <ul className={styles.footerLinks}>
          <li>
            <a
              className={styles.footerLink}
              href={SOURCE_REPOSITORY_URL}
              data-testid="footer-source"
            >
              Source code
            </a>
          </li>
          {REPOSITORY_PAGES.map(({ text, href }) => (
            <li key={href}>
              <a className={styles.footerLink} href={href}>
                {text}
              </a>
            </li>
          ))}
          <li>
            <a
              className={styles.footerLink}
              href={MASTODON_PROFILE_URL}
              rel="me"
              data-testid="footer-mastodon"
            >
              Mastodon
            </a>
          </li>
        </ul>
        <ul className={styles.footerLinks}>
          <li>
            <a className={styles.footerLink} href={PLAYGROUND_PATH}>
              Try the playground
            </a>
          </li>
          <li>
            <a className={styles.footerLink} href="/privacy">
              Privacy policy
            </a>
          </li>
        </ul>
      </nav>
    </footer>
  );
}

/**
 * The product page at `/`, ordered by what an evaluator needs to decide: the
 * hero (what it is, the playground, the install command), the playground at
 * work, what you get, when it fits, the licence, cost and readiness, the
 * smallest mount, the remaining questions, then the relief strip and the
 * footer.
 *
 * @remarks Server-rendered: it loads no map code and no service but the
 *   clipboard it is given, and its own markup requests nothing from another
 *   site (in production the host adds its cookieless page-view counter, as on
 *   every page). It links the repository's front page from three places (the
 *   header's GitHub, the hero's View on GitHub and the footer's Source code),
 *   a short named set of its pages, the footer's Mastodon profile
 *   (`rel="me"`), the map's credits under the picture, and otherwise only
 *   this site: never an issue, a pull request or a milestone. The playground
 *   is linked from the header, the hero's button and the footer.
 *   Its first element is the inline script that sends an old map link
 *   (`/#map=...`) on to the playground before the page paints. It is English
 *   only, by decision, so it sets `lang="en-GB"` on its own root whatever
 *   language the playground is in. The clipboard serves the copy buttons, and
 *   the page mounts its own live regions for their messages. The latest
 *   release comes from the route's loader, which reads the changelog.
 */
export function ProductPage({
  clipboard,
  release,
}: {
  readonly clipboard: ClipboardPort;
  readonly release: ReleaseFacts;
}) {
  return (
    <div
      className={styles.scroller}
      lang="en-GB"
      dir="ltr"
      data-testid="product-page"
      {...DOCUMENT_SCROLL}
    >
      <script
        // biome-ignore lint/security/noDangerouslySetInnerHtml: a fixed string allowed by its CSP hash; see MAP_LINK_REDIRECT_SCRIPT.
        dangerouslySetInnerHTML={{ __html: MAP_LINK_REDIRECT_SCRIPT }}
      />
      <LiveRegionProvider>
        <SkipLink targetId={MAIN_ID}>Skip to content</SkipLink>
        <ProductHeader />
        <main id={MAIN_ID} tabIndex={-1} className={styles.main}>
          <Hero clipboard={clipboard} release={release} />
          <DemoFigure />
          {SECTIONS.map((section) => (
            <SectionView
              key={section.id}
              section={section}
              clipboard={clipboard}
            />
          ))}
          <div className={styles.closing} data-testid="closing">
            <div className={styles.closingArt}>
              <SurveyArt />
            </div>
          </div>
        </main>
        <ProductFooter />
      </LiveRegionProvider>
    </div>
  );
}
