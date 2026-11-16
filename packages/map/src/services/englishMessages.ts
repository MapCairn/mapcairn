// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createMessageCatalogue,
  EN_GB_CATALOGUE,
  type MessageCatalogue,
} from "@mapcairn/core";

/**
 * The SDK's own English catalogue, for the few pieces that must still speak
 * when a test or a host mounts them without a services provider.
 */
export const ENGLISH_MESSAGES: MessageCatalogue = createMessageCatalogue(
  "en-GB",
  EN_GB_CATALOGUE,
  EN_GB_CATALOGUE,
);
