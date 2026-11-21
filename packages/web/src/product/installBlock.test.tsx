// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import path from "node:path";
import { FakeClipboard } from "@mapcairn/core";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
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
      "Needs React 19, maplibre-gl 6.18 or later and a bundler that handles CSS imports.",
    );
  });
});

describe("the install block on the page", () => {
  it("is a native radio group named Package manager, with npm chosen", () => {
    render(<ProductPage clipboard={new FakeClipboard()} release={RELEASE} />);
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
    render(<ProductPage clipboard={new FakeClipboard()} release={RELEASE} />);
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
    render(<ProductPage clipboard={new FakeClipboard()} release={RELEASE} />);
    const line = screen.getByText(/^Needs React 19,/);
    expect(line.textContent).toBe(lineToText(INSTALL_REQUIREMENTS));
    expect(
      installGroup().compareDocumentPosition(line) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("is server-rendered with npm chosen, every command in the markup and no copy button until the page runs", () => {
    const html = renderToStaticMarkup(
      <ProductPage clipboard={new FakeClipboard()} release={RELEASE} />,
    );
    for (const [, command] of COMMANDS) {
      expect(html).toContain(command);
    }
    const input = (manager: string) =>
      html.match(new RegExp(`<input[^>]*value="${manager}"[^>]*>`))?.[0] ?? "";
    expect(input("npm")).toContain("checked");
    expect(input("pnpm")).not.toContain("checked");
    expect(html).not.toContain("Copy code, npm");
  });

  it("offers the copy button once the page runs, named for the command it copies", async () => {
    render(<ProductPage clipboard={new FakeClipboard()} release={RELEASE} />);
    expect(
      await within(installGroup()).findByRole("button", {
        name: "Copy code, npm install command",
      }),
    ).toBeInTheDocument();
  });

  it.each(COMMANDS)(
    "copies the %s command when it is chosen",
    async (manager, command) => {
      const clipboard = new FakeClipboard();
      render(<ProductPage clipboard={clipboard} release={RELEASE} />);
      fireEvent.click(screen.getByRole("radio", { name: manager }));
      const button = await within(installGroup()).findByRole("button", {
        name: `Copy code, ${manager} install command`,
      });
      fireEvent.click(button);
      await waitFor(() => expect(clipboard.written).toEqual([command]));
      expect(screen.getByTestId("live-region-polite")).toHaveTextContent(
        "Code copied",
      );
      expect(
        within(installGroup()).getByRole("button", {
          name: `Copied, ${manager} install command`,
        }),
      ).toBeInTheDocument();
    },
  );

  it("copies the manager chosen before the page ran", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    container.innerHTML = renderToString(
      <ProductPage clipboard={new FakeClipboard()} release={RELEASE} />,
    );
    const earlyChoice = container.querySelector<HTMLInputElement>(
      'input[value="yarn"]',
    );
    earlyChoice?.click();
    const { hydrateRoot } = await import("react-dom/client");
    const clipboard = new FakeClipboard();
    const { act } = await import("@testing-library/react");
    await act(async () => {
      hydrateRoot(
        container,
        <ProductPage clipboard={clipboard} release={RELEASE} />,
      );
    });
    const button = await within(container).findByRole("button", {
      name: "Copy code, yarn install command",
    });
    fireEvent.click(button);
    await waitFor(() =>
      expect(clipboard.written).toEqual([
        "yarn add @mapcairn/sdk react react-dom maplibre-gl",
      ]),
    );
    container.remove();
  });

  it("says how to copy by hand when the clipboard is unavailable, and keeps the command selectable", async () => {
    const clipboard = new FakeClipboard();
    clipboard.failWith("denied");
    render(<ProductPage clipboard={clipboard} release={RELEASE} />);
    fireEvent.click(
      await within(installGroup()).findByRole("button", {
        name: "Copy code, npm install command",
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("live-region-assertive")).toHaveTextContent(
        "Could not copy npm install command. Select the code and copy it manually.",
      ),
    );
    expect(screen.getByText(INSTALL_COMMAND)).toBeInTheDocument();
  });

  it("stores nothing and sends nothing when a manager is chosen or copied", async () => {
    const stored = vi.spyOn(Storage.prototype, "setItem");
    const sent = vi.spyOn(globalThis, "fetch");
    const cookies = document.cookie;
    try {
      render(<ProductPage clipboard={new FakeClipboard()} release={RELEASE} />);
      fireEvent.click(screen.getByRole("radio", { name: "bun" }));
      fireEvent.click(
        await within(installGroup()).findByRole("button", {
          name: "Copy code, bun install command",
        }),
      );
      await within(installGroup()).findByRole("button", {
        name: "Copied, bun install command",
      });
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
      "Needs React 19, `maplibre-gl` 6.18 or later and a bundler that handles CSS imports.",
    );
  });
});
