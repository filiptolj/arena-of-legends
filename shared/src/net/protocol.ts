import type { LaneId, Team } from '../map.js';
import type { Vec2 } from '../math.js';
import type {
  ChampionState,
  Command,
  Entity,
  EntityId,
  EntityKind,
  Faction,
  GameEvent,
  MinionType,
  Projectile,
  StatusEffect,
  Zone,
} from '../types.js';
import type { World } from '../world.js';

// ---------------------------------------------------------------------------
// Lobby and connection messages

export const MAX_NAME_LENGTH = 16;

export interface LobbyPlayer {
  clientId: string;
  name: string;
  team: Team;
  lane: LaneId;
  champion: string;
  ready: boolean;
}

export interface LobbyState {
  code: string;
  hostId: string;
  players: LobbyPlayer[];
  inGame: boolean;
}

/** Commands from clients never carry a unit id; the server fills in the sender's champion. */
export type ClientCommand = Command extends infer C ? (C extends { unitId: EntityId } ? Omit<C, 'unitId'> : never) : never;

export type ClientMessage =
  | { t: 'create'; name: string }
  | { t: 'join'; code: string; name: string }
  | { t: 'pick'; team: Team; lane: LaneId; champion: string }
  | { t: 'ready'; ready: boolean }
  | { t: 'start' }
  | { t: 'leave' }
  | { t: 'cmd'; cmd: ClientCommand }
  | { t: 'ping'; at: number };

export type ServerMessage =
  | { t: 'welcome'; clientId: string }
  | { t: 'lobby'; lobby: LobbyState }
  | { t: 'start'; entityId: EntityId; team: Team; tickRate: number; snapshotEvery: number }
  | { t: 'snap'; snap: Snapshot }
  | { t: 'end'; winner: Team }
  | { t: 'error'; message: string }
  | { t: 'pong'; at: number };

// ---------------------------------------------------------------------------
// Snapshots

/** Fields that never change after spawn; sent the first time a client learns of an entity. */
export interface EntitySpawn {
  id: EntityId;
  kind: EntityKind;
  team: Faction;
  radius: number;
  sightRange: number;
  ranged: boolean;
  attackRange: number;
  minion?: { type: MinionType; lane: LaneId };
  monster?: { type: string; campId: string; home: Vec2 };
  structure?: { lane?: LaneId; tier?: number };
  ward?: { ownerId: EntityId; expiresAt: number };
  champion?: { defId: string; name: string; isBot: boolean; lane: LaneId };
  /** Fixed combat stats of non-champions, for the unit inspector: [ad, armor, mr, attack speed, move speed]. */
  stats?: [number, number, number, number, number];
}

/** Per-snapshot state of a visible entity. */
export interface EntityUpdate {
  id: EntityId;
  x: number;
  y: number;
  f: number;
  hp: number;
  mhp: number;
  mp: number;
  mmp: number;
  dead: boolean;
  tg: EntityId | null;
  rv: number;
  st: StatusEffect[];
  /** Combat stats (champions only — the HUD shows them). */
  stats?: [ad: number, ap: number, as: number, armor: number, mr: number, ms: number, ls: number, cdr: number, hpRegen: number];
  champ?: Omit<ChampionState, 'defId' | 'name' | 'isBot' | 'lane' | 'lastChampionAttacker' | 'aggroUntil' | 'recentAttackers'> & { aggroUntil: number };
}

export interface CampUpdate {
  id: string;
  up: boolean;
  spawnAt: number;
}

export interface Snapshot {
  time: number;
  winner: Team | null;
  spawns: EntitySpawn[];
  updates: EntityUpdate[];
  /** Entities that left the world (died for good) since the last snapshot. */
  removed: EntityId[];
  projectiles: Projectile[];
  zones: Zone[];
  camps: CampUpdate[];
  events: GameEvent[];
}

const r2 = (n: number): number => Math.round(n * 100) / 100;
/** JSON has no Infinity; "never" timestamps travel as -1. */
const finite = (n: number): number => (Number.isFinite(n) ? n : -1);

function spawnOf(e: Entity): EntitySpawn {
  const s: EntitySpawn = {
    id: e.id,
    kind: e.kind,
    team: e.team,
    radius: e.radius,
    sightRange: e.sightRange,
    ranged: e.ranged,
    attackRange: e.attackRange,
  };
  if (e.minion) s.minion = { type: e.minion.type, lane: e.minion.lane };
  if (e.monster) s.monster = { type: e.monster.type, campId: e.monster.campId, home: e.monster.home };
  if (e.structure) s.structure = { ...e.structure };
  if (e.ward) s.ward = { ...e.ward };
  if (e.champion) s.champion = { defId: e.champion.defId, name: e.champion.name, isBot: e.champion.isBot, lane: e.champion.lane };
  else s.stats = [e.attackDamage, e.armor, e.magicResist, e.attackSpeed, e.moveSpeed];
  return s;
}

