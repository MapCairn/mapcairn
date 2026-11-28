// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createFakeServices,
  createLanguageCatalogue,
  createMessageStore,
  FakeMessageCatalogue,
  type MessageCatalogue,
  type MessageStore,
  type Services,
} from "@mapcairn/core";
import { act, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMessageStoreState } from "./activeMessages";
import { useLanguageLoad, useMessages } from "./hooks";
import { ServicesProvider } from "./ServicesProvider";

const ENGLISH = new FakeMessageCatalogue({ language: "en-GB" });
const AFRIKAANS = new FakeMessageCatalogue({
  language: "af",
  overrides: { "settings.title": "Instellings" },
});
const OFFERED = [
  { tag: "en-GB", label: "English" },
  { tag: "af", label: "Afrikaans" },
];

function languagesWith(
  load: (tag: string) => MessageCatalogue | Promise<MessageCatalogue>,
) {
  return createLanguageCatalogue(OFFERED, "en-GB", load);
}

function Probe() {
  const messages = useMessages();
  const load = useLanguageLoad();
  return (
    <p data-testid="text">
      {messages.language}:{messages.t("settings.title", {})}:
      {load?.failed ?? "ok"}
    </p>
  );
}

function tree(services: Services) {
  return (
    <ServicesProvider services={services}>
      <Probe />
    </ServicesProvider>
  );
}

function afrikaansServices(
  load: (tag: string) => MessageCatalogue | Promise<MessageCatalogue>,
) {
  const services = createFakeServices({
    messages: ENGLISH,
    languages: languagesWith(load),
  });
  services.fakes.settings.set({ language: "af" });
  return services;
}

const text = () => screen.getByTestId("text").textContent;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ServicesProvider and the language", () => {
  it("loads a language once under StrictMode, lazily or at once", async () => {
    for (const result of [AFRIKAANS, Promise.resolve(AFRIKAANS)]) {
      const load = vi.fn(() => result);
      const { unmount } = render(
        <StrictMode>{tree(afrikaansServices(load))}</StrictMode>,
      );
      await act(async () => {});
      expect(text()).toBe("af:Instellings:ok");
      expect(load).toHaveBeenCalledTimes(1);
      unmount();
    }
  });

  it("keeps the loaded language, without loading again, when a new services object has another preferences store", async () => {
    const load = vi.fn(() => Promise.resolve(AFRIKAANS));
    const services = afrikaansServices(load);
    const { rerender } = render(tree(services));
    await act(async () => {});

    const { preferences } = services;
    rerender(
      tree({
        ...services,
        preferences: {
          get: () => preferences.get(),
          subscribe: (listener) => preferences.subscribe(listener),
        },
      }),
    );

    expect(text()).toBe("af:Instellings:ok");
    await act(async () => {});
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("follows the settings store a new services object brings", async () => {
    const services = afrikaansServices(() => AFRIKAANS);
    const { rerender } = render(tree(services));
    await act(async () => {});
    const other = createFakeServices();
    other.fakes.settings.set({ language: "en-GB" });

    rerender(tree({ ...services, settings: other.settings }));
    await act(async () => {});
    expect(text()).toBe("en-GB:Settings:ok");

    act(() => {
      other.settings.set({ language: "af" });
    });
    expect(text()).toBe("af:Instellings:ok");
  });

  it("keeps the previous language while a replaced language catalogue is loading", async () => {
    const services = afrikaansServices(() => AFRIKAANS);
    const { rerender } = render(tree(services));
    await act(async () => {});
    let finish!: (catalogue: MessageCatalogue) => void;
    const next = new Promise<MessageCatalogue>((resolve) => {
      finish = resolve;
    });

    rerender(tree({ ...services, languages: languagesWith(() => next) }));

    expect(text()).toBe("af:Instellings:ok");
    await act(async () => {
      finish(
        new FakeMessageCatalogue({
          language: "af",
          overrides: { "settings.title": "Opstelling" },
        }),
      );
    });
    expect(text()).toBe("af:Opstelling:ok");
  });

  it("speaks a replaced catalogue at once for a host with no languages", () => {
    const services = createFakeServices({
      messages: ENGLISH,
      languages: undefined,
    });
    const { rerender } = render(tree(services));

    rerender(tree({ ...services, messages: AFRIKAANS }));

    expect(text()).toBe("af:Instellings:ok");
  });

  it("hydrates a server render with a store that has already loaded another language", async () => {
    function Spoken({ store }: { readonly store: MessageStore }) {
      return <p>{useMessageStoreState(store).messages.language}</p>;
    }
    const server = document.createElement("div");
    server.innerHTML = renderToString(
      <Spoken store={createMessageStore(afrikaansServices(() => AFRIKAANS))} />,
    );
    document.body.append(server);
    const loaded = createMessageStore(afrikaansServices(() => AFRIKAANS));
    loaded.subscribe(() => {})();
    expect(loaded.getState().messages.language).toBe("af");
    const recovered = vi.fn();
    const errors = vi.spyOn(console, "error");

    let root!: Root;
    await act(async () => {
      root = hydrateRoot(server, <Spoken store={loaded} />, {
        onRecoverableError: recovered,
      });
    });

    expect(server.textContent).toBe("af");
    expect(recovered).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    act(() => root.unmount());
    server.remove();
  });

  it("hydrates a server render in the services' own catalogue, then switches", async () => {
    const load = vi.fn(() => AFRIKAANS);
    const server = document.createElement("div");
    server.innerHTML = renderToString(tree(afrikaansServices(load)));
    expect(server.textContent).toBe("en-GB:Settings:ok");
    expect(load).not.toHaveBeenCalled();
    document.body.append(server);
    const recovered = vi.fn();
    const errors = vi.spyOn(console, "error");

    let root!: Root;
    await act(async () => {
      root = hydrateRoot(server, tree(afrikaansServices(load)), {
        onRecoverableError: recovered,
      });
    });

    expect(server.textContent).toBe("af:Instellings:ok");
    expect(recovered).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    act(() => root.unmount());
    server.remove();
  });
});
