# 0017: A documentation site served at /docs/

Status: in progress: step 1 is built in the pull request that adds this plan. Tracking issue: [#199](https://github.com/MapCairn/mapcairn/issues/199).

## Goal

People who build with the SDK, and the coding agents that read on their behalf, get a documentation site they can browse, search and link into, served at `/docs/` on the reference site's hostname. It is written for developers and agents, loads fast, looks like the product page and the map, and keeps every guide in one place that is edited once. This plan covers the whole site; the first pull request builds the foundation (step 1) and the later steps are issues cut from it.

## Ground rules

Decided by the maintainer on #199 on 2026-11-22, which replaces the issue body where they differ:

- Docusaurus, docs only, no blog, `baseUrl: /docs/`. The site is a second Worker with static assets, reached by a path route, not a separate hostname.
- Tooling is `cf`: a `cloudflare.config.ts`, `cf build` and `cf deploy`, no Wrangler and no `wrangler.jsonc`. The Worker settings follow the reference site's wherever they apply to a Worker with no code.
- The guides move into the site and are deleted from `docs/guides/`, so each is edited in one place. Files GitHub reads by convention, `docs/plans/`, `ARCHITECTURE.md` and `DESIGN.md` stay where they are for now, because lint rules and agent skills read them by path.
- The same tooling as the reference site: Biome, `clsx`, Fontsource for IBM Plex Sans, TypeScript, the SPDX header and TSDoc rules, styled from `@mapcairn/theme`. Colours, type, spacing, radii, focus ring and motion come from the tokens, with Lucide icons and the one accent.
- Written for developers and agents: a Markdown copy of every page, `llms.txt` files, pages that work without script, tested snippets, local build-time search, no third party. The quality bar is in the issue's comments.
- From the issue: no cookies and no analytics beyond the cookieless page counts the zone already adds, no external fonts or scripts, a Content Security Policy as strict as the reference site's. `PRIVACY.md` was to stay unchanged, but the framework stores the colour choice in a `theme` key beside the reference site's `mapcairn:` keys, so the privacy policy needs one sentence that names it (see "Public surface"). The site is not an SDK package, so its dependencies are outside the commercial-use rule, and `packages/core/src/lint/manifests.test.ts` is unchanged.
- Every dependency version is at least 7 days old (`.npmrc`, `AGENTS.md`). The site does not describe a planned feature as existing.

## Design

### Where the workspace lives

`sites/docs`, package `@mapcairn/docs`, private, with `sites/*` added to the root `workspaces`. Options:

1. `sites/docs` (chosen). The root Vitest `projects` list gains `sites/*`. The coverage `include` is `packages/*/src/**`, so the site's code is outside the thresholds without lowering any.
2. `docs/site`. `docs/` is a folder of Markdown that other tools and links read by path, and the guides are leaving it; a workspace inside it mixes the two.
3. `packages/docs`. `packages/*` is the SDK packages and the host, and the coverage thresholds, the package-boundary rules and the release scripts treat that folder as such.

The site's content is `sites/docs/docs/`. The guides in `docs/guides/` move there in step 4.

### Docusaurus and its tree

Docusaurus 3.10.2 (`@docusaurus/core` and `@docusaurus/preset-classic`), published on 2026-07-10, MIT, `engines.node >=20`, peer `react ^18 || ^19`. The repository is on React 19.3 and Node 24. Version 4 is published only as canary builds, so it is not used. The preset's blog and pages plugins are off, and its analytics plugins (`gtag`, `googleAnalytics`, `googleTagManager`) are installed with the preset but never configured, so they load nothing; `docusaurus.config.test.ts` asserts that.

The install brings three advisories through Docusaurus's own dependencies: `tinypool` (prototype pollution leading to code execution in `run()` options), `serialize-javascript` (code execution and a CPU denial of service) and `uuid` (a missing bounds check), which `webpack-dev-server` reaches through `sockjs`. They affect the build and the dev server, not the built pages. Rather than ship a tree that `npm audit` fails, the root `overrides` raise those three to patched versions, each older than 7 days, scoped to the package that asks for them so nothing else in the repository is touched: `@docusaurus/core` for `tinypool ^2.1.2`, `copy-webpack-plugin` and `css-minimizer-webpack-plugin` for `serialize-javascript ^7.1.3`, and `sockjs` for `uuid ^11.1.1`. No patched version exists inside the ranges Docusaurus asks for (`tinypool ^1`, `serialize-javascript ^6`, `uuid ^8`), which is why an override is needed, and `npm audit` reports none. The build and the dev server run with them. Remove the overrides when Docusaurus raises its own ranges, as the `minimatch` override is removed when its upstream allows (#611).

The site's package directory has no `"type": "module"`. With it, the production build fails in the server bundle with `require.resolveWeak is not a function`; without it, the build passes. `cf` loads `cloudflare.config.ts` by detecting its ES module syntax, prints a warning that the package has no `type`, and cannot resolve an extensionless import, so the config states the hostname, the zone and the base path itself and `siteConfig.test.ts` keeps them equal to `src/siteConfig.ts`. TypeScript 7 removed `baseUrl`, which `@docusaurus/tsconfig` sets, so the site's `tsconfig.json` does not extend it.

### How the Worker is declared

An assets-only Worker with no entrypoint, named `mapcairn-docs`, in `sites/docs/cloudflare.config.ts`. The assets are the Docusaurus build output (`sites/docs/build`), deployed with `cf deploy ./build`, which `cf` documents as the way to deploy a directory another tool built. `cf build` hands the build to a framework command, the Cloudflare Vite plugin or Wrangler, and this site installs none of the three, so its own `build` script runs `docusaurus build` and then the checks, and `deploy` runs `cf deploy ./build`. The site's Workers Builds project runs `npm run build -w @mapcairn/docs` and `npm run deploy -w @mapcairn/docs` from the repository root.

- `assets.basePath: "/docs"` mounts the files at the root of `build/` under that path. `_headers` paths include the base path.
- `assets.htmlHandling: "auto-trailing-slash"` and `notFoundHandling: "404-page"` (Docusaurus writes `404.html`). The site sets `trailingSlash: true`.
- Settings copied from the reference site's Worker: compatibility date `2026-09-08`, `workersDev: false`, `previewUrls: true`, smart placement, observability with logs and traces at full sampling and persisted, `redactQueryString` and `issues`. `cf deploy ./build --dry-run` accepts the file. Whether the platform accepts every one of them for an assets-only Worker is learned at the first deploy, and any it refuses is removed with its reason written here.
- Left out because a Worker with no code has no use for them: `entrypoint`, `compatibilityFlags` (`nodejs_compat`), the `ASSETS` binding and the `e2e` mode. `domains` is replaced by routes, below.

### Routing: a route beside the Custom Domain

The reference site's Worker owns `mapcairn.timothybrits.co.za` as a Custom Domain (`domains` in `packages/web/cloudflare.config.ts`) and has no routes. Cloudflare's documentation ("Custom Domains", "Interaction with Routes") says a Worker on a Custom Domain is treated as the origin and a Worker on a route in front of it runs first. So the docs Worker takes two routes on the same hostname, `<hostname>/docs` and `<hostname>/docs/*`, and the host Worker keeps everything else without any change. A Custom Domain creates a proxied DNS record for the hostname, which is what a route needs. The docs Worker never calls the host Worker; a request under `/docs/` is answered by the assets, and a request to `/docs/missing` gets the site's own 404 page, not the host's.

Options considered: (1) a route in front of the Custom Domain Worker (chosen: no change to the host); (2) the host Worker forwards `/docs/*` to the docs Worker through a service binding (rejected: it puts code and a binding in the host that nothing needs); (3) a second hostname (rejected by the maintainer on 2026-11-22).

A later change of hostname is three edits kept equal by `siteConfig.test.ts`: `SITE_ORIGIN` and `ZONE` in `sites/docs/src/siteConfig.ts`, the same two values in `cloudflare.config.ts`, and `SITE_URL` in `packages/web/src/constants/siteConfig.ts`. The old hostname redirects through the host Worker, as it does today; the docs routes are on the current hostname only, so a page on the old one redirects to the current hostname with the path kept.

### Look: tokens, not copies

Docusaurus styles through Infima custom properties. `scripts/generateTheme.ts` writes `src/css/generated/infima.css` (git-ignored) at build time from the exported `tokens` object of `@mapcairn/theme`: every Infima variable the site uses is set to a token reference (`var(--rogqo04)`, never a colour), and every token gets a stable alias `--mc-<group>-<name>` for the site's own rules in `src/css/custom.css`. A token change therefore reaches the docs without a second edit, and the generated names are never written by hand. `themeCss.test.ts` asserts that the output holds only token references and changes when a token changes, and `customCss.test.ts` asserts that the hand-written stylesheet holds no colour literal. The font declarations are the reference site's own `fonts.css`, imported by path so the two cannot drift; the minifier drops a font face no rule names, so one rule names the families.

Options for styling: (1) generated custom properties and one hand-written stylesheet (chosen); (2) vanilla-extract, which the host uses. It needs `@vanilla-extract/webpack-plugin` wired into Docusaurus's own webpack configuration through a plugin, the framework's components still read Infima variables so the mapping would remain, and the benefit (typed token references) does not reach the framework's own markup. Revisit when the site has more components of its own than overrides.

The header and footer are the product page's: the brand mark (the same stones, `brandMark.test.ts` keeps them equal to the host's), the labels Playground, Docs and GitHub in that order (`headerLinks.test.ts` reads them from the host), a footer line and links by the same wording, and a link back to `/` and `/map`. The framework's drawer would hide the header links on a narrow screen, so `Navbar/Content` is replaced to keep them in the bar at every width, as the product page does. The colour-mode toggle is the framework's, with Lucide icons and a wrapper that also writes the reader's choice to `mapcairn:theme`.

