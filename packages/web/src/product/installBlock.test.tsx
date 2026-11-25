// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import path from "node:path";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { loader as markdownLoader } from "../routes/index.md";
import { loader as llmsLoader } from "../routes/llms.txt";
import { loader as fullLoader } from "../routes/llms-full.txt";
import { ProductPage } from "./ProductPage";
import {
  INSTALL_COMMAND,
  INSTALL_OPTIONS,
  INSTALL_REQUIREMENTS,
  lineToText,
} from "./productContent";

/** A release for the page to name, as the route's loader gives it. */
const RELEASE = { version: "0.1.0", date: "2026-11-21" } as const;

/** What each package manager is asked to install, every one with the peers. */
const COMMANDS = [
  ["npm", "npm install @mapcairn/sdk react react-dom maplibre-gl"],
  ["pnpm", "pnpm add @mapcairn/sdk react react-dom maplibre-gl"],
  ["yarn", "yarn add @mapcairn/sdk react react-dom maplibre-gl"],
  ["bun", "bun add @mapcairn/sdk react react-dom maplibre-gl"],
] as const;

const SDK_MANIFEST = JSON.parse(
  readFileSync(path.resolve(__dirname, "../../../sdk/package.json"), "utf8"),
) as { peerDependencies: Record<string, string> };

/** The install block: the group of managers, its commands and its copy button. */
function installGroup(): HTMLElement {
  return screen.getByRole("group", { name: "Package manager" });
}

describe("the install commands", () => {
  it.each(COMMANDS)(
    "%s installs the SDK with its peers: %s",
    (manager, command) => {
      expect(
        INSTALL_OPTIONS.find((option) => option.manager === manager)?.command,
      ).toBe(command);
    },
  );

  it("lists npm first and keeps INSTALL_COMMAND as the npm line, the README's own", () => {
    expect(INSTALL_OPTIONS.map((option) => option.manager)).toEqual([
      "npm",
      "pnpm",
      "yarn",
      "bun",
    ]);
    expect(INSTALL_COMMAND).toBe(INSTALL_OPTIONS[0]?.command);
    const readme = readFileSync(
      path.resolve(__dirname, "../../../../README.md"),
      "utf8",
    );
    expect(readme).toContain(INSTALL_COMMAND);
  });

  it("names the peers the umbrella package requires, with the lowest versions it allows", () => {
    expect(Object.keys(SDK_MANIFEST.peerDependencies)).toEqual(
      expect.arrayContaining(["react", "react-dom", "maplibre-gl"]),
    );
    expect(SDK_MANIFEST.peerDependencies.react).toBe("^19.0.0");
    expect(SDK_MANIFEST.peerDependencies["maplibre-gl"]).toBe("^6.18.0");
    expect(lineToText(INSTALL_REQUIREMENTS)).toBe(
      "It adds the SDK and its three peers. Needs React 19, maplibre-gl 6.18 or later and a bundler that handles CSS imports (tried with Vite).",
    );
  });
});

describe("the install block on the page", () => {
  it("is a native radio group named Package manager, with npm chosen", () => {
    render(<ProductPage release={RELEASE} />);
    const radios = within(installGroup()).getAllByRole("radio");
    expect(radios.map((radio) => radio.getAttribute("value"))).toEqual(
      COMMANDS.map(([manager]) => manager),
    );
    for (const radio of radios) {
      expect(radio.tagName).toBe("INPUT");
      expect(radio).toHaveAttribute("type", "radio");
    }
    expect(screen.getByRole("radio", { name: "npm" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "pnpm" })).not.toBeChecked();
  });

  it("holds each command in its own code block, in the hero, above the first section, and not in a sentence", () => {
    render(<ProductPage release={RELEASE} />);
    const group = installGroup();
    expect(
      screen.getByRole("region", { name: "Embed a map" }).contains(group),
    ).toBe(false);
    for (const [manager, command] of COMMANDS) {
      const code = within(group).getByText(command);
      expect(code.tagName).toBe("CODE");
      expect(code.closest("pre")).not.toBeNull();
      expect(code.closest("pre")).toHaveAttribute(
        "aria-label",
        `Install command for ${manager}`,
      );
      expect(code.closest("p")).toBeNull();
    }
  });

  it("says what the SDK needs, in one line under the block", () => {
    render(<ProductPage release={RELEASE} />);
    const line = screen.getByText(/^It adds the SDK and its three peers/);
    expect(line.textContent).toBe(lineToText(INSTALL_REQUIREMENTS));
    expect(
      installGroup().compareDocumentPosition(line) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("is server-rendered with npm chosen and every command in the markup", () => {
    const html = renderToStaticMarkup(<ProductPage release={RELEASE} />);
    for (const [, command] of COMMANDS) {
      expect(html).toContain(command);
    }
    const input = (manager: string) =>
      html.match(new RegExp(`<input[^>]*value="${manager}"[^>]*>`))?.[0] ?? "";
    expect(input("npm")).toContain("checked");
    expect(input("pnpm")).not.toContain("checked");
  });

  it("renders the copy button hidden, beside the command it copies, with the words for every manager", () => {
    render(<ProductPage release={RELEASE} />);
    const group = installGroup();
    const button = group.querySelector("[data-copy-button]");
    expect(button).toHaveAttribute("hidden");
    expect(group).toHaveAttribute("data-copy-scope");
    const words = [...group.querySelectorAll("[data-copy]")].map(
      (element) =>
        JSON.parse(element.getAttribute("data-copy") ?? "") as {
          idle: string;
          said: string;
        },
    );
    expect(words.map(({ idle }) => idle)).toEqual(
      COMMANDS.map(([manager]) => `Copy code, ${manager} install command`),
    );
    expect(words.map(({ said }) => said)).toEqual(
      COMMANDS.map(([manager]) => `Code copied, ${manager} install command`),
    );
  });

  it("keeps each command and its words in one option, so the script copies the chosen one", () => {
    render(<ProductPage release={RELEASE} />);
    for (const [manager, command] of COMMANDS) {
      const option = screen
        .getByRole("radio", { name: manager })
        .closest("[data-copy-option]");
      expect(option?.querySelector("[data-copy]")?.textContent).toBe(command);
    }
  });

  it("stores nothing and sends nothing when a manager is chosen", () => {
    const stored = vi.spyOn(Storage.prototype, "setItem");
    const sent = vi.spyOn(globalThis, "fetch");
    const cookies = document.cookie;
    try {
      render(<ProductPage release={RELEASE} />);
      fireEvent.click(screen.getByRole("radio", { name: "bun" }));
      expect(stored).not.toHaveBeenCalled();
      expect(sent).not.toHaveBeenCalled();
      expect(document.cookie).toBe(cookies);
    } finally {
      stored.mockRestore();
      sent.mockRestore();
    }
  });
});

describe("the install commands in the text twins", () => {
  it.each([
    ["/index.md", () => markdownLoader().text()],
    ["/llms.txt", () => llmsLoader().text()],
    ["/llms-full.txt", () => fullLoader().text()],
  ] as const)(
    "%s lists all four commands as one code block",
    async (_name, read) => {
      const text = await read();
      const block = `\`\`\`bash\n${COMMANDS.map(([, command]) => command).join("\n")}\n\`\`\``;
      expect(text).toContain(block);
    },
  );

  it("/index.md says what the SDK needs under the commands", async () => {
    expect(await markdownLoader().text()).toContain(
      "It adds the SDK and its three peers. Needs React 19, `maplibre-gl` 6.18 or later and a bundler that handles CSS imports (tried with Vite).",
    );
  });
});
