// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Renders `public/og-image.png`, the Open Graph and Twitter card image of the
 * playground and the pages around it (`buildPageMeta.ts`): the same survey
 * sheet look as the product page's card, with the playground's own words.
 *
 * @remarks
 * Run with `npm run generate:og-image -w @mapcairn/web` after the brand copy
 * or colours change. The layout is shared with the product page's card
 * (`generateSdkOgImage.ts`) and lives in `src/product/shareCard.ts`.
 */
import { fileURLToPath } from "node:url";
import { PLAYGROUND_CARD } from "../src/product/shareCard";
import { renderShareCard } from "./renderShareCard";

await renderShareCard(
  PLAYGROUND_CARD,
  fileURLToPath(new URL("../public/og-image.png", import.meta.url)),
);
