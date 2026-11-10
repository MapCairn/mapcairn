import type { Page } from "@playwright/test";

/** What {@link inspectPermanentCredit} found. The problem list is empty when the credit is sound. */
export interface PermanentCreditReport {
  /** The credit's box, as the viewport sees it. */
  readonly box: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  /** The rendered height of the logo in CSS pixels. */
  readonly logoHeight: number;
  /** The rendered width of the logo, which follows its proportions. */
  readonly logoWidth: number;
  /** Everything wrong with the credit; empty when it is whole, visible and unobstructed. */
  readonly problems: readonly string[];
}

/** What the page reports about the credit, before it is judged. */
interface Facts {
  readonly found: boolean;
  readonly rect: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly viewport: { readonly width: number; readonly height: number };
  /** Whether the credit or a parent is `inert`, `hidden`, not visible or faded. */
  readonly hiddenBy: readonly string[];
  readonly logo: { readonly height: number; readonly width: number } | null;
  /** Each link's own box: the touch target a finger gets. */
  readonly links: readonly {
    readonly label: string;
    readonly width: number;
    readonly height: number;
  }[];
  /** Each point probed with `elementFromPoint`, and what is there if it is not the credit. */
  readonly probes: readonly {
    readonly label: string;
    readonly x: number;
    readonly y: number;
    readonly coveredBy: string | null;
  }[];
}

/** Reads the credit's facts in the page. It only measures; judging happens outside. */
function readFacts(page: Page): Promise<Facts> {
  return page.evaluate((): Facts => {
    const none = { x: 0, y: 0, width: 0, height: 0 };
    const credit = document.querySelector<HTMLElement>(
      '[data-testid="permanent-credit"]',
    );
    const viewport = {
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
    };
    if (!credit) {
      return {
        found: false,
        rect: none,
        viewport,
        hiddenBy: [],
        logo: null,
        links: [],
        probes: [],
      };
    }
    const rect = credit.getBoundingClientRect();
    const hiddenBy: string[] = [];
    for (
      let node: HTMLElement | null = credit;
      node;
      node = node.parentElement
    ) {
      const style = getComputedStyle(node);
      const reasons = [
        node.hasAttribute("inert") && "inert",
        node.hasAttribute("hidden") && "hidden",
        style.visibility !== "visible" && "visibility",
        style.display === "none" && "display",
        Number(style.opacity) < 1 && "opacity",
      ];
      for (const reason of reasons) {
        if (reason) {
          hiddenBy.push(`${node.tagName.toLowerCase()} ${reason}`);
        }
      }
    }
    const logoElement = credit.querySelector<HTMLImageElement>("img");
    const logoBox = logoElement?.getBoundingClientRect();
    const targets: { label: string; x: number; y: number }[] = [];
    if (logoBox) {
      const inset = 2;
      targets.push(
        {
          label: "the logo's middle",
          x: logoBox.left + logoBox.width / 2,
          y: logoBox.top + logoBox.height / 2,
        },
        {
          label: "the logo's top left",
          x: logoBox.left + inset,
          y: logoBox.top + inset,
        },
        {
          label: "the logo's top right",
          x: logoBox.right - inset,
          y: logoBox.top + inset,
        },
        {
          label: "the logo's bottom left",
          x: logoBox.left + inset,
          y: logoBox.bottom - inset,
        },
        {
          label: "the logo's bottom right",
          x: logoBox.right - inset,
          y: logoBox.bottom - inset,
        },
      );
    }
    const links: { label: string; width: number; height: number }[] = [];
    for (const link of credit.querySelectorAll<HTMLElement>("a[href]")) {
      const box = link.getBoundingClientRect();
      const label = `the link "${link.textContent?.trim()}"`;
      links.push({ label, width: box.width, height: box.height });
      targets.push({
        label,
        x: box.left + box.width / 2,
        y: box.top + box.height / 2,
      });
      // The edges of the touch target are as much the link as its middle.
      targets.push(
        {
          label: `${label} (top edge)`,
          x: box.left + box.width / 2,
          y: box.top + 1,
        },
        {
          label: `${label} (bottom edge)`,
          x: box.left + box.width / 2,
          y: box.bottom - 1,
        },
      );
    }
    const probes = targets.map((target) => {
      const hit = document.elementFromPoint(target.x, target.y);
      const covered = hit !== null && !credit.contains(hit);
      const slot = hit?.closest("[data-chrome]")?.getAttribute("data-chrome");
      return {
        ...target,
        coveredBy:
          covered || hit === null
            ? `${hit?.tagName ?? "nothing"}${slot ? ` in ${slot}` : ""}`
            : null,
      };
    });
    return {
      found: true,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      viewport,
      hiddenBy,
      logo: logoBox ? { height: logoBox.height, width: logoBox.width } : null,
      links,
      probes,
    };
  });
}

/** Lists what is wrong with the credit's box: missing, empty or outside the viewport. */
function boxProblems(facts: Facts): string[] {
  const { rect, viewport } = facts;
  const problems: string[] = [];
  if (rect.width === 0 || rect.height === 0) {
    problems.push("the credit has no size");
  }
  const outside =
    rect.x < -0.5 ||
    rect.y < -0.5 ||
    rect.x + rect.width > viewport.width + 0.5 ||
    rect.y + rect.height > viewport.height + 0.5;
  if (outside) {
    problems.push("the credit reaches outside the viewport");
  }
  return problems;
}

/** The least size of a touch target, in CSS pixels (DESIGN.md). */
const MIN_TARGET = 44;

/** Lists everything wrong with what the page reported. */
function judge(facts: Facts): string[] {
  if (!facts.found) {
    return ["the permanent credit is not in the page"];
  }
  const problems = boxProblems(facts);
  for (const reason of facts.hiddenBy) {
    problems.push(`the credit is hidden: ${reason}`);
  }
  if (facts.logo === null) {
    problems.push("the credit has no logo");
  } else if (facts.logo.height < 24) {
    problems.push(`the logo is ${facts.logo.height}px high, under 24px`);
  }
  for (const link of facts.links) {
    if (link.height < MIN_TARGET - 0.5 || link.width < MIN_TARGET - 0.5) {
      problems.push(
        `${link.label} is ${Math.round(link.width)} by ${Math.round(link.height)}px, under the ${MIN_TARGET}px touch target`,
      );
    }
  }
  for (const probe of facts.probes) {
    if (probe.coveredBy !== null) {
      problems.push(
        `${probe.label} at ${Math.round(probe.x)},${Math.round(probe.y)} is covered by ${probe.coveredBy}`,
      );
    }
  }
  return problems;
}

/**
 * Checks the permanent credit the way a person sees it, not by comparing
 * boxes: it is entirely inside the viewport, neither it nor a parent is
 * hidden, inert or faded, the logo is at least 24 CSS pixels high, every link
 * is a 44 pixel touch target, and
 * `document.elementFromPoint` at the middle of the logo and of every link,
 * and at the logo's four corners just inside its edge, returns something
 * inside the credit. Anything else there (the sheet, a panel, a toolbar, a
 * toast, a control) would be what covers it.
 */
export async function inspectPermanentCredit(
  page: Page,
): Promise<PermanentCreditReport> {
  const facts = await readFacts(page);
  return {
    box: facts.rect,
    logoHeight: facts.logo?.height ?? 0,
    logoWidth: facts.logo?.width ?? 0,
    problems: judge(facts),
  };
}