Light or dark carries over from the reference site, which shares the origin: a one-line inline script in the head (`src/themeBridge.ts`, tested against a fake store) runs before the framework's own pre-paint script and copies an explicit `light` or `dark` from `mapcairn:theme` to the framework's `theme` key, or clears that key for `system`. The framework then applies it before first paint. The script is hashed in the policy.

Highlighting is done by stylesheet rules on the token classes with an empty Prism theme, because a theme makes the framework write colours as inline `style` attributes, which the policy blocks. The hidden SVG sprite the framework writes at the top of every page carries a `style` attribute too, so the build removes it (the one icon in it is replaced with Lucide). Other framework components (admonitions, tabs, search box, tables) are restyled as pages need them, in the step that adds the page.

### Security headers

`plugins/securityHeadersPlugin.ts` runs after the build, strips the sprite and writes `_headers` into the output: the reference site's security headers and a policy that names the committed inline scripts by hash. `securityHeaders.test.ts` checks that every directive is also set by the reference site's policy and every source is one that policy allows, so the docs policy is never looser. It allows the two Cloudflare origins the reference site allows for the cookieless page count, because the zone injects that script into proxied HTML. There is no `unsafe-inline` and no inline style. `_headers` allows the inline scripts committed in `scripts/expectedInlineScripts.ts` by hash, the theme bridge as built and the framework's colour-mode script, and no others; the hashes are not read from the pages, so a new inline script cannot slip in. `verifyBuild.ts` fails the build on a style attribute, an inline script that is not on that list (or one on it that is gone, which a framework upgrade or a change to the bridge causes: read the script, then replace the hash), a resource fetched from another origin, a link that goes nowhere and a page missing from the sidebar. In a browser, neither theme logs a policy violation, and an axe run with the WCAG 2 A and AA and 2.1 and 2.2 AA tags passes in both.

