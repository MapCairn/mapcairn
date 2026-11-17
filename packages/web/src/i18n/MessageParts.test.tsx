// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createMessageCatalogue,
  EN_GB_CATALOGUE,
  type MessageKey,
} from "@mapcairn/core";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MessageParts, splitAroundPlaceholders } from "./MessageParts";

describe("splitAroundPlaceholders", () => {
  it("returns one piece of text when there is no placeholder", () => {
    expect(splitAroundPlaceholders("Plain text.")).toEqual(["Plain text."]);
  });

  it("alternates text and placeholder names", () => {
    expect(splitAroundPlaceholders("See {link} or {mail}.")).toEqual([
      "See ",
      { placeholder: "link" },
      " or ",
      { placeholder: "mail" },
      ".",
    ]);
  });

  it("keeps a placeholder at either end and drops empty text", () => {
    expect(splitAroundPlaceholders("{a}{b}")).toEqual([
      { placeholder: "a" },
      { placeholder: "b" },
    ]);
  });

  it("repeats a name used twice", () => {
    expect(splitAroundPlaceholders("{a} and {a}")).toEqual([
      { placeholder: "a" },
      " and ",
      { placeholder: "a" },
    ]);
  });
});

describe("MessageParts", () => {
  const catalogue = (value: string) =>
    createMessageCatalogue(
      "en-GB",
      { "privacy.contact.body": value },
      EN_GB_CATALOGUE,
    );
  const KEY: MessageKey = "privacy.contact.body";

  it("puts each part where its placeholder is, around the text", () => {
    const { container } = render(
      <p>
        <MessageParts
          messages={catalogue("Write to {email}, or open {issues}.")}
          messageKey={KEY}
          parts={{
            email: <a href="mailto:a@b.c">a@b.c</a>,
            issues: <b>issues</b>,
          }}
        />
      </p>,
    );

    expect(container.innerHTML).toBe(
      '<p>Write to <a href="mailto:a@b.c">a@b.c</a>, or open <b>issues</b>.</p>',
    );
  });

  it("leaves a placeholder with no part as written", () => {
    const { container } = render(
      <p>
        <MessageParts
          messages={catalogue("Write to {email} or {phone}.")}
          messageKey={KEY}
          parts={{ email: "me" }}
        />
      </p>,
    );

    expect(container.textContent).toBe("Write to me or {phone}.");
  });

  it("uses a part more than once if the text names it twice", () => {
    const { container } = render(
      <p>
        <MessageParts
          messages={catalogue("{x} then {x}")}
          messageKey={KEY}
          parts={{ x: <i>x</i> }}
        />
      </p>,
    );

    expect(container.innerHTML).toBe("<p><i>x</i> then <i>x</i></p>");
  });
});
