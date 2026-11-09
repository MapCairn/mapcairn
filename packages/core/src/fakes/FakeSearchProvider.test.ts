import { describe, expect, it } from "vitest";
import {
  runSearchProviderContract,
  type SearchProviderSubject,
} from "../contracts/searchProvider.contract";
import { PortAbortError, SearchError } from "../ports/errors";
import type { SearchResult } from "../ports/search";
import { FakeSearchProvider } from "./FakeSearchProvider";

runSearchProviderContract("FakeSearchProvider", (): SearchProviderSubject => {
  const provider = new FakeSearchProvider();
  return {
    provider,
    controls: {
      willReturn: (results) => {
        provider.setDefaultResults(results);
        provider.setReverseResult(results[0] ?? null);
      },
      willFail: (kind) => provider.failWith(kind),
      hold: () => {
        provider.holdNext();
      },
    },
  };
});

const A: SearchResult = { id: "a", label: "A", centre: { lat: 1, lng: 2 } };
const B: SearchResult = { id: "b", label: "B", centre: { lat: 3, lng: 4 } };

describe("FakeSearchProvider", () => {
  it("answers per query, falling back to the default", async () => {
    const provider = new FakeSearchProvider();
    provider.setResults(" a ", [A]);
    provider.setDefaultResults([B]);
    expect(await provider.search("a")).toEqual([A]);
    expect(await provider.search("other")).toEqual([B]);
    expect(await new FakeSearchProvider().search("x")).toEqual([]);
  });

  it("answers a blank query with nothing and uses no script", async () => {
    const provider = new FakeSearchProvider();
    provider.failWith("offline");
    expect(await provider.search("  ")).toEqual([]);
  });

  it("fails until the failure is cleared", async () => {
    const provider = new FakeSearchProvider();
    provider.setDefaultResults([A]);
    provider.failWith("rate-limited");
    await expect(provider.search("a")).rejects.toBeInstanceOf(SearchError);
    provider.clearFailure();
    expect(await provider.search("a")).toEqual([A]);
  });

  it("holds a search until the handle resolves it", async () => {
    const provider = new FakeSearchProvider();
    const held = provider.holdNext();
    let settled = false;
    const pending = provider.search("a").then((results) => {
      settled = true;
      return results;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    held.resolve([B]);
    expect(await pending).toEqual([B]);
    expect(await provider.search("a")).toEqual([]);
  });

  it("holds a search until the handle rejects it, even before the call arrives", async () => {
    const provider = new FakeSearchProvider();
    const held = provider.holdNext();
    held.reject(new SearchError("failed"));
    await expect(provider.search("a")).rejects.toBeInstanceOf(SearchError);
  });

  it("resolves a held reverse call with the first result, or null", async () => {
    const provider = new FakeSearchProvider();
    const first = provider.holdNext();
    const second = provider.holdNext();
    const a = provider.reverse({ lat: 1, lng: 2 });
    const b = provider.reverse({ lat: 1, lng: 2 });
    first.resolve([A, B]);
    second.resolve([]);
    expect(await a).toEqual(A);
    expect(await b).toBeNull();
  });

  it("ignores the outcome of a held call that was aborted", async () => {
    const provider = new FakeSearchProvider();
    const held = provider.holdNext();
    const controller = new AbortController();
    const pending = provider.search("a", { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(PortAbortError);
    held.resolve([A]);
    expect(await provider.search("a")).toEqual([]);
  });

  it("does not consume a hold for a call that is already aborted", async () => {
    const provider = new FakeSearchProvider();
    const held = provider.holdNext();
    const controller = new AbortController();
    controller.abort();
    await expect(
      provider.search("a", { signal: controller.signal }),
    ).rejects.toBeInstanceOf(PortAbortError);
    const pending = provider.search("a");
    held.resolve([A]);
    expect(await pending).toEqual([A]);
  });

  it("propagates a rejection from a held call that has a signal", async () => {
    const provider = new FakeSearchProvider();
    const held = provider.holdNext();
    const controller = new AbortController();
    const pending = provider.search("a", { signal: controller.signal });
    held.reject(new SearchError("offline"));
    await expect(pending).rejects.toBeInstanceOf(SearchError);
  });

  it("records every call", async () => {
    const provider = new FakeSearchProvider();
    await provider.search("a", { limit: 3 });
    await provider.reverse({ lat: 1, lng: 2 });
    expect(provider.searchCalls).toEqual([
      { query: "a", options: { limit: 3 } },
    ]);
    expect(provider.reverseCalls).toEqual([
      { position: { lat: 1, lng: 2 }, options: undefined },
    ]);
  });
});
