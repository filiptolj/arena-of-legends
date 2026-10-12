import {
  FOUNTAIN_DPS,
  FOUNTAIN_HEAL_PCT,
  MINION_AGGRO_RANGE,
  MINION_LEASH,
  MINION_STATS,
  PASSIVE_GOLD_PER_SEC,
} from '../constants.js';
import { LANES, MAP, type Team, laneWaypoints, otherTeam } from '../map.js';
import { type Vec2, dist, normalize, sub } from '../math.js';
import type { Entity, MinionType } from '../types.js';
import type { World } from '../world.js';
import { applyDamage, canTarget, inAttackRange, performAttack } from './combat.js';
import { updateDash } from './abilities.js';
import { clearPath, faceToward, moveAlongPath } from './movement.js';
import { isStunned, tickStatuses } from './status.js';

const MINION_THINK_INTERVAL = 0.25;
const CHAMPION_ACQUIRE_BONUS = 3;

export function spawnWave(world: World): void {
  for (const team of ['blue', 'red'] as Team[]) {
    for (const lane of LANES) {
      const wps = laneWaypoints(team, lane);
      const dir = normalize(sub(wps[1], wps[0]));
      const side = { x: -dir.y, y: dir.x };
      const rows: [MinionType, number][] = [['melee', 8.5], ['caster', 6.5]];
      for (const [type, along] of rows) {
        for (const lateral of [-1.4, 0, 1.4]) {
          const pos = {
            x: wps[0].x + dir.x * along + side.x * lateral,
            y: wps[0].y + dir.y * along + side.y * lateral,
          };
          spawnMinion(world, team, lane, type, pos, wps);
        }
      }
    }
  }
  world.emit({ type: 'waveSpawned' });
}

function spawnMinion(world: World, team: Team, lane: (typeof LANES)[number], type: MinionType, pos: Vec2, waypoints: Vec2[]): void {
  const e = world.createEntity('minion', team, world.nav.nearestWalkable(pos), MINION_STATS[type]);
  e.order = { type: 'lane' };
  e.minion = {
    type,
    lane,
    waypoints,
    waypointIndex: 1,
    // Stagger thinking so a whole wave doesn't scan on the same tick.
    thinkTimer: (e.id % 8) * (MINION_THINK_INTERVAL / 8),
    chaseOrigin: null,
  };
}

/** Swing at the target if in range, otherwise walk toward it. */
export function attackOrChase(world: World, e: Entity, target: Entity, dt: number): void {
  if (inAttackRange(e, target)) {
    clearPath(e);
    faceToward(e, target.pos);
    if (e.attackCooldown <= 0) performAttack(world, e, target);
  } else {
    moveAlongPath(world, e, target.pos, dt);
  }
}

/** Nearest valid enemy within `range`. Champions count as slightly farther so units prefer minions. */
export function acquireTarget(world: World, e: Entity, range: number, champPenalty = CHAMPION_ACQUIRE_BONUS): Entity | null {
  let best: Entity | null = null;
  let bestScore = Infinity;
  for (const o of world.entities.values()) {
    if (!canTarget(world, e, o)) continue;
    const d = dist(e.pos, o.pos) - o.radius;
    if (d > range) continue;
    const score = d + (o.kind === 'champion' ? champPenalty : 0);
    if (score < bestScore) {
      bestScore = score;
      best = o;
    }
  }
  return best;
}

/** An enemy champion within range that recently attacked one of our champions. */
function findAggressor(world: World, e: Entity, range: number): Entity | null {
  for (const o of world.entities.values()) {
    if (o.kind !== 'champion' || !o.champion || o.champion.aggroUntil <= world.time) continue;
    if (!canTarget(world, e, o)) continue;
    if (dist(e.pos, o.pos) - o.radius <= range) return o;
  }
  return null;
}

export function updateMinion(world: World, e: Entity, dt: number): void {
  const m = e.minion!;
  tickStatuses(e, dt);
  if (isStunned(e)) return;
  m.thinkTimer -= dt;
  if (m.thinkTimer <= 0) {
    m.thinkTimer += MINION_THINK_INTERVAL;
    let target = world.get(e.targetId);
    const leashed = m.chaseOrigin !== null && dist(e.pos, m.chaseOrigin) > MINION_LEASH;
    if (!canTarget(world, e, target) || leashed) target = undefined;
    const aggressor = findAggressor(world, e, MINION_AGGRO_RANGE);
    if (aggressor && target?.kind !== 'champion') target = aggressor;
    if (!target) target = acquireTarget(world, e, MINION_AGGRO_RANGE) ?? undefined;
    if (target && target.id !== e.targetId) clearPath(e);
    e.targetId = target?.id ?? null;
    if (target && !m.chaseOrigin) m.chaseOrigin = { ...e.pos };
    if (!target) m.chaseOrigin = null;
  }

  const target = world.get(e.targetId);
  if (canTarget(world, e, target)) {
    attackOrChase(world, e, target, dt);
    return;
  }
  e.targetId = null;

  // Advance past waypoints we've already reached (or been pushed beyond).
  const wps = m.waypoints;
  while (m.waypointIndex < wps.length - 1) {
    const cur = wps[m.waypointIndex];
    const next = wps[m.waypointIndex + 1];
    if (dist(e.pos, cur) < 2.5 || dist(e.pos, next) < dist(cur, next)) m.waypointIndex++;
    else break;
  }
  moveAlongPath(world, e, wps[m.waypointIndex], dt);
}

