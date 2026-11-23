// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { StyleRule } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";
import { primitives } from "./primitives.css";

type Rule = StyleRule;
type Variants = Record<string, Record<string, Rule>>;
type Options<V extends Variants> = Parameters<typeof recipe<V>>[0];

/** Puts a style rule, with its selectors and media queries, in the primitives layer. */
function layered(rule: Rule): Rule {
  return { "@layer": { [primitives]: rule } };
}

/**
 * `recipe` with every rule (the base, each variant and each compound variant)
 * in the `primitives` cascade layer, so a component's own class, which sits in
 * no layer, beats the primitive's style whatever the stylesheet order and
 * however the selectors compare. Use it for a primitive that takes a
 * `className`; DESIGN.md, "Overriding a primitive", has the rule.
 *
 * @param options - The same options `recipe` takes, with rules written as
 *   objects.
 * @returns The same runtime function `recipe` returns.
 */
export function primitiveRecipe<V extends Variants>(
  options: Options<V> & { base: Rule },
): ReturnType<typeof recipe<V>> {
  const variants = Object.fromEntries(
    Object.entries(options.variants ?? {}).map(([group, values]) => [
      group,
      Object.fromEntries(
        Object.entries(values).map(([name, rule]) => [name, layered(rule)]),
      ),
    ]),
  ) as V;
  return recipe<V>({
    ...options,
    base: layered(options.base),
    variants,
    compoundVariants: options.compoundVariants?.map((compound) => ({
      ...compound,
      style: layered(compound.style as Rule),
    })),
  });
}
