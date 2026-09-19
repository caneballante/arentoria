<!-- GENERATED FILE: do not edit by hand. -->
<!-- Source: Arentoria DM City Database App — Codex Build Prompt.docx -->
<!-- Source SHA-256: 637bce3911e7790a4bb2d72ccc6695294f4283d6eeb4196b7ef5c30a24971393 -->

> Searchable text mirror of the immutable build prompt. When source packaging differs from this prompt, `docs/source-audit.md` is authoritative.

# ARENTORIA DM CITY DATABASE APP — CODEX BUILD PROMPT

I want you to build a local web application for running a tabletop RPG city called Arentoria.

This is a serious campaign-management/reference tool built around an unusually detailed fictional city database.

It is NOT primarily:

- a generic spreadsheet viewer

- a worldbuilding wiki

- a virtual tabletop

- an AI story generator

- a complicated game simulation

Its primary purpose is to let me instantly access the right information while I am actively running a D&D game.

The most important qualities are:

1. FAST

2. HIGHLY SEARCHABLE

3. SPATIALLY NAVIGABLE THROUGH THE CITY MAP

4. RELATIONAL

5. EASY TO UPDATE AS THE CANON DATABASE GROWS

6. VERY SCANNABLE DURING LIVE PLAY

I already have a substantial database containing approximately:

- 10,000 permanent residents

- 1,676 individually identified buildings

- households and family relationships

- businesses and workplaces

- thousands of workplace assignments

- street addresses and roads

- districts

- factions

- political relationships

- criminal groups

- religious organizations

- adventuring guilds

- historical background

- rumors and neighborhood observations

I want the app to make that depth usable rather than overwhelming.

## SOURCE FILES

Start by inspecting the actual source files before designing the schema.

Current major sources include:

1. Arentoria_factions_pressure_network_v21.xlsx

This is the current primary structured city database.

It includes current building, people, household, workplace, faction, district and district-atmosphere information.

2. Arentoria_road_names_complete_v15.svg

This is the city map.

The map contains the actual geometry from which the building inventory was developed.

There are approximately 1,676 ordinary buildings with permanent IDs such as:

AR-0001

AR-0002

...

AR-1676

The SVG should eventually become the primary spatial interface for navigating the database.

3. Arentor_Arentoria_Historical_Canon_v22.docx

This contains the consolidated historical canon for Arentor and Arentoria.

Do NOT automatically attempt to decompose every paragraph of this document into database records during the initial build.

Initially:

- preserve it as a reference source

- design a structured Lore system capable of holding this information later

- optionally provide tools/import formats for adding historical facts incrementally

IMPORTANT:

Inspect the actual workbook sheets, columns, IDs and relationships before making assumptions based only on this prompt.

Do not invent missing data.

If source fields are ambiguous, preserve the source values and flag the ambiguity.

## CORE PRINCIPLE

THE DATABASE IS THE CITY.

The app is a set of useful views into the city.

The experience should allow me to move naturally through relationships.

For example:

MAP

→ BUILDING

→ RESIDENT

→ FAMILY

→ WORKPLACE

→ COWORKERS

→ FACTION

→ OTHER MEMBERS

→ RUMOR

→ EVENT

→ LOCATION

or:

PERSON

→ HOME

→ SHOW HOME ON MAP

→ NEIGHBORING BUILDING

→ BUSINESS

→ OWNER

→ FACTION

→ SECRET

I should not feel like I am navigating isolated wiki pages.

Everything should feel interconnected.

## TECHNOLOGY

Build this as a local-first web application.

Preferred technologies:

- TypeScript

- React

- Next.js or another maintainable modern React framework

- SQLite

- Prisma, Drizzle or another straightforward ORM if useful

- simple CSS or Tailwind

No cloud service should be required.

It should run locally on a Mac.

The application should start with a straightforward command such as:

npm install

npm run dev

or preferably after setup:

npm run arentoria

Keep installation and maintenance understandable.

Do not introduce unnecessary infrastructure.

