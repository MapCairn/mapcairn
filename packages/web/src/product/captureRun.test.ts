// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  baseUrl,
  checkReadout,
  checkRecordAllowed,
  checkView,
  chosenSubjects,
  DEFAULT_E2E_PORT,
  qualitySteps,
  readOptions,
  replayHint,
} from "./captureRun";
import { CAPTURE_SUBJECTS, captureSubject } from "./captureSubjects";

describe("readOptions", () => {
  it("takes every subject, replaying the recording, with no arguments", () => {
    expect(readOptions([])).toEqual({ record: false, only: null });
  });

  it("reads --record and --only <subject>, in either order", () => {
    expect(readOptions(["--record"])).toEqual({ record: true, only: null });
    expect(readOptions(["--only", "hero"])).toEqual({
      record: false,
      only: "hero",
    });
    expect(readOptions(["--record", "--only", "heroWide"])).toEqual({
      record: true,
      only: "heroWide",
    });
    expect(readOptions(["--only", "heroWide", "--record"])).toEqual({
      record: true,
      only: "heroWide",
    });
  });

  it("refuses a bare --only instead of taking every subject", () => {
    expect(() => readOptions(["--only"])).toThrow(/--only needs a subject/);
    expect(() => readOptions(["--only", "--record"])).toThrow(
      /--only needs a subject/,
    );
  });

  it("refuses a subject the table does not hold, naming those it does", () => {
    expect(() => readOptions(["--only", "nowhere"])).toThrow(
      'No subject "nowhere". The subjects are hero, heroWide.',
    );
  });

  it("refuses an argument it does not know", () => {
    expect(() => readOptions(["--recrod"])).toThrow(
      /Unknown argument --recrod/,
    );
    expect(() => readOptions(["hero"])).toThrow(/Unknown argument hero/);
  });
});

describe("checkRecordAllowed", () => {
  it("refuses a recording on a CI run, and allows it for a person", () => {
    const record = { record: true, only: null } as const;
    expect(() => checkRecordAllowed(record, { CI: "true" })).toThrow(
      /never CI/,
    );
    expect(() => checkRecordAllowed(record, {})).not.toThrow();
    expect(() =>
      checkRecordAllowed({ record: false, only: null }, { CI: "true" }),
    ).not.toThrow();
  });
});

describe("chosenSubjects", () => {
  it("is every subject, or the one named", () => {
    expect(chosenSubjects({ record: false, only: null })).toEqual(
      CAPTURE_SUBJECTS,
    );
    expect(
      chosenSubjects({ record: false, only: "hero" }).map(({ id }) => id),
    ).toEqual(["hero"]);
  });
});

describe("baseUrl", () => {
  it("is the local e2e port unless the variable names another", () => {
    expect(baseUrl({})).toBe(`http://localhost:${DEFAULT_E2E_PORT}`);
    expect(baseUrl({ MAPCAIRN_E2E_PORT: "4191" })).toBe(
      "http://localhost:4191",
    );
    expect(baseUrl({ MAPCAIRN_E2E_PORT: "" })).toBe(
      `http://localhost:${DEFAULT_E2E_PORT}`,
    );
  });
});

describe("qualitySteps", () => {
  it("steps the encoder down from 0.82 to 0.40, best first", () => {
    const steps = qualitySteps();
    expect(steps[0]).toBe(0.82);
    expect(steps.at(-1)).toBeGreaterThanOrEqual(0.4);
    expect(steps).toEqual([...steps].sort((a, b) => b - a));
    expect(steps).toEqual([0.82, 0.76, 0.7, 0.64, 0.58, 0.52, 0.46, 0.4]);
  });
});

describe("checkReadout", () => {
  const hero = captureSubject("hero");

  it("passes when the picture reads the length its words state", () => {
    expect(() => checkReadout(hero, "3.37 km")).not.toThrow();
  });

  it("fails, naming both lengths, when it reads another", () => {
    expect(() => checkReadout(hero, "3.1 km")).toThrow(
      "The hero picture measures 3.1 km, but its text says 3.37 km",
    );
    expect(() => checkReadout(hero, undefined)).toThrow(/measures undefined/);
  });
});

describe("checkView", () => {
  const hero = captureSubject("hero");
  const agreeing = { zoom: 13, lat: -33.97, lng: 18.48 };

  it("passes when the map reports the view the collar is drawn from", () => {
    for (const subject of CAPTURE_SUBJECTS) {
      expect(() =>
        checkView(subject, {
          zoom: subject.view.zoom,
          lat: subject.view.latitude,
          lng: subject.view.longitude,
        }),
      ).not.toThrow();
    }
  });

  it("fails when the map has moved, even a little, or reports none", () => {
    expect(() => checkView(hero, { ...agreeing, lat: -33.9366 })).toThrow(
      /words would be wrong/,
    );
    expect(() => checkView(hero, { ...agreeing, lng: 18.4805 })).toThrow(
      /words would be wrong/,
    );
    expect(() => checkView(hero, { ...agreeing, zoom: 13.5 })).toThrow(
      /words would be wrong/,
    );
    expect(() => checkView(hero, null)).toThrow(/words would be wrong/);
  });
});

describe("replayHint", () => {
  it("names the recording and the fix: run once with --record", () => {
    expect(replayHint("hero-light.har.zip")).toContain("hero-light.har.zip");
    expect(replayHint("hero-light.har.zip")).toContain("--record");
  });
});
