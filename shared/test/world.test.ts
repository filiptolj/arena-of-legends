/// <reference lib="dom" />
import { describe, expect, it } from 'vitest';
import { CHAMPION_IDS, ITEMS, MAP, TICK_RATE, World, dist, purchasePrice, type AbilitySlot, type ChampionSpawn, type GameEvent } from '../src/index.js';

const run = (world: World, seconds: number, onEvent?: (e: GameEvent) => void) => {
  for (let i = 0; i < seconds * TICK_RATE; i++) {
    world.step();
    for (const e of world.drainEvents()) onEvent?.(e);
    if (world.winner) break;
  }
};

const solo: ChampionSpawn[] = [{ team: 'blue', defId: 'arcanist', name: 'P', lane: 'mid', isBot: false }];

describe('World', () => {
  it('spawns 12 towers and 2 nexuses', () => {
    const w = new World({ champions: [] });
    const kinds = [...w.entities.values()].map((e) => e.kind);
    expect(kinds.filter((k) => k === 'tower')).toHaveLength(12);
    expect(kinds.filter((k) => k === 'nexus')).toHaveLength(2);
  });

  it('spawns minion waves that meet and fight', () => {
    const w = new World({ champions: [] });
    let damage = 0;
    run(w, 30, (e) => {
      if (e.type === 'damage') damage++;
    });
    const minions = [...w.entities.values()].filter((e) => e.kind === 'minion');
    expect(minions.length).toBeGreaterThan(0);
    expect(damage).toBeGreaterThan(0);
  });

  it('moves a champion to a clicked point', () => {
    const w = new World({ champions: solo });
    const champ = w.champions()[0];
    const target = { x: 40, y: 150 };
    w.issue({ type: 'move', unitId: champ.id, target });
    run(w, 10);
    expect(dist(champ.pos, target)).toBeLessThan(0.5);
  });

  it('casts abilities with cooldown and mana cost', () => {
    const w = new World({ champions: solo });
    const champ = w.champions()[0];
    const mana = champ.mana;
    w.issue({ type: 'cast', unitId: champ.id, slot: 0, target: { x: 100, y: 100 } });
    w.step();
    expect(champ.mana).toBeLessThan(mana);
    expect(champ.champion!.abilities[0].cooldown).toBeGreaterThan(0);
    expect(w.projectiles.some((p) => p.visual === 'ability')).toBe(true);
    // Meteor is locked until level 6.
    w.issue({ type: 'cast', unitId: champ.id, slot: 3, target: { x: 30, y: 170 } });
    w.step();
    expect(w.zones).toHaveLength(0);
  });

  it('kills an enemy champion in the enemy fountain', () => {
    const w = new World({ champions: solo });
    const champ = w.champions()[0];
    champ.pos = { ...MAP.fountains.red };
    run(w, 3);
    expect(champ.dead).toBe(true);
  });

  it('buys items in base, discounts owned components and refunds on sell', () => {
    const w = new World({ champions: solo });
    const champ = w.champions()[0];
    const c = champ.champion!;
    const ad = champ.attackDamage;
    w.issue({ type: 'buy', unitId: champ.id, itemId: 'ironBlade' });
    w.step();
    expect(c.items).toContain('ironBlade');
    expect(champ.attackDamage).toBe(ad + 10);
    expect(c.gold).toBeLessThan(500 - 349);

    // Vampiric Blade costs 900 total but only 550 more with an Iron Blade owned.
    expect(purchasePrice('vampiricBlade', c.items).cost).toBe(550);
    c.gold = 550;
    w.issue({ type: 'buy', unitId: champ.id, itemId: 'vampiricBlade' });
    w.step();
    expect(c.items.filter(Boolean)).toEqual(['vampiricBlade']);
    expect(champ.lifesteal).toBeCloseTo(0.1);

    const gold = c.gold;
    w.issue({ type: 'sell', unitId: champ.id, slot: c.items.indexOf('vampiricBlade') });
    w.step();
    expect(c.gold).toBeCloseTo(gold + Math.floor(ITEMS.vampiricBlade.cost * 0.7), 0);
    expect(champ.lifesteal).toBe(0);
  });

  it('refuses purchases outside the base', () => {
    const w = new World({ champions: solo });
    const champ = w.champions()[0];
    champ.pos = { x: 100, y: 100 };
    w.issue({ type: 'buy', unitId: champ.id, itemId: 'ironBlade' });
    w.step();
    expect(champ.champion!.items.filter(Boolean)).toHaveLength(0);
  });

  it.each(CHAMPION_IDS)('%s can cast every ability', (defId) => {
    const w = new World({
      champions: [
        { team: 'blue', defId, name: 'P', lane: 'mid', isBot: false },
        { team: 'red', defId: 'warden', name: 'Dummy', lane: 'mid', isBot: false },
      ],
    });
    const [me, dummy] = w.champions();
    me.pos = { x: 100, y: 100 };
    dummy.pos = { x: 103, y: 100 };
    me.champion!.level = 6;
    let casts = 0;
    let damage = 0;
    for (const slot of [0, 1, 2, 3] as AbilitySlot[]) {
      me.mana = me.maxMana;
      w.issue({ type: 'cast', unitId: me.id, slot, target: { ...dummy.pos } });
      run(w, 1.5, (e) => {
        if (e.type === 'cast') casts++;
        if (e.type === 'damage' && e.sourceId === me.id) damage++;
      });
    }
    expect(casts).toBe(4);
    expect(damage).toBeGreaterThan(0);
  });

  it('stuns stop movement', () => {
    const w = new World({
      champions: [
        { team: 'blue', defId: 'warden', name: 'P', lane: 'mid', isBot: false },
        { team: 'red', defId: 'arcanist', name: 'E', lane: 'mid', isBot: false },
      ],
    });
    const [warden, enemy] = w.champions();
    warden.pos = { x: 100, y: 100 };
    enemy.pos = { x: 102, y: 100 };
    w.issue({ type: 'cast', unitId: warden.id, slot: 0, target: enemy.pos });
    w.step();
    const before = { ...enemy.pos };
    w.issue({ type: 'move', unitId: enemy.id, target: { x: 120, y: 100 } });
    run(w, 0.5);
    expect(dist(enemy.pos, before)).toBeLessThan(0.01);
  });

  it('plays a full bot-vs-bot game without crashing and makes progress', () => {
    const champions: ChampionSpawn[] = [];
    for (const team of ['blue', 'red'] as const) {
      for (const lane of ['top', 'mid', 'bot'] as const) {
        champions.push({ team, defId: CHAMPION_IDS[champions.length % CHAMPION_IDS.length], name: `${team}-${lane}`, lane, isBot: true });
      }
    }
    const w = new World({ champions });
    let towersDown = 0;
    let kills = 0;
    const start = performance.now();
    run(w, 60 * 15, (e) => {
      if (e.type === 'structureDestroyed') towersDown++;
      if (e.type === 'championKill') kills++;
    });
    const elapsed = performance.now() - start;
    const levels = w.champions().map((c) => c.champion!.level);
    const items = w.champions().map((c) => `${c.champion!.defId}: ${c.champion!.items.filter(Boolean).join(',')}`);
    console.log({ simSeconds: Math.round(w.time), elapsedMs: Math.round(elapsed), towersDown, kills, levels, items, winner: w.winner });
    expect(w.champions().every((c) => c.champion!.items.some(Boolean))).toBe(true);
    expect(Math.max(...levels)).toBeGreaterThan(3);
    expect(towersDown).toBeGreaterThan(0);
  }, 120_000);
});
