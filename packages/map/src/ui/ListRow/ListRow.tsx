import { Check } from "lucide-react";
import type { LiHTMLAttributes, MouseEventHandler, ReactNode } from "react";
import { Icon, type IconComponent } from "../Icon";
import { check, listRow, row, secondary, text, trailing } from "./ListRow.css";

/** Props for {@link ListRow}. */
export interface ListRowProps
  extends Omit<LiHTMLAttributes<HTMLLIElement>, "children" | "onClick"> {
  /** A leading icon, imported by name from `lucide-react`. */
  readonly icon?: IconComponent;
  /** The row's main text. */
  readonly label: ReactNode;
  /** A second, quieter line under the label. */
  readonly secondary?: ReactNode;
  /** Anything to show at the end, such as a value. Rendered before the check. */
  readonly trailing?: ReactNode;
  /**
   * Marks the row as the current choice. Shown with a check icon and
   * `aria-current`, so selection does not depend on colour.
   */
  readonly selected?: boolean;
  /** Makes the whole row a full-width button inside the `li`. */
  readonly onClick?: MouseEventHandler<HTMLButtonElement>;
}

/**
 * A list item for lists of places, layers and options. Render rows inside a
 * `ul` (or `ol`). Without `onClick` the row is plain content; with it the row
 * is a single full-width button, so the whole row is the target.
 */
export function ListRow({
  icon,
  label,
  secondary: secondaryText,
  trailing: trailingNode,
  selected = false,
  onClick,
  className,
  ...rest
}: ListRowProps) {
  const classes = className ? `${listRow} ${className}` : listRow;
  const current = selected ? ("true" as const) : undefined;
  const body = (
    <>
      {icon ? <Icon icon={icon} /> : null}
      <span className={text}>
        <span>{label}</span>
        {secondaryText ? (
          <span className={secondary}>{secondaryText}</span>
        ) : null}
      </span>
      {trailingNode ? <span className={trailing}>{trailingNode}</span> : null}
      {selected ? <Icon icon={Check} className={check} /> : null}
    </>
  );
  const rowClass = row({ actionable: onClick !== undefined, selected });
  if (onClick) {
    return (
      <li {...rest} className={classes}>
        <button
          type="button"
          className={rowClass}
          aria-current={current}
          onClick={onClick}
        >
          {body}
        </button>
      </li>
    );
  }
  return (
    <li {...rest} className={classes} aria-current={current}>
      <div className={rowClass}>{body}</div>
    </li>
  );
}