## DATA ARCHITECTURE

Keep source data separate from application data.

A reasonable structure might be:

/data/source/

Arentoria_factions_pressure_network_v21.xlsx

Arentoria_road_names_complete_v15.svg

historical documents

future v22, v23, v24 datasets

/data/import/

import scripts

field mappings

import QA reports

/data/database/

arentoria.sqlite

backups/

/data/export/

app-created lore

events

notes

relationships

The source workbook contains canonical structural information.

The SQLite database is the optimized relational representation used by the app.

## STABLE IDENTIFIERS

The city already uses permanent identifiers.

Preserve them.

Examples:

Person:

P-00001

Building:

AR-0738

Faction:

FAC-001

Road IDs also exist.

DO NOT generate replacement IDs for imported entities.

These stable IDs are essential because later database imports need to update the same entities.

## SOURCE-OWNED VS APP-OWNED DATA

This distinction is critical.

Some data is maintained in the external source database.

Examples:

SOURCE-OWNED DATA

Person:

- name

- ancestry

- age

- household

- home

- workplace

- job

- existing faction memberships

Building:

- AR_ID

- address

- district

- use

- business

- residents

Faction:

- membership

- headquarters

- known relationships

These fields may be updated when I import future versions of the spreadsheet.

Other information will accumulate while actually running the campaign.

Examples:

APP-OWNED DATA

- DM notes

- roleplaying notes

- NPC motivations

- secrets

- current status

- injuries

- whether someone is dead

- relationships changed through play

- rumors

- campaign events

- player discoveries

- bookmarks

- current session notes

- evolving faction pressures

A future source import MUST NOT overwrite app-owned information.

Design the schema so these layers are safely separated.

## GLOBAL SEARCH

There should be a prominent global search box available from almost everywhere.

I need to search by:

- person name

- partial person name

- Person ID

- building ID

- property name

- business name

- street address

- road name

- district

- faction

- organization

- occupation

- ancestry

- lore keywords

- rumor keywords

- event keywords

- tags

Examples:

Bilious

0738

AR-0738

Stonehome

Vayne

Cinder Court

ratcatchers

blue nimbus

castle

Open Furrow

Blanders

Search must tolerate partial matching.

Results should be categorized.

Example:

PEOPLE

Algren Vayne

BUILDINGS

AR-0006 Chancellor Vayne's Office

FACTIONS

Office of Expeditionary Licenses & Forfeitures

LORE

Vayne's confiscated magic-item collection

## INTERACTIVE SVG CITY MAP

THIS IS ONE OF THE HIGHEST-PRIORITY FEATURES.

The SVG city map should become a primary way I interact with the database.

The intended tabletop workflow is:

1. I have the city map open.

2. Players are physically looking at the same map.

3. A player points at a building and says:

"What's this place?"

4. I click that building.

5. The app immediately tells me what it is.

I should NOT need to manually read or type the AR building number.

## SVG BUILDING MAPPING

Inspect the SVG and determine how building polygons/paths are represented.

Each building must ultimately map:

SVG geometry

→ AR_ID

→ Building database record

Do NOT use screen coordinates as the permanent identifier.

If SVG elements already contain useful identifiers, preserve them.

If the map geometry does not currently contain AR IDs, create a one-time preprocessing/mapping system.

The application-ready map could contain elements like:

id="AR-0445"

or:

data-building-id="AR-0445"

If an external mapping file is cleaner, that is acceptable.

Example:

svg_element_id,building_id

building-path-445,AR-0445

Do NOT create 1,676 individually hard-coded React click handlers.

Use event delegation or another efficient architecture.

## MAP INTERACTION

Map Mode should support:

- pan

- zoom

- click building

- hover building

- highlight selected building

- highlight multiple buildings

- zoom to selected building

- reset map

- district highlighting

- searching and locating entities

- recent locations

- session bookmarks

Hover tooltip:

AR-0445

2 Cinder Court

Property/business name if applicable

