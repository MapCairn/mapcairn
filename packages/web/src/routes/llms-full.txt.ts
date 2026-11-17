// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { llmsFullText } from "../product/llmsText";
import { staticTextResponse } from "./staticTextResponse";

const LLMS_FULL_TXT_BODY = llmsFullText();

/**
 * React Router resource route: `/llms-full.txt`, `/llms.txt` followed by the
 * product page's whole text as Markdown, built from the page's own content.
 */
export function loader(): Response {
  return staticTextResponse(LLMS_FULL_TXT_BODY, "text/plain; charset=utf-8");
}
