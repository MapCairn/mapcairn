---

title: Machine-readable data
sidebar_label: Machine-readable data
description: The JSON files the documentation site publishes for tools and agents (the page manifest, the API catalogue and the search index), with their fields and stability.
---

# Machine-readable data

This page is for people who write a tool or an agent that reads these docs. By the end you will know which JSON files the site publishes, what each field holds and what you can rely on staying the same.

Checked against `@mapcairn/sdk` %sdkVersion%, the version in this repository.

## The files

Each file is a static file at a fixed address, written when the site is built from the same sources as the pages. Nothing is fetched from a third party and nothing runs on a request, so a file is as current as the last deploy.

| File                      | What it holds                                                           |
| ------------------------- | ----------------------------------------------------------------------- |
| `/docs/pages.json`        | Every page: title, address, description, headings and the Markdown copy |
| `/docs/api.json`          | Every export of the SDK packages, one entry each                        |
| `/docs/search-index.json` | The sections of every page, which the site's search box reads           |

The plain-text files are described elsewhere: `llms.txt` lists the pages with a link to each Markdown copy, and `llms-full.txt` holds all of their text.

## Stability

- `pages.json` and `api.json` carry a `schemaVersion` number, which is 1 today.
- Before version 1.0 of the SDK a change to either file only adds fields. A field is not removed, renamed or given another meaning without raising `schemaVersion`, so read the fields you need by name and ignore the others.
- Addresses are stable: the files stay where they are, and a page keeps its address unless the page itself is moved.
- The order of `pages` is the order of the sidebar, and the order of `entries` is the order of the packages and their entry points. Neither is a promise about future content.
- `search-index.json` is a bare list that the site's search reads, so it carries no `schemaVersion`. It has the same promise: a record may gain fields.
- There is no history. `/docs/` always means the current docs.

## pages.json

An object with these fields.

- `schemaVersion`: the number above.
- `packages`: the SDK packages in this build, each as `{ name, version }`.
- `pages`: every page of the sidebar, in its order.

Each page has these fields.

- `title`: the page's title.
- `description`: its one-line description.
- `path`: its address on the origin, such as `/docs/guides/extending/`.
- `url`: the same address with the origin.
- `markdownUrl`: the address of the page's Markdown copy.
- `checkedAgainst`: the SDK version the page was checked against.
- `headings`: the `h2` and `h3` headings that have an anchor, in order. Each has `level` (2 or 3), `text` (plain text), `anchor` (the `id` to use after a `#`) and `url` (the page's address with the anchor).

A last-modified date is not published: the build has no cheap, reliable source for one.

## api.json

An object with these fields.

- `schemaVersion`: the number above.
- `packages`: the SDK packages in this build, each as `{ name, version }`.
- `entries`: one entry for each export.

Each entry is built from the model the API reference pages are written from, so a page and its entry cannot disagree. It has these fields.

- `package`: the package name, such as `@mapcairn/core`.
- `entryPoint`: the import specifier, such as `@mapcairn/core/contracts`.
- `name`: the export's name.
- `kind`: one of `function`, `class`, `interface`, `typeAlias`, `variable`, `namespace` or `enum`.
- `group`: how the reference groups it, such as `components`, `hooks`, `ports`, `adapters`, `tokens`, `functions`, `classes`, `constants` or `types`. New groups may appear.
- `signature`: the declaration as TypeScript.
- `summary`: the first sentence of the description, as plain text.
- `since`: the version it was added in, or an empty string.
- `deprecated`: the deprecation notice, or an empty string.
- `pageUrl`: the address of the export's page.
- `sourceUrl`: where it is declared in the repository, or `null` when that is not known.

## search-index.json

A list of records, one for each page introduction and each `h1` to `h3` section. A record has `id` (unique in the list), `url` (the section's address, with its anchor, from the site root), `page` (the page's title), `heading` (empty for a page's introduction) and `text` (the section's plain text).