On click, open a SIDE PANEL rather than navigating away from the map.

This is important.

The map should remain visible so I can rapidly click:

house

house

shop

house

warehouse

as players point around.

## BUILDING MAP SIDE PANEL

When clicking a building, show a compact panel containing:

BUILDING ID

ADDRESS

PROPERTY / BUSINESS NAME

DISTRICT

CURRENT USE

RESIDENTS

BUSINESSES / WORKPLACES

PEOPLE COMMONLY HERE

FACTION CONNECTIONS

RUMORS / HOOKS

CURRENT EVENTS

DM NOTES

All related people, businesses and factions should be clickable.

Provide:

OPEN FULL BUILDING RECORD

ADD TO TONIGHT'S SESSION

SHOW NEARBY

## MAP + SEARCH SYNCHRONIZATION

Search should interact directly with the map.

Example:

Search:

Bilious's Magic Shoppe

Selecting the result should:

- open or focus Map Mode

- pan to AR-0738

- highlight AR-0738

- open the building panel

Searching:

2 Cinder Court

should do the same.

On a Person page provide:

SHOW HOME ON MAP

SHOW WORKPLACE ON MAP

On a Faction page:

SHOW LOCATIONS ON MAP

This can highlight multiple buildings.

## DISTRICTS

District controls should allow quick map navigation.

Current major areas include:

- Crown Ward

- High March

- Scholarium

- Commons

- Guildstrand

- Grand Market

- Stoneback

- Outer Ward

- The Shades

- exterior neighborhoods / approaches

Selecting a district should:

- zoom approximately to the area

- optionally highlight its buildings

- make district atmosphere information available

## ROAD NAVIGATION

Roads should eventually also be usable as entities.

This can be Phase 2 if needed.

Clicking or searching a road should show:

ROAD NAME

ROAD ID

DISTRICTS CROSSED

BUILDINGS ADDRESSED TO IT

BUSINESSES

IMPORTANT LOCATIONS

CURRENT RUMORS

STREET OBSERVATIONS

If SVG road geometry can eventually become interactive, design toward that without delaying clickable buildings.

## PERSON PAGE

A person record should prominently display:

NAME

PERSON ID

ANCESTRY

AGE

ROLE / OCCUPATION

HOME

HOUSEHOLD

FAMILY

WORKPLACE

WORKPLACE ROLE

FACTION MEMBERSHIPS

KNOWN ASSOCIATES

COMMON LOCATIONS

LORE / RUMORS

DM NOTES

CURRENT STATUS

All linked entities should be clickable.

Family relationships should be human readable.

Example:

Spouse:

Mera Brend

Children:

Tovin Brend

Yorin Brend

Sibling:

Nessa Brend

## PERSON: AT THE TABLE VIEW

Near the top of each important person page create a compact DM section:

AT THE TABLE

WHO IS THIS?

WHAT DO THEY WANT?

WHAT DO THEY KNOW?

WHO ARE THEY CONNECTED TO?

WHAT SHOULD I REMEMBER WHEN ROLEPLAYING THEM?

SECRETS / DM ONLY

Some of these fields may initially be empty.

They should be app-owned fields that can be edited without changing imported census data.

## BUILDING PAGE

Display:

- AR_ID prominently

- property/business name

- full address

- road

- district

- building/use type

- residents

- households

- businesses

- workplaces

- owner/proprietor if known

- employees

- people usually present

- faction affiliations

- hidden faction activity

- district observations

- rumors

- historical information

- current events

- DM notes

All entity links should be clickable.

Provide:

SHOW ON MAP

PREVIOUS BUILDING

NEXT BUILDING

ADD TO TONIGHT'S SESSION

## FACTION PAGE

Display:

FACTION NAME

FACTION ID

TYPE

DESCRIPTION

LEADER

MEMBERS

HEADQUARTERS

OTHER LOCATIONS

IMPORTANT PEOPLE

GOALS

PRESSURES

RELATIONSHIPS

CURRENT EVENTS

RUMORS

DM NOTES

