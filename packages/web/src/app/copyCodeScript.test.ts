// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProductPage } from "../product/ProductPage";
import { COPY_CODE_SCRIPT } from "./copyCodeScript";

const RELEASE = { version: "0.1.0", date: "2026-11-21" } as const;

/** How long a copy that worked says Copied, and how long a repeated message waits. */
const RESET_MS = 4000;
const REGION_CLEAR_MS = 50;

/** The install block's four commands, by manager. */
const INSTALL_COMMANDS = {
  npm: "npm install @mapcairn/sdk react react-dom maplibre-gl",
  yarn: "yarn add @mapcairn/sdk react react-dom maplibre-gl",
} as const;

let copied: string[];
let writeText: ReturnType<typeof vi.fn>;
let execCommand: ReturnType<typeof vi.fn>;

/** Puts the server-rendered page in the document, as a browser receives it. */
function loadPage(): void {
  document.body.innerHTML = renderToStaticMarkup(
    createElement(ProductPage, { release: RELEASE }),
  );
}

/** Runs the page's inline script, as the browser does when it parses it. */
function runScript(): void {
  new Function(COPY_CODE_SCRIPT)();
}

/** Lets the clipboard promise and the click's follow-up run. */
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

/**
 * Chooses a package manager as a browser does: the others are unchecked and
 * `change` bubbles. happy-dom keeps the first radio checked, so it is done by hand.
 */
function chooseRadio(manager: string): void {
  const radios = document.querySelectorAll<HTMLInputElement>(
    "fieldset input[type=radio]",
  );
  for (const radio of radios) {
    radio.checked = radio.value === manager;
  }
  document
    .querySelector(`input[value="${manager}"]`)
    ?.dispatchEvent(new Event("change", { bubbles: true }));
}

/** The install block's copy button and its scope. */
function installButton(): HTMLButtonElement {
  const scope = document.querySelector("fieldset[data-copy-scope]");
  return scope?.querySelector("[data-copy-button]") as HTMLButtonElement;
}

/** The embedding example's copy button. */
function exampleButton(): HTMLButtonElement {
  const code = document.querySelector('pre[aria-label^="src/main.tsx"]');
  return code
    ?.closest("[data-copy-scope]")
    ?.querySelector("[data-copy-button]") as HTMLButtonElement;
}

function politeRegion(): HTMLElement {
  return document.querySelector(
    '[data-testid="live-region-polite"]',
  ) as HTMLElement;
}

function assertiveRegion(): HTMLElement {
  return document.querySelector(
    '[data-testid="live-region-assertive"]',
  ) as HTMLElement;
}

