// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Props } from "@theme/CodeBlock/Line/Token";
import type { ReactNode } from "react";

/**
 * One token of a highlighted code line. The framework's version is a
 * pass-through, and the highlighter gives an empty token `display:
 * inline-block` as a style attribute, which the Content-Security-Policy
 * blocks. The line already ends in a `<br>` that keeps an empty line from
 * collapsing, so the attribute is dropped.
 */
export default function CodeBlockLineToken({
  line: _line,
  token: _token,
  style: _style,
  ...props
}: Props): ReactNode {
  return <span {...props} />;
}
