// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createFakeServices,
  createLanguageCatalogue,
  EN_GB_CATALOGUE,
  FakeDevicePreferences,
  FakeMessageCatalogue,
  type LanguageOption,
  MemorySettingsStore,
  type MessageCatalogue,
  type Settings,
} from "@mapcairn/core";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ServicesProvider } from "../../services";
import { LiveRegionProvider } from "../../ui/LiveRegion";
import { SettingsSection, type SettingsSectionProps } from "./SettingsSection";

const DEFAULT_PRIVACY_NOTE = EN_GB_CATALOGUE["settings.privacy.default"];

interface Options {
  readonly finePointer?: boolean;
  readonly persistent?: boolean;
  readonly initial?: Partial<Settings>;
  readonly props?: SettingsSectionProps;
  readonly languages?: readonly LanguageOption[];
  readonly messages?: FakeMessageCatalogue;
  readonly browserLanguages?: readonly string[];
  readonly load?: (tag: string) => MessageCatalogue | Promise<MessageCatalogue>;
}

function renderSettings({
  finePointer = true,
  persistent = true,
  initial,
  props,
  languages,
  messages,
  browserLanguages = [],
  load = (tag) => new FakeMessageCatalogue({ language: tag }),
}: Options = {}) {
  const settings = new MemorySettingsStore({ persistent, initial });
  const preferences = new FakeDevicePreferences({
    finePointer,
    languages: browserLanguages,
  });
  const services = createFakeServices({
    settings,
    preferences,
    ...(messages ? { messages } : {}),
    languages: languages
      ? createLanguageCatalogue(languages, "en-GB", load)
      : undefined,
  });
  const view = render(
    <ServicesProvider services={services}>
      <LiveRegionProvider>
        <SettingsSection {...props} />
      </LiveRegionProvider>
    </ServicesProvider>,
  );
  return { ...view, settings, preferences, services };
}

const zoomSwitch = () =>
  screen.getByRole("switch", { name: "Show zoom buttons" });

