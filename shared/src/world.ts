import { CHAMPIONS, type ChampionDef } from './champions.js';
import {
  DT,
  FIRST_WAVE_AT,
  NEXUS_STATS,
  RECALL_TIME,
  STARTING_GOLD,
  TOWER_STATS,
  type UnitStats,
  WAVE_INTERVAL,
} from './constants.js';
import { type LaneId, MAP, type Team } from './map.js';
import { type Vec2, dist } from './math.js';
import { NavGrid } from './navgrid.js';
import { buyItem, emptyInventory, sellItem } from './items.js';
import { BotController } from './ai/bot.js';
import { castAbility } from './systems/abilities.js';
import { updateProjectiles, updateZones } from './systems/combat.js';
import { clearPath, separateUnits } from './systems/movement.js';
import { spawnWave, updateChampion, updateMinion, updateTower } from './systems/units.js';
import type { Command, Entity, EntityId, EntityKind, GameEvent, Projectile, Zone } from './types.js';

export interface ChampionSpawn {
  team: Team;
  defId: string;
  name: string;
  lane: LaneId;
  isBot: boolean;
}

export interface WorldOptions {
  champions: ChampionSpawn[];
}

/** The authoritative game simulation. Advance it with `step()` at a fixed rate of TICK_RATE. */
export class World {
  time = 0;
  tickCount = 0;
  readonly nav = new NavGrid();
  readonly entities = new Map<EntityId, Entity>();
  projectiles: Projectile[] = [];
  zones: Zone[] = [];
  winner: Team | null = null;

  private events: GameEvent[] = [];
  private commands: Command[] = [];
  private nextId = 1;
  private waveTimer = FIRST_WAVE_AT;
  private readonly bots: BotController[] = [];

  constructor(opts: WorldOptions) {
    for (const s of MAP.structures) {
      const stats = s.kind === 'tower' ? TOWER_STATS : NEXUS_STATS;
      const e = this.createEntity(s.kind, s.team, s.pos, stats);
      e.structure = { lane: s.lane, tier: s.tier };
      this.nav.blockCircle(s.pos, stats.radius);
    }
    for (const c of opts.champions) {
      const e = this.spawnChampion(c);
      if (c.isBot) this.bots.push(new BotController(e.id));
    }
  }

  newId(): number {
    return this.nextId++;
  }

  emit(e: GameEvent): void {
    this.events.push(e);
  }

