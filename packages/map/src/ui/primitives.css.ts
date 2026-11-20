// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { layer } from "@vanilla-extract/css";

/**
 * The cascade layer every primitive's recipe sits in (see
 * `primitiveRecipe`). Styles outside a layer beat styles inside one whatever
 * their specificity or order, so a component's own class always overrides a
 * primitive without a doubled selector. The layer is declared once, here, and
 * every recipe that uses it imports this name.
 */
export const primitives = layer("primitives");
