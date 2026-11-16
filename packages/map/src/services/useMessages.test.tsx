// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createFakeServices,
  createLanguageCatalogue,
  FakeMessageCatalogue,
  type MessageCatalogue,
} from "@mapcairn/core";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMessages, useSettings } from "./hooks";
import { ServicesProvider } from "./ServicesProvider";

const ENGLISH = new FakeMessageCatalogue({ language: "en-GB" });
const AFRIKAANS = new FakeMessageCatalogue({
  language: "af",
  overrides: { "settings.title": "Instellings" },
});

interface Deferred {
  readonly promise: Promise<MessageCatalogue>;
  readonly resolve: (catalogue: MessageCatalogue) => void;
  readonly reject: (error: Error) => void;
}

function defer(): Deferred {
  let resolve!: Deferred["resolve"];
  let reject!: Deferred["reject"];
  const promise = new Promise<MessageCatalogue>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function Probe() {
  const messages = useMessages();
  const { update } = useSettings();
  return (
    <>
      <p data-testid="text">
        {messages.language}:{messages.t("settings.title", {})}
      </p>
      <button type="button" onClick={() => update({ language: "af" })}>
        af
      </button>
      <button type="button" onClick={() => update({ language: "en-GB" })}>
        en
      </button>
      <button type="button" onClick={() => update({ language: null })}>
        follow
      </button>
    </>
  );
}

interface Options {
  readonly load?: (tag: string) => MessageCatalogue | Promise<MessageCatalogue>;
  readonly languages?: readonly string[];
  readonly language?: string | null;
  readonly withCatalogue?: boolean;
}

function setup({
  load = (tag) => (tag === "af" ? AFRIKAANS : ENGLISH),
  languages = [],
  language = null,
  withCatalogue = true,
}: Options = {}) {
  const services = createFakeServices({
    messages: ENGLISH,
    ...(withCatalogue
      ? {
          languages: createLanguageCatalogue(
            [
              { tag: "en-GB", label: "English" },
              { tag: "af", label: "Afrikaans" },
            ],
            "en-GB",
            load,
          ),
        }
      : { languages: undefined }),
  });
  services.fakes.settings.set({ language });
  services.fakes.preferences.set({ languages });
  render(
    <ServicesProvider services={services}>
      <Probe />
    </ServicesProvider>,
  );
  return services;
}

const text = () => screen.getByTestId("text").textContent;
const choose = (name: string) =>
  act(() => {
    screen.getByRole("button", { name }).click();
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useMessages without a language catalogue", () => {
  it("is the services' catalogue, whatever the language setting says", () => {
    setup({ withCatalogue: false, language: "af", languages: ["af"] });
    expect(text()).toBe("en-GB:Settings");
  });
});

describe("useMessages with a language catalogue", () => {
  it("speaks the default language when nothing else matches", () => {
    setup();
    expect(text()).toBe("en-GB:Settings");
  });

  it("follows the browser's languages while no choice is made", async () => {
    setup({ languages: ["fr", "af-ZA"] });
    expect(await screen.findByText("af:Instellings")).toBeTruthy();
  });

  it("prefers the person's choice to the browser's languages, and goes back to following them", async () => {
    setup({ languages: ["af"], language: "en-GB" });
    expect(text()).toBe("en-GB:Settings");
    choose("af");
    expect(await screen.findByText("af:Instellings")).toBeTruthy();
    choose("en");
    expect(await screen.findByText("en-GB:Settings")).toBeTruthy();
    choose("follow");
    expect(await screen.findByText("af:Instellings")).toBeTruthy();
  });

  it("ignores a stored choice the host does not offer", () => {
    setup({ language: "fr" });
    expect(text()).toBe("en-GB:Settings");
  });

  it("switches at once for a synchronous load", () => {
    setup();
    choose("af");
    expect(text()).toBe("af:Instellings");
  });

  it("keeps the previous catalogue while a lazy load is pending, then swaps it in", async () => {
    const pending = defer();
    setup({ load: (tag) => (tag === "af" ? pending.promise : ENGLISH) });
    choose("af");
    expect(text()).toBe("en-GB:Settings");
    await act(async () => {
      pending.resolve(AFRIKAANS);
      await pending.promise;
    });
    expect(text()).toBe("af:Instellings");
  });

  it("ignores a load that finishes after the person chose another language", async () => {
    const slow = defer();
    setup({ load: (tag) => (tag === "af" ? slow.promise : ENGLISH) });
    choose("af");
    choose("en");
    await act(async () => {
      slow.resolve(AFRIKAANS);
      await slow.promise;
    });
    expect(text()).toBe("en-GB:Settings");
  });

  it("keeps the previous catalogue and warns when a load fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failing = defer();
    setup({ load: (tag) => (tag === "af" ? failing.promise : ENGLISH) });
    choose("af");
    await act(async () => {
      failing.reject(new Error("offline"));
      await failing.promise.catch(() => {});
    });
    expect(text()).toBe("en-GB:Settings");
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("keeps the previous catalogue and warns when a load throws", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    setup({
      load: (tag) => {
        if (tag === "af") {
          throw new Error("no messages");
        }
        return ENGLISH;
      },
    });
    choose("af");
    expect(text()).toBe("en-GB:Settings");
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("does not load again for a re-render with the same language", () => {
    const load = vi.fn((tag: string) => (tag === "af" ? AFRIKAANS : ENGLISH));
    setup({ load });
    choose("af");
    choose("af");
    expect(load.mock.calls.filter(([tag]) => tag === "af")).toHaveLength(1);
  });
});
