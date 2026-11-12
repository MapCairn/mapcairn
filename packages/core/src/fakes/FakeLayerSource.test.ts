// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  CONTRACT_IDENTIFY_LAYER,
  CONTRACT_LAYER,
  CONTRACT_OTHER_IDENTIFY_LAYER,
  runLayerSourceContract,
} from "../contracts/layerSource.contract";
import { identifyUrl } from "../layers/identify";
import type { IdentifyTarget } from "../ports/layers";
import { FakeLayerSource } from "./FakeLayerSource";
import {
  SAMPLE_ALERT_LAYER,
  SAMPLE_FEED_LAYER,
  SAMPLE_IDENTIFY_LAYER,
  samplePoint,
} from "./layerFixtures";

const IDENTIFY_LAYERS = [
  CONTRACT_IDENTIFY_LAYER,
  CONTRACT_OTHER_IDENTIFY_LAYER,
];

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
      respondToIdentifyWith: (points) => {
        for (const { id } of IDENTIFY_LAYERS) {
          source.setIdentified(
            id,
            points.map((point) =>
              samplePoint(point.id, { title: point.title }, [
                point.lng,
                point.lat,
              ]),
            ),
          );
        }
      },
      failIdentifyWith: (kind) => {
        for (const { id } of IDENTIFY_LAYERS) {
          source.failIdentify(id, kind);
        }
      },
      holdIdentify: () => source.holdIdentify(CONTRACT_IDENTIFY_LAYER.id),
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

  describe("identify", () => {
    const at: IdentifyTarget = {
      latlng: { lat: -33.9249, lng: 18.4241 },
      zoom: 10,
    };
    const ask = (source: FakeLayerSource) =>
      source.identify({
        definition: SAMPLE_IDENTIFY_LAYER,
        controls: { period: "100" },
        now,
        at,
      });

    it("records each request with the URL a real source would fetch", async () => {
      const source = new FakeLayerSource();
      await ask(source);
      expect(source.identifyRequests.map((request) => request.url)).toEqual([
        identifyUrl(SAMPLE_IDENTIFY_LAYER, { period: "100" }, now, at),
      ]);
    });

    it("finds nothing for a layer it was not told about, without an error", async () => {
      await expect(ask(new FakeLayerSource())).resolves.toEqual([]);
    });

    it("answers with the last features set for the layer, and can succeed after a failure", async () => {
      const source = new FakeLayerSource();
      source.failIdentify(SAMPLE_IDENTIFY_LAYER.id, "invalid");
      source.setIdentified(SAMPLE_IDENTIFY_LAYER.id, [samplePoint("a")]);
      source.setIdentified(SAMPLE_IDENTIFY_LAYER.id, [
        samplePoint("b"),
        samplePoint("c"),
      ]);
      const features = await ask(source);
      expect(features.map((feature) => feature.id)).toEqual(["b", "c"]);
    });

    it("does not let hold() or a feed's outcome affect identify", async () => {
      const source = new FakeLayerSource();
      source.fail(SAMPLE_IDENTIFY_LAYER.id, "network");
      source.hold();
      await expect(ask(source)).resolves.toEqual([]);
    });

    it("does not let a held identify hold a load", async () => {
      const source = new FakeLayerSource();
      source.holdIdentify(SAMPLE_FEED_LAYER.id);
      source.setFeatures(SAMPLE_FEED_LAYER.id, [samplePoint("a")]);
      await expect(
        source.load({ definition: SAMPLE_FEED_LAYER, controls: {}, now }),
      ).resolves.toHaveLength(1);
    });

    it("refuses, as a real source does, a tap it cannot build a URL for or a URL that is not https, and records neither", async () => {
      const source = new FakeLayerSource();
      await expect(
        source.identify({
          definition: SAMPLE_IDENTIFY_LAYER,
          controls: {},
          now,
          at: { ...at, zoom: Number.NaN },
        }),
      ).rejects.toMatchObject({ kind: "invalid" });
      await expect(
        source.identify({
          definition: {
            ...SAMPLE_IDENTIFY_LAYER,
            identify: {
              ...SAMPLE_IDENTIFY_LAYER.identify,
              url: "http://api.test/identify?bbox={bbox}",
            },
          },
          controls: { period: "100" },
          now,
          at,
        }),
      ).rejects.toMatchObject({ kind: "invalid" });
      expect(source.identifyRequests).toEqual([]);
    });

    it("lets a release end only its own hold, not a later one on the same layer", async () => {
      const source = new FakeLayerSource();
      source.setIdentified(SAMPLE_IDENTIFY_LAYER.id, [samplePoint("a")]);
      const first = source.holdIdentify(SAMPLE_IDENTIFY_LAYER.id);
      const second = source.holdIdentify(SAMPLE_IDENTIFY_LAYER.id);
      first();
      let settled = false;
      const asking = ask(source).then(() => {
        settled = true;
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(settled).toBe(false);
      second();
      await asking;
      expect(settled).toBe(true);
    });

    it("stops holding once released, so a later identify answers at once", async () => {
      const source = new FakeLayerSource();
      source.setIdentified(SAMPLE_IDENTIFY_LAYER.id, [samplePoint("a")]);
      const release = source.holdIdentify(SAMPLE_IDENTIFY_LAYER.id);
      release();
      await expect(ask(source)).resolves.toHaveLength(1);
    });
  });
});