### Search

Local, build-time, nothing sent to a third party. Built in step 2 as our own index, not the plugin the first draft of this plan chose:

1. `@easyops-cn/docusaurus-search-local` 0.55.3 was the first choice: MIT, a Lunr index at build time, searched in the browser. It was dropped without installing it, from its manifest and what it ships: a native module (`@node-rs/jieba`) for Chinese word breaking this English-only site does not use, its own search box and styles in place of the project's tokens, and a web worker, which the policy allows only from this origin, so its output would have needed checking against the policy and `verifyBuild.ts`. Not installed or measured, so this is a judgement, not a failed test.
2. **Chosen:** our own index. `plugins/searchIndexPlugin.ts` reads the finished HTML after the build and writes `search-index.json`, one record per page introduction and per `h1` to `h3` section (`scripts/searchRecords.ts`), so every page is covered whatever made it, including the generated API pages later. The browser fetches it from this origin the first time search is opened and searches it with MiniSearch 7 (MIT, no dependencies, `src/search/searchEngine.ts`). A name such as `MapView` is indexed whole and as `map` and `view`; an exact heading or page title ranks first, then headings and titles above body text, with the last term matched as a prefix as the person types. The dialog (`src/components/Search`) is a native modal `<dialog>`, styled with tokens only, opened by a header button, `/` or the command or control key with `K`, with an empty, loading, error and nothing-found state and a polite live region for the count. The Markdown copies of step 3 and the MCP groundwork can read the same records.

