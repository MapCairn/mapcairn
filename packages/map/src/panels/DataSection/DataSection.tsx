import type { Ref } from "react";
import { useLayers } from "../../services";
import { ListRow } from "../../ui/ListRow";
import { type HeadingLevel, Section } from "../Section";
import { layerList } from "./DataSection.css";

/** Props for {@link DataSection}. */
export interface DataSectionProps {
  /** The heading level. Defaults to 3, below the sheet's h2 title. */
  readonly headingLevel?: HeadingLevel;
  /** Receives the heading, so the sheet can focus it. */
  readonly headingRef?: Ref<HTMLHeadingElement>;
}

/**
 * The data layers the host has registered, by name. Renders nothing at all
 * when there are none, which is the case for the host in this release.
 */
export function DataSection({
  headingLevel = 3,
  headingRef,
}: DataSectionProps) {
  const layers = useLayers().list();
  if (layers.length === 0) {
    return null;
  }
  return (
    <Section
      title="Data"
      headingLevel={headingLevel}
      headingRef={headingRef}
      data-testid="sheet-section-data"
    >
      <ul className={layerList}>
        {layers.map((layer) => (
          <ListRow key={layer.id} label={layer.name} />
        ))}
      </ul>
    </Section>
  );
}
