import { Search } from "lucide-react";
import { IconButton } from "../../ui/IconButton";
import { Surface } from "../../ui/Surface";
import * as styles from "./SearchPill.css";

/**
 * The search pill as a decorative stand-in for the server-rendered
 * `ChromeSkeleton`: the same wrapper, pill and input classes as
 * {@link SearchPill}, so it fills the same box, with nothing wired up.
 *
 * @remarks Only ever rendered inside an `aria-hidden`, `inert` container. It
 *   uses no hooks and needs no provider. The Search button is disabled, as the
 *   real one is while the box is empty.
 */
export function SearchPillSkeleton() {
  return (
    <div className={styles.root} data-skeleton="search">
      <Surface radius="pill" className={styles.pill}>
        <input
          className={styles.input}
          type="text"
          readOnly
          tabIndex={-1}
          placeholder="Search places"
        />
        <IconButton
          label="Search"
          icon={Search}
          size="compact"
          disabled
          tabIndex={-1}
        />
      </Surface>
    </div>
  );
}
