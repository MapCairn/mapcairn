// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { llmsText } from "../product/llmsText";
import { staticTextResponse } from "./staticTextResponse";

const LLMS_TXT_BODY = llmsText();

/**
 * React Router resource route: `/llms.txt`, the llmstxt.org summary of the
 * project for language models and agents, product first and playground
 * second (see `product/llmsText.ts`).
 */
export function loader(): Response {
  return staticTextResponse(LLMS_TXT_BODY, "text/plain; charset=utf-8");
}
