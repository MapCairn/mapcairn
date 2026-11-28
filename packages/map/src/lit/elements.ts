// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Every private element's definition. Importing this module evaluates Lit,
 * which needs a browser: only `privateElements` imports it, with a dynamic
 * `import()`.
 */
import { defineSegmentedControl } from "../ui/SegmentedControl/SegmentedControlElement";
import type { PrivateElementTags } from "./privateElements";

/** Defines the private elements and gives the names they were defined under. */
export function definePrivateElements(): PrivateElementTags {
  return { segmented: defineSegmentedControl() };
}