export function updateTower(world: World, e: Entity): void {
  let target = world.get(e.targetId);
  if (!canTarget(world, e, target) || !inAttackRange(e, target)) target = undefined;

  const aggressor = findAggressor(world, e, e.attackRange);
  if (aggressor && target?.kind !== 'champion') target = aggressor;
  // Towers prefer minions over champions unless a champion is being aggressive.
  if (!target) target = acquireTarget(world, e, e.attackRange, 1000) ?? undefined;

  e.targetId = target?.id ?? null;
  if (target && e.attackCooldown <= 0) performAttack(world, e, target);
}

export function updateChampion(world: World, e: Entity, dt: number): void {
  const c = e.champion!;
  if (e.dead) {
    c.respawnTimer -= dt;
    if (c.respawnTimer <= 0) respawn(world, e);
    return;
  }

  for (const a of c.abilities) if (a.cooldown > 0) a.cooldown = Math.max(0, a.cooldown - dt);
  tickStatuses(e, dt);
  c.gold += PASSIVE_GOLD_PER_SEC * dt;

  let hpRegen = e.hpRegen;
  let manaRegen = e.manaRegen;
  const fountain = MAP.fountains[e.team];
  if (dist(e.pos, fountain) <= MAP.fountainRadius) {
    hpRegen += e.maxHp * FOUNTAIN_HEAL_PCT;
    manaRegen += e.maxMana * FOUNTAIN_HEAL_PCT;
  }
  e.hp = Math.min(e.maxHp, e.hp + hpRegen * dt);
  e.mana = Math.min(e.maxMana, e.mana + manaRegen * dt);

  if (dist(e.pos, MAP.fountains[otherTeam(e.team)]) <= MAP.fountainRadius) {
    // Source id 0 is "the environment" — no entity gets credit.
    applyDamage(world, 0, e, FOUNTAIN_DPS * dt, 'true');
    if (e.dead) return;
  }

  if (updateDash(world, e, dt)) return;
  if (isStunned(e)) {
    world.cancelRecall(e);
    return;
  }

  if (c.recallTimer > 0) {
    c.recallTimer -= dt;
    if (c.recallTimer <= 0) {
      c.recallTimer = 0;
      e.pos = { ...fountain };
      e.prevPos = { ...fountain };
      clearPath(e);
      world.emit({ type: 'recallDone', id: e.id });
    }
    return;
  }

  executeOrder(world, e, dt);
}

function executeOrder(world: World, e: Entity, dt: number): void {
  const order = e.order;
  switch (order.type) {
    case 'idle': {
      // Idle champions auto-attack anything already in range, but don't chase.
      let target = world.get(e.targetId);
      if (!canTarget(world, e, target) || !inAttackRange(e, target)) {
        target = acquireTarget(world, e, e.attackRange + e.radius, 0) ?? undefined;
      }
      e.targetId = target?.id ?? null;
      if (target && inAttackRange(e, target)) attackOrChase(world, e, target, dt);
      break;
    }
    case 'move':
      if (moveAlongPath(world, e, order.target, dt)) e.order = { type: 'idle' };
      break;
    case 'attack': {
      const target = world.get(order.targetId);
      if (!canTarget(world, e, target)) {
        e.order = { type: 'idle' };
        e.targetId = null;
        clearPath(e);
        break;
      }
      attackOrChase(world, e, target, dt);
      break;
    }
    case 'attackMove': {
      let target = world.get(e.targetId);
      if (!canTarget(world, e, target)) {
        target = acquireTarget(world, e, e.attackRange + 3, 0) ?? undefined;
        if (target) clearPath(e);
      }
      e.targetId = target?.id ?? null;
      if (target) attackOrChase(world, e, target, dt);
      else if (moveAlongPath(world, e, order.target, dt)) e.order = { type: 'idle' };
      break;
    }
    case 'lane':
      break;
  }
}

function respawn(world: World, e: Entity): void {
  const c = e.champion!;
  e.dead = false;
  e.hp = e.maxHp;
  e.mana = e.maxMana;
  e.pos = { ...MAP.fountains[e.team] };
  e.prevPos = { ...e.pos };
  e.order = { type: 'idle' };
  e.targetId = null;
  c.respawnTimer = 0;
  clearPath(e);
  world.emit({ type: 'respawn', id: e.id });
}
