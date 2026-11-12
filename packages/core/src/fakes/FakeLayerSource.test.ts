// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  CONTRACT_LAYER,
  runLayerSourceContract,
} from "../contracts/layerSource.contract";
import { FakeLayerSource } from "./FakeLayerSource";
import {
  SAMPLE_ALERT_LAYER,
  SAMPLE_FEED_LAYER,
  samplePoint,
} from "./layerFixtures";

runLayerSourceContract("FakeLayerSource", () => {
  const source = new FakeLayerSource();
  return {
    source,
    controls: {
      respondWith: (points) => {
        source.setFeatures(
          CONTRACT_LAYER.id,
          points.map((point) =>
            samplePoint(point.id, { title: point.title }, [
              point.lng,
              point.lat,
            ]),
          ),
        );
      },
      respondWithDetailLine: (from, to) => {
        source.setDetail(CONTRACT_LAYER.id, [
          {
            id: "line",
            geometry: { type: "LineString", coordinates: [from, to] },
            fields: {},
          },
        ]);
      },
      failWith: (kind) => {
        source.fail(CONTRACT_LAYER.id, kind);
      },
      hold: () => source.hold(),
    },
  };
});

describe("FakeLayerSource", () => {
  const now = Date.UTC(2026, 10, 9);

  it("records each request with the URL it stands for", async () => {
    const source = new FakeLayerSource();
    source.setFeatures(SAMPLE_FEED_LAYER.id, [samplePoint("a")]);
    await source.load({
      definition: SAMPLE_FEED_LAYER,
      controls: { window: "hour", small: "false" },
      now,
    });
    expect(source.requests.map((request) => request.url)).toEqual([
      "https://sample.test/feed/all_hour.json",
    ]);
  });

  it("returns nothing for a layer it was not told about, as an empty error", async () => {
    await expect(
      new FakeLayerSource().load({
        definition: SAMPLE_FEED_LAYER,
        controls: {},
        now,
      }),
    ).rejects.toMatchObject({ kind: "empty" });
  });

  it("can succeed again after a failure", async () => {
    const source = new FakeLayerSource();
    source.fail(SAMPLE_FEED_LAYER.id, "network");
    source.setFeatures(SAMPLE_FEED_LAYER.id, [samplePoint("a")]);
    await expect(
      source.load({ definition: SAMPLE_FEED_LAYER, controls: {}, now }),
    ).resolves.toHaveLength(1);
  });

  it("records detail requests and rejects an empty detail", async () => {
    const source = new FakeLayerSource();
    const feature = samplePoint("a", { area: "https://alerts.test/g" });
    await expect(
      source.loadDetail({ definition: SAMPLE_ALERT_LAYER, feature }),
    ).rejects.toMatchObject({ kind: "empty" });
    expect(source.detailRequests.map((request) => request.url)).toEqual([
      "https://alerts.test/g",
    ]);
  });

  it("rejects a detail request aborted before it starts", async () => {
    const source = new FakeLayerSource();
    await expect(
      source.loadDetail({
        definition: SAMPLE_ALERT_LAYER,
        feature: samplePoint("a", { area: "https://alerts.test/g" }),
        signal: AbortSignal.abort(),
      }),
    ).rejects.toMatchObject({ kind: "aborted" });
  });
});
