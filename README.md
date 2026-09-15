# Wildwood Online

The game server requires SpacetimeDB before players can register or log in. Cloudflare Tunnel only exposes Vite; it is not used as storage.

## Local database

SpacetimeDB 2.10.0 is installed in `.runtime/spacetimedb/`. The game database and signing keys live in `.data/spacetimedb/`; `.env` holds the server credentials. Keep `.data` and `.env` across restarts and include both in private backups. They are blocked from web access.

No separate SpacetimeDB cloud account is required for this local setup.

## Run locally

Use three PowerShell terminals.

Terminal 1 — persistent database:

```powershell
npm run db:start
```

Terminal 2 — start the game (setup has already been completed):

```powershell
npm run dev
```

Terminal 3 — optional public URL:

```powershell
cloudflared tunnel --url http://localhost:5173
```

Restarting Cloudflare or Vite does not clear accounts. Do not publish with `--delete-data`, because that intentionally erases the SpacetimeDB database.

If a port is already occupied, reuse the running server instead of starting a second copy.

## Setup on a new copy of the project

Install the dependencies with `npm install` and `npm install --prefix spacetimedb`. Download the official Windows 2.10.0 portable ZIP from <https://github.com/clockworklabs/SpacetimeDB/releases/tag/v2.10.0> and extract `spacetimedb-cli.exe` and `spacetimedb-standalone.exe` into `.runtime/spacetimedb/`.

Start `npm run db:start` in one terminal. In another run `npm run db:setup` once. Setup generates private local credentials, creates `.env`, builds the module and publishes it with data deletion disabled. This command can also update the module without resetting accounts. It refuses to replace the owner of an existing database when credentials are missing.

## Checks

The island, five-slot hotbar, fifteen-slot backpack, crafting, durability and database update are documented in [SURVIVAL-UPDATE.md](SURVIVAL-UPDATE.md). Item definitions are in `src/shared/itemDefinitions.js`; island/resource placement is in `src/shared/worldLayout.js`; model and texture paths are in `src/assetPaths.js`.

Desktop: 1–5 select items, Tab opens inventory, left-click gathers. Mobile: tap 1–5 to select, Bag opens inventory, and the action button gathers. In inventory, drag an item or tap it then its destination. Tools must be in the selected hotbar location to work.

```powershell
npm run check --prefix spacetimedb
npm run db:check
npm test
node scripts/verify-database.mjs
npx vite build
```

The integration test runs isolated servers on ports 3001 and 5199 and checks registration, login, inventory moves and restoration after restarting the database and game. Test records never enter `wildwood-survival`.
