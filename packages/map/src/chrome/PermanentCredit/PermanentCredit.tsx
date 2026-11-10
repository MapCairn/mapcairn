import type { BasemapCredit } from "@mapcairn/core";
import type { ReactNode } from "react";
import { VisuallyHidden } from "../../ui/VisuallyHidden";
import * as styles from "./PermanentCredit.css";

/** Props for {@link PermanentCredit}. */
export interface PermanentCreditProps {
  /** The credit a basemap's provider requires to stay on screen. */
  readonly credit: BasemapCredit;
}

/** A link to another site: a new tab, with no referrer, and a spoken warning. */
function ExternalLink({
  href,
  className,
  children,
}: {
  readonly href: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {children}
      <VisuallyHidden> (opens in a new tab)</VisuallyHidden>
    </a>
  );
}

/** Pairs each line with a key that stays unique when a provider repeats one. */
function withKeys(lines: BasemapCredit["lines"]) {
  const seen = new Map<string, number>();
  return lines.map((line) => {
    const base = `${line.text}|${line.href ?? ""}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return { line, key: `${base}|${count}` };
  });
}

/**
 * The credit a basemap's provider asks to stay on screen the whole time its
 * basemap is shown: the provider's logo, linked to the provider, and the
 * credit lines beside it, linked where the provider gives a link. It is plain
 * content, with no button, popover or timer, so nothing here collapses or
 * hides. `MapChrome` gives it a row of its own (the `credit` slot) that the
 * sheet, the side panel and the other slots keep clear of.
 *
 * @remarks The logo is drawn at the provider's least height (a `height`
 *   attribute, because production CSP allows no inline style) in its own
 *   colours, on a dark chip so it reads on any map. The chip, and each line,
 *   is a full touch target tall (44 px), with the drawn logo inside it at its
 *   own height. The lines sit on a chrome surface, so their text keeps its
 *   contrast in both themes. Links open in a new tab, so a tap on the credit
 *   never leaves the map, and send no referrer.
 */
export function PermanentCredit({ credit }: PermanentCreditProps) {
  const { logo, lines } = credit;
  const keyed = withKeys(lines);
  return (
    <section
      aria-label="Basemap credit"
      data-testid="permanent-credit"
      className={styles.root}
    >
      <ExternalLink href={logo.href} className={styles.logoLink}>
        <img
          src={logo.src}
          alt={logo.label}
          height={logo.minHeight}
          className={styles.logo}
          decoding="async"
        />
      </ExternalLink>
      {lines.length === 0 ? null : (
        <p className={styles.lines}>
          {keyed.map(({ line, key }) =>
            line.href ? (
              <ExternalLink
                key={key}
                href={line.href}
                className={`${styles.line} ${styles.link}`}
              >
                {line.text}
              </ExternalLink>
            ) : (
              <span key={key} className={styles.line}>
                {line.text}
              </span>
            ),
          )}
        </p>
      )}
    </section>
  );
}
