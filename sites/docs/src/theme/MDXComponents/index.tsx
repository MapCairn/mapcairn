// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { MDXComponentsObject } from "@theme/MDXComponents";
import MDXComponents from "@theme-original/MDXComponents";
import ScrollableTable from "../../components/ScrollableTable";

/** The framework's page elements, with tables in a box that scrolls on its own. */
const components: MDXComponentsObject = {
  ...MDXComponents,
  table: ScrollableTable,
};

export default components;
