// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { ThemeClassNames } from "@docusaurus/theme-common";
import { useNavbarMobileSidebar } from "@docusaurus/theme-common/internal";
import NavbarColorModeToggle from "@theme/Navbar/ColorModeToggle";
import NavbarLogo from "@theme/Navbar/Logo";
import NavbarMobileSidebarToggle from "@theme/Navbar/MobileSidebar/Toggle";
import clsx from "clsx";
import type { ReactNode } from "react";
import HeaderLinks from "../../../components/HeaderLinks";
import SearchButton from "../../../components/Search/SearchButton";

/**
 * The header's content: the sidebar toggle on a narrow screen, the brand, the
 * search button and the colour-mode toggle, with the product page's three
 * links beside them from the width at which the row has room. Below that the
 * links are the first thing in the drawer (`Navbar/MobileSidebar/Layout`), so
 * nothing in the row overlaps and there is still a way back to `/` and `/map`
 * from every page.
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
        <HeaderLinks className="header-nav" />
        <SearchButton />
        <NavbarColorModeToggle />
      </div>
    </div>
  );
}
