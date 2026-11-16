// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { geometryPointer } from "../geometry/walk.js";
import type { Finding, Rule, Severity } from "../types.js";

/**
 * The most findings one rule reports for one feature before it counts the rest.
 * A feature can hold hundreds of thousands of rings or positions, and a report
 * with a line for each would be too long to read and too large to hold.
 */
export const MAX_FINDINGS_PER_FEATURE = 20;

/** The parts of a rule the closing finding borrows. */
type RuleFacts = Pick<Rule, "id" | "confidence">;

const SEVERITY_RANK: Readonly<Record<Severity, number>> = {
  info: 0,
  warning: 1,
  error: 2,
};

/**
 * Collects the findings of one rule for one feature up to
 * `MAX_FINDINGS_PER_FEATURE`, and only counts the rest. A rule that can find
 * many things uses it so that it neither builds nor keeps the findings it will
 * not report. It caps what is reported, never what a fix repairs.
 */
export class FindingCap {
  private readonly kept: Finding[] = [];
  private dropped = 0;
  private worstDropped: Severity = "info";

  constructor(
    private readonly rule: RuleFacts,
    private readonly feature: unknown,
  ) {}

  /**
   * Keeps the finding `make` builds, or, once the cap is reached, counts it
   * without building it. `severity` is the severity `make` will give the
   * finding, so a dropped error still shows in the closing finding.
   */
  add(severity: Severity, make: () => Finding): void {
    if (this.kept.length < MAX_FINDINGS_PER_FEATURE) {
      this.kept.push(make());
      return;
    }
    this.dropped += 1;
    if (SEVERITY_RANK[severity] > SEVERITY_RANK[this.worstDropped]) {
      this.worstDropped = severity;
    }
  }

  /**
   * The kept findings, then, when any were left out, one more at the feature's
   * geometry that says how many. Its severity is the worst of the ones left out.
   */
  result(): Finding[] {
    if (this.dropped === 0) {
      return this.kept;
    }
    const many = this.dropped !== 1;
    return [
      ...this.kept,
      {
        ruleId: this.rule.id,
        severity: this.worstDropped,
        confidence: this.rule.confidence,
        path: geometryPointer(this.feature),
        message: `${this.dropped} more ${many ? "findings" : "finding"} from the ${this.rule.id} rule in this feature ${many ? "are" : "is"} not shown.`,
        fixable: false,
        data: { suppressed: this.dropped },
      },
    ];
  }
}

/**
 * Caps findings that were built already (see `FindingCap`): the first
 * `MAX_FINDINGS_PER_FEATURE`, then one finding that counts the rest.
 */
export function capFindings(
  findings: readonly Finding[],
  rule: RuleFacts,
  feature: unknown,
): Finding[] {
  const cap = new FindingCap(rule, feature);
  for (const finding of findings) {
    cap.add(finding.severity, () => finding);
  }
  return cap.result();
}
