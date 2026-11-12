// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  runUrlStateContract,
  type UrlStateSubject,
} from "../contracts/urlState.contract";
import { MemoryUrlState } from "./MemoryUrlState";

runUrlStateContract(
  "MemoryUrlState",
  (): UrlStateSubject => ({
    url: new MemoryUrlState(),
    controls: { settle: () => Promise.resolve() },
  }),
);

describe("MemoryUrlState", () => {
  it("reads the value it started with", () => {
    expect(new MemoryUrlState({ basemapId: "dark" }).read()).toEqual({
      basemapId: "dark",
    });
  });

  it("records every write in order", () => {
    const url = new MemoryUrlState();
    url.write({ basemapId: "a" });
    url.write({});
    expect(url.writes).toEqual([{ basemapId: "a" }, {}]);
  });
});
