# Arena of Legends

A League of Legends–style 3D MOBA that runs in the browser, built with TypeScript and Three.js.

## Quick start

```bash
nvm use            # Node 22 (see .nvmrc)
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

| Command | What it does |
|---|---|
| `npm test` | Runs the simulation tests, including a 15-minute bot-vs-bot game |
| `npm run typecheck` | Type-checks both packages |
| `npm run build` | Builds the client into `client/dist` |

## Controls

| Input | Action |
|---|---|
| Right click | Move / attack the target under the cursor (hold to keep moving) |
| A + Left click | Attack-move |
| Q W E R | Cast at the cursor (R unlocks at level 6) |
| S / B | Stop / Recall |
| P | Shop (buy in your fountain or while dead; right-click an item to buy/sell) |
| Y / Space | Toggle camera lock / center the camera |
| Mouse wheel | Zoom |
| Minimap | Left: pan the camera · Right: move the champion |
| H | Help |

## Champions

| Champion | Role | Q | W | E | R |
|---|---|---|---|---|---|
| Arcanist | Mage | Arcane Bolt (skillshot) | Blink | Frost Nova (slow) | Meteor |
| Ranger | Marksman | Piercing Arrow (pierces) | Rapid Fire (+AS) | Tumble (dash) | Arrow Storm |
| Warden | Tank | Shield Bash (stun) | Iron Will (shield) | Charge (dash, slow) | Earthshatter (stun) |
| Shade | Assassin | Shadow Strike (dash) | Smoke Veil (+MS) | Fan of Knives (slow) | Death Lotus |

Abilities are data in `shared/src/champions.ts`. Each one picks an effect type (`skillshot`,
`blink`, `dash`, `nova`, `zone` or `buff`) and a damage spec with AD/AP ratios, so a new
champion is mostly a new data entry plus a model in `client/src/render/entityViews.ts`.

## Items

There are 20 items in `shared/src/items.ts`: basic, epic and legendary tiers with recipes.
Components you already own are discounted from the price, as in LoL. Items give AD, AP,
attack speed, health, mana, armor, MR, move speed, lifesteal and cooldown reduction (capped at 40%).
Bots follow each champion's recommended build and recall to shop once they have enough gold.

## Architecture

```
shared/   Simulation in pure TypeScript with no DOM or Three.js; can run on a server later
  src/world.ts          World: entities, command queue, fixed-tick step()
  src/systems/          movement, combat, units (minions/towers/champions), abilities
  src/ai/bot.ts         Lane bot AI
  src/navgrid.ts        Walkability grid + A* with path smoothing
  src/map.ts            Lanes, towers, rocks, fountains (point-symmetric map)
  src/champions.ts      Champion + ability definitions
client/   Three.js renderer + DOM HUD
  src/game.ts           Fixed-timestep loop, render interpolation, event routing
  src/render/           Map, entity models, projectiles/particles
  src/ui/               HUD, health bars/floating text, minimap
  src/input.ts          Mouse/keyboard → Commands
```

The simulation advances at 30 ticks/s. The client renders between ticks and interpolates
from `prevPos` to `pos`. Input only produces `Command` objects (`move`, `attack`, `cast`, ...),
and the simulation only produces `GameEvent`s. Keeping that boundary means multiplayer can be
added by running `World` on a Node server and sending commands and snapshots over WebSockets.

## Roadmap

- [x] Phase 1: 3D map with 3 lanes, minion waves, towers/nexus, one champion with QWER abilities, bots, HUD, minimap
- [x] Phase 2a: 4 champions, champion select, item shop with recipes, bot itemization
- [ ] Phase 2b: jungle camps, fog of war, brush, item actives
- [ ] Phase 3: authoritative Node + WebSocket server, lobbies, client prediction

## License

[MIT](LICENSE). This is a fan-made project and is not affiliated with or endorsed by Riot Games.
