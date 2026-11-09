import type {
  FillPattern,
  LineDash,
  MapLookRule,
  MapShapeLook,
} from "@karta/core";

/**
 * An engine expression, or a literal value an engine property accepts. It is
 * opaque to the rest of the adapter: only these builders write it.
 */
export type EngineValue = unknown;

/**
 * The engine values a shape layer draws with: one per attribute of a
 * {@link MapShapeLook}. The layer builders take these without knowing whether
 * they read a property of each GeoJSON feature or evaluate a rule over the
 * properties of vector tile features.
 */
export interface LookExpressions {
  readonly colour: EngineValue;
  readonly fillOpacity: EngineValue;
  readonly width: EngineValue;
  readonly pattern: EngineValue;
  readonly dash: EngineValue;
  /** Set when every feature has this pattern, so the builders skip a filter. */
  readonly fixedPattern?: FillPattern;
  /** Set when every feature has this dash, so the builders skip a filter. */
  readonly fixedDash?: LineDash;
}

/** The look of each feature, read from properties the adapter wrote into its own GeoJSON. */
export function propertyLook(): LookExpressions {
  return {
    colour: ["get", "colour"],
    fillOpacity: ["get", "fillOpacity"],
    width: ["get", "width"],
    pattern: ["get", "pattern"],
    dash: ["get", "dash"],
  };
}

/** Reads one attribute of a look. */
type Attribute<T> = (look: MapShapeLook) => T;

/**
 * Whether a `match` expression can take these values as branch labels. The
 * engine needs labels that are all strings or all integers, and rejects a
 * repeated one.
 */
function canMatch(values: readonly (string | number)[]): boolean {
  return (
    values.every((value) => typeof value === "string") ||
    values.every((value) => Number.isSafeInteger(value))
  );
}

function compile<T>(rule: MapLookRule, pick: Attribute<T>): EngineValue {
  switch (rule.kind) {
    case "fixed":
      return pick(rule.look);
    case "category": {
      const seen = new Set<string | number>();
      const cases = rule.cases.filter(({ value }) => {
        if (seen.has(value)) {
          return false;
        }
        seen.add(value);
        return true;
      });
      const fallback = pick(rule.fallback);
      if (cases.length === 0) {
        return fallback;
      }
      const input = ["get", rule.field];
      if (canMatch(cases.map(({ value }) => value))) {
        return [
          "match",
          input,
          ...cases.flatMap(({ value, look }) => [value, pick(look)]),
          fallback,
        ];
      }
      return [
        "case",
        ...cases.flatMap(({ value, look }) => [
          ["==", input, value],
          pick(look),
        ]),
        fallback,
      ];
    }
    case "steps": {
      const [first, ...rest] = rule.steps;
      if (!first) {
        return undefined;
      }
      // The engine needs strictly rising stops.
      let last = first.min;
      const later = rest.filter(({ min }) => {
        if (min <= last) {
          return false;
        }
        last = min;
        return true;
      });
      return [
        "step",
        // A missing or non-numeric value counts as the lowest step.
        ["to-number", ["get", rule.field], first.min],
        pick(first.look),
        ...later.flatMap(({ min, look }) => [min, pick(look)]),
      ];
    }
  }
}

/**
 * Compiles a look rule into engine expressions over the properties of vector
 * tile features, so the engine evaluates it per feature: a fixed rule gives
 * literals, a category rule a `match`, a step rule a `step`. Undefined when a
 * step rule has no steps, because there is no look to draw.
 */
export function ruleLook(rule: MapLookRule): LookExpressions | undefined {
  if (rule.kind === "steps" && rule.steps.length === 0) {
    return undefined;
  }
  return {
    colour: compile(rule, (look) => look.colour),
    fillOpacity: compile(rule, (look) => look.fillOpacity),
    width: compile(rule, (look) => look.width),
    pattern: compile(rule, (look) => look.pattern),
    dash: compile(rule, (look) => look.dash),
    ...(rule.kind === "fixed"
      ? { fixedPattern: rule.look.pattern, fixedDash: rule.look.dash }
      : {}),
  };
}
