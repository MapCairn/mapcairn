// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";

/** The SDK's version, which pages name as the one they were checked against. */
export const SDK_VERSION = (
  JSON.parse(
    readFileSync(
      new URL("../../../packages/sdk/package.json", import.meta.url),
      "utf8",
    ),
  ) as { version: string }
).version;
