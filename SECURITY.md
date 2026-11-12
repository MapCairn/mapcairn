# Security policy

_Last updated: 2026-11-11_

## Scope

MapCairn is server-rendered on Cloudflare Workers. There is no database, no
accounts and no authentication. The only data accepted from users is the
automatic error report described in [`PRIVACY.md`](PRIVACY.md), which is
written to Cloudflare's logs and not stored anywhere else. Everything else
the Worker serves is either rendered HTML or a static asset (JS, CSS, fonts
and images).

The security surface is small. [`docs/assurance-case.md`](docs/assurance-case.md) sets out the trust boundaries, the threats considered at each, and why the project believes its security requirements are met. Reports are most useful when they concern:

- Cross-site scripting or other injection in the web app (`packages/web`)
- Abuse of the error-report endpoint (`packages/web/src/routes/log-error.ts`)
- Weaknesses in the Content Security Policy or other response headers
  (`packages/web/public/_headers`)
- Supply-chain issues in dependencies that actually reach the shipped bundle
- Deployment or hosting misconfiguration (`wrangler.jsonc`)

## What you can expect

- No accounts and no stored personal data on a server. Settings stay in your browser's local storage, and the map view stays in the address fragment, which is not sent to the server.
- Searches, routes and data layers go from your browser to their public providers, only when you ask for them (the search box also asks for suggestions as you type), with no cookies and no referrer. The providers see your IP address.
- Production pages are served with a Content Security Policy that allows no `unsafe-inline` source, and with headers that stop framing and downgrades.
- You cannot expect control over the third-party providers, a service level, or fixes for old versions.

The full list, with the evidence for each point and the known residual risks, is in [`docs/assurance-case.md`](docs/assurance-case.md).

## Supported versions

Only the currently deployed `main` branch is supported. There are no long-lived
release branches and no backports. Fixes land on `main` and are deployed from
there.

## Reporting a vulnerability

Please **do not** open a public issue for a suspected vulnerability.

Report it privately through GitHub's private vulnerability reporting:
[github.com/MapCairn/mapcairn/security/advisories/new](https://github.com/MapCairn/mapcairn/security/advisories/new).
If you cannot use GitHub, email mapcairn@timothybrits.co.za instead.

Helpful reports include:

- The affected file, URL, or dependency
- Steps to reproduce, and what an attacker actually gains
- The browser and version if the issue is browser-specific
- Any proof-of-concept you already have

## How a report is handled

This is a volunteer-maintained public-interest project with one maintainer, so these are targets, not guarantees.

1. **Acknowledgement.** The maintainer acknowledges a report within 7 days, from the private advisory or the email address above.
2. **Triage.** The maintainer reproduces the report and decides whether it is a vulnerability in this project, in a dependency or in a third party, and what it is worth: low, medium, high or critical, using the CVSS base score as a guide. You are told the outcome and the reason, including when it is not accepted. Questions go through the same private channel.
3. **Private fix.** A confirmed issue is fixed in the temporary private fork that GitHub provides for the advisory, with a test that fails before the fix and passes after it. It is not discussed in public issues or pull requests until a fix is ready.
4. **Target time.** For a confirmed issue of medium severity or higher, the aim is a fix or a mitigation (for example a header change, a layer switched off or a dependency pinned) deployed within 60 days of the acknowledgement. A low-severity issue is fixed in the normal course of work. If a target cannot be met, the reporter is told why.
5. **Advisory and credit.** Once the fix is deployed, the maintainer publishes a GitHub security advisory that describes the issue, the affected code and the fix, and requests a CVE where one applies. The reporter is credited in the advisory unless they ask otherwise.
6. **Disclosure.** Please do not disclose publicly until the fix is deployed. If the fix is taking longer than the target, the maintainer says so and why, and agrees a disclosure date with the reporter.

A vulnerability in a dependency that reaches the shipped bundle is handled the same way, and the fix is usually an update that Dependabot or the maintainer makes.

## Out of scope

The following are not treated as vulnerabilities in this project:

- Missing security headers on third-party hosts (tile providers and the place search service)
- Reports generated solely by an automated scanner with no demonstrated impact
- Denial of service against third-party basemap or geocoding APIs. These are
  not our infrastructure, and abusing them is explicitly discouraged
- Rate limiting, brute force or account enumeration, since there are no accounts
- Volumetric denial of service against the static host
- Inaccuracy or staleness of third-party basemaps or search results

## Handling data responsibly

The project maps geography, not people. Do not open issues or pull requests that
introduce personally identifying information, household-level data, or any data
whose licence does not permit publication. See [`ATTRIBUTIONS.md`](ATTRIBUTIONS.md)
for the sources currently in use and [`PRIVACY.md`](PRIVACY.md) for what the
deployed site does and does not collect.