## FACTION RELATIONSHIPS

Do NOT model politics as simple:

LOYAL TO

Arentoria deliberately has imperfect and conditional alliances.

Relationships should support nuanced types such as:

- benefits from

- funds

- political patron of

- owes favor to

- shares interest with

- financially dependent on

- professionally aligned with

- tolerates

- distrusts

- competes with

- jurisdictional rival

- infiltrates

- exploits

- blackmails

- uses for access

- protects

- hostile to

- opposed to

- will abandon if...

- member overlap

- cultural connection

The architecture should allow:

Person ↔ Person

Person ↔ Faction

Faction ↔ Faction

Person ↔ Organization

etc.

Relationships should optionally include:

- description

- strength

- visibility

- start/end dates

- DM notes

- conditional text

## DISTRICT PAGE

Each district should show:

DISTRICT NAME

OPENING DESCRIPTION

MAJOR LOCATIONS

BUSINESSES

IMPORTANT PEOPLE

FACTIONS PRESENT

RUMORS

CURRENT EVENTS

STREET OBSERVATIONS

DM NOTES

The v21 workbook already contains authored district atmosphere prompts.

Import and display them.

Each district currently has approximately eight reusable street encounters/observations.

Provide a button:

GIVE ME A STREET DETAIL

This should select from the EXISTING authored prompts.

Do NOT generate new canon with AI.

Allow manual selection as well.

## LORE / KNOWLEDGE / RUMOR SYSTEM

This is a major part of the architecture.

Do NOT store all background information as duplicated text inside person/building records.

Lore should be its own entity.

Create something conceptually similar to:

LoreRecord

Fields may include:

lore_id

title

text

type

canon_status

knowledge_level

time_scope

source

tags

dm_notes

created_at

updated_at

## LORE TYPES

Support types such as:

- Historical Fact

- Current Fact

- Rumor

- Gossip

- Legend

- Misconception

- Secret

- Hook

- Current Event

- Sensory Detail

- Public Notice

- Religious Belief

- Political Claim

- Folk Story

## CANON STATUS

Support:

LOCKED CANON

WORKING CANON

UNRESOLVED

FALSE

MIXED / DISTORTED

This distinction is very important.

For example:

DM Truth:

The castle ward reacted to the assault on King's Spire.

Public rumor:

"The castle screamed last night."

Both should coexist without either overwriting the other.

## KNOWLEDGE / VISIBILITY LEVEL

Suggested values:

PUBLIC

COMMON LOCAL KNOWLEDGE

EDUCATED

PROFESSIONAL

FACTION KNOWLEDGE

RESTRICTED

SECRET

DM ONLY

A lore record may also specify particular people/factions who know it.

## LORE LINKS

One LoreRecord must be linkable to MANY entities.

For example:

Lore:

"The royal castle wards have pulsed blue several times during the last few days."

Could link to:

Royal Castle

Crown Ward

City Guard

Royal Antiquarian Society

Seralith

Aerlan

King's Spire

Royal Paths

current campaign event

Another:

"Rat populations are moving upward because something is disturbing the lower sewer tunnels."

Could link to:

Ratcatchers' Brotherhood

Deep Ledger

Stoneback

The Shades

Sewer Network

Underground River

Do NOT duplicate the actual lore text on all those records.

Use relationships.

A conceptual association table could be:

LoreLink

lore_id

entity_type

entity_id

relationship_to_lore

relevance

knowledge_context

notes

If a cleaner normalized relational design is preferable to a generic polymorphic table, use that.

Preserve the capability.

## RUMOR VARIANTS

One real event can generate several different stories.

Example underlying event:

CASTLE_WARD_REACTIVATION

Possible public versions:

"The castle wall glowed blue."

"The castle screamed."

"Something inside woke up."

"The old king has returned."

"It was lightning."

"The council's mages caused it."

Allow rumor records to optionally connect back to one underlying Event or LoreRecord.

That lets misinformation spread while preserving DM truth.