describe("SettingsSection heading", () => {
  it("is a region named Settings with an h3 by default", () => {
    renderSettings();
    expect(screen.getByRole("region", { name: "Settings" })).toBe(
      screen.getByTestId("sheet-section-settings"),
    );
    expect(
      screen.getByRole("heading", { name: "Settings", level: 3 }),
    ).toBeInTheDocument();
  });

  it("uses the given level, with Privacy one level below", () => {
    renderSettings({ props: { headingLevel: 4 } });
    expect(
      screen.getByRole("heading", { name: "Settings", level: 4 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Privacy", level: 5 }),
    ).toBeInTheDocument();
  });

  it("puts Privacy under an h4 in the default sheet outline", () => {
    renderSettings();
    expect(
      screen.getByRole("heading", { name: "Privacy", level: 4 }),
    ).toBeInTheDocument();
  });
});

describe("theme", () => {
  it("is a radio group named Theme with System, Light and Dark", () => {
    renderSettings();
    const group = screen.getByRole("radiogroup", { name: "Theme" });
    for (const name of ["System", "Light", "Dark"]) {
      expect(within(group).getByRole("radio", { name })).toBeInTheDocument();
    }
    expect(screen.getByTestId("theme-option-system")).toBeInTheDocument();
    expect(screen.getByTestId("theme-option-light")).toBeInTheDocument();
    expect(screen.getByTestId("theme-option-dark")).toBeInTheDocument();
  });

  it("shows the stored choice as selected", () => {
    renderSettings({ initial: { theme: "dark" } });
    expect(screen.getByTestId("theme-option-dark")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByTestId("theme-option-system")).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("stores the choice and applies it to the document", () => {
    const { settings, services } = renderSettings();
    fireEvent.click(screen.getByTestId("theme-option-dark"));
    expect(settings.get().theme).toBe("dark");
    expect(services.fakes.theme.appliedTheme).toBe("dark");
    expect(screen.getByTestId("theme-option-dark")).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});

const TWO_LANGUAGES: readonly LanguageOption[] = [
  { tag: "en-GB", label: "English" },
  { tag: "af", label: "Afrikaans" },
];

describe("language", () => {
  it("shows no switcher when the host offers no languages to choose between", () => {
    renderSettings();
    expect(screen.queryByRole("radiogroup", { name: "Language" })).toBeNull();
    cleanup();
    renderSettings({ languages: [{ tag: "en-GB", label: "English" }] });
    expect(screen.queryByRole("radiogroup", { name: "Language" })).toBeNull();
  });

  it("is a radio group named Language with Automatic and each language", () => {
    renderSettings({ languages: TWO_LANGUAGES });
    const group = screen.getByRole("radiogroup", { name: "Language" });
    expect(
      within(group)
        .getAllByRole("radio")
        .map((radio) => radio.textContent),
    ).toEqual(["Automatic", "English", "Afrikaans"]);
    expect(screen.getByTestId("language-option-auto")).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("names each language in its own language, marked with lang", () => {
    renderSettings({ languages: TWO_LANGUAGES });
    expect(screen.getByTestId("language-option-en-GB")).toHaveAttribute(
      "lang",
      "en-GB",
    );
    expect(screen.getByTestId("language-option-af")).toHaveAttribute(
      "lang",
      "af",
    );
    expect(screen.getByTestId("language-option-auto")).not.toHaveAttribute(
      "lang",
    );
  });

  it("stores the chosen language, and null again for Automatic", () => {
    const { settings } = renderSettings({ languages: TWO_LANGUAGES });
    fireEvent.click(screen.getByTestId("language-option-af"));
    expect(settings.get().language).toBe("af");
    expect(screen.getByTestId("language-option-af")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.click(screen.getByTestId("language-option-auto"));
    expect(settings.get().language).toBeNull();
  });

  it("shows the stored language as selected", () => {
    renderSettings({ languages: TWO_LANGUAGES, initial: { language: "af" } });
    expect(screen.getByTestId("language-option-af")).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("shows Automatic for a stored language the host does not offer", () => {
    renderSettings({ languages: TWO_LANGUAGES, initial: { language: "fr" } });
    expect(screen.getByTestId("language-option-auto")).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("asks for its label and Automatic by key", () => {
    const { services } = renderSettings({ languages: TWO_LANGUAGES });
    expect(services.fakes.messages.calls.map((call) => call.key)).toEqual(
      expect.arrayContaining([
        "settings.language.label",
        "settings.language.auto",
      ]),
    );
  });
});

describe("a failed language load", () => {
  const OFFLINE = () => Promise.reject(new Error("offline"));
  const failedLoad = (state: { offline: boolean }) => (tag: string) =>
    tag === "af" && state.offline
      ? OFFLINE()
      : new FakeMessageCatalogue({
          language: tag,
          overrides: tag === "af" ? { "settings.title": "Instellings" } : {},
        });

  const renderFailed = async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const state = { offline: true };
    const view = renderSettings({
      languages: TWO_LANGUAGES,
      initial: { language: "af" },
      load: failedLoad(state),
    });
    await act(async () => {});
    return { ...view, state };
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows no status when nothing has failed", () => {
    renderSettings({ languages: TWO_LANGUAGES });
    expect(screen.queryByTestId("language-status")).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("says which language failed, in the language on screen, with a Try again button", async () => {
    await renderFailed();
    expect(screen.getByTestId("language-status")).toHaveTextContent(
      "Afrikaans could not be loaded.",
    );
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Settings" })).toBeVisible();
  });

  it("shows the language the interface is in as selected, not the one that failed", async () => {
    await renderFailed();
    expect(screen.getByTestId("language-option-en-GB")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByTestId("language-option-af")).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("announces the failure once, politely", async () => {
    await renderFailed();
    expect(screen.getByTestId("live-region-polite")).toHaveTextContent(
      "Afrikaans could not be loaded.",
    );
    expect(screen.getByTestId("live-region-assertive")).toBeEmptyDOMElement();
  });

  it("is not a live region itself, so nothing is read twice", async () => {
    await renderFailed();
    expect(screen.getByTestId("language-status")).not.toHaveAttribute("role");
    expect(screen.getByTestId("language-status")).not.toHaveAttribute(
      "aria-live",
    );
  });

  it("retries with the button, swaps the language in and removes the status", async () => {
    const { state } = await renderFailed();
    state.offline = false;
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });
    expect(screen.queryByTestId("language-status")).toBeNull();
    expect(screen.getByRole("heading", { name: "Instellings" })).toBeVisible();
    expect(screen.getByTestId("language-option-af")).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("keeps the status and the button when the retry fails too", async () => {
    await renderFailed();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });
    expect(screen.getByTestId("language-status")).toHaveTextContent(
      "Afrikaans could not be loaded.",
    );
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).not.toHaveAttribute("aria-busy", "true");
  });

  it("moves focus to the selected language when a retry from the button succeeds", async () => {
    const { state } = await renderFailed();
    state.offline = false;
    const retry = screen.getByRole("button", { name: "Try again" });
    retry.focus();
    await act(async () => {
      fireEvent.click(retry);
    });
    expect(screen.getByTestId("language-option-af")).toHaveFocus();
  });

  it("leaves focus alone when the person had moved on before the language loaded", async () => {
    const { state } = await renderFailed();
    state.offline = false;
    screen.getByTestId("theme-option-light").focus();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });
    expect(screen.getByTestId("theme-option-light")).toHaveFocus();
  });

  it("marks the button busy while the retry is under way, and keeps focus on it", async () => {
    let finish!: (catalogue: MessageCatalogue) => void;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let first = true;
    renderSettings({
      languages: TWO_LANGUAGES,
      initial: { language: "af" },
      load: (tag) => {
        if (tag !== "af") {
          return new FakeMessageCatalogue({ language: tag });
        }
        if (first) {
          first = false;
          return OFFLINE();
        }
        return new Promise<MessageCatalogue>((resolve) => {
          finish = resolve;
        });
      },
    });
    await act(async () => {});
    const retry = screen.getByRole("button", { name: "Try again" });
    retry.focus();
    fireEvent.click(retry);
    expect(retry).toHaveAttribute("aria-busy", "true");
    expect(retry).toHaveFocus();
    await act(async () => {
      finish(new FakeMessageCatalogue({ language: "af" }));
    });
    expect(screen.queryByTestId("language-status")).toBeNull();
  });

  it("retries when the person chooses the language that failed again", async () => {
    const { state, settings } = await renderFailed();
    state.offline = false;
    await act(async () => {
      fireEvent.click(screen.getByTestId("language-option-af"));
    });
    expect(settings.get().language).toBe("af");
    expect(screen.queryByTestId("language-status")).toBeNull();
    expect(screen.getByTestId("language-option-af")).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("stores Afrikaans and retries when it failed through Automatic and the person picks it", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const state = { offline: true };
    const { settings } = renderSettings({
      languages: TWO_LANGUAGES,
      browserLanguages: ["af"],
      load: failedLoad(state),
    });
    await act(async () => {});
    expect(screen.getByTestId("language-status")).toBeInTheDocument();
    state.offline = false;
    await act(async () => {
      fireEvent.click(screen.getByTestId("language-option-af"));
    });
    expect(settings.get().language).toBe("af");
    expect(screen.queryByTestId("language-status")).toBeNull();
    expect(screen.getByTestId("language-option-af")).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("goes when the person chooses Automatic and the browser resolves to a language already on screen", async () => {
    await renderFailed();
    await act(async () => {
      fireEvent.click(screen.getByTestId("language-option-auto"));
    });
    expect(screen.queryByTestId("language-status")).toBeNull();
  });
});

describe("units", () => {
  it("is a radio group named Units with Metric and Imperial", () => {
    renderSettings();
    const group = screen.getByRole("radiogroup", { name: "Units" });
    expect(within(group).getAllByRole("radio")).toHaveLength(2);
    expect(screen.getByTestId("units-option-metric")).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("stores the choice", () => {
    const { settings } = renderSettings();
    fireEvent.click(screen.getByTestId("units-option-imperial"));
    expect(settings.get().units).toBe("imperial");
    expect(screen.getByTestId("units-option-imperial")).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("shows the stored units", () => {
    renderSettings({ initial: { units: "imperial" } });
    expect(screen.getByTestId("units-option-imperial")).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});

describe("map shape", () => {
  it("is a radio group named Map shape with Flat and Globe, flat by default", () => {
    renderSettings();
    const group = screen.getByRole("radiogroup", { name: "Map shape" });
    expect(within(group).getAllByRole("radio")).toHaveLength(2);
    expect(screen.getByTestId("projection-option-flat")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByTestId("projection-option-globe")).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("stores the choice and announces it once, politely", () => {
    const { settings } = renderSettings();
    fireEvent.click(screen.getByTestId("projection-option-globe"));
    expect(settings.get().projection).toBe("globe");
    expect(screen.getByTestId("projection-option-globe")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByTestId("live-region-polite")).toHaveTextContent(
      "Map shape: globe",
    );
  });

  it("asks the catalogue for the map shape announcement, by key", () => {
    const { services } = renderSettings();
    fireEvent.click(screen.getByTestId("projection-option-globe"));
    expect(services.fakes.messages.calls).toContainEqual({
      key: "announce.projection.globe",
      params: {},
    });
  });

  it("announces a change back to flat", () => {
    renderSettings({ initial: { projection: "globe" } });
    fireEvent.click(screen.getByTestId("projection-option-flat"));
    expect(screen.getByTestId("live-region-polite")).toHaveTextContent(
      "Map shape: flat",
    );
  });
});

describe("zoom buttons", () => {
  it("is a switch with the explanation as its description", () => {
    renderSettings();
    expect(zoomSwitch()).toBe(screen.getByTestId("zoom-buttons-switch"));
    expect(zoomSwitch()).toHaveAccessibleDescription(
      "On by default with a mouse, off on touch screens.",
    );
  });

  it("is on by default with a fine pointer", () => {
    renderSettings({ finePointer: true });
    expect(zoomSwitch()).toHaveAttribute("aria-checked", "true");
  });

  it("is off by default on touch", () => {
    renderSettings({ finePointer: false });
    expect(zoomSwitch()).toHaveAttribute("aria-checked", "false");
  });

  it("follows the device default live while nothing is stored", () => {
    const { preferences } = renderSettings({ finePointer: true });
    act(() => preferences.set({ finePointer: false }));
    expect(zoomSwitch()).toHaveAttribute("aria-checked", "false");
  });

  it("stores an explicit true when turned on, and keeps it on every device", () => {
    const { settings, preferences } = renderSettings({ finePointer: false });
    fireEvent.click(zoomSwitch());
    expect(settings.get().zoomButtons).toBe(true);
    expect(zoomSwitch()).toHaveAttribute("aria-checked", "true");
    act(() => preferences.set({ finePointer: true }));
    act(() => preferences.set({ finePointer: false }));
    expect(zoomSwitch()).toHaveAttribute("aria-checked", "true");
  });

  it("stores an explicit false when turned off with a fine pointer", () => {
    const { settings } = renderSettings({ finePointer: true });
    fireEvent.click(zoomSwitch());
    expect(settings.get().zoomButtons).toBe(false);
    expect(zoomSwitch()).toHaveAttribute("aria-checked", "false");
  });

  it("shows a stored false even with a fine pointer", () => {
    renderSettings({ finePointer: true, initial: { zoomButtons: false } });
    expect(zoomSwitch()).toHaveAttribute("aria-checked", "false");
  });

  it("is toggled by clicking its label", () => {
    const { settings } = renderSettings({ finePointer: false });
    fireEvent.click(screen.getByText("Show zoom buttons"));
    expect(settings.get().zoomButtons).toBe(true);
  });
});

describe("persistence note", () => {
  it("is absent when settings are remembered", () => {
    renderSettings({ persistent: true });
    expect(
      screen.queryByText("Changes will not be remembered on this device."),
    ).toBeNull();
  });

  it("is visible text with an icon when storage is blocked", () => {
    renderSettings({ persistent: false });
    const note = screen.getByText(
      "Changes will not be remembered on this device.",
    );
    expect(note).toBeVisible();
    expect(note.tagName).toBe("P");
    expect(note.querySelector("svg")).not.toBeNull();
    expect(note.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("is not a live region", () => {
    renderSettings({ persistent: false });
    const note = screen.getByTestId("settings-not-saved");
    expect(note.hasAttribute("aria-live")).toBe(false);
    expect(note.hasAttribute("role")).toBe(false);
  });
});

describe("privacy", () => {
  it("names no provider and points to the privacy policy for what each service receives", () => {
    renderSettings();
    expect(screen.getByTestId("settings-privacy-note")).toHaveTextContent(
      DEFAULT_PRIVACY_NOTE,
    );
    expect(DEFAULT_PRIVACY_NOTE).not.toMatch(
      /Nominatim|OpenStreetMap|MapCairn/,
    );
  });

  it("looks the default note up in the active catalogue", () => {
    renderSettings({
      messages: new FakeMessageCatalogue({
        language: "af",
        overrides: {
          "settings.privacy.default": "Die beleid sê wat gestuur word.",
        },
      }),
    });
    expect(screen.getByTestId("settings-privacy-note")).toHaveTextContent(
      "Die beleid sê wat gestuur word.",
    );
    expect(screen.queryByText(DEFAULT_PRIVACY_NOTE)).toBeNull();
  });

  it("shows the host's own note in place of the default", () => {
    renderSettings({
      props: {
        privacyNote: (
          <>
            Searching sends your query to <b>Example Geocoder</b>.
          </>
        ),
      },
    });
    const note = screen.getByTestId("settings-privacy-note");
    expect(note).toHaveTextContent(
      "Searching sends your query to Example Geocoder.",
    );
    expect(within(note).getByText("Example Geocoder").tagName).toBe("B");
    expect(screen.queryByText(DEFAULT_PRIVACY_NOTE)).toBeNull();
  });

  it("shows no statement when the host passes an empty note, and keeps the policy link", () => {
    renderSettings({ props: { privacyNote: "" } });
    expect(screen.getByTestId("settings-privacy-note")).toBeEmptyDOMElement();
    expect(screen.queryByText(DEFAULT_PRIVACY_NOTE)).toBeNull();
    expect(
      screen.getByRole("link", { name: "Read the privacy policy" }),
    ).toBeInTheDocument();
  });

  it("shows no statement when the host passes null, not the default", () => {
    renderSettings({ props: { privacyNote: null } });
    expect(screen.getByTestId("settings-privacy-note")).toBeEmptyDOMElement();
    expect(screen.queryByText(DEFAULT_PRIVACY_NOTE)).toBeNull();
  });

  it("shows the default when the host passes undefined", () => {
    renderSettings({ props: { privacyNote: undefined } });
    expect(screen.getByTestId("settings-privacy-note")).toHaveTextContent(
      DEFAULT_PRIVACY_NOTE,
    );
  });

  it("keeps the policy link under a host's note", () => {
    renderSettings({ props: { privacyNote: "Host note." } });
    expect(
      screen.getByRole("link", { name: "Read the privacy policy" }),
    ).toHaveAttribute("href", "/privacy");
  });

  it("links to /privacy by default", () => {
    renderSettings();
    expect(
      screen.getByRole("link", { name: "Read the privacy policy" }),
    ).toHaveAttribute("href", "/privacy");
  });

  it("links to the given address", () => {
    renderSettings({ props: { privacyHref: "/en/privacy" } });
    expect(
      screen.getByRole("link", { name: "Read the privacy policy" }),
    ).toHaveAttribute("href", "/en/privacy");
  });
});

describe("message catalogue", () => {
  it("asks for its text and labels by key, not by writing the text inline", () => {
    const { services } = renderSettings();
    const keys = services.fakes.messages.calls.map((call) => call.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "settings.title",
        "settings.theme.label",
        "settings.theme.system",
        "settings.theme.light",
        "settings.theme.dark",
        "settings.units.label",
        "settings.units.metric",
        "settings.units.imperial",
        "settings.mapShape.label",
        "settings.mapShape.flat",
        "settings.mapShape.globe",
        "settings.zoomButtons.label",
        "settings.zoomButtons.description",
        "settings.privacy.heading",
        "settings.privacy.link",
      ]),
    );
    for (const call of services.fakes.messages.calls) {
      expect(call.params).toEqual({});
    }
  });

  it("asks for the not-saved note by key only when storage is blocked", () => {
    const { services } = renderSettings({ persistent: false });
    expect(services.fakes.messages.calls.map((call) => call.key)).toEqual(
      expect.arrayContaining(["settings.notSaved"]),
    );
  });
});

describe("markup rules", () => {
  it("sets no style attribute of its own", () => {
    renderSettings({ persistent: false });
    const region = screen.getByTestId("sheet-section-settings");
    // Radix puts `outline: none` on the segmented control groups through its
    // roving focus. That comes from the primitive, not from this section.
    expect(
      region.querySelectorAll("[style]:not([role='radiogroup'])"),
    ).toHaveLength(0);
  });

  it("hides the visible Language label from assistive technology too", () => {
    renderSettings({ languages: TWO_LANGUAGES });
    const region = screen.getByTestId("sheet-section-settings");
    const hidden = [...region.querySelectorAll('p[aria-hidden="true"]')].map(
      (item) => item.textContent,
    );
    expect(hidden).toEqual(["Theme", "Units", "Map shape", "Language"]);
  });

  it("hides the visible Theme, Units and Map shape labels from assistive technology, since the groups carry the names", () => {
    renderSettings();
    const region = screen.getByTestId("sheet-section-settings");
    const hidden = [...region.querySelectorAll('p[aria-hidden="true"]')].map(
      (item) => item.textContent,
    );
    expect(hidden).toEqual(["Theme", "Units", "Map shape"]);
  });
});
