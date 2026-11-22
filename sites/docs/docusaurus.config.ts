// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import type { Config } from "@docusaurus/types";
import { remarkSdkVersion } from "./plugins/remarkSdkVersion";
import securityHeadersPlugin from "./plugins/securityHeadersPlugin";
import { BASE_URL, REPOSITORY_URL, SITE_ORIGIN } from "./src/siteConfig";
import { THEME_BRIDGE_SCRIPT } from "./src/themeBridge";

/** The SDK's version, which pages name as the one they were checked against. */
const sdkVersion = (
  JSON.parse(
    readFileSync(
      new URL("../../packages/sdk/package.json", import.meta.url),
      "utf8",
    ),
  ) as { version: string }
).version;

/**
 * An empty Prism theme. Highlighting is done by stylesheet rules on the token
 * classes (`src/css/custom.css`), which read the project's tokens, because a
 * theme object makes the framework write colours as inline `style` attributes
 * and the Content-Security-Policy has no inline style.
 */
const classOnlyPrismTheme = { plain: {}, styles: [] };

/**
 * A link to a page of the reference site, which shares this origin but is not
 * part of this site. The framework puts its base path in front of an `href`
 * in the footer, so these two are written as HTML, which it leaves as
 * written. The header's links are in `src/headerLinks.ts`.
 */
function hostLink(path: string, label: string, className: string): string {
  return `<a class="${className}" href="${path}">${label}</a>`;
}

const config: Config = {
  title: "MapCairn documentation",
  tagline: "Documentation for the MapCairn SDK",
  url: SITE_ORIGIN,
  baseUrl: BASE_URL,
  trailingSlash: true,
  baseUrlIssueBanner: false,
  onBrokenLinks: "throw",
  onBrokenAnchors: "throw",
  onDuplicateRoutes: "throw",
  markdown: { hooks: { onBrokenMarkdownLinks: "throw" } },
  i18n: {
    defaultLocale: "en",
    locales: ["en"],
    localeConfigs: { en: { htmlLang: "en-GB" } },
  },
  headTags: [
    { tagName: "script", attributes: {}, innerHTML: THEME_BRIDGE_SCRIPT },
    {
      tagName: "link",
      attributes: { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
    },
  ],
  plugins: [securityHeadersPlugin],
  presets: [
    [
      "classic",
      {
        docs: {
          routeBasePath: "/",
          sidebarPath: "./sidebars.ts",
          editUrl: `${REPOSITORY_URL}/edit/main/sites/docs/`,
          remarkPlugins: [remarkSdkVersion(sdkVersion)],
        },
        blog: false,
        pages: false,
        theme: {
          customCss: [
            "./src/css/fonts.css",
            "./src/css/generated/infima.css",
            "./src/css/custom.css",
          ],
        },
        sitemap: { changefreq: null, priority: null },
      },
    ],
  ],
  themeConfig: {
    colorMode: { defaultMode: "light", respectPrefersColorScheme: true },
    navbar: {
      items: [],
    },
    footer: {
      links: [
        {
          items: [
            { label: "Source code", href: REPOSITORY_URL },
            {
              html: hostLink("/map", "Try the playground", "footer__link-item"),
            },
            {
              html: hostLink("/privacy", "Privacy policy", "footer__link-item"),
            },
          ],
        },
      ],
      copyright:
        "Built with love in South Africa. MapCairn is open source under the AGPL-3.0.",
    },
    prism: {
      theme: classOnlyPrismTheme,
      darkTheme: classOnlyPrismTheme,
      additionalLanguages: ["bash"],
    },
  },
};

export default config;
