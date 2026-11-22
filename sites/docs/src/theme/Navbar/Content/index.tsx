// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { ThemeClassNames } from "@docusaurus/theme-common";
import { useNavbarMobileSidebar } from "@docusaurus/theme-common/internal";
import NavbarColorModeToggle from "@theme/Navbar/ColorModeToggle";
import NavbarLogo from "@theme/Navbar/Logo";
import NavbarMobileSidebarToggle from "@theme/Navbar/MobileSidebar/Toggle";
import clsx from "clsx";
import type { ReactNode } from "react";
import { HEADER_LINKS } from "../../../headerLinks";

/**
 * The header's content: the sidebar toggle on a narrow screen, the brand, and
 * the product page's three links with the colour-mode toggle. The links stay
 * in the bar at every width, as they do on the product page, instead of
 * moving into the framework's drawer, so there is a way back to `/` and
 * `/map` from every page. The row scrolls sideways inside itself when very
 * large text leaves no room.
 */
export default function NavbarContent(): ReactNode {
  const mobileSidebar = useNavbarMobileSidebar();
  return (
    <div className="navbar__inner">
      <div
        className={clsx(
          ThemeClassNames.layout.navbar.containerLeft,
          "navbar__items",
        )}
      >
        {!mobileSidebar.disabled && <NavbarMobileSidebarToggle />}
        <NavbarLogo />
      </div>
      <div
        className={clsx(
          ThemeClassNames.layout.navbar.containerRight,
          "navbar__items navbar__items--right",
        )}
      >
        <nav aria-label="Main" className="header-nav">
          <ul className="header-nav__list">
            {HEADER_LINKS.map(({ text, href, current }) => (
              <li key={href}>
                <a
                  className="navbar__link"
                  href={href}
                  aria-current={current ? "page" : undefined}
                >
                  {text}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <NavbarColorModeToggle />
      </div>
    </div>
  );
}
