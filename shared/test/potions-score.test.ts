import { describe, expect, it } from 'vitest';
import { TICK_RATE, World, type ChampionSpawn } from '../src/index.js';

const run = (world: World, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) world.step();
};

const make = (champions: ChampionSpawn[]) => new World({ champions });
const blue = (defId = 'warden', lane: 'top' | 'mid' | 'bot' = 'mid'): ChampionSpawn => ({ team: 'blue', defId, name: defId, lane, isBot: false });
const red = (defId = 'arcanist'): ChampionSpawn => ({ team: 'red', defId, name: defId, lane: 'mid', isBot: false });

describe('potions', () => {
  it('stack in one slot, heal over time and sell one at a time', () => {
    const w = make([blue()]);
    const me = w.champions()[0];
    const c = me.champion!;
    for (let i = 0; i < 3; i++) w.issue({ type: 'buy', unitId: me.id, itemId: 'healthPotion' });
    w.step();
    const slot = c.items.indexOf('healthPotion');
    expect(c.items.filter((it) => it === 'healthPotion')).toHaveLength(1);
    expect(c.itemCharges[slot]).toBe(3);
    expect(c.gold).toBeCloseTo(500 - 150, 0); // plus a tick of passive gold

    // Drink one away from the fountain: +150 hp over 15s.
    me.pos = { x: 100, y: 100 };
    me.hp = 200;
    w.issue({ type: 'useItem', unitId: me.id, slot, target: me.pos });
    w.step();
    expect(c.itemCharges[slot]).toBe(2);
    const regen = me.hpRegen;
    run(w, 15);
    expect(me.hp).toBeGreaterThan(200 + 150 + regen * 14);

    // Back in base, selling refunds one potion.
    me.pos = { x: 14, y: 186 };
    const gold = c.gold;
    w.issue({ type: 'sell', unitId: me.id, slot });
    w.step();
    expect(c.itemCharges[slot]).toBe(1);
    expect(c.gold).toBeGreaterThan(gold + 34);
  });

  it('caps a stack at 5', () => {
    const w = make([blue()]);
    const me = w.champions()[0];
    me.champion!.gold = 10_000;
    for (let i = 0; i < 8; i++) w.issue({ type: 'buy', unitId: me.id, itemId: 'healthPotion' });
    w.step();
    const c = me.champion!;
    const counts = c.items.map((it, i) => (it === 'healthPotion' ? c.itemCharges[i] : 0)).filter(Boolean);
    expect(counts).toEqual([5, 3]);
  });
});

describe('score', () => {
  it('counts creep score for last hits', () => {
    const w = make([blue()]);
    const me = w.champions()[0];
    run(w, 25);
    const minion = [...w.entities.values()].find((e) => e.kind === 'minion' && e.team === 'red')!;
    me.pos = { x: minion.pos.x + 1.5, y: minion.pos.y };
    minion.hp = 1;
    run(w, 0.2);
    w.issue({ type: 'attack', unitId: me.id, targetId: minion.id });
    run(w, 2);
    expect(me.champion!.cs).toBeGreaterThanOrEqual(1);
  });

  it('gives assists to everyone who helped', () => {
    const w = make([blue('warden', 'top'), blue('valor', 'mid'), red('arcanist')]);
    const [a, b, victim] = w.champions();
    for (const e of [a, b, victim]) e.pos = { x: 100, y: 100 };
    a.pos = { x: 98.5, y: 100 };
    b.pos = { x: 101.5, y: 100 };
    run(w, 0.2);
    w.issue({ type: 'attack', unitId: a.id, targetId: victim.id });
    w.issue({ type: 'attack', unitId: b.id, targetId: victim.id });
    run(w, 1.5);
    victim.hp = 1;
    run(w, 3);
    expect(victim.dead).toBe(true);
    expect(a.champion!.kills + b.champion!.kills).toBe(1);
    expect(a.champion!.assists + b.champion!.assists).toBe(1);
  });
});
