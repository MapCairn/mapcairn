// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { Icon, SkipLink } from "@mapcairn/map";
import { ChevronDown, CodeXml, Compass, Heart } from "lucide-react";
import type { ReactNode } from "react";
import { Brand } from "../app/Brand";
import { MAP_LINK_REDIRECT_SCRIPT } from "../app/mapLinkRedirect";
import {
  PLAYGROUND_PATH,
  PRODUCT_PATH,
  SOURCE_REPOSITORY_URL,
} from "../constants/siteConfig";
import * as styles from "./ProductPage.css";
import {
  type Block,
  FACTS,
  GITHUB_ACTION,
  HEADLINE,
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

/** The credits for the software and basemaps the site uses. */
const CREDITS_URL = `${SOURCE_REPOSITORY_URL}/blob/main/ATTRIBUTIONS.md`;

/** The roadmap. */
const ROADMAP_URL = `${SOURCE_REPOSITORY_URL}/blob/main/ROADMAP.md`;

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

/** The two actions: View on GitHub first and strongest, then Try the playground. */
function Actions() {
  return (
    <div className={styles.actions}>
      <a className={styles.primaryAction} href={GITHUB_ACTION.href}>
        <Icon icon={CodeXml} />
        {GITHUB_ACTION.text}
      </a>
      <a className={styles.secondaryAction} href={PLAYGROUND_ACTION.href}>
        <Icon icon={Compass} />
        {PLAYGROUND_ACTION.text}
      </a>
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
    case "terms":
      return (
        <dl className={styles.terms}>
          {block.items.map(({ term, description }) => (
            <div key={JSON.stringify(term)}>
              <dt className={styles.term}>
                <Text line={term} />
              </dt>
              <dd className={styles.description}>
                <Text line={description} />
              </dd>
            </div>
          ))}
        </dl>
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
          <code>{block.code}</code>
        </pre>
      );
    case "faq":
      return (
        <div className={styles.faq}>
          {block.items.map(({ question, answer }) => (
            <details key={question} className={styles.question}>
              <summary className={styles.questionSummary}>
                {question}
                <Icon icon={ChevronDown} className={styles.questionMarker} />
              </summary>
              {answer.map((line) => (
                <p key={JSON.stringify(line)} className={styles.answer}>
                  <Text line={line} />
                </p>
              ))}
            </details>
          ))}
        </div>
      );
    case "actions":
      return <Actions />;
    case "deepLinks":
      return (
        <ul className={styles.deepLinks} data-testid="playground-deep-links">
          {block.links.map((link) => (
            <li key={link.href}>
              <a className={styles.furtherLink} href={link.href}>
                {link.text}
              </a>
            </li>
          ))}
        </ul>
      );
  }
}

/** One section: its heading in the margin, its blocks and where to read more. */
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
      <div className={styles.sectionBody}>
        {section.blocks.map((block, index) => (
          <BlockView
            // A section's blocks are fixed, so their order is their identity.
            // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list of blocks
            key={index}
            block={block}
            sectionId={section.id}
          />
        ))}
        {section.further.length > 0 ? (
          <ul className={styles.further}>
            {section.further.map((link) => (
              <li key={link.href}>
                <a className={styles.furtherLink} href={link.href}>
                  {link.text}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

/** The header: the brand, then the playground and the source, at every width. */
function ProductHeader() {
  return (
    <header className={styles.header}>
      <a className={styles.brand} href={PRODUCT_PATH}>
        <Brand />
      </a>
      <nav aria-label="Main">
        <ul className={styles.nav}>
          <li>
            <a className={styles.navLink} href={PLAYGROUND_PATH}>
              Playground
            </a>
          </li>
          <li>
            <a className={styles.navLink} href={SOURCE_REPOSITORY_URL}>
              GitHub
            </a>
          </li>
        </ul>
      </nav>
    </header>
  );
}

/** The hero: the survey sheet with the headline, the actions and the legend of facts. */
function Hero() {
  return (
    <div className={styles.hero}>
      <div className={styles.sheet}>
        <div className={styles.heroText}>
          <h1 className={styles.headline}>{HEADLINE}</h1>
          <p className={styles.lede}>
            <Text line={LEDE} />
          </p>
          <Actions />
          <dl className={styles.facts} data-testid="product-facts">
            {FACTS.map(({ term, description }) => (
              <div key={JSON.stringify(term)} className={styles.factRow}>
                <dt className={styles.factTerm}>
                  <Text line={term} />
                </dt>
                <dd className={styles.factValue}>
                  <Text line={description} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <SurveyArt />
      </div>
    </div>
  );
}

/** The footer: the licence, the links again and where the project is made. */
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
            <a className={styles.footerLink} href={SOURCE_REPOSITORY_URL}>
              Source code on GitHub
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
          <li>
            <a className={styles.footerLink} href={CREDITS_URL}>
              Credits
            </a>
          </li>
          <li>
            <a className={styles.footerLink} href={ROADMAP_URL}>
              Roadmap
            </a>
          </li>
        </ul>
      </nav>
    </footer>
  );
}

/**
 * The product page at `/`: what MapCairn is, for whom, what the code looks
 * like, what is in it and how it is built, what works today, the licence and
 * the questions developers ask first, with View on GitHub as the first action
 * and the playground one tap away from anywhere on the page.
 *
 * @remarks Server-rendered and static: it loads no map code and requests
 *   nothing from a third party; every link is a plain anchor. Its first
 *   element is the inline script that sends an old map link (`/#map=...`) on
 *   to the playground before the page paints. It is English only, by
 *   decision, so it sets `lang="en-GB"` on its own root whatever language the
 *   playground is in.
 */
export function ProductPage() {
  return (
    <div className={styles.scroller} lang="en-GB" data-testid="product-page">
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
