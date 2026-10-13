import { CAMP_SPECS, type CampSpec, MONSTERS, MONSTER_LEASH, MONSTER_MAX_CHASE, SIGHT_RANGE } from '../constants.js';
import { type CampDef, MAP } from '../map.js';
import { dist } from '../math.js';
import type { Entity, EntityId } from '../types.js';
import type { World } from '../world.js';
import { clearPath, moveAlongPath } from './movement.js';
import { isStunned, tickStatuses } from './status.js';
import { attackOrChase } from './units.js';

export interface CampState {
  def: CampDef;
  /** World time when the camp (re)spawns; Infinity while monsters are alive. */
  spawnAt: number;
  monsterIds: EntityId[];
}

const specOf = (camp: CampDef): CampSpec => CAMP_SPECS[camp.type];

export function createCamps(): CampState[] {
  return MAP.camps.map((def) => ({ def, spawnAt: specOf(def).firstSpawn, monsterIds: [] }));
}

function spawnCamp(world: World, camp: CampState): void {
  camp.spawnAt = Infinity;
  camp.monsterIds = [];
  for (const m of specOf(camp.def).monsters) {
    const def = MONSTERS[m.type];
    const pos = world.nav.nearestWalkable({ x: camp.def.pos.x + m.offset.x, y: camp.def.pos.y + m.offset.y });
    const e = world.createEntity('monster', 'neutral', pos, def);
    e.sightRange = SIGHT_RANGE.monster;
    e.monster = { campId: camp.def.id, type: m.type, home: { ...pos }, leashing: false, chaseTime: 0 };
    camp.monsterIds.push(e.id);
  }
}

/** Spawns camps whose timers are up and starts respawn timers for cleared camps. */
export function updateCamps(world: World): void {
  for (const camp of world.camps) {
    if (camp.monsterIds.length > 0) {
      camp.monsterIds = camp.monsterIds.filter((id) => {
        const e = world.get(id);
        return !!e && !e.dead;
      });
      if (camp.monsterIds.length === 0) camp.spawnAt = world.time + specOf(camp.def).respawn;
    } else if (world.time >= camp.spawnAt) {
      spawnCamp(world, camp);
    }
  }
}

/** The whole camp turns on whoever hits one of its monsters. */
export function onMonsterDamaged(world: World, monster: Entity, source: Entity): void {
  if (source.team === 'neutral' || monster.dead) return;
  const camp = world.camps.find((c) => c.def.id === monster.monster!.campId);
  for (const id of camp?.monsterIds ?? [monster.id]) {
    const m = world.get(id);
    if (!m?.monster || m.dead || m.monster.leashing) continue;
    if (m.targetId === null) {
      m.targetId = source.id;
      m.monster.chaseTime = 0;
      clearPath(m);
    }
  }
}

export function updateMonster(world: World, e: Entity, dt: number): void {
  const m = e.monster!;
  tickStatuses(e, dt);

  if (m.leashing) {
    // Regenerate quickly while walking home; reset fully on arrival.
    e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.2 * dt);
    if (moveAlongPath(world, e, m.home, dt) || dist(e.pos, m.home) < 0.5) {
      m.leashing = false;
      e.hp = e.maxHp;
      e.statuses = [];
    }
    return;
  }
  if (isStunned(e)) return;

  const target = world.get(e.targetId);
  if (!target || target.dead || target.team === 'neutral') {
    e.targetId = null;
    if (dist(e.pos, m.home) > 0.5) moveAlongPath(world, e, m.home, dt);
    else e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.05 * dt);
    return;
  }

  m.chaseTime += dt;
  const pulledAway = dist(e.pos, m.home) > MONSTER_LEASH || dist(target.pos, m.home) > MONSTER_LEASH + 3;
  const inRange = dist(e.pos, target.pos) - e.radius - target.radius <= e.attackRange;
  if (pulledAway || (!inRange && m.chaseTime > MONSTER_MAX_CHASE)) {
    m.leashing = true;
    e.targetId = null;
    clearPath(e);
    return;
  }
  if (inRange) m.chaseTime = 0;
  attackOrChase(world, e, target, dt);
}
