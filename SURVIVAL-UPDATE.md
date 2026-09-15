# Survival update

## Implemented

- Five item hotbar locations and fifteen backpack locations. One stack ID occupies exactly one location. Mobile Bag is a separate UI button, never database slot 6. Drag/drop and tap-source/tap-destination swap locations without duplicating quantities.
- Versioned inventory with per-stack IDs, material stacks capped at 1000, overflow into free slots, and separate non-stackable tool instances. Full-inventory actions fail without partially consuming or losing resources.
- Stone Hatchet: 50 Wood + 25 Stone + 3 Rope; 300 durability; 0.55-second interval; 3m range; soft-surface multiplier 1.6. Stone Pickaxe: 50 Wood + 25 Stone + 4 Rope; 500 durability; 0.95-second interval; 3m range; hard-surface multiplier 0.90, as requested. Rope: 3 Leaves. Each tool loses one durability on an accepted gathering hit; broken tools cannot gather.
- Searchable/category-filtered crafting workshop, recipe details, own item icons, material availability and disabled crafting states. Empty future categories are explicit rather than fake recipes.
- Approximately 420m-wide irregular island with grassy hills, sand coast, ocean and automatic swimming. The ocean follows the observer beyond the far plane, so it has no reachable rendered edge or invisible movement wall. Own trees/stones are instanced; existing Kenney leaf asset is reused. No source GLBs were deleted or overwritten.
- First-person camera remains at eye height when looking down. Player height follows terrain/swimming; remote player.glb characters are normalized to 1.8m with nicknames and synchronized position/yaw. Camera pitch does not tilt the character.
- Owner-only SpacetimeDB inventory transactions: recipe validation, ingredient deduction, output insertion, durability, resource depletion and respawn deadlines commit atomically. Responses are sent after database commit. Simultaneous clients cannot collect the same leaf twice.
- Persistent private `inventory_state`, `resource_state`, and `account_role` tables added without altering old account/save rows. Legacy inventories migrate on connection. Existing movement/progression saving remains separate, so a stale position save cannot overwrite committed inventory.
- Idempotent admin/superadmin provisioning from private server-side environment configuration; scrypt hashes only in account records. Existing passwords and progress are preserved. The client cannot assign roles. One simultaneous connection per account prevents competing client sessions; different accounts can share a three-player room.

## Root causes fixed

1. Type-based aggregate inventories could not represent distinct tools. Inventory v2 maps stack IDs to item data; backpack/hotbar contain only those IDs. Totals are derived from stacks.
2. The old gathering handler used `update.tool || 'stone'`. Empty selection silently became Stone. The database now resolves only its saved selected slot and verifies that tool, range and cooldown.
3. The eye-height offset was inside the pitch rotation, rotating the camera around the feet. The offset now belongs to the eye pivot, with camera-local position zero.
4. Expected reducer failures used ordinary Error, producing a fatal-instance response. SenderError now reports failed gameplay actions without a runtime panic or partial commit.
5. Source GLB transforms moved the held stone offscreen. It is oriented before centering and its screen offset adapts to portrait aspect ratio.

## Main files

- `src/shared/itemDefinitions.js`: item stats, recipes and categories.
- `src/shared/inventoryState.js`: versioning, stack migration, physical moves, crafting and durability.
- `src/shared/worldLayout.js`, `survivalConfig.js`: shared island surface, resources and configurable gathering values.
- `src/world/World.js`, `CollisionWorld.js`: terrain/ocean, instanced assets, active resource collisions.
- `src/ui/InventoryUI.js`, `src/inventory/Inventory.js`, `src/styles/workshop.css`, `index.html`: workshop and mobile/desktop inventory controls.
- `src/player/PlayerController.js`, `FirstPersonTool.js`, `src/network/RemotePlayers.js`, `NetworkClient.js`, `src/core/Game.js`, `Scene.js`: view, swimming, equipped models and network integration.
- `spacetimedb/src/index.ts`, `server/spacetimePersistence.js`, `gameServerPlugin.js`: atomic reducers and authenticated server coordination.
- `server/bootstrapAccounts.js`, `scripts/database.mjs`, `migrate-survival.mjs`: protected provisioning and migration checks.

## Verification

`npm test`, `npm run test:database`, SpacetimeDB TypeScript checking and Vite production build were used. Database tests run on isolated ports 3001/5199, not the player's database. Tests cover legacy migration, overflow/rollback, slot moves, forged/empty tool rejection, concurrent crafting, distinct durability, maximum tree yield, respawn timestamps, a simultaneous leaf race, continuous movement saves, two-player join/disconnect, and actual database/server restart persistence including roles.

Browser fixtures exercised the real renderer and UI: own models and nickname, grassy island/coast/ocean, held Stone, desktop recipe search/categories, crafting quantities, and mobile-width Bag/scroll/Craft access. No JavaScript errors were observed in the fixture; Three.js emitted deprecation/dependency warnings. Mobile-width rendering was checked on a desktop GPU, not a physical phone. Fullscreen permission and real-device performance remain device/browser dependent.

## Boundaries and configurable behavior

- Source `map.glb` is retained, but the active island is generated from `worldLayout.js` and individual model paths in `assetPaths.js` rather than loading the old small map wholesale.
- Last-hit multipliers are read from tool definitions and capped by remaining node resources. A tree never creates more than its 200 Wood; a configured final multiplier cannot mint resources beyond that budget.
- Combat damage, tradability, repairability and tool tier are metadata for future combat/trading/repair systems. This update implements gathering durability, not a new combat, trade or repair interface.
- Trees/rocks retain 20-minute respawn deadlines; leaves retain 5-minute deadlines. Each leaf plant gives a separately rolled random 1–3 Leaves, then depletes as one pickup. Deadline persistence and depletion were tested, not a real 20-minute browser wait.
- Existing bootstrap account passwords are not reset to the initial environment password. Keep private `.env*` files and `.data` out of public distribution. The initial credential should be changed for public deployment through a future account-management flow.
- Rooms are still ephemeral lobby sessions. Account/inventory/roles and node deadlines persist; the lobby room list itself is not a persistent server directory.

Run `npm run db:start`, then `npm run dev`; optionally start Cloudflare in another terminal. After copying to another machine, run `npm run db:setup` against its local database. Never delete `.data/spacetimedb` or publish with data deletion enabled.
