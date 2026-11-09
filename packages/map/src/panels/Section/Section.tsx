import { type HTMLAttributes, type ReactNode, type Ref, useId } from "react";
import { heading, section, subheading } from "./Section.css";

/** A heading level. The sheet title is an h2, so its sections start at 3. */
export type HeadingLevel = 2 | 3 | 4 | 5 | 6;

/** The level one below `level`, stopping at 6. */
export function nextHeadingLevel(level: HeadingLevel): HeadingLevel {
  return level === 6 ? 6 : ((level + 1) as HeadingLevel);
}

/** Props for {@link Section}. */
export interface SectionProps
  extends Omit<HTMLAttributes<HTMLElement>, "children" | "title"> {
  /** The heading text. It also names the section. */
  readonly title: string;
  /** The heading level. Defaults to 3, below the sheet's h2 title. */
  readonly headingLevel?: HeadingLevel;
  /**
   * Receives the heading element. The heading takes focus from script
   * (`tabIndex` -1), so the sheet can move focus to a section it opens on.
   */
  readonly headingRef?: Ref<HTMLHeadingElement>;
  readonly children?: ReactNode;
}

/**
 * A titled block of the sheet: a `section` named by a real heading. All the
 * sheet's sections use it, so headings, spacing and naming stay uniform.
 */
export function Section({
  title,
  headingLevel = 3,
  headingRef,
  className,
  children,
  ...rest
}: SectionProps) {
  const headingId = useId();
  const Heading = `h${headingLevel}` as const;
  return (
    <section
      {...rest}
      aria-labelledby={headingId}
      className={className ? `${section} ${className}` : section}
    >
      <Heading
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
        className={heading}
      >
        {title}
      </Heading>
      {children}
    </section>
  );
}

/** Props for {@link Subheading}. */
export interface SubheadingProps {
  /** The level of the heading, normally one below its section's. */
  readonly level: HeadingLevel;
  readonly children: ReactNode;
}

/** A heading for a group inside a section, such as Privacy or Keyboard. */
export function Subheading({ level, children }: SubheadingProps) {
  const Heading = `h${level}` as const;
  return <Heading className={subheading}>{children}</Heading>;
}