## EVENT SYSTEM

Create a lightweight Event model.

Examples in this campaign might eventually include:

- assault on King's Spire

- castle wards begin pulsing

- party arrives in Arentoria

- royal castle gate opens

- Vayne summons adventurers

- assassination attempt

- business burns

- NPC disappears

- Council decree

- faction conflict

Event fields could include:

event_id

title

date / sequence

status

description

public_description

locations

people

factions

linked_lore

linked_rumors

dm_notes

Do NOT build a complicated simulation engine yet.

This is initially a structured campaign-history system.

## HISTORICAL CANON

The v22 history document contains important background including:

- old Arentor

- famine/plague collapse

- restoration

- Seralith and Aerlan

- Royal Paths

- Azhurath War

- Fort Aelwind

- Great Forgetting

- Council origins

- royal heir

- modern historical misunderstandings

Initially:

DO NOT automatically turn every sentence into records.

Instead:

1. retain the document as a readable reference

2. create the Lore schema needed to represent historical facts

3. create an import format for later history additions

For example:

lore_records.csv

or:

lore_records.json

Allow me to add historical lore incrementally.

## INFRASTRUCTURE ENTITIES

Some important locations are not normal buildings.

Support infrastructure entities such as:

- Royal Castle

- sewer system

- underground river

- Royal Path network

- city gates

- petition grounds

- outdoor markets

These should be linkable to:

Lore

Events

Factions

Buildings

Districts

People

The Royal Castle in particular stands outside the ordinary AR-0001–AR-1676 building inventory.

Do not force it into the normal building ID structure.

## MODULES

Some major adventure locations may later have full standalone modules.

Examples:

Royal Castle

Sewers

Fort Aelwind

King's Spire

Do not build these modules yet.

But design entity links so a location can later link to:

OPEN ADVENTURE MODULE

without disrupting the main city schema.

## AT-THE-TABLE MODE

This is extremely important.

Create a compact interface specifically for use during live play.

For a LOCATION show:

LOCATION

WHAT THE PLAYERS SEE

WHO IS HERE

WHAT IS HAPPENING

CURRENT RUMORS

IMPORTANT CONNECTIONS

POSSIBLE TROUBLE

DM-ONLY INFORMATION

For a PERSON:

NAME / ROLE

ROLEPLAY NOTE

WANTS

KNOWS

CONNECTIONS

SECRET

For a FACTION:

WHO THEY ARE

WHAT THEY WANT

WHO IS INVOLVED

WHAT THEY ARE DOING RIGHT NOW

CURRENT PRESSURE

The interface should favor short information and scanning.

Avoid giant walls of prose.

## TONIGHT'S SESSION

Create a session preparation/bookmark feature.

Call it something like:

TONIGHT'S SESSION

I should be able to pin:

- people

- buildings

- businesses

- factions

- districts

- lore

- rumors

- events

- district prompts

For example, before a session I might pin:

Algren Vayne

Vexatious

Blanders

Bilious's Magic Shoppe

Rental Office

Royal Castle

three castle rumors

two street encounters

The app still contains the entire city, but the session panel gives me quick access to the handful of records likely to matter that evening.

From almost every record provide:

ADD TO TONIGHT'S SESSION

## RECENTLY VIEWED

Maintain a lightweight current-session history.

Example:

RECENT

AR-0445 — 2 Cinder Court

AR-0738 — Bilious's Magic Shoppe

P-06572 — Chancellor Algren Vayne

FAC-002 — Cloverpot Compact

This is especially useful after following several relational links.

## MAP MODE

Create a dedicated Map Mode.

Most of the screen should be the SVG map.

A collapsible side panel contains the selected entity.

Minimal navigation chrome.

Useful controls:

SEARCH

DISTRICT

RESET MAP

RECENT

TONIGHT'S SESSION

LAYERS

Potential keyboard shortcuts:

ESC = close selection

F = fit entire city

B = bookmark selected item

All functions must also have visible controls.

## MAP LAYERS

