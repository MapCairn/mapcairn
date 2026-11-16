// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { createFakeServices, FakeMessageCatalogue } from "@mapcairn/core";
import { ServicesProvider } from "@mapcairn/map";
import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";
import { ErrorPage, type ErrorPageKind } from "./ErrorPage";

function renderPage(
  kind: ErrorPageKind,
  services?: ReturnType<typeof createFakeServices>,
) {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () =>
        services ? (
          <ServicesProvider services={services}>
            <ErrorPage kind={kind} />
          </ServicesProvider>
        ) : (
          <ErrorPage kind={kind} />
        ),
    },
  ]);
  render(<Stub initialEntries={["/"]} />);
}

describe("ErrorPage", () => {
  it("asks for the not-found words by key", () => {
    const services = createFakeServices();
    renderPage("not-found", services);
    expect(services.fakes.messages.calls.map((call) => call.key)).toEqual(
      expect.arrayContaining([
        "app.error.notFound.title",
        "app.error.notFound.message",
        "app.error.notFound.link",
      ]),
    );
  });

  it("asks for the unexpected-error words and Reload by key", () => {
    const services = createFakeServices();
    renderPage("unexpected", services);
    expect(services.fakes.messages.calls.map((call) => call.key)).toEqual(
      expect.arrayContaining([
        "app.error.unexpected.title",
        "app.error.unexpected.message",
        "app.reload",
      ]),
    );
  });

  it("uses the host's catalogue when it has one", () => {
    const services = createFakeServices({
      messages: new FakeMessageCatalogue({
        overrides: { "app.error.notFound.title": "Nothing here" },
      }),
    });
    renderPage("not-found", services);
    expect(
      screen.getByRole("heading", { name: "Nothing here" }),
    ).toBeInTheDocument();
  });

  it("speaks English outside the services, as the root error boundary does", () => {
    renderPage("unexpected");
    expect(
      screen.getByRole("heading", { name: "Something went wrong" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });
});
