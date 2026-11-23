// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type ComponentProps,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { scrolls, tableLabel } from "./scrolls";

/** The class on every table's box, used to number the tables on a page. */
const BOX_CLASS = "table-scroll";

/**
 * A table in a box that scrolls sideways on its own, so a wide table never
 * pushes the page sideways. When the table is wider than the box, the box is a
 * region named by its number on the page and a tab stop, so a keyboard reader
 * can scroll it; a table that fits adds no tab stop.
 */
export default function ScrollableTable(
  props: ComponentProps<"table">,
): ReactNode {
  const box = useRef<HTMLDivElement>(null);
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const element = box.current;
    if (!element) {
      return;
    }
    const measure = (): void => {
      const boxes = Array.from(document.querySelectorAll(`.${BOX_CLASS}`));
      setLabel(scrolls(element) ? tableLabel(boxes.indexOf(element)) : null);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (element.firstElementChild) {
      observer.observe(element.firstElementChild);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={box}
      className={BOX_CLASS}
      {...(label ? { role: "region", tabIndex: 0, "aria-label": label } : {})}
    >
      <table {...props} />
    </div>
  );
}
