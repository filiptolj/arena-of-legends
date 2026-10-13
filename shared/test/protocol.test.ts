import { describe, expect, it } from 'vitest';
import {
  type EntityId,
  type GameEvent,
  type Snapshot,
  TICK_RATE,
  World,
  applySnapshot,
  encodeSnapshot,
  sanitizeCommand,
} from '../src/index.js';

const makeWorld = () =>
  new World({
    champions: [
      { team: 'blue', defId: 'warden', name: 'B', lane: 'mid', isBot: false },
      { team: 'red', defId: 'ranger', name: 'R', lane: 'mid', isBot: false },
    ],
  });

/** Encodes for `team`, sends through JSON like the real socket, and applies to a mirror. */
function sync(server: World, mirror: World, known: Set<EntityId>, events: GameEvent[] = []): Snapshot {
  const snap = JSON.parse(JSON.stringify(encodeSnapshot(server, 'blue', known, events))) as Snapshot;
  applySnapshot(mirror, snap, 'blue');
  return snap;
}

describe('network protocol', () => {
  it('never sends enemies hidden by fog', () => {
    const server = makeWorld();
    const [blue, red] = server.champions();
    blue.pos = { x: 40, y: 160 };
    red.pos = { x: 160, y: 40 };
    for (let i = 0; i < 3; i++) server.step();
    const snap = encodeSnapshot(server, 'blue', new Set(), []);
    const ids = snap.updates.map((u) => u.id);
    expect(ids).toContain(blue.id);
    expect(ids).not.toContain(red.id);
    // Enemy towers are always visible.
    expect(snap.spawns.some((s) => s.kind === 'tower' && s.team === 'red')).toBe(true);
  });

  it('mirrors the visible world through JSON and tracks removals', () => {
    const server = makeWorld();
    const mirror = new World({ champions: [] });
    mirror.entities.clear();
    const known = new Set<EntityId>();
    for (let i = 0; i < 10 * TICK_RATE; i++) server.step();
    sync(server, mirror, known);

    const blue = server.champions()[0];
    const copy = mirror.get(blue.id)!;
    expect(copy.pos).toEqual({ x: Math.round(blue.pos.x * 100) / 100, y: Math.round(blue.pos.y * 100) / 100 });
    expect(copy.champion?.defId).toBe('warden');
    expect(copy.champion?.items).toEqual(blue.champion!.items);
    expect(mirror.vision.blue.has(blue.id)).toBe(true);

    // Kill a visible blue minion and check the mirror drops it.
    const minion = [...server.entities.values()].find((e) => e.kind === 'minion' && e.team === 'blue')!;
    expect(mirror.get(minion.id)).toBeDefined();
    minion.hp = -1;
    minion.dead = true;
    server.step();
    sync(server, mirror, known);
    expect(mirror.get(minion.id)).toBeUndefined();
  });

  it("keeps the other team's private events private", () => {
    const server = makeWorld();
    const [blue, red] = server.champions();
    const events: GameEvent[] = [
      { type: 'gold', id: red.id, amount: 300, pos: red.pos },
      { type: 'gold', id: blue.id, amount: 20, pos: blue.pos },
      { type: 'itemBought', id: red.id, itemId: 'boots' },
      { type: 'gameOver', winner: 'blue' },
    ];
    const snap = encodeSnapshot(server, 'blue', new Set(), events);
    expect(snap.events.map((e) => e.type)).toEqual(['gold', 'gameOver']);
    expect((snap.events[0] as { id: number }).id).toBe(blue.id);
  });

  it('rejects malformed commands', () => {
    expect(sanitizeCommand({ type: 'move', target: { x: 10, y: 20 } })).toEqual({ type: 'move', target: { x: 10, y: 20 } });
    expect(sanitizeCommand({ type: 'move', target: { x: 'a', y: 2 } })).toBeNull();
    expect(sanitizeCommand({ type: 'cast', slot: 9, target: { x: 1, y: 1 } })).toBeNull();
    expect(sanitizeCommand({ type: 'cast', slot: 2, target: { x: 1, y: 1 }, unitId: 99 })).toEqual({ type: 'cast', slot: 2, target: { x: 1, y: 1 } });
    expect(sanitizeCommand({ type: 'teleportToWin' })).toBeNull();
    expect(sanitizeCommand(null)).toBeNull();
  });
});
