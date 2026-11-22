// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type ComponentProps,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { scrolls } from "./scrolls";

/** What a box that scrolls needs: a name, a role to carry it, and a place in the tab order. */
const REGION = {
  role: "region",
  tabIndex: 0,
  "aria-label": "Table, scrolls sideways",
} as const;

/**
 * A table in a box that scrolls sideways on its own, so a wide table never
 * pushes the page sideways. When the table is wider than the box, the box is a
 * labelled region and a tab stop, so a keyboard reader can scroll it; a table
 * that fits adds no tab stop.
 */
export default function ScrollableTable(
  props: ComponentProps<"table">,
): ReactNode {
  const box = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const element = box.current;
    if (!element) {
      return;
    }
    const measure = (): void => setOverflowing(scrolls(element));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (element.firstElementChild) {
      observer.observe(element.firstElementChild);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={box} className="table-scroll" {...(overflowing ? REGION : {})}>
      <table {...props} />
    </div>
  );
}
