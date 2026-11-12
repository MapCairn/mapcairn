// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  CONTRACT_AREA,
  type FeatureQuerySubject,
  runFeatureQueryContract,
} from "../contracts/featureQuery.contract";
import { shapeGeometry } from "../draw/export";
import type { DrawShape } from "../draw/types";
import { FeatureQueryError, PortAbortError } from "../ports/errors";
import type { SelectionHit } from "../ports/featureQuery";
import { FakeFeatureQuery } from "./FakeFeatureQuery";

runFeatureQueryContract("FakeFeatureQuery", (): FeatureQuerySubject => {
  const query = new FakeFeatureQuery();
  return {
    query,
    controls: {
      respondWith: (hits) => query.respondWith(hits),
      failWith: (kind) => query.failWith(kind),
      hold: () => query.hold(),
    },
  };
});

const HIT: SelectionHit = {
  layerId: "gauges",
  feature: {
    id: "a",
    geometry: { type: "Point", coordinates: [18.4, -33.9] },
    fields: {},
  },
};

const REQUEST = { area: CONTRACT_AREA, layerIds: ["gauges"], limit: 5 };

const CIRCLE: DrawShape = {
  id: "shape-1",
  kind: "circle",
  label: "Circle 1",
  vertices: [{ lat: -33.9, lng: 18.4 }],
  radiusMetres: 500,
  done: true,
};

describe("FakeFeatureQuery", () => {
  it("finds nothing until it is scripted", async () => {
    expect(await new FakeFeatureQuery().within(REQUEST)).toEqual([]);
  });

  it("answers with a new array of what it was told to", async () => {
    const query = new FakeFeatureQuery();
    query.respondWith([HIT]);
    const first = await query.within(REQUEST);
    expect(first).toEqual([HIT]);
    expect(await query.within(REQUEST)).not.toBe(first);
  });

  it("fails until the failure is cleared", async () => {
    const query = new FakeFeatureQuery();
    query.respondWith([HIT]);
    query.failWith("network");
    await expect(query.within(REQUEST)).rejects.toMatchObject({
      kind: "network",
    });
    query.clearFailure();
    expect(await query.within(REQUEST)).toEqual([HIT]);
  });

  it("checks the request before it uses any script", async () => {
    const query = new FakeFeatureQuery();
    query.failWith("network");
    query.hold();
    await expect(query.within({ ...REQUEST, limit: 0 })).rejects.toMatchObject({
      kind: "invalid",
    });
  });

  it("holds every query until the release is called", async () => {
    const query = new FakeFeatureQuery();
    query.respondWith([HIT]);
    const release = query.hold();
    let settled = false;
    const pending = query.within(REQUEST).then((hits) => {
      settled = true;
      return hits;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    release();
    expect(await pending).toEqual([HIT]);
    expect(await query.within(REQUEST)).toEqual([HIT]);
  });

  it("keeps holding while a second hold is active, after the first is released", async () => {
    const query = new FakeFeatureQuery();
    query.respondWith([HIT]);
    const releaseFirst = query.hold();
    const releaseSecond = query.hold();
    releaseFirst();
    let settled = false;
    const pending = query.within(REQUEST).then((hits) => {
      settled = true;
      return hits;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(false);
    releaseSecond();
    expect(await pending).toEqual([HIT]);
  });

  it("rejects with a FeatureQueryError, not a PortAbortError, when aborted", async () => {
    const query = new FakeFeatureQuery();
    const error = await query
      .within({ ...REQUEST, signal: AbortSignal.abort() })
      .catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(FeatureQueryError);
    expect(error).not.toBeInstanceOf(PortAbortError);
  });

  it("does not answer a held query that was aborted, when the hold is released", async () => {
    const query = new FakeFeatureQuery();
    query.respondWith([HIT]);
    const release = query.hold();
    const controller = new AbortController();
    const pending = query.within({ ...REQUEST, signal: controller.signal });
    controller.abort();
    release();
    await expect(pending).rejects.toMatchObject({ kind: "aborted" });
  });

  it("records every request", async () => {
    const query = new FakeFeatureQuery();
    await query.within(REQUEST);
    await query.within({ ...REQUEST, limit: 9 });
    expect(query.calls).toEqual([REQUEST, { ...REQUEST, limit: 9 }]);
  });

  it("accepts the polygon a drawn circle gives, as it is", async () => {
    const area = shapeGeometry(CIRCLE);
    if (area?.type !== "Polygon") {
      throw new Error("A circle should give a polygon.");
    }
    const query = new FakeFeatureQuery();
    query.respondWith([HIT]);
    expect(await query.within({ ...REQUEST, area })).toEqual([HIT]);
  });
});
