import {
  Button,
  Chip,
  ControlGroup,
  EmptyState,
  Icon,
  IconButton,
  ListRow,
  SegmentedControl,
  Slider,
  StatusMessage,
  Surface,
  Switch,
  Tooltip,
  VisuallyHidden,
} from "@karta/map";
import {
  ChevronRight,
  Copy,
  Crosshair,
  Info,
  Layers,
  LocateFixed,
  MapPin,
  Minus,
  Navigation2,
  Plus,
  RotateCw,
  Ruler,
  Search,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { ClientOnly } from "../app/ClientOnly";
import * as styles from "./DesignGuide.css";
import { GuideSection } from "./GuideSection";

/** The primitives the guide demonstrates, in the order they appear. */
export const COMPONENT_NAMES = [
  "IconButton",
  "ControlGroup",
  "Button",
  "Chip",
  "ListRow",
  "EmptyState",
  "StatusMessage",
  "Switch",
  "Slider",
  "SegmentedControl",
  "Tooltip",
  "SkipLink",
  "Surface",
  "VisuallyHidden",
] as const;

/** Does nothing: the demo messages stay on the page so every state stays visible. */
function keep(): undefined {
  return undefined;
}

/** One labelled state of a component. */
function State({
  label,
  wide = false,
  children,
}: {
  readonly label: string;
  readonly wide?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <li className={wide ? styles.wideState : styles.state}>
      {children}
      <span className={styles.caption}>{label}</span>
    </li>
  );
}

/** One component's demo: an h3, what it is for, and its states. */
function Demo({
  name,
  description,
  children,
}: {
  readonly name: (typeof COMPONENT_NAMES)[number];
  readonly description: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <div className={styles.demo} data-testid={`demo-${name}`}>
      <h3 className={styles.subTitle}>{name}</h3>
      <p className={styles.prose}>{description}</p>
      {children}
    </div>
  );
}

/**
 * Stands in for a demo built on Radix until the page hydrates. Radix writes
 * inline styles during server rendering, which the strict style CSP blocks,
 * so these demos render in the browser only.
 */
function BrowserOnly({ children }: { readonly children: ReactNode }) {
  return (
    <ClientOnly
      fallback={<p className={styles.caption}>Loading the live demo</p>}
    >
      {children}
    </ClientOnly>
  );
}

function IconButtonDemo() {
  const [measuring, setMeasuring] = useState(true);
  return (
    <Demo
      name="IconButton"
      description="A button that shows only an icon and is named for its action. 48px square, or 44px when compact. Pressed adds a tint and a bar, so it never relies on colour."
    >
      <ul className={styles.states}>
        <State label="Default">
          <IconButton label="Copy coordinates" icon={Copy} />
        </State>
        <State label="Pressed (toggles)">
          <IconButton
            label="Measure"
            icon={Ruler}
            pressed={measuring}
            onClick={() => setMeasuring((value) => !value)}
          />
        </State>
        <State label="Expanded">
          <IconButton label="Map credits" icon={Info} expanded />
        </State>
        <State label="Busy">
          <IconButton label="Locate me" icon={LocateFixed} busy />
        </State>
        <State label="Disabled">
          <IconButton label="Undo last point" icon={Undo2} disabled />
        </State>
        <State label="Compact">
          <IconButton label="Close" icon={X} size="compact" />
        </State>
      </ul>
    </Demo>
  );
}

function ControlGroupDemo() {
  return (
    <Demo
      name="ControlGroup"
      description="Icon buttons stacked on one floating surface with hairlines between them. A plain group, so it adds no arrow-key behaviour."
    >
      <ul className={styles.states}>
        <State label="Zoom">
          <ControlGroup label="Zoom">
            <IconButton label="Zoom in" icon={Plus} />
            <IconButton label="Zoom out" icon={Minus} />
          </ControlGroup>
        </State>
        <State label="Map tools, one pressed">
          <ControlGroup label="Map tools">
            <IconButton label="Map options" icon={Layers} />
            <IconButton label="Show the centre" icon={Crosshair} pressed />
            <IconButton label="Reset north" icon={Navigation2} />
          </ControlGroup>
        </State>
      </ul>
    </Demo>
  );
}

function ButtonDemo() {
  return (
    <Demo
      name="Button"
      description="A text button, at least 48px tall. Busy swaps the icon for a loader and keeps the label, so the name never changes. Disabled stays focusable so its name can still be found."
    >
      <ul className={styles.states}>
        <State label="Primary">
          <Button icon={MapPin}>Drop pin</Button>
        </State>
        <State label="Secondary">
          <Button variant="secondary" icon={Copy}>
            Copy link
          </Button>
        </State>
        <State label="Quiet">
          <Button variant="quiet" icon={Trash2}>
            Clear
          </Button>
        </State>
        <State label="Busy">
          <Button busy>Searching</Button>
        </State>
        <State label="Disabled">
          <Button disabled icon={Trash2}>
            Delete pin
          </Button>
        </State>
      </ul>
    </Demo>
  );
}

function ChipDemo() {
  const [satellite, setSatellite] = useState(false);
  const [streets, setStreets] = useState(true);
  return (
    <Demo
      name="Chip"
      description="A small pill. With an action it is a toggle button with aria-pressed and a check when on; without one it is a label."
    >
      <ul className={styles.states}>
        <State label="Label">
          <Chip>Vector</Chip>
        </State>
        <State label="Label with icon">
          <Chip icon={Layers}>Raster</Chip>
        </State>
        <State label="Toggle, off">
          <Chip
            selected={satellite}
            onClick={() => setSatellite((value) => !value)}
          >
            Satellite
          </Chip>
        </State>
        <State label="Toggle, on">
          <Chip
            selected={streets}
            onClick={() => setStreets((value) => !value)}
          >
            Streets
          </Chip>
        </State>
      </ul>
    </Demo>
  );
}

function ListRowDemo() {
  const [chosen, setChosen] = useState("positron");
  return (
    <Demo
      name="ListRow"
      description="A list item for places, layers and options. With an action the whole row is one button; the current choice has a check and aria-current."
    >
      <ul className={styles.list}>
        <ListRow
          icon={MapPin}
          label="Cape Town"
          secondary="Western Cape, South Africa"
        />
        <ListRow
          icon={Ruler}
          label="Measured distance"
          trailing={<span className={styles.figures}>12.4 km</span>}
        />
        <ListRow
          label="Positron"
          secondary="Light vector basemap"
          selected={chosen === "positron"}
          onClick={() => setChosen("positron")}
        />
        <ListRow
          label="Liberty"
          secondary="Colourful vector basemap"
          selected={chosen === "liberty"}
          trailing={<Icon icon={ChevronRight} />}
          onClick={() => setChosen("liberty")}
        />
      </ul>
    </Demo>
  );
}

function EmptyStateDemo() {
  return (
    <Demo
      name="EmptyState"
      description="What a list shows when it has nothing to show: an icon, a real heading, an explanation and an optional next step."
    >
      <EmptyState
        icon={Search}
        heading="No places found"
        headingLevel={4}
        action={
          <Button variant="secondary" icon={RotateCw}>
            Try again
          </Button>
        }
      >
        Check the spelling, or try a nearby town.
      </EmptyState>
    </Demo>
  );
}

function StatusMessageDemo() {
  return (
    <Demo
      name="StatusMessage"
      description="A toast or banner with an icon, text and a dismiss button, so the kind is never shown by colour alone. Info and success are polite status messages; an error is an alert and never dismisses itself. Here dismissing does nothing, so every state stays on the page."
    >
      <ul className={styles.states}>
        <State label="Info" wide>
          <StatusMessage
            className={styles.fullWidth}
            variant="info"
            onDismiss={keep}
          >
            Copied the coordinates.
          </StatusMessage>
        </State>
        <State label="Success" wide>
          <StatusMessage
            className={styles.fullWidth}
            variant="success"
            onDismiss={keep}
          >
            Pin dropped at the map centre.
          </StatusMessage>
        </State>
        <State label="Error, with an action" wide>
          <StatusMessage
            className={styles.fullWidth}
            variant="error"
            onDismiss={keep}
            action={{ label: "Retry", onClick: keep }}
          >
            Search is not responding.
          </StatusMessage>
        </State>
      </ul>
    </Demo>
  );
}

function SwitchDemo() {
  const [match, setMatch] = useState(false);
  const [zoom, setZoom] = useState(true);
  return (
    <Demo
      name="Switch"
      description="A labelled on and off switch. On is shown three ways: the thumb moves, the track fills and the thumb carries a tick."
    >
      <BrowserOnly>
        <ul className={styles.states}>
          <State label="Off" wide>
            <Switch
              className={styles.fullWidth}
              label="Match the map to the theme"
              checked={match}
              onCheckedChange={setMatch}
            />
          </State>
          <State label="On, with a description" wide>
            <Switch
              className={styles.fullWidth}
              label="Show zoom buttons"
              description="Pinch and the plus and minus keys always work."
              checked={zoom}
              onCheckedChange={setZoom}
            />
          </State>
          <State label="Disabled, off" wide>
            <Switch
              className={styles.fullWidth}
              label="Remember the view"
              checked={false}
              onCheckedChange={keep}
              disabled
            />
          </State>
          <State label="Disabled, on" wide>
            <Switch
              className={styles.fullWidth}
              label="Use metric units"
              checked
              onCheckedChange={keep}
              disabled
            />
          </State>
        </ul>
      </BrowserOnly>
    </Demo>
  );
}

/** Formats a percentage for the slider demos. */
function percent(value: number): string {
  return `${value}%`;
}

function SliderDemo() {
  const [opacity, setOpacity] = useState(60);
  return (
    <Demo
      name="Slider"
      description="A single-thumb slider with a visible label and value. Arrow keys, Home, End, Page Up and Page Down move it, and the value is announced as text."
    >
      <BrowserOnly>
        <ul className={styles.states}>
          <State label="Default" wide>
            <Slider
              className={styles.fullWidth}
              label="Overlay opacity"
              min={0}
              max={100}
              step={5}
              value={opacity}
              onValueChange={setOpacity}
              formatValue={percent}
            />
          </State>
          <State label="Disabled" wide>
            <Slider
              className={styles.fullWidth}
              label="Label size"
              min={0}
              max={100}
              step={5}
              value={40}
              onValueChange={keep}
              formatValue={percent}
              disabled
            />
          </State>
        </ul>
      </BrowserOnly>
    </Demo>
  );
}

function SegmentedControlDemo() {
  const [units, setUnits] = useState("metric");
  return (
    <Demo
      name="SegmentedControl"
      description="One choice from a few, all shown at once. One tab stop; arrow keys move between options. The selection is filled and carries a check."
    >
      <BrowserOnly>
        <ul className={styles.states}>
          <State label="Default" wide>
            <SegmentedControl
              className={styles.fullWidth}
              label="Units"
              options={[
                { value: "metric", label: "Metric" },
                { value: "imperial", label: "Imperial" },
              ]}
              value={units}
              onValueChange={setUnits}
            />
          </State>
          <State label="Disabled" wide>
            <SegmentedControl
              className={styles.fullWidth}
              label="Distance units"
              options={[
                { value: "km", label: "Kilometres" },
                { value: "mi", label: "Miles" },
              ]}
              value="km"
              onValueChange={keep}
              disabled
            />
          </State>
        </ul>
      </BrowserOnly>
    </Demo>
  );
}

function TooltipDemo() {
  return (
    <Demo
      name="Tooltip"
      description="A short hint that supplements a name and never replaces it. It opens on focus as well as hover and closes with Escape. Touch screens have no tooltips. Tab to the button to open it."
    >
      <BrowserOnly>
        <ul className={styles.states}>
          <State label="Focus or hover to open">
            <Tooltip content="Points the map north again">
              <IconButton label="Face north" icon={Navigation2} />
            </Tooltip>
          </State>
        </ul>
      </BrowserOnly>
    </Demo>
  );
}

function SkipLinkDemo() {
  return (
    <Demo
      name="SkipLink"
      description="The first focusable element on a page, hidden until it has focus. This page has one: press Tab once from the top of the page to see it, and Enter to jump to the content."
    >
      <p className={styles.caption}>
        It is not repeated here, because a page has exactly one.
      </p>
    </Demo>
  );
}

function SurfaceDemo() {
  return (
    <Demo
      name="Surface"
      description="The translucent, blurred surface every floating control sits on. Floating has the floating shadow, raised uses the raised colour, flat has neither."
    >
      <ul className={styles.states}>
        <State label="Floating, control radius">
          <Surface variant="floating" radius="control">
            <p className={styles.surfaceSample}>Floating</p>
          </Surface>
        </State>
        <State label="Raised, pill radius">
          <Surface variant="raised" radius="pill">
            <p className={styles.surfaceSample}>Raised</p>
          </Surface>
        </State>
        <State label="Flat, sheet radius">
          <Surface variant="flat" radius="sheet">
            <p className={styles.surfaceSample}>Flat</p>
          </Surface>
        </State>
      </ul>
    </Demo>
  );
}

function VisuallyHiddenDemo() {
  return (
    <Demo
      name="VisuallyHidden"
      description="The one way to give screen readers text that is not shown. The line below reads 12.4 km on screen; a screen reader also hears that it is the distance along the measured line."
    >
      <p className={styles.figures}>
        12.4 km
        <VisuallyHidden> along the measured line</VisuallyHidden>
      </p>
    </Demo>
  );
}

/** Every primitive from `@karta/map`, in every state it has. */
export function ComponentsSection() {
  return (
    <GuideSection
      id="components"
      title="Components"
      intro="Every primitive, built from the real components. Hover cannot be shown on a static page. To see focus, press Tab: each control draws the two-tone focus ring, which the end-to-end suite checks control by control."
    >
      <IconButtonDemo />
      <ControlGroupDemo />
      <ButtonDemo />
      <ChipDemo />
      <ListRowDemo />
      <EmptyStateDemo />
      <StatusMessageDemo />
      <SwitchDemo />
      <SliderDemo />
      <SegmentedControlDemo />
      <TooltipDemo />
      <SkipLinkDemo />
      <SurfaceDemo />
      <VisuallyHiddenDemo />
    </GuideSection>
  );
}
