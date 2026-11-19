// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Says whether anything listens on a local port, the same way on macOS, Linux
 * and Windows. The skills use it before they start a dev server and when they
 * confirm that one has stopped.
 *
 *   node scripts/agents/port.mjs <port>
 *
 * It probes the two loopback addresses only, so a server bound to another
 * interface address alone reads as free. The dev and e2e servers listen on
 * loopback or on every address, which it sees.
 *
 * Exit 0 when the port is free, 1 when something listens on it, 2 for a port
 * that is not a number from 1 to 65535.
 */
import net from "node:net";
import { isEntryPoint } from "../entryPoint.mjs";

/** Both loopback addresses, because a server may bind to either family. */
const LOOPBACK_ADDRESSES = ["127.0.0.1", "::1"];
const CONNECT_TIMEOUT_MS = 2000;
const MAX_PORT = 65535;

/**
 * The port as a number, or undefined when the text is not a whole number from
 * 1 to 65535.
 *
 * @param {string | undefined} text
 * @returns {number | undefined}
 */
export function parsePort(text) {
  if (text === undefined || !/^\d+$/.test(text)) {
    return undefined;
  }
  const port = Number(text);
  return port >= 1 && port <= MAX_PORT ? port : undefined;
}

/** Whether a connection to the address and port is accepted. */
function accepts(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: CONNECT_TIMEOUT_MS });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
}

/**
 * Whether something accepts connections on the port on either loopback
 * address.
 *
 * @param {number} port
 * @returns {Promise<boolean>}
 */
export async function isListening(port) {
  const results = await Promise.all(
    LOOPBACK_ADDRESSES.map((host) => accepts(host, port)),
  );
  return results.some(Boolean);
}

/** Prints whether the port in the first argument is free and sets the exit code. */
async function main() {
  const port = parsePort(process.argv[2]);
  if (port === undefined) {
    console.error("usage: node scripts/agents/port.mjs <port from 1 to 65535>");
    process.exitCode = 2;
    return;
  }
  const inUse = await isListening(port);
  console.log(`port ${port} is ${inUse ? "in use" : "free"}`);
  process.exitCode = inUse ? 1 : 0;
}

if (isEntryPoint(import.meta.url)) {
  await main();
}
