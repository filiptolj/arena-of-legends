import { MAP, type Team } from '../map.js';
import { type Vec2, pointInPolygon } from '../math.js';
import type { Entity, Faction } from '../types.js';
import type { World } from '../world.js';

const brushBounds = MAP.brushes.map((poly) => ({
  x0: Math.min(...poly.map((p) => p.x)),
  x1: Math.max(...poly.map((p) => p.x)),
  y0: Math.min(...poly.map((p) => p.y)),
  y1: Math.max(...poly.map((p) => p.y)),
}));

/** Index of the brush containing `p`, or -1. */
export function brushAt(p: Vec2): number {
  for (let i = 0; i < MAP.brushes.length; i++) {
    const b = brushBounds[i];
    if (p.x < b.x0 || p.x > b.x1 || p.y < b.y0 || p.y > b.y1) continue;
    if (pointInPolygon(p, MAP.brushes[i])) return i;
  }
  return -1;
}

/** Vision is recomputed every few ticks rather than every tick. */
export const VISION_INTERVAL_TICKS = 3;

/**
 * Which enemy entities each team can currently see.
 *
 * An entity is visible to a team if it's within sight range of one of that team's units
 * and either outside brush, revealed (it attacked or cast recently), or sharing a brush
 * with one of the team's units. Structures are always visible.
 */
export function computeVision(world: World): Record<Team, Set<number>> {
  const out: Record<Team, Set<number>> = { blue: new Set(), red: new Set() };
  const viewers: Record<Team, Entity[]> = { blue: [], red: [] };
  const brushOf = new Map<number, number>();
  // Brushes each team has a unit standing in.
  const occupied: Record<Team, Set<number>> = { blue: new Set(), red: new Set() };

  for (const e of world.entities.values()) {
    if (e.dead) continue;
    const b = brushAt(e.pos);
    brushOf.set(e.id, b);
    if (e.team === 'neutral') continue;
    if (e.sightRange > 0) viewers[e.team].push(e);
    if (b >= 0) occupied[e.team].add(b);
  }

  for (const team of ['blue', 'red'] as Team[]) {
    const seen = out[team];
    for (const e of world.entities.values()) {
      if (e.dead) continue;
      if (e.team === team || e.kind === 'tower' || e.kind === 'nexus') {
        seen.add(e.id);
        continue;
      }
      const b = brushOf.get(e.id) ?? -1;
      if (b >= 0 && e.revealedUntil <= world.time && !occupied[team].has(b)) continue;
      for (const v of viewers[team]) {
        const r = v.sightRange + e.radius;
        const dx = v.pos.x - e.pos.x;
        const dy = v.pos.y - e.pos.y;
        if (dx * dx + dy * dy <= r * r) {
          seen.add(e.id);
          break;
        }
      }
    }
  }
  return out;
}

export function isVisibleTo(world: World, viewer: Faction, e: Entity): boolean {
  if (viewer === 'neutral') return true;
  return world.vision[viewer].has(e.id);
}
