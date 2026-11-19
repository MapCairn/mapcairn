# Using MapCairn under the AGPL

What the GNU Affero General Public License, version 3, asks of a team that builds an app on the MapCairn SDK, in plain terms and with examples. It is not legal advice. The licence text is in [`LICENSE`](../../LICENSE) (each SDK package carries an identical copy), section numbers below refer to it, and where this page and the text differ, the text wins. Where the answer depends on how your team builds and runs its app, the page says so and says what to ask a lawyer.

The four SDK packages (`core`, `map`, `react` and `theme`), the reference host in `packages/web` and the embed example all declare `AGPL-3.0-only`. That means version 3 of the licence and no later one, because section 14 lets you follow a later version only when the program says "or any later version".

## When the licence asks nothing

Running the SDK, unmodified, for your own use costs nothing. Section 2 affirms "unlimited permission to run the unmodified Program", and says you may "make, run and propagate covered works that you do not convey, without conditions". Conveying means passing copies to other parties. A prototype on your laptop, or a build that only your own staff run on machines your organisation controls, is not conveying.

You can also have a contractor build or host your copy. Section 2 allows it when they work "exclusively on your behalf, under your direction and control" and are barred from keeping copies outside that arrangement.

There are two limits. If you modify the SDK, section 13 applies even when nobody outside your organisation has a copy (see the next section). And a team that spans several legal entities, or whose supplier runs the app for other people, should ask whether handing it over counts as conveying.

## What a web app triggers

Most apps built on MapCairn are web pages, and two parts of the licence matter.

### Visitors receive code

A page that uses the SDK sends its code to each visitor's browser, bundled with yours. The licence calls passing a copy to someone else conveying, as against "mere interaction with a user through a computer network, with no transfer of a copy", which is not. Treat a shipped bundle as conveying.

### Your app is probably a work based on the SDK

The licence says a work "based on" the Program is one that adapts "all or part of" it, and that a covered work includes such a work. It doesn't say whether importing a library does that. The cautious reading, and the one to plan on, is that an app built into one program with the SDK's code is based on it. Section 5(c) then asks you to license "the entire work, as a whole" under the AGPL, and section 6 asks you to supply the Corresponding Source along with the code you ship.

If you think your app isn't based on the SDK, get a lawyer to confirm it before you ship. The SDK is a set of libraries meant to be built into your app, so the usual case doesn't give you that argument.

### Changing the SDK

If you modify the Program, section 13 says your version "must prominently offer all users interacting with it remotely through a computer network" a way to get its Corresponding Source "at no charge". It applies even when you never ship a copy: a server that runs a modified SDK for people to use over the network owes them a source offer. A fork of `@mapcairn/map` that you host for the public, or only for your customers, falls here. So does a server-side rendered app whose server runs modified SDK code.

## What you share, and what you don't

You share:

- The source of the app you ship, when it counts as a work based on the SDK. Section 1 defines Corresponding Source as "all the source code needed to generate, install, and (for an executable work) run the object code and to modify the work, including scripts to control those activities". That means your components and also the build configuration, the lockfile and whatever scripts produce the bundle.
- Your changes to the SDK itself, to anyone who uses the modified version (section 13) and to anyone you convey it to (sections 5 and 6).

You don't have to share:

- Your data, your users' content and what the map shows. Section 2 says the output of running a covered work is covered "only if the output, given its content, constitutes a covered work". Your users' saved shapes and pins, and a GeoJSON file they export, are their data and not a copy of the SDK's code.
- General-purpose tools you use unmodified to build the app. Section 1 leaves out "general-purpose tools or generally available free programs which are used unmodified". Your editor, Node and the bundler are in that group.
- Separate programs. Section 5 says an "aggregate" of a covered work with "separate and independent works" doesn't extend the licence to the others, as long as they aren't "combined with it such as to form a larger program". A backend that your app calls over HTTP, running on its own, is a usual example. Where the line falls for a given design is a question for a lawyer, and "separate" is a factual claim you'd need to be able to defend.
- Anything to the maintainers. The licence asks you to offer source to your users, and not to send changes back. Contributing is a separate step with its own agreement, in [`CLA.md`](../../CLA.md).

What a data provider's terms add is a different matter, covered below.

People who receive your source then have the licence's rights to it: section 10 gives each recipient a licence "to run, modify and propagate" what they receive, and you can't "impose any further restrictions".

## Doing it in practice

### Put the source offer where users will see it

Section 6(d) is the usual route for code served from a network server: the code and the source can be on different servers if you "maintain clear directions next to the object code saying where to find the Corresponding Source". For a web app that means a link in the interface, to a repository or archive that matches what's deployed. For a modified SDK, section 13 asks for the same thing and says "prominently".

