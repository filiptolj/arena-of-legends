import { describe, expect, it } from 'vitest';
import { INHIBITOR_RESPAWN, TICK_RATE, World, isInvulnerable, type Entity, type LaneId } from '../src/index.js';

const run = (world: World, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) world.step();
};

const structures = (w: World) => [...w.entities.values()].filter((e) => e.structure || e.kind === 'nexus');
const tower = (w: World, team: string, lane: LaneId | undefined, tier: number) =>
  structures(w).filter((e) => e.kind === 'tower' && e.team === team && e.structure?.lane === lane && e.structure?.tier === tier);
const inhib = (w: World, team: string, lane: LaneId) =>
  structures(w).find((e) => e.kind === 'inhibitor' && e.team === team && e.structure?.lane === lane)!;
const nexus = (w: World, team: string) => structures(w).find((e) => e.kind === 'nexus' && e.team === team)!;

/** Marks a structure destroyed (skipping combat) and advances a tick. */
function destroy(w: World, e: Entity): void {
  e.hp = 0;
  e.dead = true;
  if (e.kind === 'inhibitor') {
    e.structure!.respawnAt = w.time + INHIBITOR_RESPAWN;
    w.nav.unblockCircle(e.pos, e.radius);
  }
  w.step();
}

describe('base structures', () => {
  it('fall in League order: towers → inhibitor → nexus turrets → nexus', () => {
    const w = new World({ champions: [] });
    const lane: LaneId = 'mid';
    const [t1] = tower(w, 'red', lane, 1);
    const [t2] = tower(w, 'red', lane, 2);
    const [t3] = tower(w, 'red', lane, 3);
    const nexusTurrets = tower(w, 'red', undefined, 4);
    expect(nexusTurrets).toHaveLength(2);

    expect(isInvulnerable(w, t1)).toBe(false);
    expect(isInvulnerable(w, t2)).toBe(true);
    destroy(w, t1);
    expect(isInvulnerable(w, t2)).toBe(false);
    expect(isInvulnerable(w, t3)).toBe(true);
    destroy(w, t2);
    expect(isInvulnerable(w, t3)).toBe(false);
    expect(isInvulnerable(w, inhib(w, 'red', lane))).toBe(true);
    destroy(w, t3);
    expect(isInvulnerable(w, inhib(w, 'red', lane))).toBe(false);
    expect(isInvulnerable(w, nexusTurrets[0])).toBe(true);
    destroy(w, inhib(w, 'red', lane));
    expect(isInvulnerable(w, nexusTurrets[0])).toBe(false);
    expect(isInvulnerable(w, nexus(w, 'red'))).toBe(true);
    destroy(w, nexusTurrets[0]);
    expect(isInvulnerable(w, nexus(w, 'red'))).toBe(true);
    destroy(w, nexusTurrets[1]);
    expect(isInvulnerable(w, nexus(w, 'red'))).toBe(false);
  });

  it('a downed inhibitor sends super minions, then rebuilds itself', () => {
    const w = new World({ champions: [] });
    const target = inhib(w, 'red', 'bot');
    for (const t of tower(w, 'red', 'bot', 1).concat(tower(w, 'red', 'bot', 2), tower(w, 'red', 'bot', 3))) destroy(w, t);
    destroy(w, target);
    expect(w.get(target.id)?.dead).toBe(true);

    run(w, 31); // at least one wave
    const supers = [...w.entities.values()].filter((e) => e.minion?.type === 'super');
    expect(supers.length).toBeGreaterThan(0);
    expect(supers.every((m) => m.team === 'blue' && m.minion!.lane === 'bot')).toBe(true);

    let rebuilt = false;
    for (let i = 0; i < (INHIBITOR_RESPAWN + 2) * TICK_RATE && !rebuilt; i++) {
      w.step();
      rebuilt = w.drainEvents().some((e) => e.type === 'inhibitorRespawned' && e.id === target.id);
    }
    expect(rebuilt).toBe(true);
    expect(target.dead).toBe(false);
    expect(target.hp).toBe(target.maxHp);
  }, 60_000);
});