function updateOf(e: Entity): EntityUpdate {
  const u: EntityUpdate = {
    id: e.id,
    x: r2(e.pos.x),
    y: r2(e.pos.y),
    f: r2(e.facing),
    hp: r2(e.hp),
    mhp: e.maxHp,
    mp: r2(e.mana),
    mmp: e.maxMana,
    dead: e.dead,
    tg: e.targetId,
    rv: finite(e.revealedUntil),
    st: e.statuses,
  };
  if (e.champion) {
    const c = e.champion;
    u.stats = [e.attackDamage, e.abilityPower, e.attackSpeed, e.armor, e.magicResist, e.moveSpeed, e.lifesteal, e.cooldownReduction, e.hpRegen];
    u.champ = {
      level: c.level,
      xp: c.xp,
      gold: c.gold,
      kills: c.kills,
      deaths: c.deaths,
      abilities: c.abilities,
      items: c.items,
      itemCharges: c.itemCharges,
      assists: c.assists,
      cs: c.cs,
      itemCooldowns: c.itemCooldowns,
      respawnTimer: c.respawnTimer,
      recallTimer: c.recallTimer,
      aggroUntil: finite(c.aggroUntil),
      dash: c.dash,
    };
  }
  return u;
}

/** Ids referenced by an event; it is only sent to teams that can see all of them. */
function eventSubjects(ev: GameEvent): EntityId[] {
  switch (ev.type) {
    case 'attack':
      return [ev.sourceId];
    case 'damage':
      return [ev.targetId];
    case 'cast':
    case 'blink':
    case 'nova':
    case 'buff':
    case 'levelUp':
    case 'recallStart':
    case 'recallCancel':
    case 'recallDone':
      return [ev.id];
    default:
      return [];
  }
}

/** Private events only go to the champion's own team. */
function eventIsPrivate(ev: GameEvent): EntityId | null {
  switch (ev.type) {
    case 'gold':
    case 'itemBought':
    case 'itemSold':
    case 'itemUsed':
    case 'blessingGained':
      return ev.id;
    case 'wardPlaced':
      return ev.ownerId;
    default:
      return null;
  }
}

/**
 * Builds the snapshot one team is allowed to see. `known` is the set of entity ids
 * this client has already been sent; it's updated in place.
 */
export function encodeSnapshot(world: World, team: Team, known: Set<EntityId>, events: GameEvent[]): Snapshot {
  const visible = world.vision[team];
  const spawns: EntitySpawn[] = [];
  const updates: EntityUpdate[] = [];
  for (const e of world.entities.values()) {
    if (!visible.has(e.id) && e.team !== team) continue;
    if (!known.has(e.id)) {
      known.add(e.id);
      spawns.push(spawnOf(e));
    }
    updates.push(updateOf(e));
  }
  const removed: EntityId[] = [];
  for (const id of known) {
    if (!world.entities.has(id)) {
      removed.push(id);
      known.delete(id);
    }
  }

  const teamOf = (id: EntityId): Faction | undefined => world.get(id)?.team;
  const filtered = events.filter((ev) => {
    const owner = eventIsPrivate(ev);
    if (owner !== null) return teamOf(owner) === team;
    return eventSubjects(ev).every((id) => !world.get(id) || visible.has(id) || teamOf(id) === team);
  });

  return {
    time: world.time,
    winner: world.winner,
    spawns,
    updates,
    removed,
    projectiles: world.projectiles.map((p) => ({ ...p, pos: { x: r2(p.pos.x), y: r2(p.pos.y) }, prevPos: { x: r2(p.prevPos.x), y: r2(p.prevPos.y) } })),
    zones: world.zones,
    camps: world.camps.map((c) => ({ id: c.def.id, up: c.monsterIds.length > 0, spawnAt: finite(c.spawnAt) })),
    events: filtered,
  };
}

/** Builds a blank entity from spawn data; the next update fills in live values. */
function entityFromSpawn(s: EntitySpawn): Entity {
  const e: Entity = {
    id: s.id,
    kind: s.kind,
    team: s.team,
    pos: { x: 0, y: 0 },
    prevPos: { x: 0, y: 0 },
    facing: 0,
    radius: s.radius,
    hp: 1,
    maxHp: 1,
    mana: 0,
    maxMana: 0,
    hpRegen: 0,
    manaRegen: 0,
    armor: 0,
    magicResist: 0,
    attackDamage: 0,
    abilityPower: 0,
    attackRange: s.attackRange,
    attackSpeed: 0,
    moveSpeed: 0,
    lifesteal: 0,
    cooldownReduction: 0,
    ranged: s.ranged,
    attackCooldown: 0,
    dead: false,
    order: { type: 'idle' },
    targetId: null,
    path: [],
    pathGoal: null,
    repathTimer: 0,
    statuses: [],
    lastDamagedAt: -Infinity,
    revealedUntil: -Infinity,
    sightRange: s.sightRange,
  };
  if (s.stats) [e.attackDamage, e.armor, e.magicResist, e.attackSpeed, e.moveSpeed] = s.stats;
  if (s.minion) e.minion = { ...s.minion, waypoints: [], waypointIndex: 0, thinkTimer: 0, chaseOrigin: null };
  if (s.monster) e.monster = { ...s.monster, leashing: false, chaseTime: 0 };
  if (s.structure) e.structure = { ...s.structure };
  if (s.ward) e.ward = { ...s.ward };
  if (s.champion) {
    e.champion = {
      ...s.champion,
      level: 1,
      xp: 0,
      gold: 0,
      kills: 0,
      deaths: 0,
      abilities: [],
      items: [],
      itemCharges: [],
      assists: 0,
      cs: 0,
      recentAttackers: [],
      itemCooldowns: {},
      respawnTimer: 0,
      recallTimer: 0,
      aggroUntil: -Infinity,
      lastChampionAttacker: null,
      dash: null,
    };
  }
  return e;
}

