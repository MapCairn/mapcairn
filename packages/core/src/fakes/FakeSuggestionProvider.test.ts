import { describe, expect, it } from "vitest";
import {
  runSuggestionProviderContract,
  type SuggestionProviderSubject,
} from "../contracts/suggestionProvider.contract";
import { PortAbortError, SearchError } from "../ports/errors";
import type { SearchResult } from "../ports/search";
import { FakeSuggestionProvider } from "./FakeSuggestionProvider";

runSuggestionProviderContract(
  "FakeSuggestionProvider",
  (): SuggestionProviderSubject => {
    const provider = new FakeSuggestionProvider();
    return {
      provider,
      controls: {
        willReturn: (results) => provider.setDefaultResults(results),
        willFail: (kind) => provider.failWith(kind),
        hold: () => {
          provider.holdNext();
        },
      },
    };
  },
);

const A: SearchResult = { id: "a", label: "A", centre: { lat: 1, lng: 2 } };
const B: SearchResult = { id: "b", label: "B", centre: { lat: 3, lng: 4 } };

describe("FakeSuggestionProvider", () => {
  it("answers per query, falling back to the default", async () => {
    const provider = new FakeSuggestionProvider();
    provider.setResults(" a ", [A]);
    provider.setDefaultResults([B]);
    expect(await provider.suggest("a")).toEqual([A]);
    expect(await provider.suggest("other")).toEqual([B]);
    expect(await new FakeSuggestionProvider().suggest("x")).toEqual([]);
  });

  it("answers a blank query with nothing and uses no script", async () => {
    const provider = new FakeSuggestionProvider();
    provider.setDefaultResults([A]);
    provider.failWith("failed");
    expect(await provider.suggest("  ")).toEqual([]);
  });

  it("records every call with its options", async () => {
    const provider = new FakeSuggestionProvider();
    await provider.suggest("a", { limit: 3 });
    expect(provider.suggestCalls).toEqual([
      { query: "a", options: { limit: 3 } },
    ]);
  });

  it("fails until the failure is cleared", async () => {
    const provider = new FakeSuggestionProvider();
    provider.setDefaultResults([A]);
    provider.failWith("rate-limited");
    await expect(provider.suggest("a")).rejects.toBeInstanceOf(SearchError);
    provider.clearFailure();
    expect(await provider.suggest("a")).toEqual([A]);
  });

  it("holds the next call until the handle settles it", async () => {
    const provider = new FakeSuggestionProvider();
    const held = provider.holdNext();
    const pending = provider.suggest("a");
    held.resolve([B]);
    expect(await pending).toEqual([B]);
    const second = provider.holdNext();
    const failing = provider.suggest("a");
    second.reject(new SearchError("failed"));
    await expect(failing).rejects.toBeInstanceOf(SearchError);
  });

  it("aborts a held call", async () => {
    const provider = new FakeSuggestionProvider();
    provider.holdNext();
    const controller = new AbortController();
    const pending = provider.suggest("a", { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(PortAbortError);
  });
});
