// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { Icon, SkipLink } from "@mapcairn/map";
import { ChevronDown, CodeXml, Compass, Heart } from "lucide-react";
import type { ReactNode } from "react";
import { Brand } from "../app/Brand";
import { DOCUMENT_SCROLL } from "../app/documentScroll";
import { MAP_LINK_REDIRECT_SCRIPT } from "../app/mapLinkRedirect";
import {
  PLAYGROUND_PATH,
  PRODUCT_PATH,
  SOURCE_REPOSITORY_URL,
} from "../constants/siteConfig";
import { type CodeTokenKind, highlightCode } from "./highlightCode";
import * as styles from "./ProductPage.css";
import {
  type Block,
  type Disclosure,
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

/** The two actions, the same size: View on GitHub first and filled, Try the playground beside it. */
function Actions() {
  return (
    <div className={styles.actions}>
      <a
        className={styles.primaryAction}
        href={GITHUB_ACTION.href}
        data-testid="action-github"
      >
        <Icon icon={CodeXml} />
        {GITHUB_ACTION.text}
      </a>
      <a
        className={styles.secondaryAction}
        href={PLAYGROUND_ACTION.href}
        data-testid="action-playground"
      >
        <Icon icon={Compass} />
        {PLAYGROUND_ACTION.text}
      </a>
    </div>
  );
}

/** Items that open to show their detail: native disclosures, in the page's markup whether open or not. */
function Disclosures({ items }: { readonly items: readonly Disclosure[] }) {
  return (
    <div className={styles.disclosures}>
      {items.map(({ summary, detail }) => (
        <details key={summary} className={styles.disclosure}>
          <summary className={styles.summary}>
            {summary}
            <Icon icon={ChevronDown} className={styles.marker} />
          </summary>
          {detail.map((line) => (
            <p key={JSON.stringify(line)} className={styles.detail}>
              <Text line={line} />
            </p>
          ))}
        </details>
      ))}
    </div>
  );
}

/** One block of a section. */
function BlockView({
  block,
  sectionId,
}: {
  readonly block: Block;
  readonly sectionId: string;
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
      // A named region the keyboard can reach and scroll (WCAG 2.1.1). It stays a
      // pre, which keeps the code's whitespace, rather than becoming a section.
      return (
        // biome-ignore lint/a11y/useSemanticElements: a pre keeps the code's whitespace; a section would not
        <pre
          className={styles.codeBlock}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must take focus to be scrolled from the keyboard
          tabIndex={0}
          role="region"
          aria-label={block.label}
          data-testid={`${sectionId}-code`}
        >
          <code>
            <HighlightedCode source={block.code} />
          </code>
        </pre>
      );
    case "details":
      return <Disclosures items={block.items} />;
    case "deepLinks":
      return (
        <ul className={styles.deepLinks} data-testid="playground-deep-links">
          {block.links.map((link) => (
            <li key={link.href}>
              <a className={styles.blockLink} href={link.href}>
                <Icon icon={Compass} className={styles.linkIcon} />
                {link.text}
              </a>
            </li>
          ))}
        </ul>
      );
  }
}

/** One section: its heading and its blocks. */
function SectionView({ section }: { readonly section: Section }) {
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
          sectionId={section.id}
        />
      ))}
    </section>
  );
}

/**
 * The header: the brand, then the playground at every width. The repository
 * is not linked here: the hero's View on GitHub and the footer already do.
 */
function ProductHeader() {
  return (
    <header className={styles.header}>
      <a className={styles.brand} href={PRODUCT_PATH}>
        <Brand />
      </a>
      <nav aria-label="Main">
        <ul className={styles.nav}>
          <li>
            <a
              className={styles.navLink}
              href={PLAYGROUND_PATH}
              data-testid="nav-playground"
            >
              Playground
            </a>
          </li>
        </ul>
      </nav>
    </header>
  );
}

/** The hero: the pitch, the two actions, and the survey sheet beside them. */
function Hero() {
  return (
    <div className={styles.hero}>
      <div className={styles.heroText}>
        <h1 className={styles.headline}>{HEADLINE}</h1>
        <p className={styles.lede}>
          <Text line={LEDE} />
        </p>
        <Actions />
        <p className={styles.note}>
          <Text line={HERO_NOTE} />
        </p>
      </div>
      <div className={styles.heroArt}>
        <SurveyArt />
      </div>
    </div>
  );
}

/** The footer: where the project is made, the licence, the source, the playground and the privacy policy. */
function ProductFooter() {
  return (
    <footer className={styles.footer}>
      <p className={styles.made}>
        <Icon icon={Heart} className={styles.heart} />
        Built with love in South Africa.
      </p>
      <p className={styles.footerLine}>
        MapCairn is open source under the AGPL-3.0.
      </p>
      <nav aria-label="Footer">
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
 * The product page at `/`: the pitch and the two actions, the embedding
 * example, what you get, the playground, when it fits and the questions, with
 * View on GitHub as the first action and the playground one link away from
 * anywhere on the page.
 *
 * @remarks Server-rendered and static: it loads no services and no map code,
 *   and its own markup requests nothing from another site (in production the
 *   host adds its cookieless page-view counter, as on every page). It links
 *   to the repository from exactly two places, the hero's View on GitHub and
 *   the footer's Source code, and otherwise only to this site: never a
 *   Markdown file, an issue, a pull request or a milestone.
 *   Its first element is the inline script that sends an old map link
 *   (`/#map=...`) on to the playground before the page paints. It is English
 *   only, by decision, so it sets `lang="en-GB"` on its own root whatever
 *   language the playground is in.
 */
export function ProductPage() {
  return (
    <div
      className={styles.scroller}
      lang="en-GB"
      data-testid="product-page"
      {...DOCUMENT_SCROLL}
    >
      <script
        // biome-ignore lint/security/noDangerouslySetInnerHtml: a fixed string allowed by its CSP hash; see MAP_LINK_REDIRECT_SCRIPT.
        dangerouslySetInnerHTML={{ __html: MAP_LINK_REDIRECT_SCRIPT }}
      />
      <SkipLink targetId={MAIN_ID}>Skip to content</SkipLink>
      <ProductHeader />
      <main id={MAIN_ID} tabIndex={-1} className={styles.main}>
        <Hero />
        {SECTIONS.map((section) => (
          <SectionView key={section.id} section={section} />
        ))}
      </main>
      <ProductFooter />
    </div>
  );
}
