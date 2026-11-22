// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { type ColorMode, createStorageSlot } from "@docusaurus/theme-common";
import { THEME_STORAGE_KEY } from "@mapcairn/core";
import type { Props } from "@theme/ColorModeToggle";
import ColorModeToggle from "@theme-original/ColorModeToggle";
import type { ReactNode } from "react";
import { sharedChoiceFor } from "../../sharedChoice";

const sharedChoice = createStorageSlot(THEME_STORAGE_KEY);

/**
 * The framework's colour-mode toggle, which also writes the choice to the
 * key the reference site reads (`mapcairn:theme`), so a choice made here
 * carries to the map and the product page. `null` is "follow the system".
 */
export default function ColorModeToggleWithSharedChoice(
  props: Props,
): ReactNode {
  return (
    <ColorModeToggle
      {...props}
      onChange={(mode: ColorMode | null) => {
        props.onChange(mode);
        sharedChoice.set(sharedChoiceFor(mode));
      }}
    />
  );
}
