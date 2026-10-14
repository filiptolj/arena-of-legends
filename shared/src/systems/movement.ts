import { type Vec2, dist, moveToward } from '../math.js';
import type { Entity } from '../types.js';
import type { World } from '../world.js';
import { isRooted, moveSpeedOf } from './status.js';

const REPATH_INTERVAL = 0.3;
const GOAL_DRIFT = 1;

export function clearPath(e: Entity): void {
  e.path = [];
  e.pathGoal = null;
  e.repathTimer = 0;
}


export function faceToward(e: Entity, p: Vec2): void {
  const dx = p.x - e.pos.x;
  const dy = p.y - e.pos.y;
  if (dx * dx + dy * dy > 1e-6) e.facing = Math.atan2(dx, dy);
}

/**
 * Walks `e` toward `goal` along a cached A* path, repathing when the goal drifts.
 * Returns true once the path is exhausted (arrived or unreachable).
 */
export function moveAlongPath(world: World, e: Entity, goal: Vec2, dt: number): boolean {
  if (isRooted(e)) return false;
  e.repathTimer -= dt;
  const needsPath =
    e.pathGoal === null || (dist(e.pathGoal, goal) > GOAL_DRIFT && (e.repathTimer <= 0 || e.path.length === 0));
  if (needsPath) {
    e.path = world.nav.findPath(e.pos, goal) ?? [];
    e.pathGoal = { ...goal };
    e.repathTimer = REPATH_INTERVAL;
  }

  let remaining = moveSpeedOf(e) * dt;
  while (remaining > 1e-6 && e.path.length > 0) {
    const next = e.path[0];
    faceToward(e, next);
    const d = dist(e.pos, next);
    if (d <= remaining) {
      e.pos = { ...next };
      remaining -= d;
      e.path.shift();
    } else {
      e.pos = moveToward(e.pos, next, remaining);
      remaining = 0;
    }
  }
  return e.path.length === 0;
}

/** Soft collision: pushes overlapping mobile units apart without shoving them into walls. */
export function separateUnits(world: World): void {
  const units: Entity[] = [];
  for (const e of world.entities.values()) {
    if (!e.dead && (e.kind === 'champion' || e.kind === 'minion')) units.push(e);
  }
  for (let i = 0; i < units.length; i++) {
    const a = units[i];
    for (let j = i + 1; j < units.length; j++) {
      const b = units[j];
      const minD = (a.radius + b.radius) * 0.9;
      let dx = b.pos.x - a.pos.x;
      let dy = b.pos.y - a.pos.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= minD * minD) continue;
      let d = Math.sqrt(d2);
      if (d < 1e-4) {
        // Deterministic nudge for perfectly stacked units.
        dx = Math.cos(a.id + b.id);
        dy = Math.sin(a.id + b.id);
        d = 1;
      }
      const overlap = (minD - d) * 0.5;
      const nx = dx / d;
      const ny = dy / d;
      // Champions are heavier than minions so they can't be body-blocked into walls by a wave.
      const wa = a.kind === 'champion' ? 0.3 : 1;
      const wb = b.kind === 'champion' ? 0.3 : 1;
      const total = wa + wb;
      const pa = { x: a.pos.x - nx * overlap * (wa / total) * 2, y: a.pos.y - ny * overlap * (wa / total) * 2 };
      const pb = { x: b.pos.x + nx * overlap * (wb / total) * 2, y: b.pos.y + ny * overlap * (wb / total) * 2 };
      if (world.nav.isWalkable(pa)) a.pos = pa;
      if (world.nav.isWalkable(pb)) b.pos = pb;
    }
  }
}
