// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  accepts,
  isListening,
  main,
  parsePort,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/agents/port.mjs";

const SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../scripts/agents/port.mjs",
);
const CHILD_TIMEOUT_MS = 30_000;

let server: net.Server | undefined;

/** Starts a listener on a free port and returns the port. */
async function listen(host: string): Promise<number> {
  const listener = net.createServer();
  server = listener;
  await new Promise<void>((resolve) => listener.listen(0, host, resolve));
  return (listener.address() as net.AddressInfo).port;
}

async function close(): Promise<void> {
  const listener = server;
  server = undefined;
  if (listener !== undefined) {
    await new Promise((resolve) => listener.close(resolve));
  }
}

afterEach(close);

describe("parsePort", () => {
  it.each(["80", "5190", "65535"])("accepts %s", (text) => {
    expect(parsePort(text)).toBe(Number(text));
  });

  it.each(["", "0", "65536", "-1", "5190.5", "abc", "12 3", undefined])(
    "refuses %s",
    (text) => {
      expect(parsePort(text)).toBeUndefined();
    },
  );
});

describe("accepts", () => {
  it.each([
    ["connect", true],
    ["timeout", false],
    ["error", false],
  ])("settles on %s and closes a completed socket", async (event, expected) => {
    const socket = new EventEmitter() as net.Socket;
    let destroyed = false;
    socket.destroy = () => {
      destroyed = true;
      return socket;
    };
    const pending = accepts("127.0.0.1", 5190, () => socket);

    socket.emit(event);

    expect(await pending).toBe(expected);
    expect(destroyed).toBe(event !== "error");
  });
});

describe("isListening", () => {
  it("is true while something listens and false after it stops", async () => {
    const port = await listen("127.0.0.1");
    expect(await isListening(port)).toBe(true);
    await close();
    expect(await isListening(port)).toBe(false);
  });
});

describe("main", () => {
  it("reports an invalid port without probing it", async () => {
    const errors: string[] = [];
    let called = false;
    const code = await main(
      ["nope"],
      async () => {
        called = true;
        return false;
      },
      () => undefined,
      (line: string) => errors.push(line),
    );

    expect(code).toBe(2);
    expect(called).toBe(false);
    expect(errors).toEqual([
      "usage: node scripts/agents/port.mjs <port from 1 to 65535>",
    ]);
  });

  it.each([
    [true, 1, "in use"],
    [false, 0, "free"],
  ])("reports a port that is %s", async (inUse, code, text) => {
    const output: string[] = [];
    expect(
      await main(
        ["5190"],
        async () => inUse,
        (line: string) => output.push(line),
        () => undefined,
      ),
    ).toBe(code);
    expect(output).toEqual([`port 5190 is ${text}`]);
  });
});

describe("scripts/agents/port.mjs, run as a command", () => {
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [SCRIPT, ...args], {
      encoding: "utf8",
      timeout: CHILD_TIMEOUT_MS,
    });

  it("exits 1 and says so when the port is in use", async () => {
    const port = await listen("127.0.0.1");
    const result = run(String(port));
    expect(result.status).toBe(1);
    expect(result.stdout).toContain(`port ${port} is in use`);
  });

  it("exits 0 when the port is free", async () => {
    const port = await listen("127.0.0.1");
    await close();
    const result = run(String(port));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`port ${port} is free`);
  });

  it("exits 2 for a missing or invalid port", () => {
    expect(run().status).toBe(2);
    expect(run("nope").status).toBe(2);
  });
});
