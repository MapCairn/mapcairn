// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Props } from "@theme/Logo";
import type { ReactNode } from "react";
import { BrandMark } from "../../components/BrandMark";

/** The brand's name, set beside the mark. */
const BRAND_NAME = "MapCairn";

/**
 * The brand lockup in the navbar: the cairn and the name, linking to the
 * reference site's front page at `/` (outside this site), as the product
 * page's own header does.
 */
export default function Logo({
  imageClassName,
  titleClassName,
  ...rest
}: Props): ReactNode {
  return (
    <a href="/" {...rest}>
      <BrandMark />
      <b className={titleClassName}>{BRAND_NAME}</b>
    </a>
  );
}
