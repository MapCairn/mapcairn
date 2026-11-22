// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Props } from "@theme/Navbar/MobileSidebar/Layout";
import NavbarMobileSidebarLayout from "@theme-original/Navbar/MobileSidebar/Layout";
import type { ReactNode } from "react";
import HeaderLinks from "../../../../components/HeaderLinks";

/**
 * The framework's drawer with the product page's three links under its
 * header, which is where they live below the width at which the header has
 * room for them. The drawer's brand shows its name, as the header's does.
 */
export default function Layout({ header, ...rest }: Props): ReactNode {
  return (
    <NavbarMobileSidebarLayout
      {...rest}
      header={
        <>
          {header}
          <HeaderLinks className="drawer-nav" />
        </>
      }
    />
  );
}