/**
 * Applies a snapshot to a client-side mirror World. Entities that drop out of
 * vision stay in the world (stale and hidden) until the server says they're gone.
 */
export function applySnapshot(world: World, snap: Snapshot, team: Team): void {
  world.time = snap.time;
  world.winner = snap.winner;
  const fresh = new Set<EntityId>();
  for (const s of snap.spawns) {
    world.entities.set(s.id, entityFromSpawn(s));
    fresh.add(s.id);
  }

  const visible = new Set<EntityId>();
  for (const u of snap.updates) {
    const e = world.entities.get(u.id);
    if (!e) continue;
    visible.add(u.id);
    // Interpolate from where we last saw it, unless it just appeared or teleported far.
    const jump = Math.hypot(u.x - e.pos.x, u.y - e.pos.y) > 12;
    e.prevPos = fresh.has(u.id) || jump ? { x: u.x, y: u.y } : { ...e.pos };
    e.pos = { x: u.x, y: u.y };
    e.facing = u.f;
    e.hp = u.hp;
    e.maxHp = u.mhp;
    e.mana = u.mp;
    e.maxMana = u.mmp;
    e.dead = u.dead;
    e.targetId = u.tg;
    e.revealedUntil = u.rv;
    e.statuses = u.st;
    if (u.stats) {
      [e.attackDamage, e.abilityPower, e.attackSpeed, e.armor, e.magicResist, e.moveSpeed, e.lifesteal, e.cooldownReduction, e.hpRegen] = u.stats;
    }
    if (u.champ && e.champion) Object.assign(e.champion, u.champ);
  }
  for (const id of snap.removed) world.entities.delete(id);
  // Fogged entities keep their last position but don't move.
  for (const e of world.entities.values()) if (!visible.has(e.id)) e.prevPos = { ...e.pos };

  world.vision = { blue: new Set(), red: new Set() };
  world.vision[team] = visible;

  const oldProjectiles = new Map(world.projectiles.map((p) => [p.id, p]));
  world.projectiles = snap.projectiles.map((p) => ({ ...p, prevPos: oldProjectiles.get(p.id)?.pos ?? p.pos }));
  world.zones = snap.zones;
  for (const cu of snap.camps) {
    const camp = world.camps.find((c) => c.def.id === cu.id);
    if (!camp) continue;
    camp.spawnAt = cu.spawnAt < 0 ? Infinity : cu.spawnAt;
    camp.monsterIds = cu.up ? [-1] : [];
  }
}

/** Checks a client command's shape before it reaches the simulation. */
export function sanitizeCommand(raw: unknown): ClientCommand | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  const vec = (v: unknown): Vec2 | null => {
    if (!v || typeof v !== 'object') return null;
    const { x, y } = v as Record<string, unknown>;
    return typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  };
  const int = (v: unknown, lo: number, hi: number): number | null =>
    typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : null;
  switch (c.type) {
    case 'move':
    case 'attackMove': {
      const target = vec(c.target);
      return target ? { type: c.type, target } : null;
    }
    case 'attack': {
      const targetId = int(c.targetId, 0, Number.MAX_SAFE_INTEGER);
      return targetId === null ? null : { type: 'attack', targetId };
    }
    case 'stop':
    case 'recall':
      return { type: c.type };
    case 'cast': {
      const slot = int(c.slot, 0, 3);
      const target = vec(c.target);
      return slot === null || !target ? null : { type: 'cast', slot: slot as 0 | 1 | 2 | 3, target };
    }
    case 'useItem': {
      const slot = int(c.slot, 0, 5);
      const target = vec(c.target);
      return slot === null || !target ? null : { type: 'useItem', slot, target };
    }
    case 'buy':
      return typeof c.itemId === 'string' ? { type: 'buy', itemId: c.itemId } : null;
    case 'sell': {
      const slot = int(c.slot, 0, 5);
      return slot === null ? null : { type: 'sell', slot };
    }
    default:
      return null;
  }
}