beforeEach(() => {
  vi.useFakeTimers();
  copied = [];
  writeText = vi.fn(async (text: string) => {
    copied.push(text);
  });
  execCommand = vi.fn(() => false);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: execCommand,
  });
  loadPage();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("the copy buttons' script", () => {
  it("shows every button, still, and names it in words for the code it copies", () => {
    for (const button of document.querySelectorAll("[data-copy-button]")) {
      expect(button).toHaveAttribute("hidden");
    }
    runScript();
    for (const button of document.querySelectorAll("[data-copy-button]")) {
      expect(button).not.toHaveAttribute("hidden");
      expect(button).toHaveAttribute("data-state", "idle");
    }
    expect(installButton()).toHaveAttribute(
      "aria-label",
      "Copy code, npm install command",
    );
    expect(exampleButton().getAttribute("aria-label")).toMatch(
      /^Copy code, src\/main\.tsx/,
    );
  });

  it("copies the text of the code shown, says Copied, announces it politely and goes back to Copy after a while", async () => {
    runScript();
    const code = document.querySelector('pre[aria-label^="src/main.tsx"]');
    const label = code?.getAttribute("aria-label") ?? "";
    exampleButton().click();
    await settle();

    expect(copied).toEqual([code?.textContent]);
    expect(exampleButton()).toHaveAttribute("data-state", "copied");
    expect(exampleButton()).toHaveAttribute("aria-label", `Copied, ${label}`);
    expect(politeRegion().textContent).toBe(`Code copied, ${label}`);
    expect(assertiveRegion().textContent).toBe("");

    await vi.advanceTimersByTimeAsync(RESET_MS);
    expect(exampleButton()).toHaveAttribute("data-state", "idle");
    expect(exampleButton()).toHaveAttribute(
      "aria-label",
      `Copy code, ${label}`,
    );
  });

  it("copies the manager chosen when it is clicked, and renames the button when another is chosen", async () => {
    runScript();
    chooseRadio("yarn");
    expect(installButton()).toHaveAttribute(
      "aria-label",
      "Copy code, yarn install command",
    );
    installButton().click();
    await settle();
    expect(copied).toEqual([INSTALL_COMMANDS.yarn]);
    expect(installButton()).toHaveAttribute(
      "aria-label",
      "Copied, yarn install command",
    );

    chooseRadio("npm");
    expect(installButton()).toHaveAttribute("data-state", "idle");
    expect(installButton()).toHaveAttribute(
      "aria-label",
      "Copy code, npm install command",
    );
  });

  it("copies the manager chosen before the script ran", async () => {
    chooseRadio("yarn");
    runScript();
    expect(installButton()).toHaveAttribute(
      "aria-label",
      "Copy code, yarn install command",
    );
    installButton().click();
    await settle();
    expect(copied).toEqual([INSTALL_COMMANDS.yarn]);
  });

  it("says Copy failed, announces how to copy by hand assertively and stays failed when the browser refuses", async () => {
    writeText.mockRejectedValue(new DOMException("Refused", "NotAllowedError"));
    runScript();
    const label = document
      .querySelector('pre[aria-label^="src/main.tsx"]')
      ?.getAttribute("aria-label");
    exampleButton().click();
    await settle();

    expect(exampleButton()).toHaveAttribute("data-state", "failed");
    expect(exampleButton()).toHaveAttribute(
      "aria-label",
      `Copy failed, ${label}`,
    );
    expect(assertiveRegion().textContent).toBe(
      `Could not copy ${label}. Select the code and copy it manually.`,
    );
    expect(politeRegion().textContent).toBe("");

    await vi.advanceTimersByTimeAsync(RESET_MS * 2);
    expect(exampleButton()).toHaveAttribute("data-state", "failed");
  });

  it("falls back to a copy command when the clipboard API refuses, and gives the focus back", async () => {
    writeText.mockRejectedValue(new DOMException("Refused", "NotAllowedError"));
    execCommand.mockImplementation(() => {
      copied.push(document.querySelector("textarea")?.value ?? "");
      return true;
    });
    runScript();
    const button = installButton();
    button.focus();
    button.click();
    await settle();

    expect(copied).toEqual([INSTALL_COMMANDS.npm]);
    expect(button).toHaveAttribute("data-state", "copied");
    expect(document.querySelector("textarea")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("uses the copy command alone when the browser has no clipboard API", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    execCommand.mockReturnValue(true);
    runScript();
    installButton().click();
    await settle();

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(installButton()).toHaveAttribute("data-state", "copied");
  });

  it("says failed when the copy command throws or refuses too", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    execCommand.mockImplementation(() => {
      throw new Error("not allowed");
    });
    runScript();
    installButton().click();
    await settle();

    expect(installButton()).toHaveAttribute("data-state", "failed");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("shows only the latest click's outcome", async () => {
    const pending: ((value: undefined) => void)[] = [];
    writeText.mockImplementation(
      () =>
        new Promise<undefined>((resolve) => {
          pending.push(resolve);
        }),
    );
    runScript();
    installButton().click();
    installButton().click();
    pending[1]?.(undefined);
    await settle();
    expect(installButton()).toHaveAttribute("data-state", "copied");

    writeText.mockRejectedValue(new Error("late"));
    pending[0]?.(undefined);
    await settle();
    expect(installButton()).toHaveAttribute("data-state", "copied");
    expect(assertiveRegion().textContent).toBe("");
  });

  it("gives each successful copy the full time on Copied", async () => {
    runScript();
    installButton().click();
    await settle();
    await vi.advanceTimersByTimeAsync(RESET_MS - 1000);
    installButton().click();
    await settle();
    await vi.advanceTimersByTimeAsync(RESET_MS - 1);
    expect(installButton()).toHaveAttribute("data-state", "copied");
    await vi.advanceTimersByTimeAsync(1);
    expect(installButton()).toHaveAttribute("data-state", "idle");
  });

  it("clears a region before it says the same message again, so it is read again", async () => {
    runScript();
    installButton().click();
    await settle();
    const first = politeRegion().textContent;
    installButton().click();
    await settle();
    expect(politeRegion().textContent).toBe("");
    await vi.advanceTimersByTimeAsync(REGION_CLEAR_MS);
    expect(politeRegion().textContent).toBe(first);
  });

  it("stores nothing and sends nothing when it copies", async () => {
    const stored = vi.spyOn(Storage.prototype, "setItem");
    const sent = vi.spyOn(globalThis, "fetch");
    const cookies = document.cookie;
    try {
      runScript();
      installButton().click();
      await settle();
      expect(stored).not.toHaveBeenCalled();
      expect(sent).not.toHaveBeenCalled();
      expect(document.cookie).toBe(cookies);
    } finally {
      stored.mockRestore();
      sent.mockRestore();
    }
  });

  it("does nothing, and does not throw, on a page without copy buttons", () => {
    document.body.innerHTML = "<p>no buttons</p>";
    expect(() => runScript()).not.toThrow();
  });

  it("leaves a button without a scope hidden", () => {
    document.body.innerHTML = "<button data-copy-button hidden></button>";
    runScript();
    expect(document.querySelector("button")).toHaveAttribute("hidden");
  });
});
