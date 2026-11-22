// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { useLocation } from "@docusaurus/router";
import type { ReactNode } from "react";
import { ariaCurrentFor, HEADER_LINKS } from "../headerLinks";

/**
 * The product page's three links as a list of links. The header shows it from
 * the width at which the framework's sidebar toggle disappears, and the
 * drawer shows it below that, so the links are in one place at a time and the
 * header never has more in its row than a phone has room for.
 * @param props.className - The class of the `nav` element, which sets where it is shown.
 */
export default function HeaderLinks({
  className,
}: {
  className: string;
}): ReactNode {
  const { pathname } = useLocation();
  return (
    <nav aria-label="Site links" className={className}>
      <ul className="header-links__list">
        {HEADER_LINKS.map((link) => (
          <li key={link.href}>
            <a
              className="navbar__link"
              href={link.href}
              aria-current={ariaCurrentFor(link, pathname)}
            >
              {link.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
