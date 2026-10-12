import type { LaneId, Team } from './map.js';
import type { Vec2 } from './math.js';

export type EntityId = number;
export type EntityKind = 'champion' | 'minion' | 'tower' | 'nexus';
export type DamageKind = 'physical' | 'magic' | 'true';
export type AbilitySlot = 0 | 1 | 2 | 3;
export type MinionType = 'melee' | 'caster';
export type ItemId = string;

export const INVENTORY_SIZE = 6;

export type Order =
  | { type: 'idle' }
  | { type: 'move'; target: Vec2 }
  | { type: 'attack'; targetId: EntityId }
  | { type: 'attackMove'; target: Vec2 }
  | { type: 'lane' };

export type StatusEffect =
  | { type: 'slow'; amount: number; remaining: number }
  | { type: 'stun'; remaining: number }
  | { type: 'shield'; amount: number; remaining: number }
  | { type: 'buff'; remaining: number; attackSpeedPct: number; moveSpeedPct: number; armor: number };

export interface AbilityState {
  cooldown: number;
}

/** An in-progress dash: the unit slides toward `to`, hitting enemies it passes once. */
export interface DashState {
  to: Vec2;
  speed: number;
  abilityId: string;
  hitRadius: number;
  hitIds: EntityId[];
}

export interface ChampionState {
  defId: string;
  name: string;
  isBot: boolean;
  lane: LaneId;
  level: number;
  xp: number;
  gold: number;
  kills: number;
  deaths: number;
  abilities: AbilityState[];
  items: (ItemId | null)[];
  respawnTimer: number;
  /** Seconds left in the recall channel, or 0 if not recalling. */
  recallTimer: number;
  /** While > world time, towers and minions prioritize this champion (it attacked an enemy champion). */
  aggroUntil: number;
  /** Most recent enemy champion to damage this one, for kill credit when a tower or minion finishes it. */
  lastChampionAttacker: { id: EntityId; time: number } | null;
  dash: DashState | null;
}

export interface MinionState {
  type: MinionType;
  lane: LaneId;
  waypoints: Vec2[];
  waypointIndex: number;
  thinkTimer: number;
  /** Where the minion left its lane to chase, so it can give up if dragged too far. */
  chaseOrigin: Vec2 | null;
}

export interface StructureState {
  lane?: LaneId;
  tier?: number;
}

export interface Entity {
  id: EntityId;
  kind: EntityKind;
  team: Team;
  pos: Vec2;
  /** Position at the start of the current tick, for render interpolation. */
  prevPos: Vec2;
  facing: number;
  radius: number;

  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  hpRegen: number;
  manaRegen: number;
  armor: number;
  magicResist: number;
  attackDamage: number;
  abilityPower: number;
  attackRange: number;
  /** Attacks per second, before temporary buffs. */
  attackSpeed: number;
  moveSpeed: number;
  /** Fraction of auto-attack damage healed. */
  lifesteal: number;
  /** Fraction of ability cooldowns removed (capped). */
  cooldownReduction: number;
  ranged: boolean;

  attackCooldown: number;
  dead: boolean;
  order: Order;
  /** Current auto-attack target chosen by the order logic. */
  targetId: EntityId | null;
  path: Vec2[];
  pathGoal: Vec2 | null;
  repathTimer: number;
  statuses: StatusEffect[];
  lastDamagedAt: number;

  champion?: ChampionState;
  minion?: MinionState;
  structure?: StructureState;
}

export type ProjectileVisual = 'attack' | 'caster' | 'tower' | 'ability';

export interface OnHitStatus {
  type: 'slow' | 'stun';
  amount?: number;
  duration: number;
}

export interface Projectile {
  id: number;
  team: Team;
  sourceId: EntityId;
  visual: ProjectileVisual;
  /** For ability projectiles, which ability fired it (the client uses this for color/size). */
  abilityId?: string;
  pos: Vec2;
  prevPos: Vec2;
  speed: number;
  damage: number;
  damageKind: DamageKind;
  /** Auto-attacks apply lifesteal. */
  isAttack: boolean;
  /** Homing projectiles follow a target. */
  targetId?: EntityId;
  /** Skillshots fly in a direction and hit the first enemy unit (or every unit if piercing). */
  dir?: Vec2;
  width?: number;
  remainingRange?: number;
  pierce?: boolean;
  hitIds?: EntityId[];
  status?: OnHitStatus;
}

/** A delayed area effect (e.g. a meteor) that detonates when its timer runs out. */
export interface Zone {
  id: number;
  team: Team;
  sourceId: EntityId;
  abilityId: string;
  pos: Vec2;
  radius: number;
  delay: number;
  totalDelay: number;
  damage: number;
  damageKind: DamageKind;
  status?: OnHitStatus;
}

export type Command =
  | { type: 'move'; unitId: EntityId; target: Vec2 }
  | { type: 'attack'; unitId: EntityId; targetId: EntityId }
  | { type: 'attackMove'; unitId: EntityId; target: Vec2 }
  | { type: 'stop'; unitId: EntityId }
  | { type: 'cast'; unitId: EntityId; slot: AbilitySlot; target: Vec2 }
  | { type: 'recall'; unitId: EntityId }
  | { type: 'buy'; unitId: EntityId; itemId: ItemId }
  | { type: 'sell'; unitId: EntityId; slot: number };

export type GameEvent =
  | { type: 'attack'; sourceId: EntityId; targetId: EntityId }
  | { type: 'damage'; sourceId: EntityId; targetId: EntityId; amount: number; kind: DamageKind }
  | { type: 'death'; id: EntityId; killerId: EntityId | null; pos: Vec2 }
  | { type: 'championKill'; killerId: EntityId | null; victimId: EntityId }
  | { type: 'gold'; id: EntityId; amount: number; pos: Vec2 }
  | { type: 'levelUp'; id: EntityId; level: number }
  | { type: 'cast'; id: EntityId; slot: AbilitySlot; abilityId: string; pos: Vec2; target: Vec2 }
  | { type: 'blink'; id: EntityId; abilityId: string; from: Vec2; to: Vec2 }
  | { type: 'nova'; id: EntityId; abilityId: string; pos: Vec2; radius: number }
  | { type: 'buff'; id: EntityId; abilityId: string }
  | { type: 'zoneExplode'; abilityId: string; pos: Vec2; radius: number; team: Team }
  | { type: 'projectileHit'; visual: ProjectileVisual; abilityId?: string; team: Team; pos: Vec2 }
  | { type: 'respawn'; id: EntityId }
  | { type: 'recallStart' | 'recallCancel' | 'recallDone'; id: EntityId }
  | { type: 'itemBought'; id: EntityId; itemId: ItemId }
  | { type: 'itemSold'; id: EntityId; itemId: ItemId; refund: number }
  | { type: 'structureDestroyed'; id: EntityId; kind: EntityKind; team: Team }
  | { type: 'waveSpawned' }
  | { type: 'gameOver'; winner: Team };
