// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import Link from "@docusaurus/Link";
import Heading from "@theme/Heading";
import type { Props } from "@theme/NotFound/Content";
import clsx from "clsx";
import type { ReactNode } from "react";

/**
 * The page for an address that is not here: what happened in plain words, the
 * way back to the start, and where search is. The framework's own wording asks
 * the reader to contact the owner of the site that linked them, which is not
 * what this project's pages say.
 */
export default function NotFoundContent({ className }: Props): ReactNode {
  return (
    <main className={clsx("not-found", className)}>
      <Heading as="h1">This page doesn't exist</Heading>
      <p>The address may be mistyped, or the page may have moved.</p>
      <p>
        Go back to <Link to="/">Get started</Link>, or use the Search button at
        the top of the page (or press <kbd>/</kbd>) to find what you were
        looking for.
      </p>
    </main>
  );
}