Design toward optional map layers such as:

BUILDINGS

BUSINESSES

PEOPLE

FACTIONS

RUMORS

EVENTS

TONIGHT

Initially not every layer must be implemented.

Useful early examples:

Show all Cloverpot locations.

Show all Open Furrow locations.

Show Vayne-connected buildings.

Show buildings in tonight's session.

Show buildings containing a current rumor.

Do not overwhelm the base map.

## PLAYER-SAFE FUTURE VIEW

Do not necessarily build this in Phase 1.

But architect the app so a future second-screen Player View is possible.

PLAYER VIEW could show:

- city map

- publicly known locations

- discovered businesses

- public NPC names

- player notes

DM VIEW contains:

- secrets

- faction membership

- hidden residents

- assassins

- criminal connections

- DM lore

- undiscovered locations

Avoid architecture that makes this impossible later.

## IMPORTING NEW CITY VERSIONS

THIS MUST BE ROBUST.

I will continue creating later database versions:

v22

v23

v24

v25

I want the update workflow to be simple.

Ideally:

1. Put newest workbook into:

/data/source/

2. Run:

npm run import

3. Importer examines the workbook.

4. Stable IDs are used for matching.

5. Existing source-owned fields update.

6. New entities are inserted.

7. App-owned fields remain untouched.

8. Missing entities are NEVER automatically deleted.

9. Produce a human-readable import report.

## IMPORT REPORT

Report:

SOURCE FILE

VERSION

IMPORT DATE

ADDED

UPDATED

UNCHANGED

MISSING FROM NEW SOURCE

CONFLICTS

SCHEMA CHANGES

WARNINGS

ERRORS

Examples:

People added: 12

People updated: 31

Buildings updated: 7

Buildings missing: 0

Faction memberships changed: 18

Unknown column detected:

Building_Condition

## IMPORT SAFETY

Before every successful import:

Automatically back up the existing SQLite database.

Example:

/data/database/backups/

arentoria-before-v23-2026-09-03.sqlite

Provide a straightforward restore command.

## IMPORT PREVIEW

If practical, support:

npm run import:check

This should analyze the new source and report what WOULD change without writing to the database.

Then:

npm run import

actually commits changes.

## DATA EXPORT

The app must not become a data trap.

Allow APP-OWNED material to be exported separately.

Prefer:

JSON

and, where reasonable:

CSV

Examples:

lore_records.json

lore_links.csv

events.json

dm_notes.json

relationship_overrides.json

npc_roleplay_notes.csv

This will allow app-generated campaign material to be backed up or merged into future master databases.

## EDITING

Imported canonical structural information should normally be visibly distinguished from editable DM data.

Example:

Imported field:

Address: 5 Cinder Court

DM editable field:

Notes:

"The players threatened the proprietor."

If I change a canonical imported value directly in the app, do not silently lose that modification during the next import.

Either:

- discourage editing source-owned fields

or

- create an override system

Example:

Source:

5 Cinder Court

DM Override:

7 Cinder Court

Next import should flag:

SOURCE VALUE CHANGED

OVERRIDE EXISTS

Do not silently choose one.

## PLAYER DISCOVERY

Design toward an optional discovered/undiscovered state.

Example:

AR-0738 exists in the database.

Before discovery:

player-facing name may be hidden.

After party visits:

Bilious's Magic Shoppe becomes known.

DM always sees full information.

This can be Phase 2.

## DEAD / CHANGED NPCS

Campaign state should support:

Alive

Dead

Missing

Imprisoned

Traveling

Unknown

Retired

A dead person must not disappear from the database.

Their historical relationships remain.

Their workplace/home records may show:

Former proprietor — deceased

This city should accumulate history.

## NEARBY BUILDINGS

Because the SVG is spatial, eventually calculate or support neighboring buildings.

From a building page:

NEARBY

AR-0444

AR-0446

AR-0452

This could be based on geometry or distance.

Useful for:

"What shop is next door?"

"Where does the assassin escape?"