The script budget: the dialog and the engine load when search is first opened, so only the header button counts against the front page, which went from 151,074 to 157,669 bytes of gzip script (the budget stays 160,000; most of the rise is the button's icon). The 404 page carries the header and so the search box.

Hosted search (Algolia) is out by the rules above. `docusaurus.config.test.ts` asserts that no `algolia` configuration exists.

### Markdown copies, `llms.txt`, robots and sitemap

Not in step 1. How they will be generated:

- A build plugin reads each page's source Markdown, resolves the `%sdkVersion%` token (`plugins/remarkSdkVersion.ts`), turns relative links into full URLs, and writes it next to the page (`/docs/guides/x.md`) from `postBuild`. Each page's head gets `<link rel="alternate" type="text/markdown">`.
- `llms.txt` and `llms-full.txt` are written from the sidebar in the same hook: the ordered titles, one-line descriptions and links, and the concatenation of every copy. The reference site's `/llms.txt` gains a link to them (a host change, in step 3).
- The sitemap is the framework's (`/docs/sitemap.xml`), already built. The reference site's `robots.txt` names it (a host change in step 3), because a crawler reads only the root file; no crawler is blocked.
- A request that sends `Accept: text/markdown` for a page cannot be answered by an assets-only Worker, which serves a file by its path. See the open question below.

### Budgets, stated before the content grows

- JavaScript: `SCRIPT_BUDGET_BYTES` in `scripts/verifyBuild.ts` is 160,000 bytes of gzip for the scripts the front page loads, and the build fails above it. The first measure, a page with no search, is 151,074 bytes, almost all of it the framework's client runtime and theme; the budget is 6 percent above that, so ordinary changes pass and a plugin that doubles the script does not. Step 2 measures search against it and states the new figure here before it lands. The target is to lower it: step 7 looks at what the framework ships that this site does not use.
- Lighthouse: performance at least 0.95 on a guide page and on the API reference, as the issue says. Not measured yet and not enforced in step 1: the Lighthouse workflow keeps running only what it runs today. Step 7 adds a run for the site and records the first scores here.
- Fonts: the same files and fallback metrics as the reference site, no layout shift from the swap.

### Public surface

`/docs/` and every path under it become URLs people link to, so the sidebar's structure and the page slugs are a contract: a page keeps its URL when its source moves. The only other surface is `_headers` for the site. No exported API, no change to the host's routes, headers or CSP. One stored format is shared: the reader's colour choice, kept by the host under `mapcairn:theme` (`light`, `dark` or `system`, read by core's `parseThemeChoice`) and by the site under the framework's own `theme` key (`light` or `dark`, absent for the system choice). The bridge script copies the first to the second before first paint, the toggle writes both, `sharedChoice.test.ts` ties the values written to core's parsing, and `storage.namespace: false` in the configuration keeps the framework's key plain. `PRIVACY.md` and the privacy page say the other keys start with `mapcairn:`, which is no longer true on this origin; a sentence naming the site's `theme` key is the maintainer's to add (those files are the maintainer's). The stylesheet also selects the framework's own class names and the site imports `@docusaurus/theme-common/internal`, which a release can rename or move, so `TARGETED_CLASSES` lists the class names and `verifyBuild.ts` fails the build when a page no longer carries one.

