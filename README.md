# TavernTable — starter monorepo

A starter scaffold for a Discord-for-D&D-groups app: chat, voice/video calling,
and shared dice rolling everyone in the room can see.

## Layout

```
/packages/shared   - dice logic, shared types, the real-time room hook (used by BOTH web and mobile)
/server            - Node + Socket.io server: rooms, chat relay, dice roll broadcast
/apps/web          - Next.js web app
/apps/mobile       - Expo (React Native) app
```

The idea: `packages/shared` holds anything that isn't UI — dice math, event types,
the `useRealtimeRoom` hook. Both the web app and the mobile app import from it, so
the real-time/dice logic is written once and just gets different UI wrapped around it.

## What's implemented in this scaffold

- Real-time server with Socket.io: join a room, send chat messages, roll dice,
  everyone in the room sees results live.
- Shared dice engine supporting d4/d6/d8/d10/d12/d20/d100, custom dice of any
  size (e.g. d37), multiple dice, modifiers, and advantage/disadvantage.
  - **Combining multiple different dice types in one roll** (e.g. "1d10 +
    1d12", "2d6 + 1d8 + 3"): click "+ Add Die" in the dice tray to pin the
    currently-selected die and pick another type for the roll — the Roll
    button always shows the full combined formula. A normal single-type
    roll (still the common case) is completely unaffected — this is purely
    additive on top of the existing `diceType`/`count` request shape (a new
    optional `extraDice` list), so old saved rolls and every existing dice
    behavior render exactly as they did before. Results include a
    per-die-type breakdown (only when more than one type was rolled) so
    everyone can see exactly what each die showed, not just the total.
    Mobile currently displays multi-type rolls made by others correctly,
    but building one is a web-only capability for now (mobile's dice tab
    doesn't yet have the count/modifier controls this extends).
  - **Normal / Advantage / Disadvantage now work for any roll**, not just a
    single d20 — the traditional d20 case still works exactly as it always
    has, and the same idea now generalizes to any dice combination: the
    *entire* combination (every die, modifier included) is rolled twice as
    two complete, independent attempts, and the higher (Advantage) or lower
    (Disadvantage) **complete total** is used — never a per-die comparison
    (e.g. Advantage on "1d10 + 1d12" is never "the higher d10 paired with
    the higher d12"). Both complete attempts are always shown, with the
    chosen one clearly marked, since TavernTable is built around everyone
    at the table seeing what was actually rolled. Purely additive on the
    wire (a new optional `advantageRolls` field) — a Normal roll, and any
    advantage/disadvantage roll made before this existed, render exactly as
    they always have.
- Email/password accounts, alongside guest access:
  - Register/login at `/auth/register` and `/auth/login`; a saved login session
    is restored automatically on the next visit (localStorage on web,
    AsyncStorage on mobile).
  - Guests can still just type a name and jump into a room exactly as before —
    accounts are optional, not required.
  - **Storage caveat**: accounts are currently stored in a local JSON file
    (`server/data/users.json`), not a real database. Fine for trying this out
    locally; replace with a real database (see "Next steps") before this goes
    anywhere real. Passwords are hashed, never stored in plain text.
- Persistent lobbies for registered users (`server/lobbyStore.js`):
  - If a logged-in user is the first to join a table name, that table becomes
    a persistent lobby: one JSON file per lobby (`server/data/lobbies/`) storing
    its full chat history and dice roll history. Reopening it later — even
    after everyone left, even after a server restart — reloads that history.
  - Guest-created tables are unaffected: still pure in-memory, gone when the
    last person leaves, exactly as before.
  - Each lobby file also has a `state` object reserved for future features
    (maps, tokens, initiative, character sheets, notes, inventory) so they
    can be added later without a database redesign.
- Public and private lobbies, with join approval (only applies to persistent/
  account-owned lobbies — guest tables are always instant-join, unaffected):
  - The creator chooses **Public** or **Private**, and for public lobbies,
    whether joining is **instant** or **requires their approval**. Private
    lobbies always require approval.
  - Logged-in users can browse public lobbies (`GET /lobbies/public`) — shows
    the table name, player count, max players, and the creator's *lobby*
    display name only (never their account name or email).
  - Approval flow: a join attempt that needs approval doesn't enter the room —
    the requester sees a "waiting" screen, the owner gets a live notification
    if they're currently in the lobby, and can approve or decline. Approved
    once, you're a member and skip approval on every future visit. That
    notification (the requester's name, the fact that a request even exists)
    is sent only to whichever connected socket(s) belong to the owner's
    account — never broadcast to the rest of the room and filtered client-side.
  - The owner can remove a currently-connected player or close the lobby
    entirely (blocks future joins, notifies everyone currently in it).
  - Permissions are role-based (`server/permissions.js`) — only `"owner"`
    exists today, but adding roles like `"co-dm"` or `"moderator"` later is
    just adding a role to that file's permissions table, not a redesign.
  - **Known limitation**: removing a player doesn't revoke their membership —
    they can rejoin immediately since they were approved before. A proper
    ban list would be a good addition alongside a real database.
  - **Storage identity**: each lobby's saved data is stored under a random
    internal ID (e.g. `lobby_8f72c91a4b3d91ef`), completely independent of
    its display name — the table name you type is never turned into a
    filename. This is what makes it safe for two different lobbies to have
    similar, or even identical, names without any risk of one overwriting
    the other; lookups by name go through a small index (name → internal
    ID) so typing a table name to join/create it still works exactly as
    before. Lobbies saved before this existed are migrated to the new
    format automatically and safely the first time the server starts after
    updating — see the comments at the bottom of `server/lobbyStore.js` for
    exactly how (short version: nothing is deleted, a backup of the old
    files is kept, and the process is safe to interrupt or re-run).
- Collapsible Initiative Panel (`server/initiative.js`), with the actual
  initiative data synced live to everyone in the lobby:
  - Toggle button lives in the left column (web) / header (mobile) and opens
    a slide-out panel (web) / slide-up modal (mobile). **Opening and closing
    the panel is local to each person** — like token selection, it's a
    display preference, never sent over the socket, so everyone can have it
    open or closed independently. The initiative *data* underneath (who's in
    it, rolls, turn order, round, whose turn it is) is a completely separate
    thing and stays fully synced regardless of who has their panel open.
  - On desktop (matching the same ~1000px breakpoint the three-column layout
    itself uses), the panel is sized to match the existing right-hand
    Table Talk column, not a fixed pixel width — so it overlays only that
    area and never covers the battle map. Below that breakpoint (narrow
    screens, where the layout is already a single stacked column), sizing is
    unchanged from before.
  - Add any currently-connected player, or a custom monster/NPC entry
    (name + initiative value) — multiple custom entries can share a name
    (e.g. "Goblin 1", "Goblin 2").
  - "Roll Initiative" has an optional **Modifier** input (default 0, positive
    or negative) next to it. Rolling adds the modifier to a 1d20 roll through
    the *same* dice engine as manual rolls (so it shows up in the dice feed
    identically), posts a readable breakdown to chat (e.g. "Tiffany rolled
    Initiative — 17 + 3 = 20"), and automatically adds/updates that player's
    entry and re-sorts the list. The modifier is session-only, typed fresh
    each time — it's not saved anywhere yet. It's a placeholder for a real
    Dexterity modifier once character sheets exist; that's still just
    `rollInitiativeRequest(modifier)`, only the modifier's source changes.
  - Turn tracker: Start Combat / Next Turn / Previous Turn / End Combat, with
    the current turn tracked by entry id (not list position), so editing or
    removing entries mid-combat never desyncs whose turn is highlighted.
    Advancing past the last entry wraps to the top and increments the round.
  - Persisted for saved lobbies (inside the lobby file's existing `state`
    field — `state.initiative`); ephemeral for guest lobbies, exactly like
    everything else guest-created.
  - Editing permissions run through the same role-based check as lobby
    ownership (`permissions.can(role, "manageInitiative")`) — everyone can
    edit today via a default `"member"` role, but restricting this to
    specific roles later is a one-line change to that permissions table, not
    a rewrite of the initiative handlers.
  - Every initiative entry already has unused `hp`, `maxHp`, `tempHp`,
    `conditions`, and `notes` fields — reserved so HP tracking, temp HP,
    conditions, and combat notes can be added later by reading/writing an
    existing field, not changing the entry shape.
- Three-column lobby layout (web), designed around the battle map:
  - **Left** (~30%): dice roller, dice history, the Initiative button — the
    home for future gameplay controls too.
  - **Center** (~47%): the interactive battle map (see below).
  - **Right** (~23%): chat, narrower than before but otherwise unchanged.
  - Stacks into a single column (left → center → right) below 1000px width,
    so it stays usable on narrower browser windows.
  - The mobile app keeps its existing tab-based UI (already a "stacked"
    layout by nature); the battle map lives in its own "Map" tab there
    instead of a column, without a native-app layout redesign.
- Interactive battle map (`server/battleMap.js`, `apps/web/components/BattleMap.tsx`,
  the "Map" tab in `apps/mobile/App.tsx`), synced live to everyone in the lobby:
  - **Default grid**: a clean 50×50 grid, drawn as a lightweight pattern
    (not thousands of individual elements) so it stays fast.
  - **Custom maps**: upload a PNG/JPG/WEBP (capped around 3MB) and it
    replaces the grid for everyone instantly. A "Use Default Grid" button
    switches back — the uploaded image is kept in memory so switching back
    to it later doesn't require re-uploading.
  - **One Token type for all three kinds** (Player, Monster, NPC) — see the
    plan write-up for the full shape. Player tokens are deduplicated by the
    room user they represent, so a player can only end up with one; monster
    and NPC tokens have no such limit ("Goblin 1", "Goblin 2", etc. are fine).
  - **Drag and drop**: every token can be dragged; positions are stored as a
    percentage (0–100) of the play area on both axes, which is what makes
    the map responsive across screen sizes and is also what makes future
    grid-snapping a small addition (round to the nearest of 50 lines)
    instead of a redesign.
  - **Selecting a token** (left-click or right-click, on web) opens a
    floating Context Toolbar (`apps/web/components/ContextToolbar.tsx`
    on web; `MobileContextToolbar` in `apps/mobile/App.tsx`) with Remove,
    Color, and Size — built as a small config array of buttons, so adding
    future ones (Rename, Duplicate, HP, Conditions, Token Image, Notes, Lock
    Position, ...) is adding an entry to that array, not a redesign. The
    toolbar stays open and interactive until you click empty map space,
    select a different token, remove the selected token, or press Escape —
    releasing the mouse button never closes it. Right-clicking a token opens
    the toolbar instead of the browser's context menu.
    **Selection itself is local to each user's screen and never sent over
    the socket** — everyone can inspect a different token at once without
    affecting anyone else.
  - **"Show Token Names" toggle**: hides the full name label shown beneath
    each token (useful when several tokens are clustered together), while
    the initials shown *inside* the token are always kept — the toggle only
    ever affects that one label element. Same as token selection, this is a
    local, per-person display preference (never synced, resets to on if you
    refresh) — turning it off doesn't touch the token's actual stored name
    in any way, just whether that one label renders on your own screen.
  - **"Expand Map" / "Exit Map View"** (`apps/web/components/RoomView.tsx`):
    lets one person enlarge the battle map to fill essentially the whole
    browser window on their own screen, hiding the Dice & Controls and Chat
    columns for them specifically. Same local-only pattern as everything
    above (a plain `useState`, never sent over the socket — there's no
    server code path involved at all, so it's structurally impossible for
    this to generate any network traffic or affect anyone else's screen).
    The side columns are hidden with CSS rather than un-rendered, so a
    half-typed chat message or an in-progress multi-dice selection survives
    switching in and out. The existing BattleMap component itself is
    completely untouched — this only changes how much space its container
    is given, the same way the initiative panel width already worked. The
    normal Initiative button lives in the now-hidden Dice column, so a
    small twin of it floats next to "Exit Map View" only while expanded,
    opening the exact same (unmodified) initiative panel.
  - **Local mouse-wheel zoom (100%–400%) and click-drag panning** on the
    battle map (`apps/web/components/BattleMap.tsx`): scroll to zoom toward
    the cursor, drag empty map space to pan once zoomed in, "Reset View" in
    the map's own controls bar to snap back to 100%/centered. Same
    local-only philosophy as everything else here — plain `useState`, zero
    references anywhere in server or shared socket code, so it's
    structurally impossible for a zoom or pan action to reach the network
    or affect anyone else's screen, verified directly in testing (0.00px
    drift on zoom-to-cursor across repeated zooms, all boundary conditions
    held exactly). Implemented as a camera: a fixed-size viewport contains
    an inner layer that gets `transform: translate() scale()` for the pan
    and zoom — the map image, grid, and every token live inside that inner
    layer completely unchanged, so nothing about token data or positions is
    touched by zooming or panning. The existing token-drag code required NO
    changes at all: it already computes a token's position as a percentage
    of its container's real on-screen bounding box, and a browser's own
    `getBoundingClientRect()` already accounts for CSS transforms
    automatically — pointing that same, unmodified code at the new
    transformed layer instead of the old fixed one was the entire fix,
    confirmed by dragging a token to an exact pixel target while zoomed
    and panned and finding it landed within 0.02px. Panning is only ever
    triggered by a mousedown that reaches the map's own handler — since
    tokens and the context toolbar already call `stopPropagation()` on
    their own mousedown (the same mechanism that already separated "click a
    token" from "click empty space" before this feature existed), a pan can
    never begin on top of a token. Pan is bounded so the zoomed content
    always fully covers the viewport — worked out from the viewport's own
    actual measured size, not a guess about any particular screen — and
    collapses to exactly `{x:0, y:0}` at 100% zoom. The context toolbar
    counter-scales itself so it stays a normal, readable size rather than
    growing right along with a 3–4x zoomed map.
  - **Token positions are anchored to the actual uploaded map image, not
    the surrounding container.** For an uploaded map, `background-size:
    contain` (used so the image is never distorted) letterboxes it
    differently depending on the container's own aspect ratio — Normal
    View and Expanded Map View aren't the same shape, so a token's stored
    x/y percentage used to land in a visibly different spot on the image
    in each. The fix: a dedicated inner element (`.map-image-frame`) is
    sized and centered with the browser's own layout engine
    (`aspect-ratio` + `max-width/height: 100%`, the same idea as
    `background-size: contain` but as a real, measurable element) so its
    own bounds are always exactly where the image is actually visible —
    tokens are positioned as a percentage of *that* element, not the
    outer box. Grid maps were never affected (no image, no letterboxing)
    and render exactly as before. Verified directly: with a deliberately
    non-square test image, a token's position relative to the real image
    pixels matched exactly (0.000% drift) between a narrow and a very wide
    container shape, standing in for Normal vs. Expanded View — the same
    test against the old approach showed up to 59% drift, confirming the
    bug was real and now isn't. No stored token data changed at all; this
    is purely a client-side rendering correction.
  - **Remove from Map** asks for confirmation first, then removes the token
    from the board for everyone. It's not a permanent delete — a removed
    player can be re-added via "Add Player Token," a removed monster/NPC can
    be recreated by typing the same name again via "Add Monster/NPC Token."
    If someone else had that token selected, their toolbar disappears
    automatically (each client just notices the token is gone from the next
    synced update and clears its own local selection).
  - **16 preset token colors** and **3 token sizes** (Small/Medium/Large),
    both defined in `packages/shared/src/tokenAppearance.ts` and duplicated
    (documented in that file) into `server/battleMap.js` for server-side
    validation — the server rejects any color or size that isn't one of the
    known presets, the same "never trust the client" principle as dice
    rolls. Sizes are a lookup table (`SIZE_SCALE`), so adding Tiny/Huge/
    Gargantuan later is adding entries to that table. Label text
    automatically switches between black and white for contrast against
    whatever color a token has, via a shared luminance-based helper.
  - **Optional per-token image** (a character portrait, monster art, etc.),
    for Player, Monster, and NPC tokens alike — uploaded via the context
    toolbar's "Image" button, replacing the token's initials while set (the
    initials remain the fallback: they're what shows again if the image is
    removed, or if it ever fails to load). Client-resized to a small
    512px/~500KB budget before upload — deliberately its *own*, much
    smaller limit than the map background image, since a token portrait has
    no business being anywhere near map-sized. The server never trusts that
    resize step alone: it independently re-verifies both the file size and
    the image's actual pixel dimensions by reading them straight out of the
    file header (no image-decoding library needed for that). Uploading,
    replacing, or removing a token's image broadcasts only that one token's
    id and image — moving it, recoloring it, resizing it, or selecting it
    never retransmits the image, verified directly: moving 10 image-bearing
    tokens 50 times between two connected players produced zero image
    retransmissions and a largest single network message of 64 bytes.
  - Persisted for saved lobbies (`state.battleMap` — the same reserved field
    initiative uses); ephemeral for guest lobbies, exactly like everything
    else guest-created.
  - Editing permissions run through the same role-based check as initiative
    (`permissions.can(role, "manageBattleMap")`) — everyone can edit today,
    restricting it later is a one-line change, not a rewrite.
  - Every token already has unused `hp`, `maxHp`, `tempHp`, `conditions`,
    `imageUrl`, and `notes` fields, and `ownerId` is reserved for
    future permission rules — HP tracking, token art, and per-token
    permissions are all "populate an existing field," not a new token
    shape. Fog of war, hidden DM layers,
    measuring, drawing tools, and a ping system would each be a new field or
    two on the same state object, following the same pattern.
- Automatic data retention & cleanup (`server/lobbyStore.js`, `server/cleanup.js`):
  - Every saved lobby tracks `createdAt`, `lastActivityAt`, `expiresAt`, and
    `status` (`"active"` today; the field exists now so a future soft-delete
    or archive mode doesn't need a schema change). `lastActivityAt` refreshes
    automatically on essentially every meaningful action — chat, rolls,
    initiative changes, token add/remove/resize/recolor, map changes, and
    joining — because nearly all of those already write to the lobby's file,
    and that single write path is where the timestamp gets refreshed.
  - A background sweep (started automatically when the server starts, no
    manual steps) deletes any lobby whose `lastActivityAt` is older than the
    retention period — removing its chat, rolls, initiative, battle map, and
    tokens in one step, since it's all one file. Accounts, friends, and
    profile data are never touched.
  - **Configurable, not hardcoded**: `LOBBY_RETENTION_DAYS` (default 45) and
    `LOBBY_CLEANUP_INTERVAL_MS` (default every 6 hours) are both environment
    variables.
  - Chat and dice history are capped at 500 entries each per lobby — the
    oldest are trimmed automatically once a lobby exceeds that, so a
    long-running campaign's file doesn't grow without bound.
  - Uploaded map images are resized/compressed **client-side** (a canvas on
    web, `expo-image-manipulator` on mobile) before they're ever sent —
    deliberately avoiding a server-side image library, which tends to need
    native build tools. Images are resized to a 2000px maximum dimension and
    prefer WebP (smaller than JPEG at equivalent visual quality, and
    supported by all current major browsers) — the web version specifically
    verifies the browser actually honored the WebP request rather than
    silently substituting an oversized PNG (a real, documented browser
    inconsistency), falling back to JPEG if not. An already-small,
    already-appropriately-sized upload is used as-is rather than needlessly
    reprocessed. In testing with a realistic, detailed battle map image,
    this reduced a 1.79MB upload to about 200KB (roughly 89% smaller) while
    keeping grid lines and terrain detail clearly legible. The server
    enforces the 5MB limit itself, and genuinely verifies the upload is a
    real PNG, JPEG, or WEBP by checking its actual decoded bytes ("magic
    numbers") — never just the filename or the MIME type the browser
    happened to report — before ever storing or broadcasting it. A file that
    fails this check is rejected with a friendly message, and nothing is stored.
  - Dragging a token only writes to disk **once**, when the drag ends —
    every intermediate frame still broadcasts live for smooth movement, but
    only the final position is persisted (and counts as activity).
  - Real-time battle map sync sends only what actually changed: moving,
    adding, removing, recoloring, or resizing a token broadcasts a small,
    token-only message — never the map image or any other token. The full
    map (including the image) is only ever sent when the map itself
    actually changes (uploading one, switching grid/image mode), or once,
    privately, to a player who just joined or reconnected. Chat, dice, and
    initiative never touch the battle map broadcast at all. This is what
    keeps dragging a token cheap on the network regardless of how large the
    uploaded map is — see `server/index.js`'s `battlemap:token*` handlers
    and the matching listeners in `packages/shared/src/useRealtimeRoom.ts`.
- Invite links (`server/lobbyStore.js`, `apps/web/app/join/[code]/page.tsx`):
  - Every saved lobby gets a secure, random 10-character invite code
    (generated with Node's `crypto` module, not `Math.random`) the moment
    it's created — `https://yourdomain.com/join/THECODE`. A small lookup
    index (`server/data/invite-index.json`) maps codes to lobbies so
    resolving one is fast regardless of how many lobbies exist.
  - The "Invite Players" button (in every lobby) shows the lobby name, the
    full link, and the raw join code, each with its own copy button and a
    brief "copied!" confirmation.
  - **Clicking an invite link never bypasses anything** — it resolves to a
    lobby, then goes through the exact same join flow as typing a table name
    manually. A public/auto lobby admits instantly; a private or
    approval-required lobby still puts the visitor in the pending queue and
    notifies the owner, exactly as it already did.
  - Logged-in visitors land straight in the lobby with no extra prompts;
    logged-out visitors see the same login/register/guest screen the
    homepage already uses, then proceed automatically afterward (guests get
    one small "what's your name" prompt, since they have no account name to
    default to).
  - Deleting a lobby (by the owner, or by the 45-day inactivity cleanup)
    removes its invite code from the index at the same moment — a link to a
    gone lobby resolves to a friendly "no longer available" page, not an error.
  - Mobile can generate and share invites the same way web can. Actually
    *opening* one is just visiting an ordinary `https://` URL, so it opens in
    a browser and hits the same web page — no mobile-app deep-link
    configuration was needed for this version.
- Server-side rate limiting, protecting login, account creation, invite
  checks, joining/creating lobbies, chat, and dice rolls from automated
  abuse — with limits generous enough that normal play (rapid-fire combat
  rolls, quick back-and-forth chat) is never affected:
  - REST endpoints (`/auth/login`, `/auth/register`, `/invites/:code`) use
    the standard `express-rate-limit` library, limited per IP address.
  - Real-time actions (joining/creating a lobby, chat, dice rolls) use a
    small custom in-memory limiter (`server/rateLimiter.js`), limited **per
    connection** rather than per IP — deliberately, so multiple real players
    on the same WiFi never get throttled as if they were one person.
  - All limits are environment-variable-configurable (see below) with
    generous defaults; hitting one shows a plain-language message (e.g.
    "You're sending messages too quickly...") rather than silently doing
    nothing or exposing any technical detail, and normal use resumes
    automatically once the short time window passes — nothing is ever
    permanently blocked.
- Graceful handling of an unreachable server (`packages/shared/src/http.ts`),
  on both web and mobile:
  - Every request to the server (login, account creation, checking a saved
    session, resolving an invite link, browsing public lobbies) now times
    out after 10 seconds instead of being able to hang indefinitely, and any
    failure to connect at all becomes one consistent, friendly message
    ("Unable to connect to TavernTable. Please check your connection and try
    again.") instead of a raw browser error.
  - The three places that could previously leave someone on a blank,
    indefinite loading screen if the server was unreachable — the homepage's
    session check, the invite-link page, and the mobile app's launch screen
    — now show that message with a **Retry** button instead.
  - Joining a lobby's live connection (chat/dice/battle map — a different,
    WebSocket-based mechanism from the rest of the app) gets the same
    treatment: a "having trouble connecting" screen with Retry appears if
    the initial connection is actively failing or simply hasn't succeeded
    within 10 seconds. A brief reconnect blip *after* you're already in a
    lobby doesn't interrupt anything — it just shows the existing small
    "Connecting…" badge, exactly as before.
- Locked-down CORS configuration: only the web app's actual address (or the
  local dev server, by default) is allowed to call the server's API and
  real-time connection — configurable via `APP_ORIGIN` for deployment, never
  a wildcard. See the environment variables section below for details.
- Search engine metadata (`apps/web/app/layout.tsx`, `robots.ts`, `sitemap.ts`,
  `icon.tsx`, `opengraph-image.tsx`, `lib/siteConfig.ts`): a proper page
  title and description, a canonical URL, Open Graph and Twitter-card tags
  (so links shared in texts/Discord/etc. show a real title, description, and
  preview image), a generated favicon, and `robots.txt`/`sitemap.xml` files
  so Google can find and index the site. The one public production address
  is defined once in `lib/siteConfig.ts` — update it there if the domain
  ever changes.
- Web app (Next.js) with a working chat panel + dice tray UI.
- Mobile app (Expo) with the same functionality, native components.
- **Not implemented yet**: voice/video calling, friends lists.
  See "Next steps" below.

## Getting started

You'll need Node.js 18+ installed locally (this can't be run inside this chat).

```bash
# 1. Unzip the project, then from the root:
npm install

# 2. Start the real-time server (defaults to localhost:4000)
npm run dev:server

# 3. In another terminal, start the web app (localhost:3000)
npm run dev:web

# 4. In another terminal, start the mobile app (opens Expo dev tools)
npm run dev:mobile
```

Open the web app in two browser tabs (or the web app + Expo Go on your phone),
join the same room code, and roll dice — you'll see both rolls appear in both clients.

> Mobile image handling uses `expo-image-picker` and `expo-image-manipulator`;
> copying invite links/codes uses `expo-clipboard` (added for this feature).
> If you're updating an existing local copy rather than starting fresh, run
> `npm install` again from the root before `npm run dev:mobile`.

### Required environment variable (server)

`JWT_SECRET` **must** be set before the server will start — it's what keeps
login sessions secure. There is no built-in default; if it's missing or
empty, the server will refuse to start and print an explanatory error
instead of running insecurely. Set it to a long, random value.

Locally, set it in your terminal before starting the server, e.g.:

```bash
# macOS/Linux
export JWT_SECRET="some-long-random-value-for-local-dev"
npm run dev:server

# Windows (Command Prompt)
set JWT_SECRET=some-long-random-value-for-local-dev
npm run dev:server
```

You'll need to do this in every new terminal window before running the
server, unless you set it as a permanent environment variable on your
system. When deploying for real, set `JWT_SECRET` to a different, properly
random value in your hosting provider's environment variable settings —
never reuse a value that was ever written in a file or shared anywhere.

### Optional environment variables (server)

| Variable | Default | What it controls |
|---|---|---|
| `APP_ORIGIN` | `http://localhost:3000, http://127.0.0.1:3000` | Which website address(es) are allowed to talk to the server (see below) |
| `LOBBY_RETENTION_DAYS` | `45` | How many days a saved lobby can sit with no activity before it's automatically deleted |
| `LOBBY_CLEANUP_INTERVAL_MS` | `21600000` (6 hours) | How often the cleanup sweep runs |
| `RATE_LIMIT_LOGIN_MAX` / `RATE_LIMIT_LOGIN_WINDOW_MIN` | `10` / `5` | Max login attempts per IP, per window (minutes) |
| `RATE_LIMIT_REGISTER_MAX` / `RATE_LIMIT_REGISTER_WINDOW_MIN` | `5` / `60` | Max account registrations per IP, per window (minutes) |
| `RATE_LIMIT_INVITE_MAX` / `RATE_LIMIT_INVITE_WINDOW_MIN` | `30` / `1` | Max invite-link checks per IP, per window (minutes) |
| `RATE_LIMIT_ROOM_JOIN_MAX` / `RATE_LIMIT_ROOM_JOIN_WINDOW_SEC` | `20` / `60` | Max lobby creates/joins/leaves per connection, per window (seconds) |
| `RATE_LIMIT_CHAT_MAX` / `RATE_LIMIT_CHAT_WINDOW_SEC` | `15` / `10` | Max chat messages per connection, per window (seconds) |
| `RATE_LIMIT_DICE_MAX` / `RATE_LIMIT_DICE_WINDOW_SEC` | `20` / `10` | Max dice rolls per connection, per window (seconds) — shared between manual rolls and "Roll Initiative" |

**`APP_ORIGIN`** controls which website(s) the browser is allowed to let
TavernTable's frontend actually talk to the server from (this is what's
called CORS). Without it, only the local development addresses above are
allowed — never a wildcard, so no other website can call this server's API
even during local testing. Before deploying for real, set it to your actual
production website address, e.g.:

```
APP_ORIGIN=https://your-production-domain.com
```

Once set, *only* that address (or addresses — comma-separated, e.g. for a
`www` and non-`www` variant) is allowed; the local dev addresses stop being
allowed automatically, so there's nothing extra to turn off. This has no
effect on the mobile app — CORS is a browser-only protection and doesn't
apply to it.

None of these need to be set for local development or testing — the
defaults above are what's already in effect. They're only there so the
limits can be tightened or loosened later without touching code.

## Next steps, roughly in the order I'd tackle them

1. **Real database**: swap the in-memory room store, the JSON-file user store
   (`server/userStore.js`), and the JSON-file lobby store (`server/lobbyStore.js`)
   for a real database (Postgres via Supabase/Prisma is a solid default) —
   needed for scale and safe concurrent writes.
2. **Fog of war, hidden DM layers, measuring, drawing tools, ping system**:
   each of these is a new field (or small array) on the battle map's saved
   state, following the same pattern `tokens` already does — see
   `server/battleMap.js` and the "Interactive battle map" section above.
3. **Ban list**: removing a player currently doesn't revoke their membership,
   so they can rejoin instantly. A real ban list is a natural next step.
4. **Voice calling**: integrate a provider SDK (LiveKit, Daily.co, or Agora) —
   add a "join voice" button per room, wire their React and React Native SDKs into
   `apps/web` and `apps/mobile` respectively. This is the biggest remaining chunk of work.
5. **Video calling**: same providers usually support video with a small addition
   once voice is working.
6. **Combat depth on top of initiative**: HP/temp HP tracking, conditions,
   and combat notes — every initiative entry already reserves fields for
   these (see above), so this is populating existing fields, not a redesign.
7. **Character sheets**: once these exist, "Roll Initiative" can pass a real
   Dexterity modifier into `rollInitiativeRequest()` instead of a typed-in one.
8. **Friends / presence**: accounts give you a stable user id to build a
   friends list on. The `joinRequests` array and now the invite-code system
   itself are both already structurally ready to support direct invitations
   between friends, not just link-sharing.
9. **More roles**: `server/permissions.js` has `owner` and `member` today —
   adding `co-dm` or `moderator` (including restricting who can edit
   initiative, or who can regenerate an invite link) is adding entries to
   that file's permission table, not a redesign.
10. **Regenerate invite link, temporary/expiring invites, invite usage
    limits, QR codes, direct share to Discord/Messenger/email**: the invite
    system stores one code as one field on the lobby — regenerating is
    "generate a new code, swap the index entry"; an expiring or
    limited-use invite is a couple of extra fields on the same record read
    by the same `/invites/:code` endpoint; a QR code or share sheet is just
    a different way of presenting the same URL that's already being copied
    today.
11. **Campaign archiving / expiration notices / extended retention for
    premium users / manual export**: all of these build on the retention
    fields already in place — `status` is ready for an "archived" state
    instead of deletion, `expiresAt` is ready to drive a "your campaign
    expires soon" notice, and per-account retention overrides would just be
    an extra check against `RETENTION_MS` at cleanup time.

`JWT_SECRET` is required for the server to run at all now, including locally
— see "Required environment variable" above. When you do deploy for real,
set a fresh, properly random value in your hosting provider's environment
settings rather than reusing whatever you used locally.

## Data storage & backups

Everything TavernTable needs to remember lives under **`server/data/`** —
this is the one folder to back up before deploying for real. Nothing
persistent lives anywhere else in the project.

```
server/data/
├── users.json                 accounts: id, email, hashed password, name
├── lobby-name-index.json      table name -> internal lobby ID lookup
├── invite-index.json          invite code -> internal lobby ID lookup
└── lobbies/
    └── lobby_xxxxxxxx.json    one file per saved lobby — see below
```

Each file inside `lobbies/` is a complete, self-contained saved lobby:
its chat history, dice roll history, initiative tracker (round, turn order,
entries), battle map (mode, uploaded image, all tokens with their
positions/colors/sizes), owner, members, public/private setting, join
policy, max players, and invite code. Restoring a lobby is just restoring
its one file — there's no other database or table it depends on.

**Should be backed up**: the whole `server/data/` folder above.

**Does not need to be backed up** (safe to exclude, nothing persistent or
irreplaceable lives here):
- `node_modules/` in any app — reinstalled from `package.json` via `npm install`
- `.next/` (web) and `.expo/` (mobile) — build/dev caches, regenerated automatically
- `*.log` files, if you ever redirect server output to one
- `server/migration-backups/` — a one-time safety copy made automatically
  the first time the server starts after a storage-format change (so far,
  just the internal-lobby-ID migration); useful to keep around but not
  something that needs its own backup, since it's already a backup of data
  that (if migration succeeded, which it verifiably did — see
  `server/lobbyStore.js`) still exists in `server/data/` in its current form

### A small organizational fix made in this pass

The one thing not already well-organized: that migration safety copy used
to be saved *inside* `server/data/lobbies-backup-before-id-migration/` —
nested inside the very folder you'd back up. That's now
`server/migration-backups/lobbies-before-id-migration/` instead, a sibling
of `server/data/`, not something inside it. This was a pure relocation of
where *future* migration snapshots get written — nothing about existing
data changed, and the 45-day cleanup sweep never touched (and still never
touches) either location; it only ever reads and deletes individual files
inside `server/data/lobbies/`. If you already had a folder at the old path
from a previous run, it's harmless to leave there or move manually — it's
not read from anymore either way.

Everything else was already reasonably organized for this stage: accounts
live in their own file, never touched by the lobby cleanup sweep; each
lobby is one self-contained file; and the whole `server/data/` folder was
already excluded from version control.

## Dice roll data model

See `packages/shared/src/types.ts` and `packages/shared/src/dice.ts` — a roll
request specifies dice type, count, modifier, and advantage/disadvantage; the
server computes the actual result server-side (never trust the client for this,
or people will just report whatever roll they want) and broadcasts it to the room.
