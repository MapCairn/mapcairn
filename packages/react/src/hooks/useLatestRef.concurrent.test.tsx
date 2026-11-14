// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { act, render } from "@testing-library/react";
import {
  type RefObject,
  StrictMode,
  Suspense,
  startTransition,
  use,
  useLayoutEffect,
  useState,
} from "react";
import { describe, expect, it } from "vitest";
import { useLatestRef } from "./useLatestRef";

const NEVER = new Promise<never>(() => {});

/**
 * Mounts a component that holds `useLatestRef` of a state value and exposes
 * the ref plus two setters. `abandon` makes a render React throws away: a
 * transition that suspends and is never committed.
 */
function mount() {
  const held: { ref: RefObject<string> | null } = { ref: null };
  const seenByLayoutEffect: string[] = [];
  let setValue: (value: string) => void = () => {};
  let abandon: () => void = () => {};

  function Harness() {
    const [value, setValueState] = useState("committed");
    const [abandoned, setAbandoned] = useState(false);
    setValue = setValueState;
    abandon = () => setAbandoned(true);
    const latest = useLatestRef(value);
    held.ref = latest;
    useLayoutEffect(() => {
      seenByLayoutEffect.push(latest.current);
    });
    if (abandoned) {
      use(NEVER);
    }
    return null;
  }

  const tree = (
    <Suspense fallback={null}>
      <Harness />
    </Suspense>
  );
  const view = (strict: boolean) =>
    render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  return {
    view,
    seenByLayoutEffect,
    current: () => held.ref?.current,
    setValue: (value: string) => setValue(value),
    abandonTransition: (value: string) =>
      act(async () => {
        startTransition(() => {
          setValue(value);
          abandon();
        });
      }),
  };
}

describe("useLatestRef when a render is not committed", () => {
  it("keeps the committed value when a render for another value is thrown away", async () => {
    const probe = mount();
    probe.view(false);

    await probe.abandonTransition("never committed");

    expect(probe.current()).toBe("committed");
  });

  it("takes a new value once the render that holds it commits", () => {
    const probe = mount();
    probe.view(false);

    act(() => probe.setValue("next"));

    expect(probe.current()).toBe("next");
  });

  it("holds the committed value under StrictMode, which renders twice", () => {
    const probe = mount();
    probe.view(true);

    act(() => probe.setValue("next"));

    expect(probe.current()).toBe("next");
  });

  it("is already current for a layout effect of the same component that is declared after it", () => {
    const probe = mount();
    probe.view(false);

    act(() => probe.setValue("next"));

    expect(probe.seenByLayoutEffect.at(-1)).toBe("next");
  });
});
