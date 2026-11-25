---

title: Machine-readable data
sidebar_label: Machine-readable data
description: The JSON files the documentation site publishes for tools and agents (the page manifest, the API catalogue and the search index), with their fields and stability.
---

# Machine-readable data

The JSON files the site publishes for tools and agents that read these docs, what each field holds and what you can rely on staying the same.

## The files

Each file is a static file at a fixed address, written when the site is built from the same sources as the pages. Nothing is fetched from a third party and nothing runs on a request, so a file is as current as the last deploy.

| File                 | What it holds                                                           |
| -------------------- | ----------------------------------------------------------------------- |
| `/pages.json`        | Every page: title, address, description, headings and the Markdown copy |
| `/api.json`          | Every export of the SDK packages, one entry each                        |
| `/search-index.json` | The sections of every page, which the site's search box reads           |

The plain-text files sit beside them: [`/llms.txt`](https://docs.mapcairn.com/llms.txt) is the index to read first: it lists each page with a one-line description, a link to its Markdown copy and the copy's size in bytes, and the full text in files split by area (`llms-full-guides-1.txt`, `llms-full-core-1.txt` and so on; an area that fits in one file has no number, as `llms-full-react.txt`. There is one set for each of the guides, the changelog, the architecture, the design system and each package's API reference), each with its size. The architecture and the design system are long documents, so the site shows each as an overview page and a page for each section (a section that is still long is cut into numbered parts), and each of those pages has its own Markdown copy and line in `llms.txt`. No file is larger than 150,000 bytes unless it holds a single page, so a reader with a small context can fetch only the part it needs. The API reference has a page for every export, so `llms.txt` lists only its front page and each package's page, which links the members; their text is in the package's files. [`/llms-full.txt`](https://docs.mapcairn.com/llms-full.txt) is the address that once held all the text in one file; it now only lists the split files with their sizes. Every page also has a Markdown copy at its own address with `.md` on the end, such as `/tasks/choose-a-basemap.md`.

To read the page manifest from a shell:

```bash
curl -s https://docs.mapcairn.com/pages.json
```

### Reading the files from a browser

The files are served with the site's security headers and no `Access-Control-Allow-Origin` header, and with `Cross-Origin-Resource-Policy: same-origin`. A script on another origin therefore cannot read them with `fetch`; a script on the documentation site's own origin, a command-line tool and a server-side program can. Nothing here promises that this will change.

## Stability

- `pages.json` and `api.json` carry a `schemaVersion` number, which is 1 today.
- Before version 1.0 of the SDK a change to either file only adds fields. A field is not removed, renamed or given another meaning without raising `schemaVersion`, so read the fields you need by name and ignore the others.
- Addresses are stable: the files stay where they are, and a page keeps its address unless the page itself is moved.
- The order of `pages` is the order of the sidebar, and the order of `entries` is the order of the packages and their entry points. Neither is a promise about future content.
- `search-index.json` is a bare list that the site's search reads, so it carries no `schemaVersion`. It has the same promise: a record may gain fields.
- There is no history. `https://docs.mapcairn.com/` always means the current docs.

## pages.json

An object with these fields.

- `schemaVersion`: the number above.
- `packages`: the SDK packages in this build, each as `{ name, version }`.
- `pages`: every page of the sidebar, in its order.

Each page has these fields. The origin in every field that has one is the site's address when it was built.

- `title`: the page's title.
- `description`: its one-line description.
- `path`: its address on the origin, an absolute path on the site, such as `/guides/extending/`.
- `url`: the same address with the origin, such as `https://docs.mapcairn.com/guides/extending/`. It is not a path.
- `markdownUrl`: the address of the page's Markdown copy, also with the origin and ending in `.md`.
- `checkedAgainst`: the SDK version the page was checked against.
- `headings`: the `h2` and `h3` headings that have an anchor, in order. Each has `level` (2 or 3), `text` (plain text), `anchor` (the `id` to use after a `#`) and `url` (the page's address with the anchor).

One page, with its headings cut to two (the file lists every heading):

```json
{
  "title": "Choose a basemap",
  "description": "Let people pick a basemap, show its credits, and offer only the basemaps you want.",
  "path": "/tasks/choose-a-basemap/",
  "url": "https://docs.mapcairn.com/tasks/choose-a-basemap/",
  "markdownUrl": "https://docs.mapcairn.com/tasks/choose-a-basemap.md",
  "checkedAgainst": "0.1.0",
  "headings": [
    {
      "level": 2,
      "text": "What a basemap is",
      "anchor": "what-a-basemap-is",
      "url": "https://docs.mapcairn.com/tasks/choose-a-basemap/#what-a-basemap-is"
    },
    {
      "level": 2,
      "text": "Add a picker and the credits",
      "anchor": "add-a-picker-and-the-credits",
      "url": "https://docs.mapcairn.com/tasks/choose-a-basemap/#add-a-picker-and-the-credits"
    }
  ]
}
```

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
- `pageUrl`: the address of the export's page, with the origin.
- `sourceUrl`: where it is declared in the repository, or `null` when that is not known.

One entry:

```json
{
  "package": "@mapcairn/core",
  "entryPoint": "@mapcairn/core",
  "name": "BASEMAPS",
  "kind": "variable",
  "group": "constants",
  "signature": "BASEMAPS: readonly BasemapDefinition[]",
  "summary": "Every built-in basemap, in the order the picker shows them, the default first.",
  "since": "",
  "deprecated": "",
  "sourceUrl": "https://github.com/MapCairn/mapcairn/blob/main/packages/core/src/basemaps/basemaps.ts#L174",
  "pageUrl": "https://docs.mapcairn.com/api/core/BASEMAPS/"
}
```

## search-index.json

A list of records, one for each page introduction and each `h1` to `h3` section. A record has `id` (unique in the list), `url` (the section's address, with its anchor, as an absolute path on the site, such as `/guides/extending/#install`), `page` (the page's title), `heading` (empty for a page's introduction) and `text` (the section's plain text).
