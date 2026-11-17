// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  HEADER,
  hasHeader,
  namesAnIdentifier,
  withHeader,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/licenceHeaders.mjs";

const AGPL =
  "// SPDX-License-Identifier: AGPL-3.0-only\n// Copyright MapCairn contributors\n";
const APACHE =
  "// SPDX-License-Identifier: Apache-2.0\n// Copyright MapCairn contributors\n";

describe("HEADER", () => {
  it("is the AGPL-3.0-only identifier and the copyright line", () => {
    expect(HEADER).toBe(AGPL);
  });
});

describe("hasHeader", () => {
  it("accepts the AGPL-3.0-only identifier", () => {
    expect(hasHeader(`${AGPL}export {};\n`)).toBe(true);
  });

  it("rejects a different licence", () => {
    expect(hasHeader(`${APACHE}export {};\n`)).toBe(false);
  });

  it("rejects a file with no header", () => {
    expect(hasHeader("export {};\n")).toBe(false);
  });

  it("accepts the header after a shebang", () => {
    expect(hasHeader(`#!/usr/bin/env node\n${AGPL}`)).toBe(true);
  });
});

describe("namesAnIdentifier", () => {
  it("is true for any identifier, an expression included, which hasHeader refuses", () => {
    const dual =
      "// SPDX-License-Identifier: AGPL-3.0-only OR MIT\n// Copyright MapCairn contributors\nexport {};\n";
    expect(namesAnIdentifier(APACHE)).toBe(true);
    expect(namesAnIdentifier(dual)).toBe(true);
    expect(hasHeader(dual)).toBe(false);
  });

  it("is true after a shebang and false for no identifier or one too far down", () => {
    expect(namesAnIdentifier(`#!/usr/bin/env node\n${AGPL}`)).toBe(true);
    expect(namesAnIdentifier("export {};\n")).toBe(false);
    expect(
      namesAnIdentifier(
        `${"// a\n".repeat(5)}// SPDX-License-Identifier: AGPL-3.0-only\n`,
      ),
    ).toBe(false);
  });
});

describe("withHeader", () => {
  it("adds the header at the top", () => {
    expect(withHeader("export {};\n")).toBe(`${AGPL}export {};\n`);
  });

  it("keeps a shebang on the first line", () => {
    expect(withHeader("#!/usr/bin/env node\nrun();\n")).toBe(
      `#!/usr/bin/env node\n${AGPL}run();\n`,
    );
  });
});
