// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import Link from "@docusaurus/Link";
import { PageMetadata } from "@docusaurus/theme-common";
import Heading from "@theme/Heading";
import type { Props } from "@theme/NotFound/Content";
import clsx from "clsx";
import type { ReactNode } from "react";
import { NOT_FOUND_TITLE } from "../../../notFound";

/**
 * The page for an address that is not here: what happened in plain words, the
 * way back to the start, and where search is. The framework's own wording asks
 * the reader to contact the owner of the site that linked them, which is not
 * what this project's pages say. The document title is set here, inside the
 * layout, because the layout sets its own title and the innermost one wins.
 */
export default function NotFoundContent({ className }: Props): ReactNode {
  return (
    <main className={clsx("not-found", className)}>
      <PageMetadata title={NOT_FOUND_TITLE} />
      <Heading as="h1">{NOT_FOUND_TITLE}</Heading>
      <p>The address may be mistyped, or the page may have moved.</p>
      <p>
        Go to <Link to="/">Get started</Link>, the{" "}
        <Link to="/api/">API reference</Link> or{" "}
        <Link to="/troubleshooting/">Troubleshooting</Link>, or use the Search
        button at the top of the page to find what you were looking for.
      </p>
    </main>
  );
}
