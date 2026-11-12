// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { createFakeServices } from "../fakes/createFakeServices";
import {
  HOST_SUPPLIED_PORT_NAMES,
  OPTIONAL_PORT_NAMES,
  PORT_NAMES,
  PORT_REGISTRY,
  type PortName,
} from "./portRegistry";

const serviceKeys = Object.keys(createFakeServices())
  .filter((key) => key !== "fakes")
  .sort();

describe("port coverage", () => {
  it("lists every service in PORT_NAMES", () => {
    expect([...PORT_NAMES].sort()).toEqual(serviceKeys);
  });

  it("registers every service in PORT_REGISTRY", () => {
    expect(Object.keys(PORT_REGISTRY).sort()).toEqual(serviceKeys);
  });

  it("lists the optional services, each of which is a port", () => {
    expect([...OPTIONAL_PORT_NAMES]).toEqual([
      "featureQuery",
      "fileOpener",
      "routing",
      "selection",
      "suggestions",
    ]);
    for (const name of OPTIONAL_PORT_NAMES) {
      expect(PORT_NAMES).toContain(name);
    }
  });

  it("lists the host-supplied services, each of which is optional and has a fake", () => {
    expect([...HOST_SUPPLIED_PORT_NAMES]).toEqual([
      "featureQuery",
      "selection",
    ]);
    for (const name of HOST_SUPPLIED_PORT_NAMES) {
      expect(OPTIONAL_PORT_NAMES).toContain(name);
      expect(PORT_REGISTRY[name].createFake()).toBeDefined();
    }
  });

  for (const name of serviceKeys as PortName[]) {
    describe(name, () => {
      it("has a fake", () => {
        const entry = PORT_REGISTRY[name];
        expect(typeof entry.createFake).toBe("function");
        expect(entry.createFake()).toBeDefined();
      });

      it("has a contract suite", () => {
        expect(typeof PORT_REGISTRY[name].runContract).toBe("function");
      });
    });
  }
});
