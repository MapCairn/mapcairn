// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Renders `public/og-sdk.png`, the product page's Open Graph and Twitter card
 * image: the survey sheet look of the page, with the page's own headline.
 *
 * @remarks
 * Run with `npm run generate:og-sdk -w @mapcairn/web` after the art, the
 * product page's headline or the brand colours change. The layout is shared
 * with the playground's card (`generateOgImage.ts`) and lives in
 * `src/product/shareCard.ts`.
 */
import { fileURLToPath } from "node:url";
import { PRODUCT_CARD } from "../src/product/shareCard";
import { renderShareCard } from "./renderShareCard";

await renderShareCard(
  PRODUCT_CARD,
  fileURLToPath(new URL("../public/og-sdk.png", import.meta.url)),
);
