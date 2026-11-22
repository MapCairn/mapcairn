// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { ApiExport } from "./extract";

/**
 * An export with every field set to its empty value, for a test to override
 * the fields it is about.
 * @param fields - The fields that differ.
 */
export function anExport(fields: Partial<ApiExport> = {}): ApiExport {
  return {
    name: "thing",
    kind: "function",
    packageName: "@fixture/pkg",
    signature: "function thing(): void;",
    summary: "Does a thing.",
    remarks: "",
    parameters: [],
    typeParameters: [],
    returnType: "void",
    returns: "",
    examples: [],
    since: "",
    deprecated: "",
    see: [],
    throws: [],
    members: [],
    references: [],
    bases: [],
    releaseTag: "public",
    ...fields,
  };
}
