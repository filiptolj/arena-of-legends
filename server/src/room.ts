import {
  CHAMPION_IDS,
  type ChampionSpawn,
  type ClientCommand,
  DT,
  type EntityId,
  type GameEvent,
  LANES,
  type LaneId,
  type LobbyPlayer,
  type LobbyState,
  type ServerMessage,
  TICK_RATE,
  type Team,
  World,
  encodeSnapshot,
} from '@lol/shared';

/** Snapshots go out every N ticks (30 Hz sim → 15 Hz snapshots). */
export const SNAPSHOT_EVERY = 2;
const MAX_CATCH_UP_STEPS = 5;
const TEAMS: Team[] = ['blue', 'red'];
const BOT_NAMES = ['Rook', 'Vale', 'Ember', 'Nyx', 'Frost', 'Sable'];

export interface RoomClient {
  id: string;
  name: string;
  send(msg: ServerMessage): void;
}

/** A lobby that turns into one authoritative match, then back into a lobby. */
export class Room {
  readonly clients = new Map<string, RoomClient>();
  private readonly players = new Map<string, LobbyPlayer>();
  hostId: string;
  private world: World | null = null;
  private loop: ReturnType<typeof setInterval> | null = null;
  private readonly entityOf = new Map<string, EntityId>();
  private readonly known = new Map<string, Set<EntityId>>();
  private events: GameEvent[] = [];
  private lastTickAt = 0;
  private accumulator = 0;

  constructor(
    readonly code: string,
    host: RoomClient,
  ) {
    this.hostId = host.id;
    this.join(host);
  }

  get inGame(): boolean {
    return this.world !== null;
  }

  get empty(): boolean {
    return this.clients.size === 0;
  }

  private freeSlot(): { team: Team; lane: LaneId } | null {
    for (const lane of LANES) {
      for (const team of TEAMS) {
        if (![...this.players.values()].some((p) => p.team === team && p.lane === lane)) return { team, lane };
      }
    }
    return null;
  }

  join(client: RoomClient): string | null {
    if (this.inGame) return 'That match has already started';
    const slot = this.freeSlot();
    if (!slot) return 'Room is full';
    this.clients.set(client.id, client);
    this.players.set(client.id, { clientId: client.id, name: client.name, ...slot, champion: CHAMPION_IDS[0], ready: false });
    this.broadcastLobby();
    return null;
  }

  leave(clientId: string): void {
    this.clients.delete(clientId);
    this.players.delete(clientId);
    this.known.delete(clientId);
    const entity = this.entityOf.get(clientId);
    // A bot takes over for players who drop mid-game.
    if (this.world && entity !== undefined) this.world.setBotControl(entity, true);
    this.entityOf.delete(clientId);
    if (this.hostId === clientId) this.hostId = [...this.clients.keys()][0] ?? '';
    if (this.empty) this.stop();
    else if (!this.inGame) this.broadcastLobby();
  }

  pick(clientId: string, team: Team, lane: LaneId, champion: string): string | null {
    const me = this.players.get(clientId);
    if (!me || this.inGame) return null;
    if (!TEAMS.includes(team) || !LANES.includes(lane) || !CHAMPION_IDS.includes(champion)) return 'Invalid pick';
    const taken = [...this.players.values()].some((p) => p.clientId !== clientId && p.team === team && p.lane === lane);
    if (taken) return 'That slot is taken';
    Object.assign(me, { team, lane, champion });
    this.broadcastLobby();
    return null;
  }

  setReady(clientId: string, ready: boolean): void {
    const me = this.players.get(clientId);
    if (!me || this.inGame) return;
    me.ready = ready;
    this.broadcastLobby();
  }

  lobbyState(): LobbyState {
    return { code: this.code, hostId: this.hostId, players: [...this.players.values()], inGame: this.inGame };
  }

  private broadcastLobby(): void {
    const lobby = this.lobbyState();
    for (const c of this.clients.values()) c.send({ t: 'lobby', lobby });
  }

  start(clientId: string): string | null {
    if (clientId !== this.hostId) return 'Only the host can start';
    if (this.inGame) return null;

    // Humans in their chosen slots; bots fill the rest with champions not yet on that team.
    const roster: (ChampionSpawn & { clientId?: string })[] = [];
    let botIndex = 0;
    for (const team of TEAMS) {
      for (const lane of LANES) {
        const human = [...this.players.values()].find((p) => p.team === team && p.lane === lane);
        if (human) {
          roster.push({ team, lane, defId: human.champion, name: human.name, isBot: false, clientId: human.clientId });
        } else {
          const used = new Set(roster.filter((r) => r.team === team).map((r) => r.defId));
          const pool = CHAMPION_IDS.filter((id) => !used.has(id));
          const defId = pool[Math.floor(Math.random() * pool.length)] ?? CHAMPION_IDS[0];
          roster.push({ team, lane, defId, name: `${BOT_NAMES[botIndex++ % BOT_NAMES.length]} (bot)`, isBot: true });
        }
      }
    }

    const world = new World({ champions: roster });
    this.world = world;
    // Champions are created in roster order after the structures.
    const champs = world.champions();
    roster.forEach((r, i) => {
      if (r.clientId) this.entityOf.set(r.clientId, champs[i].id);
    });

    for (const [cid, client] of this.clients) {
      const entityId = this.entityOf.get(cid);
      const team = this.players.get(cid)!.team;
      if (entityId === undefined) continue;
      this.known.set(cid, new Set());
      client.send({ t: 'start', entityId, team, tickRate: TICK_RATE, snapshotEvery: SNAPSHOT_EVERY });
    }
    this.broadcastLobby();

    this.lastTickAt = performance.now();
    this.accumulator = 0;
    this.loop = setInterval(() => this.tick(), 1000 / TICK_RATE / 2);
    return null;
  }

  command(clientId: string, cmd: ClientCommand): void {
    const unitId = this.entityOf.get(clientId);
    if (!this.world || unitId === undefined) return;
    this.world.issue({ ...cmd, unitId } as Parameters<World['issue']>[0]);
  }

  /** Fixed-step loop that catches up if the timer fires late. */
  private tick(): void {
    const world = this.world;
    if (!world) return;
    const now = performance.now();
    this.accumulator += (now - this.lastTickAt) / 1000;
    this.lastTickAt = now;
    let steps = 0;
    while (this.accumulator >= DT && steps < MAX_CATCH_UP_STEPS) {
      world.step();
      this.events.push(...world.drainEvents());
      this.accumulator -= DT;
      steps++;
      if (world.tickCount % SNAPSHOT_EVERY === 0 || world.winner) this.broadcastSnapshot();
      if (world.winner) {
        this.finish(world.winner);
        return;
      }
    }
    if (steps === MAX_CATCH_UP_STEPS) this.accumulator = 0;
  }

  private broadcastSnapshot(): void {
    const world = this.world!;
    for (const [cid, client] of this.clients) {
      const known = this.known.get(cid);
      const team = this.players.get(cid)?.team;
      if (!known || !team) continue;
      client.send({ t: 'snap', snap: encodeSnapshot(world, team, known, this.events) });
    }
    this.events = [];
  }

  private finish(winner: Team): void {
    for (const c of this.clients.values()) c.send({ t: 'end', winner });
    this.stop();
    for (const p of this.players.values()) p.ready = false;
    this.broadcastLobby();
  }

  stop(): void {
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
    this.world = null;
    this.entityOf.clear();
    this.known.clear();
    this.events = [];
  }
}
