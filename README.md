# Hierarchy Tree

A Lightning Web Component that draws any object with a lookup to itself as a tree, a tree with columns, or an org
chart of cards: territories, regions, account hierarchies, org units. Names link to their record pages. Any branch can be zoomed into, with a breadcrumb and a
"Section view" banner, so a zoomed-in view is never mistaken for the real top. It works on Lightning Home, App and
Record pages and on Experience Cloud sites (LWR and Aura).

It ships as a generic template. Out of the box it shows a built-in sample tree and needs no objects or data. Point it at
a real object by setting four design attributes, or by changing their defaults (see [Fill in your schema](#fill-in-your-schema)).

**State, 2026-11-22.** Lint is clean and Jest passes 86 tests with coverage above its floors. In a scratch org,
everything deploys and the 27 Apex tests pass. All three layouts were rendered from the real source in a local
harness. The look in Lightning Experience and on an LWR site is still to be checked by a person; see
[What is proven, and where](#what-is-proven-and-where).

<!-- Screenshot slot: capture the component in an org, save it as docs/screenshot.png, and replace this line with
     ![Hierarchy Tree](docs/screenshot.png) -->

## What it does

- **Three layouts** (*Layout*):
  - *Tree*: one row per record, names only, with the zoom button right after each name and count.
  - *Columns*: like the standard Account Hierarchy. The name column keeps the indent, chevrons and stripes; the
    type field and up to five *Column fields* line up beside it, then a "Below" count. Numbers align right and
    checkboxes read Yes or No.
  - *Org chart*: for a small hierarchy, such as a leadership page. The top record's card sits above its children's
    cards, and their children stack under each one; deeper levels are one zoom away. Each card shows an avatar,
    the name as a link, "code · type", and up to two column values (one on a compact card). The search and expand
    buttons are hidden; the breadcrumb and section banner stay.
  - **Narrow spaces.** Below 640 pixels of the component's own width (a sidebar, a phone), Columns shows the plain
    tree and the org chart stacks into a list of compact cards.
- **Avatars.** *Avatar field* names a short text field such as a code. A code like REG-EUR shows EUR, the part after
  the last hyphen, up to five characters; with no code, the avatar shows initials from the name.
- **Tree.** One row per record, with indent guides showing what each row rolls up to. A chevron opens and closes
  each branch. Expand all and Collapse all buttons cover the whole view. Two levels are open at start
  (`expandDepth`).
- **Record links.** Each name is a real link to the record page. A plain click navigates inside Lightning or the site.
  Cmd/Ctrl/Shift-click and middle-click open a new tab. Sample data has no record pages, so its names are plain text.
- **Zoom in.** The magnifier on any row or card with children re-roots the view there, as does the toolbar button for the
  selected row. When zoomed in:
  - a breadcrumb names every level above the view, and each crumb climbs back to that level;
  - a banner reads "Section view: showing ‹name› and the N records below it" and has a *Show full hierarchy* button.
- **Levels and branches.** Names get smaller down the levels of the view: the top row is largest and bold, its
  children are semibold, and everything below is body text. Each child of the top row starts a branch, and every
  row in that branch carries the same colored stripe at its left edge, so it's clear at a glance where a row
  belongs. Colors are counted from the view, so zooming in gives the new top row's children their own colors. Six
  colors repeat in order; *Hide branch colors* turns the stripes off.
- **Badges and counts.** An optional type field (a picklist shows its label) appears as a badge. Each parent shows
  how many records sit below it at any depth ("12 below").
- **Search.** Filters the current view to matching names, keeps the path down to each match, and lets a matched
  branch be opened. Clearing the search restores the previous view.
- **Record-page mode.** On a record page, or on a site page routed to a record, the current record is highlighted,
  its path is opened, and it scrolls into view. *Start at the current record* zooms in on it from the start.
- **Lock to one branch.** Set a top record and lock it: viewers start there and cannot go above it. This is useful on
  a site that should show one branch. It's a view setting, not security (see [Security](#security)).
- **Inactive records.** With an active checkbox configured, inactive rows are muted. *Hide inactive records* removes
  them together with everything below them, so an active child of an inactive parent never appears as a false top.
- **Keyboard and screen readers.** The tree is an ARIA tree with one tab stop:
  - Up/Down/Home/End move between rows;
  - Right opens a branch or goes to its first child, and Left closes it or goes to the parent;
  - Enter opens the record;
  - zooming moves focus to the new top row and announces the view.

## Files

| Path | What it is | Carry it to a real org? |
|---|---|---|
| `force-app/main/default/lwc/hierarchyTree/` | The component: `hierarchyTree.js` (view logic), `hierarchyTreeModel.js` (pure tree functions), `.html`, `.css`, `.js-meta.xml` (design attributes), `__tests__/` (Jest, never deployed) | Yes |
| `force-app/main/default/lwc/hierarchyTreeCard/` | One org-chart card, used only inside the component | Yes |
| `force-app/main/default/classes/HierarchyTreeController.cls` | The Apex controller: one cacheable method, sample mode and records mode | Yes |
| `force-app/main/default/classes/HierarchyTreeControllerTest.cls` | Its tests, written against Account | Yes, after pointing it at your object |
| `force-app/main/default/permissionsets/Hierarchy_Tree_User` | Apex class access for users who are not admins and for site users | Yes |
| `force-app/test/jest-mocks/` | A `lightning/navigation` mock that records calls, for Jest only | Yes, if you run Jest |
| `demo/` | An App page and tab with four instances (Accounts with columns and as an org chart, the sample as an org chart and a tree), plus a permission set for the tab | No, demo only |
| `scripts/apex/seedSampleHierarchy.apex` | 31 Accounts in four levels, with codes in AccountNumber and column data, for a scratch org | No, demo only |
| `config/project-scratch-def.json` | Scratch org with the Communities feature, for site testing | Optional |
| `package.json`, `jest.config.js`, `eslint.config.js`, `.prettierrc` | Local tooling | Yes, if you run Jest and lint |

To carry it to another machine, export the tracked files without git history or `node_modules`:

```bash
git archive --format=zip --output ../salesforce-hierarchy-tree.zip HEAD
```

## Fill in your schema

Every name below is a placeholder. Swap in the real API names, then follow the "where it goes" column.

| What | Placeholder | Where it goes |
|---|---|---|
| Hierarchy object | `AOR__c` | `default` of `hierarchyObjectApiName` in both `targetConfig` blocks of `hierarchyTree.js-meta.xml`; `ALLOWED_OBJECT_API_NAMES` in `HierarchyTreeController.cls`; `OBJECT_NAME` and `insertAccountTree` in the test class |
| Parent lookup (to the same object) | `ParentAOR__c` | `default` of `parentFieldApiName` in the meta file; `PARENT_FIELD` in the test class |
| Name field | `Name` | `labelFieldApiName` (already `Name`) |
| Type or level field (optional badge) | `Type__c` | `default` of `typeFieldApiName`; `TYPE_FIELD` and the picklist value in `testPicklistTypeFieldUsesLabel` |
| Active checkbox (optional) | `IsActive__c` | `default` of `activeFieldApiName`; the field in `testActiveFieldIsMapped`, with one inactive record in the factory |
| AOR code (optional avatar and column) | `AOR_Code__c` | *Avatar field* on an org-chart page, and one of the *Column fields*; `testAvatarField` uses `AccountNumber` |
| Column fields (optional) | for example `AOR_Code__c, OwnerId` | *Column fields* on each page; the column tests use Account fields |
| Start on real data | `Records` | `default` of `hierarchySource` in the meta file (it starts as `Sample`) |

Notes for the test class:
- `insertAccountTree` is the only place records are built. Make it insert your object with its required fields:
  one top record, two children, one grandchild.
- `testParentFieldMustPointAtSameObject` uses `OwnerId` as a lookup to a different object. If your object has no
  owner (the detail side of a master-detail), use any other lookup.
- `testTextTypeFieldUsesValue` and `testAvatarField` use `AccountNumber`. Point them at any text field.
- The column tests use Account's `Type`, `AnnualRevenue`, `OwnerId`, `Parent.Name`, `CreatedDate` and `Owner.Alias`:
  a picklist, a currency, a lookup, a field through the parent lookup, a date-time and a field through a lookup.
  Swap in fields of the same kinds from your object.

Defaults in the meta file only apply when an admin drops the component onto a page. Pages already built keep their own
values. The `@api` defaults in `hierarchyTree.js` matter only when another component embeds `<c-hierarchy-tree>`.

## Deploy and verify

```bash
npm install
npm run lint
npm test
sf project deploy start --source-dir force-app --target-org <alias>
sf org assign permset --name Hierarchy_Tree_User --target-org <alias>
sf apex run test --class-names HierarchyTreeControllerTest --code-coverage --result-format human --wait 10 --target-org <alias>
```

Users need read access to the hierarchy object and its fields from their own profile or permission sets. The component
reads only what each user can see.

To check everything in a fresh scratch org (the demo page needs `demo/` too):

```bash
sf org create scratch --definition-file config/project-scratch-def.json --alias hierarchy-tree --duration-days 7 --target-dev-hub <dev hub>
sf project deploy start --target-org hierarchy-tree
sf org assign permset --name Hierarchy_Tree_User --name Hierarchy_Tree_Demo --target-org hierarchy-tree
sf apex run --file scripts/apex/seedSampleHierarchy.apex --target-org hierarchy-tree
sf org open --target-org hierarchy-tree --path lightning/n/Hierarchy_Tree_Demo
```

## Using it on a page

**Lightning App Builder** (Home, App and Record pages). Drag **Hierarchy Tree** from the Custom components onto the
page and set the attributes below. On a record page, `recordId` is filled in automatically.

**Experience Builder** (sites):
1. Give site users Apex class access: assign `Hierarchy_Tree_User`, or add `HierarchyTreeController` to the site
   profiles. Guest users also need sharing to the records, which guest sharing rules control.
2. Drag **Hierarchy Tree** onto a page and set the attributes.
3. **LWR sites:** create object pages for the hierarchy object (Builder, Pages, New Page, Object Pages). Without them,
   record links land on the site's error page.
4. **Aura sites:** change *Record Id* from `{!Route.recordId}` (the LWR form) to `{!recordId}`.
5. Publish.

| Attribute | Default | What it does |
|---|---|---|
| Card title | Hierarchy | The card header, also the tree's accessible name |
| Icon | `standard:hierarchy` | SLDS icon in the header |
| Layout | Tree | `Tree`, `Columns` or `Org chart`; Columns and Org chart fall back to narrow forms in a narrow space |
| Data source (`hierarchySource`) | Sample | `Sample` draws the built-in tree; `Records` reads the object below |
| Object API name (`hierarchyObjectApiName`) | Account | Needs a lookup to itself. Not called `objectApiName`, because record pages fill that one in themselves |
| Parent field API name | ParentId | The lookup to the same object |
| Name field API name | Name | Shown as each row's name |
| Type field API name | Type | Optional badge; a picklist shows its label |
| Active field API name | (blank) | Optional checkbox; rows where it is false are muted |
| Column fields | (blank) | Up to five comma-separated fields for the Columns layout and the cards. A lookup shows the related name; `Relationship.Field` reads one field through one lookup, for example `Owner.Alias` |
| Avatar field API name | (blank) | A short text field, such as a code, for the card avatars |
| Hide inactive records | off | Removes inactive rows and everything below them |
| Top record Id | (blank) | Start zoomed in on this record |
| Lock to the top record | off | Viewers cannot go above the top record |
| Start at the current record | off | On a record page, start zoomed in on that record |
| Levels open at start | 2 | 0 to 20, counted from the view's top |
| Hide the search box | off | |
| Hide branch colors | off | Turns off the colored stripe that marks each row's branch |
| Record Id (sites only) | `{!Route.recordId}` | The routed record, highlighted and revealed |

## How it works

1. **One Apex call.** `HierarchyTreeController.getHierarchy` is `cacheable` and `with sharing`:
   - In `Sample` mode it returns about 40 in-memory nodes (Global, three regions, countries, offices, one inactive).
   - In `Records` mode it resolves every name against the schema before any query runs:
     - the object exists, is readable and is on the allow list, if one is set;
     - the parent field is a lookup to that same object;
     - each field exists, and the active field is a checkbox;
     - each column field exists. A lookup shows the related record's name (`OwnerId` shows the owner's name), and
       `Relationship.Field` reads one field through one lookup. A lookup that can point at more than one object,
       like Owner on most custom objects, offers only Name.
   - Picklist columns come back as labels through `toLabel()`, and number and date columns as the user would see
     them, with currency symbols, through `FORMAT()`. Each is aliased, so a field can be both the type badge and a
     column.
   - The query is built only from the describe's own spelling of each name, so nothing typed into a design attribute
     reaches the SOQL text. It runs in `USER_MODE`, ordered by Id and capped at 2,000 rows (`maxNodes`). Over the cap,
     it returns the first 2,000 and flags `isTruncated`.
2. **The tree is built in the browser.** `hierarchyTreeModel.js` indexes the flat list:
   - A record whose parent is missing becomes a top-level node. The parent may be deleted, filtered out or not shared
     with the user.
   - A cycle is broken at its lowest-sorting member, so every record still appears exactly once.
   - Children sort by name, ignoring case.
   - Counts, search, zoom and keyboard moves all run on that index, with no further server calls.
3. **Rows are drawn flat.** The template renders only the open part of the view as one list with ARIA levels, which
   avoids a recursive component. At most 500 rows are drawn at once; past that the tree says how many it held back.
   Record URLs are generated only for rows on screen. The Columns layout reuses the same rows as an ARIA tree grid
   (rows and grid cells) laid out on one CSS grid.
4. **The org chart nests the view three levels deep.** `getChartTree` builds the nesting, and `c-hierarchy-tree-card`
   draws each card. A branch's color reaches its cards through the `--hierarchy-tree-card-color` custom property.
5. **Narrow is measured, not guessed.** A `ResizeObserver` on the component's body reads its own width, so a narrow
   region on a wide screen counts as narrow.
6. **Styling.** Structural CSS lives in `hierarchyTree.css`, and every color is a styling hook with a fallback. The
   six branch colors can be set from outside the component with `--hierarchy-tree-branch-color-1` to `-6`, for
   example in a site's head markup or theme CSS.

## Security

- **What a user sees is what sharing and their permissions allow.** The query runs in user mode. An optional field the
  user cannot read is left out; an unreadable name or parent field stops the query with a message naming it.
- **Lock to the top record is a view setting, not security.** The whole visible hierarchy still reaches the browser.
  Use sharing to keep records away from users.
- **Set the allow list in a real org.** Any user with access to the Apex class can call `getHierarchy` with any object
  name. User mode limits them to what they could already read, but listing the hierarchy object in
  `ALLOWED_OBJECT_API_NAMES` keeps the component from being pointed anywhere else.

## What is proven, and where

**Jest** (86 tests, `npm test`) proves the client side. Coverage is about 96% for `hierarchyTree.js`, 99% for
`hierarchyTreeModel.js` and 100% for `hierarchyTreeCard.js`.
- The model covers sorting, orphans, cycles, 15- and 18-character Ids, counts, pruning, search, branch numbering,
  the chart nesting, avatar text and the row cap.
- The component covers rendering, ARIA attributes, zoom, breadcrumbs, the locked branch, search, level and branch classes,
  keyboard moves, link clicks and record-page mode. For the layouts it covers the tree grid's headers and cells, the
  org chart's cards, zoom and navigation from a card, and both narrow fallbacks, with a mocked `ResizeObserver`.
- Apex is mocked.

**Apex tests** (27 methods) prove the controller in an org:
- sample shape, codes and columns;
- column labels, types and values: picklist labels, formatted currency and date-time, lookup names, a field through
  a lookup, blank values;
- the avatar field;
- parent mapping;
- picklist labels and text values;
- the active flag;
- case-insensitive names;
- truncation;
- every refusal, including the allow list and bad column fields (too many, unknown, two lookups deep).

**Only an org proves**, checked in a scratch org on 2026-11-22 (Developer edition, deployed at API 63.0) as recorded
below:

| # | Claim | Status |
|---|---|---|
| 1 | The bundles, classes, permission sets, demo page and tab deploy | RUN: all source deployed, the card bundle and the four-instance demo page included |
| 2 | Apex tests pass in an org | RUN: 27 of 27 pass, 95% coverage of the controller. The uncovered lines include the query-failure catch, custom `__r` relationships and lookups that can point at several objects, which Account's fields cannot exercise |
| 3 | The controller reads a real hierarchy | RUN: after the seed script, Records mode on Account returned 32 nodes (31 seeded plus the scratch org's own Account) and 2 roots |
| 3a | Columns come back formatted from real records | RUN: with the demo page's five column fields, the top Account read `HLD-HT, Finance, New York, User User, $48,000,000` |
| 3b | All three layouts render from the real source | RUN locally: a throwaway harness compiled the bundles with the LWC engine (base components and Apex stubbed, not kept in the repo) and drew each layout at 1,000 and 360 pixels |
| 3c | Names link to and open record pages in Lightning Experience, and the layouts look right there | for a person to check on the demo tab |
| 4 | The `datasource` picklist shows in Experience Builder | UNVERIFIED |
| 5 | `NavigationMixin.GenerateUrl` and `Navigate` reach record pages on an LWR site | UNVERIFIED |
| 6 | The component's own CSS renders the same inside an LWR site's native shadow DOM | UNVERIFIED |
| 7 | The narrow fallback's `ResizeObserver` runs on an Aura site under Lightning Locker | UNVERIFIED |

**Not tested anywhere yet:** a user without read access to an optional field. The code leaves that field out of the
query, but no test runs as a restricted user.

## Later

- **Lazy loading** for hierarchies well past 2,000 records: load one level at a time instead of all at once.
- **Custom Labels:** every string sits in the `LABELS` object at the top of `hierarchyTree.js`, ready to move.
- **The AOR Code avatar** is still to be worked out: how much of a `{AORType}-{ShortCode}` code the circle shows
  lives in `getAvatarText` in `hierarchyTreeModel.js`.
- **Columns from a field set**, managed in Setup, as an alternative to listing fields on each page.
- **Moving into the sf-lwc library** as `skhHierarchyTree` / `SkhHierarchyTreeController` once its prefix rename
  lands.

## Local development on this Mac

`node_modules` is a symlink to the sibling `sf-lwc` checkout's, with the same pinned tool versions and no network
install. Elsewhere, run `npm install`. The style follows the conventions of the sf-lwc library:
- tabs, single quotes, a single arrow parameter without parentheses;
- `on…` handlers and `_private` fields;
- no `@author` line until the code has been reviewed by hand.