"What can the players see across the street?"

This is useful but secondary to the initial clickable map.

## WHO IS HERE?

Eventually I want a "Who is here?" function.

Use REAL census/workplace data.

Do not invent NPCs if real people already exist.

Example:

AR-0738 Bilious's Magic Shoppe

LIKELY HERE DURING BUSINESS HOURS:

Bilious

employees

possibly household members

customers from relevant prompt/event records

Eventually time-of-day logic may improve this.

Do not build complex scheduling in Phase 1.

## TIME OF DAY / DISTRICT ACTIVITY

Future architecture should permit:

Morning

Day

Evening

Late Night

Different districts may eventually have:

traffic

guard presence

crime risk

open businesses

faction activity

street events

Do not build a full simulation yet.

## CURRENT DISTRICT ATMOSPHERE DATA

The v21 workbook contains:

District Atmosphere v21

and/or equivalent data.

This includes opening descriptions plus approximately 80 authored neighborhood observations.

Preserve these prompts exactly as authored data.

Each observation already links to real NPCs and locations where possible.

These should become structured records, not just a giant text field.

Each should retain:

District

Prompt number

Prompt type

Best time

Prompt

Person IDs

AR IDs

DM connection / underlying thread

## NO UNREQUESTED AI CANON GENERATION

The app should NOT randomly generate new lore, businesses, NPCs or canon.

If AI capabilities are ever added later, they should be separate and explicitly invoked.

The core application should only display and manipulate authored or imported campaign material.

A button such as:

GIVE ME A STREET DETAIL

means:

select an existing authored prompt

NOT:

generate a new encounter.

## VISUAL DESIGN

Think:

PROFESSIONAL MUNICIPAL ARCHIVE

+

DM CONTROL PANEL

Not:

fantasy parchment website.

Use:

- clean typography

- neutral/muted colors

- high information density

- clear hierarchy

- compact cards

- tabs where appropriate

- collapsible sections

- excellent hover states

- very readable side panels

Avoid:

- giant fantasy fonts

- fake parchment

- unnecessary animation

- excessive decorative elements

- huge page headers

- wasted vertical space

Desktop use is primary.

Tablet responsiveness is desirable.

## PERFORMANCE

The app contains:

~10,000 people

~1,676 buildings

thousands of relationships

It should remain fast.

Do not load every full person record into browser state.

Use indexed database queries.

For SVG hover tooltips, use a lightweight cached building index:

AR_ID

address

property name

Fetch full building details only when selected.

## ERROR HANDLING

Never silently discard source information.

If an import encounters:

unknown Person ID

duplicate building ID

missing required relation

broken address reference

unexpected spreadsheet column

invalid faction ID

log it clearly.

Provide a data quality screen or import log.

## PHASE 1 DELIVERY

Build this incrementally.

PHASE 1 SHOULD INCLUDE:

1. Inspect the actual workbook and SVG.

2. Document existing workbook sheets and columns.

3. Propose the normalized SQLite schema.

4. Build the workbook import pipeline.

5. Build import QA/reporting.

6. Build the primary entity models:

- Person

- Household

- Building

- Workplace / Establishment

- Faction

- Road

- District

7. Build LoreRecord and Lore relationships.

8. Build lightweight Event support.

9. Build global search.

10. Build Person pages.

11. Build Building pages.

12. Build Faction pages.

13. Build District pages.

14. Import the v21 district atmosphere prompts.

15. Build interactive SVG Map Mode.

16. Make building polygons clickable.

17. Map AR_ID → database building.

18. Build map hover tooltips.

19. Build building side-panel browsing.

20. Build Show on Map from entity pages.

21. Build Tonight's Session bookmarks.

22. Build Recently Viewed.

23. Build compact At-the-Table views.

24. Create automatic pre-import database backups.

25. Provide JSON/CSV export of app-owned data.

26. Write a clear README.

## PHASE 1 QA

Before calling Phase 1 complete, verify:

- all 1,676 expected buildings imported

