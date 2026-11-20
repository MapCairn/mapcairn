---
name: triage-production
description: "Read the health of the deployed MapCairn site the same way each time, read-only: the latest Workers Build and its logs, the Worker's detected issues and their grouping, client error report volume, and the live site's routes, headers and Content-Security-Policy. Separates scanner noise and expected answers from real faults, and ends in a fixed report. Use after a merge to main deploys, when asked whether production is healthy, or when an error or build failure is reported. It changes nothing remote: it never deploys, purges a cache, edits a setting or deletes a resource."
---

# Triage production

`AGENTS.md` ("Web host and deployment") names `cf` as the tool for Cloudflare and keeps deploys, deletions and secrets away from agents. This skill is the read-only reading, so two people get the same answer. It uses `cf` and an HTTP client such as `curl`, with no shell pipe, and says what to read in the output. Run `cf cli search "<task>"` if a command below has moved (`cf` is a beta); keep searches generic, with no names or ids.

Example: after a merge, the latest build says `success` for the merge commit, and the only active issue was last seen before the fix deployed. The report says healthy, with the issue named as stale and a recommendation that the maintainer mark it resolved.

## 1. Preflight

Run `cf auth whoami`. If it says `authenticated: false`, or fails, stop and report that the person must run `cf auth login` in their own terminal; never run it yourself and never ask for or handle a credential. Its output holds an email address and account ids: do not copy them into any report, issue or comment. The Worker is `mapcairn` (`packages/web/cloudflare.config.ts`). `cf workers get mapcairn` prints it, and its `id` is the script tag the next step needs. Other Workers on the account are out of scope: never read or report them.

## 2. The build

Run `cf builds list --worker <tag> --per-page 5`. Read the newest entry: `build_outcome`, `status`, `build_trigger_metadata.commit_hash` and `stopped_on`. Compare the hash with `git rev-parse origin/main` (after `git fetch origin`). A build still running is "in progress": check again later and do not call it healthy. On any outcome but `success`, run `cf builds logs <build_uuid>` and read the failing step (its `type`) and the last lines before it. Report the step and the message, not the whole log. A failed build leaves the previous deploy serving, so say which commit is live.

## 3. Detected issues

Run `cf o11y issues list --service mapcairn --order-by lastObserved --order desc --per-page 30`. For each issue read `title`, `type`, `status`, `count`, `firstObserved` and `lastObserved` (epoch milliseconds; `node -p "new Date(<n>).toISOString()"` converts one). Compare `lastObserved` with the `stopped_on` of the build that fixed the cause. An issue last seen before that deploy is stale; one seen after it is live.

Client reports reach the log as `[client-error] ...` titles (`packages/web/src/routes/log-error.ts`). Read only the count, the trend and the title. Never copy a URL, user agent, address, map position or stack frame into a report: they can identify a person (`PRIVACY.md`).

## 4. The live site

Request each route with `curl --head --max-time 20 https://<host>/<path>`, taking the host from `SITE_URL` in `packages/web/src/constants/siteConfig.ts`. Expected: `/`, `/map`, `/privacy`, `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/index.md` and `/.well-known/security.txt` answer 200; a path that does not exist answers 404; `POST /map` with an empty body answers 405. Read `content-security-policy` on `/` and `/map` and compare each directive with `packages/web/public/_headers`: the same origins and the same two `sha256-` script hashes. The server adds a `nonce-` per response, so differing nonces are normal. A missing or different script hash means the theme or hydration script will be blocked: that is the class in #479, a bundler changing script text so the hash no longer matches (now guarded by `packages/web/src/inlineScriptsBuild.test.ts`). Also read `x-frame-options`, `x-content-type-options`, `referrer-policy` and `strict-transport-security`. Headers set by a Cloudflare zone setting can differ from `_headers`; report a difference as a fact and leave the cause to the maintainer.

Cache: only when a stale file is suspected, read `cf-cache-status` and `age` on that file. Report them. A purge is the maintainer's step.

## 5. Noise or a real fault

Decide each issue with its evidence, not its title.

- **Scanner probes.** `Potential vulnerability scan` types: bots asking for secret files, WordPress, source control and debug paths. Real only if a probed path answers 200: request two of them with `curl --head`; a 404, or a 403 from the Cloudflare edge, means noise; a 200 means a file is served and is a real fault.
- **Expected answers.** An unknown path (404) and a wrong method (405) are normal. #411 is the worked example: they were logged as errors, so the list filled with `No route matches URL` and `You made a POST request ... did not provide an action`. Merged in #412, they no longer appear; one with a `lastObserved` after the deploy of #412 is a regression.
- **Uninformative reports.** `Script error.` is a browser hiding a cross-origin error: it has no stack and cannot be acted on. Volume that rises after a deploy is a signal; a flat trickle is not.
- **Real faults.** A title that is readable and names our code, a count that rises after the latest deploy, a failed build, a route that answers 5xx, or a CSP that does not match `_headers`. `[object Object]` in #411 was real: an error response was passed to `console.error` as an object, so the message said nothing. A fault in the logging itself still counts.

When unsure, call it "unconfirmed" and say what would settle it.

## 6. What to do next

- Search for a duplicate (`gh issue list --state all --search "<words>"`), then use the `create-issue` skill: plain facts, the title and count of the issue, the commit, the route and the header seen, and no URL, address or agent string from a report.
- Never change remote state: do not deploy or run a deploy script, retry or cancel a build, purge a cache, mark an issue resolved or ignored, change a zone or Worker setting, or delete anything (`AGENTS.md`). Hand the maintainer the exact step and say why. The maintainer settles `PRIVACY.md`, `SECURITY.md` and the licence.
- If a fix is a code change, take it through `pick-up-issue` as a separate piece of work.

## 7. Report

Use these five lines, each filled or "none":

- **Build:** the newest commit built, its outcome and time, and whether it is `origin/main`.
- **Issues:** each active issue as title, count, last seen, and `stale`, `noise` or `real`.
- **Site:** routes and headers checked, and each difference from `_headers`.
- **Findings:** issues filed or to file, with numbers.
- **Maintainer steps:** the exact step and why, or none. Add "healthy" or "not healthy" as the first word of the report.
