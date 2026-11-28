// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { useLayoutEffect, useRef } from "react";
import type { DefinitionState } from "../../lit/lazyDefinition";
import type { PrivateElementTags } from "../../lit/privateElements";
import type { AnnouncementTextElement } from "./AnnouncementTextElement";

function Writer({
  tag,
  text,
}: {
  readonly tag: string;
  readonly text: string;
}) {
  const ref = useRef<AnnouncementTextElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element !== null) {
      element.message = text;
      element.flush();
    }
  });
  // The tag is a name chosen when the element was defined, so it is a variable.
  const Text = tag as "span";
  return <Text ref={ref as React.Ref<HTMLSpanElement>} />;
}

/**
 * What goes inside one live region: the private element that writes the text,
 * nothing while it loads, and the text itself if it cannot be loaded, so a
 * failed request does not leave the page silent.
 */
export function RegionText({
  elements,
  text,
}: {
  readonly elements: DefinitionState<PrivateElementTags>;
  readonly text: string;
}) {
  if (elements.status === "ready") {
    return <Writer tag={elements.value.announcement} text={text} />;
  }
  return elements.status === "failed" ? text : null;
}
