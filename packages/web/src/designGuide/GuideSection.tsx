// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { ReactNode } from "react";
import * as styles from "./DesignGuide.css";

/** Props for {@link GuideSection}. */
export interface GuideSectionProps {
  /** The anchor the nav links to. */
  readonly id: string;
  /** The h2 text, which also names the region. */
  readonly title: string;
  /** One or two sentences under the heading. */
  readonly intro: ReactNode;
  readonly children: ReactNode;
}

/**
 * One section of the style guide: a `section` named by its h2, so it is a
 * region landmark the nav can link to.
 */
export function GuideSection({
  id,
  title,
  intro,
  children,
}: GuideSectionProps) {
  const headingId = `${id}-title`;
  return (
    <section id={id} aria-labelledby={headingId} className={styles.section}>
      <h2 id={headingId} className={styles.sectionTitle}>
        {title}
      </h2>
      <p className={styles.prose}>{intro}</p>
      {children}
    </section>
  );
}
