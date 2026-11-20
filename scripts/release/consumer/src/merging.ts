// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Services } from "@mapcairn/core";

declare module "@mapcairn/core" {
  interface Services {
    readonly analytics: { readonly track: (event: string) => void };
  }
}

// A host may add a service of its own by declaration merging. The check reads
// `contracts.d.ts` with `skipLibCheck` off, so a declaration there that
// assumes the SDK's own list of services fails the host's type check here.
export const MERGED_SERVICE: keyof Services = "analytics";
