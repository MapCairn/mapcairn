// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  CAPTURE_SUBJECTS,
  type CaptureSubject,
  type CaptureSubjectId,
  measuredReadout,
} from "./captureSubjects";

/*
 * The parts of a capture run that need no browser: what the command line
 * asked for, which subjects that means, the encoder's quality steps and the
 * checks that the page showed what the table says. `scripts/captureProduct.ts`
 * does the rest; keeping these here lets a unit test hold them.
 */

/** The port the e2e build is served on unless `MAPCAIRN_E2E_PORT` says otherwise: the one `playwright.config.ts` and `scripts/startE2e.mjs` use. */
export const DEFAULT_E2E_PORT = "4173";

/** The host the e2e build is served from, and the only one a run may contact. */
export const LOCAL_HOST = "localhost";

/** What a run was asked to do. */
export interface CaptureOptions {
  readonly record: boolean;
  readonly only: CaptureSubjectId | null;
}

/** The subject ids the table holds. */
function subjectIds(): readonly string[] {
  return CAPTURE_SUBJECTS.map(({ id }) => id);
}

/** The option that names one subject to take. */
const ONLY = "--only";

/** The option that fills or refreshes the recording of the basemap. */
const RECORD = "--record";

/**
 * Reads the command line: `--record` and `--only <subject>`. An unknown
 * argument, a bare `--only` and a subject the table does not hold are
 * mistakes, so a run never quietly takes every subject when one was meant.
 */
export function readOptions(args: readonly string[]): CaptureOptions {
  const unknown = args.filter(
    (arg, index) => arg !== RECORD && arg !== ONLY && args[index - 1] !== ONLY,
  );
  if (unknown.length > 0) {
    throw new Error(
      `Unknown argument ${unknown.join(", ")}. Use ${RECORD} and ${ONLY} <subject>.`,
    );
  }
  const at = args.indexOf(ONLY);
  const record = args.includes(RECORD);
  if (at === -1) {
    return { record, only: null };
  }
  const only = args[at + 1];
  if (only === undefined || only === RECORD) {
    throw new Error(`${ONLY} needs a subject: ${subjectIds().join(", ")}.`);
  }
  const subject = CAPTURE_SUBJECTS.find(({ id }) => id === only);
  if (subject === undefined) {
    throw new Error(
      `No subject "${only}". The subjects are ${subjectIds().join(", ")}.`,
    );
  }
  return { record, only: subject.id };
}

/** Refuses a recording on a continuous integration run: only a person asks a map provider for tiles. */
export function checkRecordAllowed(
  options: CaptureOptions,
  env: { readonly CI?: string },
): void {
  if (options.record && env.CI) {
    throw new Error(
      `${RECORD} asks OpenFreeMap for tiles, and only a person runs it, never CI.`,
    );
  }
}

/** The subjects a run takes: the one named by `--only`, or all of them. */
export function chosenSubjects(
  options: CaptureOptions,
): readonly CaptureSubject[] {
  return options.only === null
    ? CAPTURE_SUBJECTS
    : CAPTURE_SUBJECTS.filter(({ id }) => id === options.only);
}

/** The address the e2e build is served on. */
export function baseUrl(env: { readonly MAPCAIRN_E2E_PORT?: string }): string {
  return `http://${LOCAL_HOST}:${env.MAPCAIRN_E2E_PORT || DEFAULT_E2E_PORT}`;
}

/** The first encoder quality tried, in hundredths, and how far it steps down while a file is over its budget. */
const START_QUALITY = 82;
const QUALITY_STEP = 6;
const LOWEST_QUALITY = 40;

/** The encoder qualities to try, best first, as fractions of 1. */
export function qualitySteps(): readonly number[] {
  const steps: number[] = [];
  for (
    let quality = START_QUALITY;
    quality >= LOWEST_QUALITY;
    quality -= QUALITY_STEP
  ) {
    steps.push(quality / 100);
  }
  return steps;
}

/** Fails when the length a picture reads is not the one its subject's words state. */
export function checkReadout(
  subject: CaptureSubject,
  readout: string | undefined,
): void {
  const expected = measuredReadout(subject.id);
  if (readout !== expected) {
    throw new Error(
      `The ${subject.id} picture measures ${readout}, but its text says ${expected}: update the subject's readout and its words.`,
    );
  }
}

/** The view the map reports in its address. */
export interface ReportedView {
  readonly zoom: number;
  readonly lat: number;
  readonly lng: number;
}

/** How close the map's reported view must be to the table's: what the address's decimals hold. */
const ZOOM_TOLERANCE = 0.01;
const DEGREES_TOLERANCE = 0.00001;

/**
 * Fails when the map's own view, read at capture time, is not the one the
 * collar is drawn from, so a collar can never label a picture that shows
 * another place.
 */
export function checkView(
  subject: CaptureSubject,
  reported: ReportedView | null,
): void {
  const { zoom, latitude, longitude } = subject.view;
  const agrees =
    reported !== null &&
    Math.abs(reported.zoom - zoom) <= ZOOM_TOLERANCE &&
    Math.abs(reported.lat - latitude) <= DEGREES_TOLERANCE &&
    Math.abs(reported.lng - longitude) <= DEGREES_TOLERANCE;
  if (!agrees) {
    throw new Error(
      `The ${subject.id} picture shows ${JSON.stringify(reported)}, not ${JSON.stringify(subject.view)}: its collar would be wrong.`,
    );
  }
}

/** What to tell a person whose replay failed: the likely cause and the fix. */
export function replayHint(recording: string): string {
  return `Replaying ${recording} failed. If it is missing, or the view or the interface changed since it was recorded, run again once with ${RECORD}.`;
}