  /** Returns and clears the events produced since the last call. */
  drainEvents(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  issue(cmd: Command): void {
    this.commands.push(cmd);
  }

  get(id: EntityId | null | undefined): Entity | undefined {
    return id == null ? undefined : this.entities.get(id);
  }

  /** Living entities within `radius` of `pos` (measured to their edge). */
  unitsNear(pos: Vec2, radius: number, filter?: (e: Entity) => boolean): Entity[] {
    const out: Entity[] = [];
    for (const e of this.entities.values()) {
      if (e.dead) continue;
      if (dist(e.pos, pos) - e.radius > radius) continue;
      if (filter && !filter(e)) continue;
      out.push(e);
    }
    return out;
  }

  champions(): Entity[] {
    return [...this.entities.values()].filter((e) => e.kind === 'champion');
  }

  createEntity(kind: EntityKind, team: Team, pos: Vec2, stats: UnitStats): Entity {
    const e: Entity = {
      id: this.newId(),
      kind,
      team,
      pos: { ...pos },
      prevPos: { ...pos },
      facing: team === 'blue' ? Math.PI * 0.75 : -Math.PI * 0.25,
      radius: stats.radius,
      hp: stats.maxHp,
      maxHp: stats.maxHp,
      mana: stats.maxMana,
      maxMana: stats.maxMana,
      hpRegen: stats.hpRegen,
      manaRegen: stats.manaRegen,
      armor: stats.armor,
      magicResist: stats.magicResist,
      attackDamage: stats.attackDamage,
      abilityPower: 0,
      attackRange: stats.attackRange,
      attackSpeed: stats.attackSpeed,
      moveSpeed: stats.moveSpeed,
      lifesteal: 0,
      cooldownReduction: 0,
      ranged: stats.ranged,
      attackCooldown: 0,
      dead: false,
      order: { type: 'idle' },
      targetId: null,
      path: [],
      pathGoal: null,
      repathTimer: 0,
      statuses: [],
      lastDamagedAt: -Infinity,
    };
    this.entities.set(e.id, e);
    return e;
  }

  private spawnChampion(spawn: ChampionSpawn): Entity {
    const def: ChampionDef | undefined = CHAMPIONS[spawn.defId];
    if (!def) throw new Error(`Unknown champion: ${spawn.defId}`);
    const e = this.createEntity('champion', spawn.team, MAP.fountains[spawn.team], def.base);
    e.champion = {
      defId: def.id,
      name: spawn.name,
      isBot: spawn.isBot,
      lane: spawn.lane,
      level: 1,
      xp: 0,
      gold: STARTING_GOLD,
      kills: 0,
      deaths: 0,
      abilities: def.abilities.map(() => ({ cooldown: 0 })),
      items: emptyInventory(),
      respawnTimer: 0,
      recallTimer: 0,
      aggroUntil: -Infinity,
      lastChampionAttacker: null,
      dash: null,
    };
    return e;
  }

  step(): void {
    if (this.winner) return;
    this.time += DT;
    this.tickCount++;

    for (const e of this.entities.values()) e.prevPos = { ...e.pos };
    for (const p of this.projectiles) p.prevPos = { ...p.pos };

    for (const bot of this.bots) bot.update(this, DT);
    this.processCommands();

    this.waveTimer -= DT;
    if (this.waveTimer <= 0) {
      this.waveTimer += WAVE_INTERVAL;
      spawnWave(this);
    }

    for (const e of this.entities.values()) {
      if (e.attackCooldown > 0) e.attackCooldown -= DT;
      switch (e.kind) {
        case 'champion':
          updateChampion(this, e, DT);
          break;
        case 'minion':
          if (!e.dead) updateMinion(this, e, DT);
          break;
        case 'tower':
          if (!e.dead) updateTower(this, e);
          break;
        case 'nexus':
          break;
      }
    }

    separateUnits(this);
    updateProjectiles(this, DT);
    updateZones(this, DT);

    // Dead minions and structures leave the world; champions stay to respawn.
    for (const [id, e] of this.entities) {
      if (e.dead && e.kind !== 'champion') this.entities.delete(id);
    }
  }

  private processCommands(): void {
    const cmds = this.commands;
    this.commands = [];
    for (const cmd of cmds) {
      const e = this.get(cmd.unitId);
      if (!e || !e.champion) continue;
      // Shopping is the only thing the dead can do.
      if (cmd.type === 'buy') {
        if (buyItem(e, cmd.itemId)) this.emit({ type: 'itemBought', id: e.id, itemId: cmd.itemId });
        continue;
      }
      if (cmd.type === 'sell') {
        const itemId = e.champion.items[cmd.slot];
        const refund = sellItem(e, cmd.slot);
        if (itemId && refund > 0) this.emit({ type: 'itemSold', id: e.id, itemId, refund });
        continue;
      }
      if (e.dead) continue;
      const cancelsRecall = cmd.type !== 'recall' && cmd.type !== 'cast';
      if (cancelsRecall && e.champion.recallTimer > 0) this.cancelRecall(e);
      switch (cmd.type) {
        case 'move':
          e.order = { type: 'move', target: { ...cmd.target } };
          e.targetId = null;
          clearPath(e);
          break;
        case 'attack': {
          const t = this.get(cmd.targetId);
          if (t && !t.dead && t.team !== e.team) {
            e.order = { type: 'attack', targetId: t.id };
            e.targetId = t.id;
            clearPath(e);
          }
          break;
        }
        case 'attackMove':
          e.order = { type: 'attackMove', target: { ...cmd.target } };
          e.targetId = null;
          clearPath(e);
          break;
        case 'stop':
          e.order = { type: 'idle' };
          e.targetId = null;
          clearPath(e);
          break;
        case 'cast':
          if (castAbility(this, e, cmd.slot, cmd.target) && e.champion.recallTimer > 0) this.cancelRecall(e);
          break;
        case 'recall':
          if (e.champion.recallTimer <= 0) {
            e.champion.recallTimer = RECALL_TIME;
            e.order = { type: 'idle' };
            e.targetId = null;
            clearPath(e);
            this.emit({ type: 'recallStart', id: e.id });
          }
          break;
      }
    }
  }

  cancelRecall(e: Entity): void {
    if (e.champion && e.champion.recallTimer > 0) {
      e.champion.recallTimer = 0;
      this.emit({ type: 'recallCancel', id: e.id });
    }
  }
}
