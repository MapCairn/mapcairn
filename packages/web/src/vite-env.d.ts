// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/// <reference types="vite/client" />

/** The address of the client's elements chunk in a server build, else null (`vite/elementsPreload.ts`). */
declare module "virtual:mapcairn/elements-chunk" {
  const address: string | null;
  export default address;
}