- all 10,000 expected residents imported if that is what the source contains

- stable IDs preserved

- known sample building AR IDs open correctly

- known sample Person IDs open correctly

- building → resident relationships work

- person → home relationships work

- person → workplace relationships work

- faction membership works

- district prompts work

- search works

- SVG building clicking works

- searching a building highlights it on the map

- app notes survive a test spreadsheet re-import

- database backup is created before re-import

Perform spot checks against the source workbook.

## KNOWN USE CASES TO TEST

Test workflows such as:

CASE 1

Player points to an arbitrary building.

I click it on the SVG.

I immediately see:

address

building type

residents

business

rumors

CASE 2

I search:

Bilious

I open Bilious's person/business record.

I click:

SHOW WORKPLACE ON MAP

The map zooms to Bilious's Magic Shoppe.

CASE 3

I search:

Vayne

I see:

person

office

faction connections

relevant lore

known locations

CASE 4

I open:

Stonehome Heritage House

I can see:

building information

public cultural organization

people associated with it

hidden Deep Ledger connection

relevant rumors/lore

without duplicating the underlying lore text.

CASE 5

I am running a session.

Players enter Grand Market.

I open Grand Market.

I click:

GIVE ME A STREET DETAIL

The app returns one of the existing authored Grand Market prompts.

CASE 6

I import v22 of the spreadsheet.

Person P-00421 has updated structural information.

The structural information updates.

My manually entered DM note:

"Hildi suspects the party knows about the tunnels."

remains intact.

CASE 7

A campaign event occurs:

ROYAL CASTLE GATE OPENS

I create one Event.

I attach:

Royal Castle

party

City Guard

Council

Royal Antiquarian Society

I create several rumor variants linked to that Event.

Different entity pages can show those rumors without duplicating records.

## CURRENT AND FUTURE CITY FEATURES

Design the architecture so later phases can add:

- clickable roads

- sewer map

- Royal Castle module

- King's Spire module

- underground river

- faction clocks

- neighborhood activity

- day/night population

- rumor propagation

- NPC deaths and succession

- business ownership changes

- encounter mechanics

- calendar

- festivals

- Guard response

- crime heat

- shop inventory

- weather

- player discovery state

- second-screen player map

- generated print gazetteer

Do not implement all of these now.

Just avoid schema choices that would make them difficult.

## IMPORTANT CAMPAIGN DESIGN PRINCIPLES

Respect these principles while interpreting the data:

1. Not every faction member is perfectly loyal to the faction leader.

2. Political relationships are conditional and transactional.

3. Criminal organizations do not represent entire ancestries.

4. Halflings, dwarves, rabbit-folk, lizardfolk and humans all exist across social classes and moral alignments.

5. The city contains normal life alongside conspiracy.

6. Not every rumor is true.

7. Not every interesting observation is an adventure hook.

8. The same person can belong to several overlapping social systems:

household

workplace

neighborhood

faction

religion

political relationship

9. Historical myth and historical truth are intentionally different.

10. The city should feel like a place that exists independently of the player characters.

## FINAL DEVELOPMENT APPROACH

Do not attempt to build everything at once.

Start by:

1. Inspecting the files.

2. Reporting what you find.

3. Proposing the schema.

4. Identifying any source-data or SVG-mapping challenges.

5. Creating the importer.

6. Getting one end-to-end relational slice working.

For example:

SVG map

→ AR-0738

→ Bilious's Magic Shoppe

→ Bilious

→ home/work relationships

→ lore

Once that works cleanly, expand it to the full city.

Do not invent data to make demos work.

Use actual Arentoria records.

At major milestones, summarize:

WHAT WORKS

WHAT REMAINS

DATA ISSUES FOUND

SCHEMA DECISIONS MADE

HOW TO RUN IT

HOW TO IMPORT THE NEXT DATABASE VERSION

The final goal is that during a D&D session I can look at the city map, click anywhere the players decide to go, and immediately have enough real interconnected information to make that part of Arentoria feel inhabited.