## Tests

Written first, run to fail for the intended reason (the modules did not exist), then implemented:

- `scripts/docChecks.test.ts`: a page on disk that no sidebar lists is named, and the real `docs/` folder has none (`docusaurus.config.test.ts`). The build runs the same check in `verifyBuild.ts`.
- Links: `onBrokenLinks`, `onBrokenAnchors`, `onDuplicateRoutes` and the Markdown-link hook are all `throw` (asserted in `docusaurus.config.test.ts`; a link to `/docs/map/` was caught by the framework in the first build). `brokenInternalLinks` in `scripts/builtSite.test.ts` checks every `href` in the built pages against the built files, and allows only the host's paths outside the base path.
- `themeCss.test.ts`, `customCss.test.ts`, `themeBridge.test.ts`, `brandMark.test.ts`, `headerLinks.test.ts`, `siteConfig.test.ts` (the origin, the base path, the route and the absence of a Custom Domain), `securityHeaders.test.ts`, `securityHeadersPlugin.test.ts` and `remarkSdkVersion.test.ts` each prove one behaviour above and fail if it is removed.
- Build output: `verifyBuild.ts` runs after every `docusaurus build`, and CI's `build` job runs `npm run build -w @mapcairn/docs` as its own step, so the `build` check fails on a broken link, a missing sidebar entry, a policy break or the script budget. The root `build` script does not build the site: the host's Workers Build runs that script, and a fault in the documentation site must not stop the product's deploy.
- By hand in step 1 (a browser test is step 7): the built site served with its `_headers` showed no policy violation in the console in both themes at phone, tablet and desktop widths; the stored theme from the reference site, an explicit choice and the system choice all applied; the toggle wrote `mapcairn:theme` and cleared the framework's key for `system`; axe found nothing in either theme.

## Order of work

1. **This pull request.** The plan; `sites/docs` with Docusaurus, the generated theme, the shell (header, footer, brand, toggle), the Get started page, the security headers, the sidebar and link checks, the script budget, `cloudflare.config.ts`, the root `workspaces` and `vitest` project, a CI step for the build, Dependabot's group, the `overrides`, the exempt-path entry in the licence report, and the documents below. After it merges, the maintainer runs the first deploy and connects the Workers Builds project (see "Decided and open" and "First deploy").
2. **Search.** Own issue (done). The index, the dialog, its styling, the empty state and the 404 search box, the budget restated, and a build check that the index exists and is not empty (the existing checks already cover the policy).
3. **Markdown copies and the agent files.** Own issue. The copies, `llms.txt`, `llms-full.txt`, the head link, the host's `llms.txt` and `robots.txt` lines, and a build check that every page has a copy.
4. **Move the guides.** One issue, in pull requests of a few guides each, `extending.md` and the embed guide first because the README and the product page point at them. Each pull request deletes the guide from `docs/guides/`, rewrites every link to it (`AGENTS.md`, `README.md`, the package READMEs, the skills and agents) and adds the lint check that fails on a link to a moved guide.
5. **Tested snippets and task pages.** Each guide's code compiles or runs in CI against the built packages; a page per common task; the error page; the changelog.
6. **API reference** from #1 and #434, and **Storybook** from #174, each its own issue.
7. **Browser checks and Lighthouse for the site.** A Playwright project in `sites/docs` with axe in both themes, and a Lighthouse run with the first scores; the budget lowered.
8. **Point the product page at the site.** The documentation links the product page and the README take today (`DOCUMENTATION_LINK`) change to `/docs/`.

