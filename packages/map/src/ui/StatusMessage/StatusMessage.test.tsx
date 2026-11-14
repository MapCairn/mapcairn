// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Suspense, startTransition, use, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StatusMessage } from "./StatusMessage";

describe("StatusMessage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is a polite status for info and success", () => {
    const { rerender } = render(
      <StatusMessage variant="info" onDismiss={vi.fn()}>
        Link copied
      </StatusMessage>,
    );
    expect(screen.getByRole("status").textContent).toContain("Link copied");
    expect(screen.queryByRole("alert")).toBeNull();
    rerender(
      <StatusMessage variant="success" onDismiss={vi.fn()}>
        Saved
      </StatusMessage>,
    );
    expect(screen.getByRole("status").textContent).toContain("Saved");
  });

  it("is an alert for errors", () => {
    render(
      <StatusMessage variant="error" onDismiss={vi.fn()}>
        Tiles failed to load
      </StatusMessage>,
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "Tiles failed to load",
    );
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("keeps the action and dismiss buttons out of the live region", () => {
    render(
      <StatusMessage
        variant="error"
        onDismiss={vi.fn()}
        action={{ label: "Retry", onClick: vi.fn() }}
      >
        Failed
      </StatusMessage>,
    );
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Failed");
    expect(alert.querySelector("button")).toBeNull();
  });

  it("shows an icon next to the text, hidden from assistive technology", () => {
    render(
      <StatusMessage variant="error" onDismiss={vi.fn()} data-testid="msg">
        Failed
      </StatusMessage>,
    );
    const icons = screen
      .getByTestId("msg")
      .querySelectorAll("svg[aria-hidden='true']");
    // The status icon and the dismiss icon.
    expect(icons.length).toBe(2);
  });

  it("has a dismiss button that calls onDismiss", () => {
    const onDismiss = vi.fn();
    render(
      <StatusMessage variant="info" onDismiss={onDismiss}>
        Hello
      </StatusMessage>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("accepts a translated dismiss label", () => {
    render(
      <StatusMessage variant="info" onDismiss={vi.fn()} dismissLabel="Maak toe">
        Hallo
      </StatusMessage>,
    );
    expect(screen.getByRole("button", { name: "Maak toe" })).toBeTruthy();
  });

  it("renders an optional action that runs without dismissing", () => {
    const onDismiss = vi.fn();
    const onClick = vi.fn();
    render(
      <StatusMessage
        variant="error"
        onDismiss={onDismiss}
        action={{ label: "Retry", onClick }}
      >
        Failed
      </StatusMessage>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("never auto-dismisses an error", () => {
    const onDismiss = vi.fn();
    render(
      <StatusMessage variant="error" onDismiss={onDismiss}>
        Failed
      </StatusMessage>,
    );
    act(() => vi.advanceTimersByTime(10 * 60 * 1000));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("auto-dismisses info and success after 6 seconds by default", () => {
    const onDismiss = vi.fn();
    render(
      <StatusMessage variant="success" onDismiss={onDismiss}>
        Saved
      </StatusMessage>,
    );
    act(() => vi.advanceTimersByTime(5999));
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("never dismisses sooner than 6 seconds, but allows longer", () => {
    const onDismiss = vi.fn();
    const { rerender } = render(
      <StatusMessage variant="info" onDismiss={onDismiss} autoDismissMs={1000}>
        Quick
      </StatusMessage>,
    );
    act(() => vi.advanceTimersByTime(5999));
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onDismiss).toHaveBeenCalledTimes(1);

    onDismiss.mockClear();
    rerender(
      <StatusMessage
        key="long"
        variant="info"
        onDismiss={onDismiss}
        autoDismissMs={10000}
      >
        Slow
      </StatusMessage>,
    );
    act(() => vi.advanceTimersByTime(9999));
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("pauses while hovered and resumes with the time left", () => {
    const onDismiss = vi.fn();
    render(
      <StatusMessage variant="info" onDismiss={onDismiss} data-testid="msg">
        Hello
      </StatusMessage>,
    );
    const message = screen.getByTestId("msg");
    act(() => vi.advanceTimersByTime(4000));
    fireEvent.mouseEnter(message);
    act(() => vi.advanceTimersByTime(60000));
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.mouseLeave(message);
    act(() => vi.advanceTimersByTime(1999));
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("pauses while it contains focus and resumes when focus leaves", () => {
    const onDismiss = vi.fn();
    render(
      <>
        <StatusMessage variant="info" onDismiss={onDismiss}>
          Hello
        </StatusMessage>
        <button type="button">Elsewhere</button>
      </>,
    );
    const dismiss = screen.getByRole("button", { name: "Dismiss" });
    act(() => dismiss.focus());
    act(() => vi.advanceTimersByTime(60000));
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => screen.getByRole("button", { name: "Elsewhere" }).focus());
    act(() => vi.advanceTimersByTime(6000));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("stays paused when focus moves between controls inside it", () => {
    const onDismiss = vi.fn();
    render(
      <StatusMessage
        variant="info"
        onDismiss={onDismiss}
        action={{ label: "Undo", onClick: vi.fn() }}
      >
        Deleted
      </StatusMessage>,
    );
    act(() => screen.getByRole("button", { name: "Undo" }).focus());
    act(() => screen.getByRole("button", { name: "Dismiss" }).focus());
    act(() => vi.advanceTimersByTime(60000));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("stays paused while hovered even after focus leaves", () => {
    const onDismiss = vi.fn();
    render(
      <StatusMessage variant="info" onDismiss={onDismiss} data-testid="msg">
        Hello
      </StatusMessage>,
    );
    const message = screen.getByTestId("msg");
    fireEvent.mouseEnter(message);
    act(() => screen.getByRole("button", { name: "Dismiss" }).focus());
    act(() => screen.getByRole("button", { name: "Dismiss" }).blur());
    act(() => vi.advanceTimersByTime(60000));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("calls the latest onDismiss and clears its timer on unmount", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender, unmount } = render(
      <StatusMessage variant="info" onDismiss={first}>
        Hello
      </StatusMessage>,
    );
    rerender(
      <StatusMessage variant="info" onDismiss={second}>
        Hello
      </StatusMessage>,
    );
    act(() => vi.advanceTimersByTime(6000));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);

    const { unmount: unmountOther } = render(
      <StatusMessage variant="info" onDismiss={first}>
        Other
      </StatusMessage>,
    );
    unmountOther();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the onDismiss that was committed when a render with another one is thrown away", async () => {
    const committed = vi.fn();
    const discarded = vi.fn();
    let propose: (next: () => void) => void = () => {};
    let abandon: () => void = () => {};

    function Harness() {
      const [onDismiss, setOnDismiss] = useState(() => committed);
      const [abandoned, setAbandoned] = useState(false);
      propose = (next) => setOnDismiss(() => next);
      abandon = () => setAbandoned(true);
      return (
        <>
          <StatusMessage variant="info" onDismiss={onDismiss}>
            Hello
          </StatusMessage>
          <Suspender suspended={abandoned} />
        </>
      );
    }
    function Suspender({ suspended }: { suspended: boolean }) {
      if (suspended) {
        use(new Promise<never>(() => {}));
      }
      return null;
    }

    render(
      <Suspense fallback={null}>
        <Harness />
      </Suspense>,
    );
    await act(async () => {
      startTransition(() => {
        propose(discarded);
        abandon();
      });
    });
    act(() => vi.advanceTimersByTime(6000));

    expect(discarded).not.toHaveBeenCalled();
    expect(committed).toHaveBeenCalledTimes(1);
  });

  it("stops the countdown when an info message becomes an error", () => {
    const onDismiss = vi.fn();
    const { rerender } = render(
      <StatusMessage variant="info" onDismiss={onDismiss}>
        Working
      </StatusMessage>,
    );
    act(() => vi.advanceTimersByTime(3000));
    rerender(
      <StatusMessage variant="error" onDismiss={onDismiss}>
        Failed
      </StatusMessage>,
    );
    act(() => vi.advanceTimersByTime(60000));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("merges a class name and passes attributes through", () => {
    render(
      <StatusMessage
        variant="info"
        onDismiss={vi.fn()}
        className="extra"
        data-chrome="toast"
        data-testid="msg"
      >
        Hello
      </StatusMessage>,
    );
    const message = screen.getByTestId("msg");
    expect(message.className).toContain("extra");
    expect(message.getAttribute("data-chrome")).toBe("toast");
  });
});
