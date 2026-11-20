// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import * as contracts from "@mapcairn/core/contracts";
import { useModelContextTool } from "@mapcairn/react";

// Only a type check reads this file: it proves the second entry point of
// `core` and the `react` package resolve and have declarations that compile.
export const ENTRY_POINTS = { contracts, useModelContextTool };
