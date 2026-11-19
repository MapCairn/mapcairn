// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { fillSlots } from "./fillSlots";
import { Isolate } from "./Isolate";

describe("fillSlots", () => {
  it("puts an element in each slot and keeps the text between them", () => {
    const { container } = render(
      <p>
        {fillSlots("{a}, {b} left", {
          a: <Isolate>12 km</Isolate>,
          b: <Isolate>3 min</Isolate>,
        })}
      </p>,
    );
    expect(container.textContent).toBe("12 km, 3 min left");
    expect(
      [...container.querySelectorAll("bdi")].map((n) => n.textContent),
    ).toEqual(["12 km", "3 min"]);
  });

  it("drops the isolate controls a right-to-left catalogue puts around a slot", () => {
    const { container } = render(<p>{fillSlots("x ⁨{a}⁩ y", { a: "1" })}</p>);
    expect(container.textContent).toBe("x 1 y");
  });

  it("leaves a slot with no value as written", () => {
    const { container } = render(<p>{fillSlots("{missing}", {})}</p>);
    expect(container.textContent).toBe("{missing}");
  });
});
