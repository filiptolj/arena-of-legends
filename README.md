# Arena of Legends

A League of Legends–style 3D MOBA that runs in the browser, built with TypeScript and Three.js.

## Quick start

```bash
nvm use            # Node 22 (see .nvmrc)
npm install
npm run dev        # http://localhost:5173
```

### Multiplayer

```bash
npm run dev:server # game server on :3001 (keep running)
npm run dev        # client on :5173; /ws is proxied to the server
```

Open the client, enter a name and choose **Create room**. Share the 5-letter room code; friends
choose **Join**. In the lobby, everyone picks a slot (team + lane) and a champion. Empty slots are
filled by bots, and the host starts the match. If a player disconnects, a bot takes over their champion.

To host a build from a single process: `npm run build && npm start`, then open `http://<host>:3001`.

Other scripts:

| Command | What it does |
|---|---|
| `npm test` | Runs the simulation tests, including a 15-minute bot-vs-bot game |
| `npm run typecheck` | Type-checks both packages |
| `npm run build` | Builds the client into `client/dist` |
| `npm start` | Runs the game server; it also serves `client/dist` |

## Controls

| Input | Action |
|---|---|
| Right click | Move / attack the target under the cursor (hold to keep moving) |
| A + Left click | Attack-move |
| Q W E R | Cast at the cursor (R unlocks at level 6) |
| S / B | Stop / Recall |
| P | Shop (buy in your fountain or while dead; right-click an item to buy/sell) |
| 1 – 6 | Use item actives (Ward Totem, Stoneskin, Gale, Time Stop, Bloodlust) |
| Y / Space | Toggle camera lock / center the camera |
| Mouse wheel | Zoom |
| Minimap | Left: pan the camera · Right: move the champion |
| H | Help |

## Champions

There are 20 champions, many inspired by League archetypes: Arcanist, Ranger, Warden, Shade, Ironhook (Blitzcrank),
Valor (Garen), Sunweaver (Lux), Frostbloom (Ashe), Bloodreaver (Darius), Mistweaver (Soraka),
Nightstalker (Evelynn), Stonewall (Malphite), Volt (Caitlyn), Tempest (Yasuo), Kitsu (Ahri),
Lanternkeeper (Thresh), Firecracker (Jinx), Pyra (Annie), Umbra (Zed) and Dawnshield (Leona).

Abilities are data in `shared/src/champions.ts`. Each one uses an effect type: `skillshot` (optionally
piercing or multi-shot), `blink`, `dash` (optionally backward), `nova`, `zone`, `buff` (shields, haste,
stealth), `strike` (point-and-click, optionally an execute), `heal`, `ward`, `stasis` or `cleanse`. On-hit
effects include slow, stun, root, pull and knockback.

## Items

There are 47 items in `shared/src/items.ts`: basics, a mid tier of epic components and boots upgrades, and legendaries, all with recipes.
Components you already own are discounted from the price, as in LoL. Items give AD, AP,
attack speed, health, mana, armor, MR, move speed, lifesteal and cooldown reduction (capped at 40%).
Bots follow each champion's recommended build and recall to shop once they have enough gold.

## Base structures

As in League, each lane has an outer, inner and inhibitor turret, then an inhibitor. Two nexus
turrets guard the nexus. Structures must fall in order: a lane's towers from outside in, then that
lane's inhibitor, then the nexus turrets (once any inhibitor is down), then the nexus. A destroyed
inhibitor makes the enemy team spawn a super minion in that lane every wave, and it rebuilds after 5 minutes.

## Jungle, vision and actives

- **Jungle camps:** Wolves, Raptors, the Azure Golem and the Crimson Sentinel on each side, plus the Ember Drake in the river. Monsters fight back, leash if pulled too far, and respawn on timers shown on the minimap.
- **Blessings:** the Azure Golem grants +15% cooldown reduction and mana regen. The Crimson Sentinel makes your attacks burn and slow. If you die while holding one, it passes to the enemy champion who killed you. Slaying the drake gives your whole team gold.
- **Fog of war:** each team sees only what its champions, minions, towers and wards see. Hidden units are never shown, and minions, towers and bots can't target them. Terrain outside your vision is darkened.
- **Brush:** units in brush are hidden unless an enemy is in the same brush or a ward watches it. Attacking or casting reveals you briefly.
- **Item actives:** the Ward Totem places wards. Titan Plate (Stoneskin), Storm Bow (Gale), Archmage Staff (Time Stop) and Crimson Edge (Bloodlust) each have an active, cast with keys 1–6.

## Architecture

```
shared/   Simulation in pure TypeScript with no DOM or Three.js; can run on a server later
  src/world.ts          World: entities, command queue, fixed-tick step()
  src/systems/          movement, combat, units (minions/towers/champions), abilities
  src/ai/bot.ts         Lane bot AI
  src/navgrid.ts        Walkability grid + A* with path smoothing
  src/map.ts            Lanes, towers, rocks, fountains (point-symmetric map)
  src/champions.ts      Champion + ability definitions
  src/net/protocol.ts   Wire protocol: lobby messages, fog-filtered snapshots, command validation
server/   Node + ws authoritative server: rooms, lobby, 30 Hz simulation, 15 Hz snapshots
client/   Three.js renderer + DOM HUD
  src/session.ts        LocalSession (sim in the browser) / NetSession (mirror fed by snapshots)
  src/game.ts           Render loop, interpolation, event routing
  src/render/           Map, entity models, projectiles/particles
  src/ui/               HUD, health bars/floating text, minimap
  src/input.ts          Mouse/keyboard → Commands
```

The simulation advances at 30 ticks/s. The client renders between ticks and interpolates
from `prevPos` to `pos`. Input only produces `Command` objects (`move`, `attack`, `cast`, ...),
and the simulation only produces `GameEvent`s. Offline, `World` runs in the browser. Online,
the server runs it, and each client gets snapshots holding only what its team can see. Hidden
enemies are never sent, so fog of war can't be bypassed by reading network traffic. The server
replaces the unit id on every command with the sender's champion.

## Roadmap

- [x] Phase 1: 3D map with 3 lanes, minion waves, towers/nexus, one champion with QWER abilities, bots, HUD, minimap
- [x] Phase 2a: 4 champions, champion select, item shop with recipes, bot itemization
- [x] Phase 2b: jungle camps and blessings, drake, fog of war, brush, wards, item actives
- [x] Phase 3: authoritative Node + WebSocket server, rooms and lobby, fog-filtered snapshots, bot takeover on disconnect
- [ ] Next: client-side prediction, delta-compressed snapshots, reconnect, ranked matchmaking

## Credits

Champion and minion models are from the KayKit Adventurers and Skeletons character packs by
[Kay Lousberg](https://www.kaylousberg.com) (CC0). Each champion uses a base model with its own weapons,
hue-shifted colors and animations. See `client/public/models/CREDITS.txt`.

## License

[MIT](LICENSE). This is a fan-made project and is not affiliated with or endorsed by Riot Games.
