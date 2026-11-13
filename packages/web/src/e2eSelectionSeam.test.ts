// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { FeatureRef, FeatureSelection } from "@mapcairn/core";
import { runFeatureSelectionContract } from "@mapcairn/core/contracts";
import { afterEach, describe, expect, it } from "vitest";
import {
  installScriptedSelection,
  type ScriptedSelectionHandle,
} from "../e2e/support/services";

const REFERENCE: FeatureRef = { layerId: "gauges", featureId: "a" };

function install(limit: number, refs: readonly FeatureRef[] = []) {
  installScriptedSelection({ limit, refs });
  const handle = window.__mapcairnSelection as ScriptedSelectionHandle;
  const services = window.__MAPCAIRN_TEST_SERVICES__ as {
    selection: FeatureSelection;
  };
  return { handle, selection: services.selection };
}

afterEach(() => {
  window.__MAPCAIRN_TEST_SERVICES__ = undefined;
  window.__mapcairnSelection = undefined;
});

// A browser test cannot pass a function into the page, so the scripted store
// is written out in the page. The port's own contract keeps that copy honest.
runFeatureSelectionContract(
  "the browser test seam's scripted store",
  ({ limit }) => {
    const { handle, selection } = install(limit);
    return {
      selection,
      controls: { replaceExternally: handle.replaceExternally },
    };
  },
);

describe("the scripted selection store", () => {
  it("starts with the references it is given, and keeps the other scripted services", () => {
    window.__MAPCAIRN_TEST_SERVICES__ = { search: {} };

    const { selection } = install(5, [REFERENCE, REFERENCE]);

    expect(selection.getState()).toEqual([REFERENCE]);
    expect(window.__MAPCAIRN_TEST_SERVICES__).toMatchObject({ search: {} });
  });

  it("counts its subscribers, so a test can see the host subscribed", () => {
    const { handle, selection } = install(5);
    expect(handle.store).toBe(selection);
    expect(handle.subscribers()).toBe(0);

    const stop = selection.subscribe(() => undefined);
    expect(handle.subscribers()).toBe(1);

    stop();
    expect(handle.subscribers()).toBe(0);
  });
});
