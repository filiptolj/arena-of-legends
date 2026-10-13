import {
  CHAMPION_IDS,
  type ChampionSpawn,
  type ClientCommand,
  type Command,
  DT,
  type EntityId,
  type GameEvent,
  type LaneId,
  type Snapshot,
  type Team,
  World,
  applySnapshot,
} from '@lol/shared';
import type { Connection } from './net/connection';

const MAX_STEPS_PER_FRAME = 5;

/**
 * Where the game state comes from. The renderer only reads `world` and sends
 * commands, so it works the same for a local simulation and a networked one.
 */
export interface Session {
  readonly world: World;
  readonly playerId: EntityId;
  readonly team: Team;
  readonly online: boolean;
  send(cmd: Command): void;
  /** Advances time; returns events since the last call and the render interpolation factor. */
  advance(dt: number, paused: boolean): { events: GameEvent[]; alpha: number };
}

const BOT_SLOTS: { team: Team; lane: LaneId; name: string }[] = [
  { team: 'blue', lane: 'top', name: 'Rook' },
  { team: 'blue', lane: 'bot', name: 'Vale' },
  { team: 'red', lane: 'top', name: 'Ember' },
  { team: 'red', lane: 'mid', name: 'Nyx' },
  { team: 'red', lane: 'bot', name: 'Frost' },
];

const shuffled = <T,>(xs: T[]): T[] => xs.map((x) => [Math.random(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x);

/** Single player against bots: the simulation runs in the browser. */
export class LocalSession implements Session {
  readonly world: World;
  readonly playerId: EntityId;
  readonly team: Team = 'blue';
  readonly online = false;
  private accumulator = 0;

  constructor(playerChampion: string) {
    const roster: ChampionSpawn[] = [{ team: this.team, defId: playerChampion, name: 'You', lane: 'mid', isBot: false }];
    const pools: Record<Team, string[]> = {
      blue: shuffled(CHAMPION_IDS.filter((id) => id !== playerChampion)),
      red: shuffled([...CHAMPION_IDS]),
    };
    for (const slot of BOT_SLOTS) {
      roster.push({ team: slot.team, defId: pools[slot.team].pop() ?? CHAMPION_IDS[0], name: slot.name, lane: slot.lane, isBot: true });
    }
    this.world = new World({ champions: roster });
    this.playerId = this.world.champions().find((c) => !c.champion!.isBot)!.id;
  }

  send(cmd: Command): void {
    this.world.issue(cmd);
  }

  advance(dt: number, paused: boolean): { events: GameEvent[]; alpha: number } {
    const events: GameEvent[] = [];
    if (!paused && !this.world.winner) {
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= DT && steps < MAX_STEPS_PER_FRAME) {
        this.world.step();
        events.push(...this.world.drainEvents());
        this.accumulator -= DT;
        steps++;
      }
      if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0;
    }
    return { events, alpha: this.accumulator / DT };
  }
}

/**
 * Online match: the server owns the simulation. Snapshots (already filtered by
 * our team's vision) are applied to a mirror World that the renderer reads.
 */
export class NetSession implements Session {
  readonly world = new World({ champions: [] });
  readonly online = true;
  private readonly snapInterval: number;
  private lastSnapAt = performance.now();
  private pending: GameEvent[] = [];
  /** Round-trip time to the server in ms, for the HUD. */
  ping = 0;
  /** Resolves once the first snapshot containing our champion has arrived. */
  readonly ready: Promise<void>;
  private markReady!: () => void;

  constructor(
    private readonly conn: Connection,
    readonly playerId: EntityId,
    readonly team: Team,
    tickRate: number,
    snapshotEvery: number,
  ) {
    // The mirror starts empty; everything arrives through snapshots.
    this.world.entities.clear();
    this.ready = new Promise((resolve) => (this.markReady = resolve));
    this.snapInterval = (1000 / tickRate) * snapshotEvery;
    conn.on((msg) => {
      if (msg.t === 'snap') this.onSnapshot(msg.snap);
      else if (msg.t === 'pong') this.ping = performance.now() - msg.at;
    });
    setInterval(() => conn.send({ t: 'ping', at: performance.now() }), 2000);
  }

  private onSnapshot(snap: Snapshot): void {
    applySnapshot(this.world, snap, this.team);
    this.pending.push(...snap.events);
    this.lastSnapAt = performance.now();
    if (this.world.get(this.playerId)) this.markReady();
  }

  send(cmd: Command): void {
    const { unitId: _ignored, ...rest } = cmd;
    this.conn.send({ t: 'cmd', cmd: rest as ClientCommand });
  }

  advance(): { events: GameEvent[]; alpha: number } {
    const events = this.pending;
    this.pending = [];
    const alpha = Math.min(1, (performance.now() - this.lastSnapAt) / this.snapInterval);
    return { events, alpha };
  }
}
