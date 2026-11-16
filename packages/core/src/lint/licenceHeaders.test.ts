// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  expectedIdentifier,
  hasHeader,
  headerFor,
  namesAnIdentifier,
  withHeader,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/licenceHeaders.mjs";

const AGPL =
  "// SPDX-License-Identifier: AGPL-3.0-only\n// Copyright MapCairn contributors\n";
const APACHE =
  "// SPDX-License-Identifier: Apache-2.0\n// Copyright MapCairn contributors\n";

describe("expectedIdentifier", () => {
  it("is AGPL-3.0-only for every package but geolint", () => {
    expect(expectedIdentifier("packages/core/src/index.ts")).toBe(
      "AGPL-3.0-only",
    );
    expect(expectedIdentifier("scripts/licenceHeaders.mjs")).toBe(
      "AGPL-3.0-only",
    );
    expect(expectedIdentifier("examples/embed/src/main.tsx")).toBe(
      "AGPL-3.0-only",
    );
  });

  it("is Apache-2.0 inside packages/geolint", () => {
    expect(expectedIdentifier("packages/geolint/src/index.ts")).toBe(
      "Apache-2.0",
    );
    expect(expectedIdentifier("packages/geolint/vitest.config.ts")).toBe(
      "Apache-2.0",
    );
  });

  it("does not treat a sibling folder with a similar name as geolint", () => {
    expect(expectedIdentifier("packages/geolint-extra/src/a.ts")).toBe(
      "AGPL-3.0-only",
    );
  });
});

describe("hasHeader", () => {
  it("accepts the identifier that belongs to the place", () => {
    expect(hasHeader(`${AGPL}export {};\n`, "packages/core/src/a.ts")).toBe(
      true,
    );
    expect(
      hasHeader(`${APACHE}export {};\n`, "packages/geolint/src/a.ts"),
    ).toBe(true);
  });

  it("rejects the wrong licence in either direction", () => {
    expect(hasHeader(`${AGPL}export {};\n`, "packages/geolint/src/a.ts")).toBe(
      false,
    );
    expect(hasHeader(`${APACHE}export {};\n`, "packages/core/src/a.ts")).toBe(
      false,
    );
  });

  it("rejects a file with no header", () => {
    expect(hasHeader("export {};\n", "packages/core/src/a.ts")).toBe(false);
  });

  it("accepts the header after a shebang", () => {
    expect(
      hasHeader(
        `#!/usr/bin/env node\n${APACHE}`,
        "packages/geolint/src/bin.ts",
      ),
    ).toBe(true);
  });
});

describe("namesAnIdentifier", () => {
  it("is true for any identifier, an expression included, which hasHeader refuses", () => {
    const dual =
      "// SPDX-License-Identifier: Apache-2.0 OR MIT\n// Copyright MapCairn contributors\nexport {};\n";
    expect(namesAnIdentifier(APACHE)).toBe(true);
    expect(namesAnIdentifier(dual)).toBe(true);
    expect(hasHeader(dual, "packages/geolint/src/a.ts")).toBe(false);
  });

  it("is true after a shebang and false for no identifier or one too far down", () => {
    expect(namesAnIdentifier(`#!/usr/bin/env node\n${APACHE}`)).toBe(true);
    expect(namesAnIdentifier("export {};\n")).toBe(false);
    expect(
      namesAnIdentifier(
        `${"// a\n".repeat(5)}// SPDX-License-Identifier: Apache-2.0\n`,
      ),
    ).toBe(false);
  });
});

describe("withHeader", () => {
  it("adds the header for the package at the top", () => {
    expect(withHeader("export {};\n", "packages/geolint/src/a.ts")).toBe(
      `${APACHE}export {};\n`,
    );
    expect(withHeader("export {};\n", "packages/core/src/a.ts")).toBe(
      `${AGPL}export {};\n`,
    );
  });

  it("keeps a shebang on the first line", () => {
    expect(
      withHeader(
        "#!/usr/bin/env node\nrun();\n",
        "packages/geolint/src/bin.ts",
      ),
    ).toBe(`#!/usr/bin/env node\n${APACHE}run();\n`);
  });

  it("matches headerFor", () => {
    expect(headerFor("packages/geolint/src/a.ts")).toBe(APACHE);
  });
});
