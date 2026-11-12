// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  IDENTIFY_VARIABLES,
  MAX_IDENTIFY_TOLERANCE_PX,
  MIN_IDENTIFY_TOLERANCE_PX,
} from "./identify";
import { parseTemplate } from "./template";
import {
  checkCard,
  checkDecoder,
  checkFields,
  checkUrl,
  isHttpsUrl,
  isObject,
  isText,
  type Json,
  list,
  type Problems,
  type ValidationOptions,
} from "./validateSupport";

/** A brace in the scheme, host, port or user information of a URL template, which end at its first `/`, `?` or `#`. */
const PLACEHOLDER_IN_ORIGIN = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*[{}]/i;

/** The two ways an identify URL says where the tap was: as degrees, or as a picture with the tapped pixel in it. */
const POINT_VARIABLES: readonly string[] = ["lng", "lat"];
const PICTURE_VARIABLES: readonly string[] = [
  "bbox",
  "width",
  "height",
  "x",
  "y",
];

function checkIdentifyUrl(
  problems: Problems,
  url: unknown,
  known: readonly string[],
): void {
  const path = "identify.url";
  checkUrl(problems, url, path, [...known, ...IDENTIFY_VARIABLES], {
    engineNames: [],
  });
  if (!isText(url) || !isHttpsUrl(url.replace(/[{}]/g, ""))) {
    return;
  }
  if (PLACEHOLDER_IN_ORIGIN.test(url)) {
    problems.add(
      path,
      "the scheme, host and port must be fixed text, with no placeholder",
    );
  }
  const names = parseTemplate(url).map((placeholder) => placeholder.name);
  const has = (needed: readonly string[]) =>
    needed.every((name) => names.includes(name));
  if (!has(POINT_VARIABLES) && !has(PICTURE_VARIABLES)) {
    problems.add(
      path,
      "must use {lng} and {lat}, or {bbox}, {width}, {height}, {x} and {y}",
    );
  }
}

function checkTolerance(problems: Problems, tolerance: unknown): void {
  if (
    tolerance !== undefined &&
    (!Number.isInteger(tolerance) ||
      (tolerance as number) < MIN_IDENTIFY_TOLERANCE_PX ||
      (tolerance as number) > MAX_IDENTIFY_TOLERANCE_PX)
  ) {
    problems.add(
      "identify.tolerance",
      `must be a whole number from ${MIN_IDENTIFY_TOLERANCE_PX} to ${MAX_IDENTIFY_TOLERANCE_PX}`,
    );
  }
}

/** Refuses a control or derived variable named like one the identify URL fills, so a template name is never ambiguous. */
function checkIdentifyNames(problems: Problems, definition: Json): void {
  const clashes = (item: unknown): item is Json & { id: string } =>
    isObject(item) && IDENTIFY_VARIABLES.includes(item.id as string);
  for (const key of ["controls", "variables"]) {
    list(definition[key]).forEach((item, index) => {
      if (clashes(item)) {
        problems.add(
          `${key}[${index}].id`,
          `${item.id} is a name the identify URL fills itself`,
        );
      }
    });
  }
}

/**
 * Checks a definition's optional `identify` block, with every path prefixed
 * `identify.`. The block is for a raster tile layer only. Its URL knows the
 * layer's controls and variables and {@link IDENTIFY_VARIABLES}, and nothing
 * else, so it never names the engine's own placeholders.
 */
export function checkIdentify(
  problems: Problems,
  definition: Json,
  source: Json,
  known: readonly string[],
  options: ValidationOptions,
): void {
  const identify = definition.identify;
  if (identify === undefined) {
    return;
  }
  if (source.kind !== "tiles") {
    problems.add("identify", "is only for raster tile layers");
    return;
  }
  if (!problems.object(identify, "identify")) {
    return;
  }
  checkIdentifyUrl(problems, identify.url, known);
  checkTolerance(problems, identify.tolerance);
  checkDecoder(problems, identify.decoder, "identify.decoder", options);
  if (identify.records !== undefined) {
    problems.text(identify.records, "identify.records");
  }
  const fields = checkFields(problems, identify.fields, "identify.fields");
  checkCard(problems, identify.card, "identify.card", fields, options);
  checkIdentifyNames(problems, definition);
}
