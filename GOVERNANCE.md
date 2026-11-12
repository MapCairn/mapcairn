# Governance

_Last updated: 2026-11-12_

MapCairn is a small, volunteer-maintained project with one maintainer. This document says who decides what, how decisions are made and recorded, how that can change, and what is not yet in place.

## Roles

**Maintainer.** There is one. The maintainer:

- decides what the project builds, accepts or declines, and what it will not do (see [`ROADMAP.md`](ROADMAP.md));
- reviews and merges every pull request, and may decline or close one with a reason;
- triages issues, applies labels and milestones, and keeps the plans in [`docs/plans/`](docs/plans/README.md) and their tracking issues current;
- handles private vulnerability reports and publishes advisories, following [`SECURITY.md`](SECURITY.md);
- holds the repository, the Cloudflare account that serves the reference site and the domain, and is the only person with access to them today;
- enforces the [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md);
- answers for the licence position: the repository is AGPL-3.0, and the terms contributors agree to are in [`CLA.md`](CLA.md).

**Contributor.** Anyone who opens an issue, comments, or sends a pull request. A contributor keeps the copyright in what they contribute and agrees to [`CLA.md`](CLA.md) before a pull request is merged. Contributors have no commit access. They propose, and the maintainer decides.

**Maintainers other than the first.** None exist yet. The way to become one is below.

## How decisions are made

The maintainer decides. The record of a decision is public and lives in four places.

- **Issues** track work. A bug, an enhancement or a question is an issue, with a label, and a milestone when one fits. Larger decisions are written into the issue, with the date.
- **Plans** are the proposal mechanism for larger work. A plan in [`docs/plans/`](docs/plans/README.md) states the goal, the ground rules, the design, the tests and the order of work, and has a tracking issue. Its status is "proposed", "in progress" or "done". Anyone can propose a plan by opening a pull request that adds one, or an issue that asks for one. A plan marked "proposed" is a proposal, not a commitment.
- **Pull requests** change the repository. Every change reaches `main` through a pull request, and the repository ruleset requires the `build` and `e2e` checks to pass before it merges. What is checked, and by whom, is in the "Review and acceptance" section of [`CONTRIBUTING.md`](CONTRIBUTING.md).
- **The licence agreement** governs contributions. [`CLA.md`](CLA.md) is checked on every pull request by the `CLA` workflow. A contribution is not merged without it.

Some things are not open to a vote or a pull request: the licence of the SDK packages and of the host, the privacy position in [`PRIVACY.md`](PRIVACY.md) (no accounts, no tracking beyond cookieless page-view counts) and the non-goals in [`ROADMAP.md`](ROADMAP.md). The maintainer can change them, in the open, with a plan and a tracking issue, but a pull request that quietly changes one will be declined.

A disagreement with a decision is raised on the issue or pull request in question. The maintainer gives a reason when declining. There is no separate appeals body. An unresolved disagreement can be taken up by forking the project, which the licence allows.

## Becoming a maintainer

There is no fixed route yet, because no one else has asked. The route the project will use is this:

1. A person sends several pull requests over some months that were accepted without needing the maintainer to rewrite them, covering code, tests and documentation, and keeps to the conventions in [`CONTRIBUTING.md`](CONTRIBUTING.md), including accessibility and the design tokens.
2. They take part in review and triage: answering issues, reading other people's pull requests, and noticing problems in them.
3. The maintainer asks them, or they ask the maintainer, in an issue titled for the proposal. The decision and its reason are recorded in that issue.
4. If they agree, they are given write access, and this document is updated in the same pull request to name the new role and its holder.

Taking on the Cloudflare account, the domain or the repository's administration is a separate step and is not implied by commit access.

## Continuity: not yet covered

The maintainer commits to supporting MapCairn for as long as possible, and wants more contributors and, in time, more maintainers. If the maintainer can no longer maintain it, they will find a new maintainer or archive the repository. The repository will not be deleted.

The project is built so that it can outlive any one person, but one thing is still missing.

If the only maintainer were unavailable for any reason, the project could not continue with minimal interruption. This is the OpenSSF Best Practices silver criterion `access_continuity`, and it is not met.

What is missing is a named, trusted second person with administrator access to the repository, who could keep the project going or hand it on. No such person is recorded here, and none will be invented to fill the gap. The work is tracked in [#4](https://github.com/MapCairn/mapcairn/issues/4). When it is done, this section will say who has access and since when, without credentials or any secret.

### What a second person needs

- A member of the `MapCairn` GitHub organisation with the Admin role on the `mapcairn` repository, so they can merge, triage, change the ruleset and publish advisories. They are not an organisation owner. Before the access is granted, the organisation's member privileges are checked so that members cannot delete or transfer repositories or change their visibility.
- Once publishing starts, write access to the `mapcairn` packages on npm through a team.

What a second person does not need is the Cloudflare account or the domain. The repository is the project: the code, the issues, the plans and the decisions are all in it, and the deployment is described by `wrangler.jsonc`. If the maintainer were unavailable, the second administrator could host the site themselves from the repository, on their own Cloudflare account and hostname.

Credentials are never recorded in the repository. The access is granted to the person's own account and recorded here by role.

### What reduces the risk today

The code, the plans and the decisions are public, the licence lets anyone fork and run it, the site has no database or accounts to migrate, and the deployment is a Cloudflare Worker described by `wrangler.jsonc` in the repository. A fork can be deployed from the repository alone.

### How you can help

Contributors are welcome now, and the route to maintainer is above. A person who reads this and would like to be the second trusted person can say so in [#4](https://github.com/MapCairn/mapcairn/issues/4).

## Changing this document

A change to this document is a pull request like any other, reviewed and merged by the maintainer, with the reason in the description. A change to the maintainer role, the decision process or the becoming-a-maintainer route also needs a plan or an issue that stays open for at least a week before merging, so that contributors can comment. The date at the top is updated with every change.