Later steps, after the eight above, each its own issue when it is picked up and not built here:

- A roadmap page generated from `ROADMAP.md` (#670).
- A documentation MCP server, so an agent reaches the same index as search and the Markdown copies (#665).

## First deploy

The commands, run by the maintainer: `npm run build -w @mapcairn/docs`, then `npm run deploy -w @mapcairn/docs` from the repository root at `main`. The deploy creates the Worker `mapcairn-docs` and its two routes.

- **What can fail.** The API token or the signed-in profile may lack Workers Routes edit permission on the zone, which is a different permission from Workers scripts; the platform may refuse a setting for an assets-only Worker (observability, smart placement). The host Worker's configuration is not part of this deploy, so a failure leaves it as it is, and `/docs` keeps answering with the host's 404 page until the routes exist.
- **Smart placement and observability.** They follow the host's settings because the maintainer asked for the host's settings. `placement: smart` and most observability settings only take effect when the Worker runs code, so they do nothing for assets alone and matter only if Worker code is added (the `Accept: text/markdown` question below).
- **Workers Builds.** The maintainer connects the repository and creates the project; the plan records what it needs. Build command `npm run build -w @mapcairn/docs`, deploy command `npm run deploy -w @mapcairn/docs`, root directory `/`. Watch paths should be `sites/docs/*`, `packages/theme/*`, `packages/core/*`, `packages/web/src/fonts/*`, `packages/sdk/package.json`, `package.json` and `package-lock.json`, so an unrelated commit does not redeploy. A non-production branch build must not run the production deploy: either turn branch builds off, or give the project a preview deploy command that runs `cf previews deploy`; add a `deploy:preview` script to the site in the pull request that does it.
- **Rollback.** Remove the two routes or the Worker, which only the maintainer does; the host Worker needs no change because it never knew about the routes.
- **Checks after the deploy,** with `curl`: `/docs` answers with a redirect to `/docs/`; `/docs/` returns 200 with the security headers; a nested page carries the same policy; `/docs/missing` returns the docs 404 page, not the host's; `/`, `/map`, `/robots.txt` and `/sitemap.xml` are unchanged; the old hostname's `/docs/x` redirects to the current hostname with the path kept; and a `/docs/` page is checked for the page-count beacon, to decide whether the two Cloudflare origins stay in the policy.

## Documents to update

- Step 1: `README.md` (the documentation section names the site and the `sites/docs` workspace), `CONTRIBUTING.md` (how to run and build the site), `AGENTS.md` (Commands: the docs scripts, port 4410 for `dev`; Documentation: the site; the SDK licence rule's exempt list), `ROADMAP.md` (the site is noted), `DESIGN.md` ("Exempt surfaces" and the lint table: the site is outside the harmony scan and what holds its values to the tokens), `docs/plans/README.md` (this plan in the list).
- Later steps: the guides move out of `docs/guides/`, `ARCHITECTURE.md` and `DESIGN.md` move last, and the skills and agents change their links in the step that moves each guide. `PRIVACY.md` and `packages/web/src/app/PrivacyPage.tsx` need one sentence for the site's `theme` key, which is the maintainer's to add (see "Public surface"). `docs/guides/working-with-agents.md` is not updated in step 1, although the issue lists it: nothing in it describes the site yet, and step 4 updates it when the guides move.

## Risks

- **`npm ci` over a large tree.** Docusaurus adds several hundred packages to the shared lockfile, so every install in CI and in Workers Builds is slower and every Dependabot update touches a bigger graph; the overrides are scoped so they cannot affect the host's tree. If install time becomes a problem, the site can move to its own lockfile at the cost of a second install step.
- **The site's build and the host's deploy.** The host's Workers Build runs the root `build`, so the site is built by a separate CI step and its own Workers Builds project, so a fault in the docs build cannot stop the host's Workers Build. The cost is that a docs fault is found by CI, not by the root `build`. The separation is partial: the docs build is part of CI's required `build` check, and a broken docs entry in the shared lockfile stops `npm ci` for the host too.
- **A framework that moves.** Docusaurus brings a large tree and a `3.x` that may change the markup the stylesheet targets. Dependabot groups `@docusaurus/*`, the build checks catch a broken link, a policy break and a script over budget, and the visual check is repeated at each upgrade.
- **A policy break from a plugin.** A plugin that writes an inline style or script fails `verifyBuild.ts`; the plugin is chosen or patched, never allowed with `unsafe-inline`.
- **The route does not win.** If a route in front of the Custom Domain does not take `/docs/*`, the deploy check (`curl` on `/docs/`) fails before the site is announced, and the product page's links change only in step 8.
- **A refused Worker setting.** Observability or placement may not be accepted for an assets-only Worker. The deploy reports it and the setting is removed with its reason in this plan.
- **Drift from the host.** The hostname, the font declarations, the brand stones, the header labels and the policy each have a test that reads the host's own source, so a change there that the site does not follow fails.
- **The token CSS names.** The framework's variables are mapped from the exported `tokens`, whose generated names are private (`DESIGN.md`, "How the CSS ships"); the site never writes them by hand, only through the generated file.

## Decided and open

Decided:

- 2026-11-22, maintainer, on #199: the decisions in "Ground rules".
- 2026-11-22, in step 1: workspace `sites/docs`; Docusaurus 3.10.2 with the classic preset and the blog and pages plugins off; generated custom properties for styling; a route Worker beside the Custom Domain; the deploy is `cf deploy ./build`.
- 2026-11-22, the maintainer on #199 decided that the site is deployed once the first documentation pull request is merged, and gave the go-ahead in the session for the first `cf deploy`. One rule holds: the first `cf deploy ./build` (which creates the Worker) and the Workers Builds project run only on the maintainer's own words in the session, as "Ask the maintainer first" in `AGENTS.md` says. The comment on #199 records the decision; it does not authorise the run. The maintainer, not an agent, connects the repository and creates the Workers Builds project, and an agent never runs `cf builds workers create`.
- 2026-11-22, decided for readers by Claude and recorded on #199 (the issue comment is the maintainer's account): no versioned documentation before 1.0. `/docs/` always means the current docs, so links and citations stay stable and search, `llms-full.txt` and agents see one copy of each page. The site is built from `main`. Each page names the package versions it was checked against, a new feature carries an "Added in 0.x" note, snippets are tested in CI against the built packages, and there is a changelog page per release. The generated API reference (#434) is built per release so it matches what is on npm. When 1.0 brings breaking changes, the last 0.x docs are snapshotted at `/docs/0.x/`, `/docs/` stays the latest, and a version selector is added then. The Docusaurus versioning feature is not enabled.

Open, each with a recommendation:

- **`Accept: text/markdown` for a page.** The issue asks for it. An assets-only Worker answers by path, so it needs a Worker with code and `assets.runWorkerFirst` for the page paths, which makes every page request an invocation of code and not a free asset request. Cost to build is a small entrypoint and its tests; the cost to keep is a Worker that must be kept compatible and billed per request. Recommendation: ship the static `.md` copies and the `alternate` link in step 3, and add the negotiating Worker only if the maintainer wants it after seeing the copies in use. This is the maintainer's call: it turns the Worker from static assets into code.
- **The page counts script and the policy.** The reference site's policy allows the two Cloudflare origins for the cookieless page count, because the zone injects the script into proxied HTML. The docs policy allows the same two. If the zone's setting does not inject into a route Worker's responses, the allowance is removed in step 2 with the finding written here. Recommendation: keep the two origins until the deploy shows whether the script is injected.
