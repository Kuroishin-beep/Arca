# Research — Superhuman Docs (formula) & Capacities (structure)

Source research for the Arca scope document. Two products were studied because
each solves half of what Arca needs:

- **Capacities** answers *how do you model a thing?* — object types, properties,
  containment without folders. It is the closest shipping product to the
  object-oriented model in `object_oriented_pkm_core_schema.md`.
- **Superhuman Docs** (the rebranded Coda — `docs.superhuman.com` and
  `help.superhuman.com` now serve Coda's documentation) answers *how do you
  compute over those things?* — a formula language over tables, rows and
  columns, and the table/view separation Arca needs for its container/view split.

> Note on sourcing: several `help.coda.io` and `docs.superhuman.com` article URLs
> return HTTP 403 to automated fetches. Where a page could not be retrieved
> directly, findings below come from the search-result summaries and from the
> Coda guide pages that were retrievable. Points that could not be verified are
> marked **[unverified]** rather than asserted.

---

## Part 1 — Superhuman Docs (Coda): the formula model

### 1.1 The core mental model: objects and functions

The formula language is described as two components: **Objects** (nouns) and
**Functions** (verbs).

- **Objects** are *named* references to data — a table is an object, a column is
  an object, a row is an object. This is the key departure from spreadsheets:
  you never write `B7`. You write the name of the thing. Renaming a column
  updates every formula that referenced it, because the reference was to the
  object, not to a coordinate.
- **Functions** operate on objects — `Filter()`, `Count()`, `toText()`, and so on.

In the editor, objects render as coloured **chips** rather than plain text.
Chips sharing a colour belong to the same table, and the chip's icon signals
whether the value is a single value or a list. That is a UI decision worth
copying: the formula bar tells you the *shape* of what you are holding before
you run it.

### 1.2 Two equivalent syntaxes

The same formula can be written two ways, and both evaluate identically:

- **Wrapping** — spreadsheet style, functions nested around their arguments.
  Readable at one level, unreadable at four.
- **Chaining** — JavaScript style, using the dot operator:
  `Object.function().nextFunction()`

Chaining is the recommended style as complexity grows. The dot operator is the
single most important piece of syntax in the language: it is both "get the
property of" and "pipe into".

Operators available: comparison (`=`, `!=`, `<`, `>`, `<=`, `>=`) and logical
(`&&` / `AND`, `||` / `OR`). Parentheses set evaluation order.

### 1.3 `thisRow` — row context

`thisRow` is how a formula written *in a column* refers to the row it is
currently evaluating. Combined with the dot operator it reaches that row's other
columns:

```
thisRow.DueDate - Today()
```

This is the mechanism behind a **column formula**: one expression, authored
once at the column level, evaluated per row with `thisRow` rebound each time.
It is the direct analogue of a derived/computed property.

### 1.4 `FormulaMap` and `CurrentValue` — mapping over lists

`FormulaMap()` applies the same expression to every item in a list — numbers,
text, or rows. Inside it, `CurrentValue` refers to the item being processed.
Functionally it is `Array.prototype.map` with an implicit parameter name.

This matters for Arca because *lists are a first-class value*. A relation column
returns a list of rows, not one row, and `FormulaMap` is how you go from "the
items in this container" to "the weight of each item in this container".

### 1.5 `Filter` and `Contains`

`Filter()` narrows a list by a predicate. Against multi-value columns (a
multi-select, or a relation holding several rows) `Contains()` is the standard
companion — you cannot use `=` against a list, you ask whether the list contains
the value. Arca will need exactly this pair for tag filtering.

### 1.6 Volatile formulas

Some formulas are **volatile**: `Today()`, `Now()`, and `User()`. `User()` in
particular resolves to *the person currently viewing the doc*, which means one
authored formula produces a different result per viewer in real time.

This is the single most directly transferable idea in the whole research. Arca's
central permission problem — a GM sees everything, a player sees only their own
packs plus shared containers — is a `User()`-shaped problem: **one view
definition, evaluated per viewer**, not two hand-maintained views.

### 1.7 Tables, views, and relation columns

- A **table** holds structured data that can be filtered, summarised, analysed
  and referenced in formulas elsewhere in the doc.
- A **view** is another presentation of the *same* underlying table. Filters,
  sorts and grouping belong to the view; the data does not move or duplicate.
- A **relation column** (formerly "lookup") references rows of another table
  from within a row. Relations can be **linked / two-way**, so creating the
  connection from one side makes it visible from the other.
- The **display column** (marked with a ribbon icon) is the column that stands
  in for the whole row wherever that row is referenced — the human-readable
  identity of a record.

### 1.8 What Arca takes from Superhuman Docs

| Idea | How it lands in Arca |
| --- | --- |
| Reference by name, not coordinate | Domain API is `Object`/`Container`/`Property`, never raw table/column ids |
| Objects vs functions | Domain model vs service layer — the split already present in `src/domain/types.ts` |
| Dot chaining | Query builder reads `container.items().filter(...).sortBy(...)` |
| `thisRow` column formula | Derived properties (encumbrance, total value) computed per row at read time, never stored |
| `FormulaMap` over lists | Containment returns a list; aggregates map over it |
| `Filter` + `Contains` | Tag and property filtering in the view layer |
| **`User()` volatility** | **Permissions as a per-viewer evaluation of one view definition** |
| Table vs view | Container owns membership; View owns presentation — matches the schema doc exactly |
| Display column | `Item.name` is Arca's display property |
| Linked two-way relations | `object_relations` rows are traversable from both endpoints |

---

## Part 2 — Capacities: the structural model

### 2.1 Everything is an object; every object has a type

"An object is a piece of content in Capacities. Notes, images, PDFs, and tags
are all objects." Every object has exactly one **object type**, and the type
defines both the structure the object carries and how it is displayed.

Note the divergence from the Arca schema doc: **Capacities is single-type**
(one object, one type), whereas `object_oriented_pkm_core_schema.md` specifies
**composable multi-type** membership (`object_type_memberships` as a join table,
`Longsword -> Weapon + Physical Object + Equipment`). Arca follows the schema
doc here, not Capacities. Capacities' single-type constraint buys a simpler,
more opinionated UI — each type gets a bespoke page layout — at the cost of
composability.

### 2.2 Basic vs custom types

**Basic object types** ship with the product and are available to everyone:
Page, Tag, Image, Weblink, Audio, PDF, Files, Tweet, AI Chat, Query, Table.
Each gets tailored design and behaviour rather than being a generic record.

**Custom object types** are user-defined. Creating one asks for a **singular and
a plural noun** ("Meeting" / "Meetings") up front — the type's name is part of
the UI grammar, not just a label — and then you configure properties, page
layout, card view and object dashboard.

The recommended workflow is explicitly iterative: start with plain pages, notice
a pattern, then use "turn into" to convert them to a new type. Structure is
discovered, not designed up front.

### 2.3 Properties

Properties "define what kind of information each object of that type can hold",
and — critically — **properties are defined at the type level and apply to every
object of that type**. Add a property to the type and it appears on all its
objects. Each property has a name, an optional description, an icon, and a type.

**Default properties** (present on every type): Title (plain text), Aliases
(alternative names for reference), Description, Icon, Created at, Tags.

**Normal properties** (added as needed):

| Property type | Notes |
| --- | --- |
| Text | lightweight rich text with formatting |
| Cover image | upload, URL, or Unsplash |
| Number | with formatting options |
| Checkbox | binary toggle |
| Blocks | full block-based content inside a property |
| Datetime | date, optional time, optional range |
| Label | single- or multi-select dropdown |
| Object select | dropdown linked to another object type — this is the relation |

**Object select** is the relation mechanism: it links a property to an object
type, supports single or multiple selection, and supports two-way linking.

Computed / rollup properties are **not documented** — Capacities appears not to
have them. **[unverified]** whether any aggregate exists. This is precisely the
gap Superhuman Docs' formula language fills, and why Arca needs both halves of
this research rather than either one alone.

### 2.4 Organisational structures — the anti-folder position

Capacities deliberately has no folder hierarchy. Content is organised by
structure and theme *simultaneously*, using several distinct mechanisms:

| Mechanism | Scope | Nature |
| --- | --- | --- |
| **Object type** | the structural home of a record | one per object |
| **Label** | categorising *within* one type (meeting: 1:1 / Sprint / Retro) | a property |
| **Tag** | cross-cutting theme, spans multiple types *and individual blocks* | an object in its own right |
| **Object select** | typed link between two specific objects | a property |
| **Query** | rule-based, auto-updating collection — "no manual upkeep" | saved as an object |
| **Collection** | manual, curated grouping, within or across types | manual membership |

The Query/Collection pair is the important distinction: a **Query** is
membership *by rule*, a **Collection** is membership *by hand*. They coexist
because some groupings genuinely cannot be expressed as a predicate.

Note that Tag and Query are themselves listed as basic object types — the
organisational machinery is built from the same primitive as the content. This
matches the schema doc's rule that "a Container is an Object with container
capability".

### 2.5 Type settings define presentation

A type configures four presentation surfaces:

1. **Properties** — the metadata fields
2. **Page layout** — how a single object renders when opened
3. **Card view** — which properties show on gallery/wall cards
4. **Object dashboard** — an overview across all objects of the type, including
   sections like "untagged objects" or "items missing assignments"
5. **Default link views** — how references to this type render elsewhere

### 2.6 What Arca takes from Capacities

| Idea | How it lands in Arca |
| --- | --- |
| Everything is an object, including containers | `containers.object_id` is a FK to `objects` — already in the schema doc |
| Properties defined on the type, valued on the object | `type_properties` vs `object_properties` split |
| Object select as the relation primitive | `object_relations` + `relation_types` |
| Singular/plural noun on type creation | Type registry stores both; UI grammar reads correctly ("3 Weapons", "New Weapon") |
| Query vs Collection | **Rule-based views vs hand-ordered containment** — Arca's `views.configuration` (predicate) vs `container_objects.position` (manual order) |
| Aliases as a default property | Item search matches aliases, so "sword" finds "Longsword +1" |
| Dashboard section for incomplete records | GM's "unassigned loot" view — items in a world container nobody has claimed |
| Iterative "turn into" | Items start as generic objects; a type is applied later without re-creating the row |
| No folders | Containment is many-to-many; an item can be in Backpack and Equipped and Favourites at once |

---

## Part 3 — Synthesis: the one model Arca builds

The two products decompose cleanly and non-overlappingly:

```
Capacities gives Arca the NOUNS          Superhuman Docs gives Arca the VERBS
-------------------------------          ------------------------------------
Object                                   Filter() / sort / group
Type (composable, per schema doc)        thisRow -> derived properties
Property definition / property value     FormulaMap over containment lists
Relation (object select)                 Contains() for tag predicates
Container (an object itself)             User() -> per-viewer permission
Containment (many-to-many, ordered)      Table vs View separation
View (presentation only)                 Display column
```

Both converge on the same invariant, which is also rule 1 of the Arca schema
document and the rule the whole app hangs from:

> **Objects own data. Containers own containment. Views own presentation.**

The practical consequence for Arca's headline feature: *moving an item between
containers is a write to one containment edge.* Not a delete-and-recreate, not a
copy. The object's identity, properties, notes, comments and history are
untouched — only its membership changed. That is why the move can be optimistic
in the UI and still be correct after the server round-trips.

---

## Sources

**Superhuman Docs / Coda**

- [Basics of Superhuman Docs formulas — Superhuman Help Center](https://help.superhuman.com/hc/en-us/articles/46210140423821-Basics-of-Superhuman-Docs-formulas)
- [Superhuman Docs formulas, formula library, formula cheat sheet](https://docs.superhuman.com/formulas)
- [Name your formulas for easy reference — Superhuman Help Center](https://help.superhuman.com/hc/en-us/articles/46210108625805-Name-your-formulas-for-easy-reference)
- [Docs & Packs — Superhuman Help Center](https://help.superhuman.com/hc/en-us/categories/46127975063565-Docs-Packs)
- [An introduction to the formula language — Coda guides](https://coda.io/resources/guides/intro-to-codas-formula-syntax)
- [Formulas 101 — Coda courses](https://apple.coda.io/resources/courses/formulas-101)
- [Reference current rows in formulas with thisRow — Coda](https://help.coda.io/hc/en-us/articles/39555822109837-Reference-current-rows-in-formulas-with-thisRow)
- [Use FormulaMap to repeat actions across a list — Coda](https://help.coda.io/hc/en-us/articles/39555751409933-Use-FormulaMap-to-repeat-actions-across-a-list)
- [Connect tables with relation columns — Coda](https://help.coda.io/hc/en-us/articles/39555878926861-Connect-tables-with-relation-columns)
- [Create two-way table connections with linked relations — Coda](https://help.coda.io/hc/en-us/articles/39555809935629-Create-two-way-table-connections-with-linked-relations)
- [Overview: Tables — Coda](https://help.coda.io/hc/en-us/articles/39555768266893-Overview-Tables)
- [Column basics — Coda](https://help.coda.io/hc/en-us/articles/39555851862925-Column-basics)
- [Superhuman Docs API (v1) Reference](https://docs.superhuman.com/developers/apis/v1)

**Capacities**

- [Object types — Capacities Documentation](https://docs.capacities.io/reference/content-types)
- [Properties — Capacities Documentation](https://docs.capacities.io/reference/properties)
- [Organizational structures — Capacities Documentation](https://docs.capacities.io/reference/organizational-structures)
- [Define your own object types — Capacities Documentation](https://docs.capacities.io/tutorials/custom-content-types)
- [Capacities — product site](https://capacities.io/)