The SDK's Help panel has an optional About block for this, passed as `about` on `SheetContent` (see [Extending MapCairn](extending.md)). The reference site uses it for its repository and licence link. The SDK shows no About block unless you pass one, so nothing in the interface points to the source until your app adds something. Section 5(d) only requires "Appropriate Legal Notices" where the program's own interface displays them, so the SDK alone doesn't force one, but section 13 does as soon as you modify it, and a link costs one prop.

```ts
const about = {
  heading: "About this map",
  text: "Built on MapCairn. This site is open source under the AGPL-3.0.",
  link: { href: "https://example.org/our-team/our-map", label: "Source code and licence" },
};
```

Pass it as `about={about}`.

### Keep the source true to what's running

The offer is for "the Corresponding Source of your version", so tag or branch what you deploy, and keep that source available "for as long as needed" to meet the offer (section 6(d)). A link to a repository that you later delete or rewrite is a broken offer.

### Keep the notices

Don't strip the copyright notices, the SPDX headers or the copies of the licence from the SDK's files. Sections 4 and 5 ask you to keep "intact all notices" and to give recipients "a copy of this License". Where you change a file, section 5(a) asks for "prominent notices stating that you modified it, and giving a relevant date". A comment at the top of the file is enough.

If your app is a covered work, section 5(b) asks for a "prominent" statement that it is released under the licence. The same two-line SPDX header the SDK uses on each file does that job.

Keep anything that must stay private, such as an API key, in the environment of the server or the build and out of files you publish.

## What `licence:sdk` checks, and what it doesn't

The SDK is meant to bring no terms of its own beyond the AGPL. `npm run licence:sdk` (it runs as part of `npm run lint`) reads `package-lock.json` and fails if a production dependency of `core`, `map`, `react` or `theme`, direct or transitive, has a licence that is not on the permissive list in [`scripts/sdkLicences.allowlist.json`](../../scripts/sdkLicences.allowlist.json): MIT, BSD, Apache-2.0, ISC and a few others. Weak copyleft such as LGPL and MPL fails, and so does a package with no licence field. Details are in [Extending MapCairn](extending.md).

So adding the SDK shouldn't bring a second copyleft licence or a licence that needs an agreement with someone else. Section 12 is the reason that matters: if another obligation contradicts the AGPL, you "may not convey it at all".

The check has limits:

- It reads the licence each package declares. It doesn't read licence files, and it can't know that a declaration is wrong. The allowlist records one known typo.
- Permissive licences still have conditions of their own, usually that you keep the copyright notice and licence text with the code you ship (Apache-2.0 also asks you to pass on a NOTICE file). A bundler may strip those comments from your output, so list your dependencies' licences somewhere a user can reach, for instance with a third-party notices file in the deploy.
- It checks the SDK's production dependencies. It doesn't check peer dependencies, which are your choice (React is one), or the dependencies of the reference host or of your own app. Run a licence check on your own lockfile.
- It runs in this repository. It doesn't read your app.

## What the SDK doesn't decide

The AGPL covers code. It says nothing about the map data your app shows, and the SDK ships none.

### Map data and tile providers

Every basemap and layer is fetched from a provider that has its own terms: an attribution requirement, a usage policy, limits on traffic, sometimes a share-alike condition on data you derive from it. Using the SDK doesn't grant you any of that. The SDK's basemaps and the reference site's layers are listed in [`ATTRIBUTIONS.md`](../../ATTRIBUTIONS.md) with the terms the project found, and that file is a record of what this project reads, not a ruling on your use. Read each provider's current terms for what your app does with them. A volunteer-run tile server may not welcome the traffic of a busy site.

### Attribution

A basemap definition carries the provider's credit, and the SDK's map shows the credits of the basemap and layers that are on. Don't hide them. Whether a provider needs more than the on-map credit, such as a link or a notice on a printed or exported map, is in that provider's terms.

### Search and routing

The reference host sends typed queries to a public geocoder and, when asked, route requests to a public routing server. Each has a usage policy, and your app's use is yours to check. A provider you add is your own responsibility too.

### Privacy

The SDK's Settings and pin card describe what's sent to providers in text with neutral defaults that name no provider. Your app passes its own (`privacyNote`, `lookupNote`) for the providers it uses. [`PRIVACY.md`](../../PRIVACY.md) is the reference site's policy and says nothing about yours.

## Questions to take to a lawyer

- Does our app, built the way we build it, count as a work based on the SDK?
- Do we convey copies to anyone outside our legal entity, including a customer, a partner or a contractor who keeps a copy?
- Have we modified the SDK, and who interacts with that version over a network?
- Is the service our app talks to separate enough to be an aggregate under section 5?
- Do any terms we've agreed, with a customer, a data provider or an investor, conflict with section 10 or 12?
- Do the providers we use allow what our app does with their data?
