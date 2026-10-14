import { type Vec2, vec } from './math.js';

export type Team = 'blue' | 'red';
export type LaneId = 'top' | 'mid' | 'bot';
export const LANES: LaneId[] = ['top', 'mid', 'bot'];

export const otherTeam = (t: Team): Team => (t === 'blue' ? 'red' : 'blue');

export interface StructureDef {
  kind: 'tower' | 'inhibitor' | 'nexus';
  team: Team;
  lane?: LaneId;
  /**
   * Towers: 1 = outer, 2 = inner, 3 = inhibitor turret (each needs the previous one down),
   * 4 = nexus turret (needs an inhibitor down).
   */
  tier?: number;
  pos: Vec2;
}

const SIZE = 200;

/** Blue base is bottom-left, red base is top-right; the map is point-symmetric about the center. */
const reflect = (p: Vec2): Vec2 => vec(SIZE - p.x, SIZE - p.y);
const mirrorDiag = (p: Vec2): Vec2 => vec(p.y, p.x);

// Jungle rocks for the blue-side quadrant between top and mid lane; the rest are mirrored.
const quadrantRocks: Vec2[][] = [
  [vec(32, 58), vec(42, 54), vec(52, 64), vec(46, 78), vec(33, 76)],
  [vec(34, 100), vec(50, 94), vec(58, 108), vec(50, 124), vec(36, 122)],
  [vec(64, 96), vec(76, 90), vec(84, 100), vec(76, 108), vec(66, 106)],
];

const rocks: Vec2[][] = [];
for (const r of quadrantRocks) {
  const diag = r.map(mirrorDiag);
  rocks.push(r, diag, r.map(reflect), diag.map(reflect));
}

export type CampType = 'wolves' | 'raptors' | 'golem' | 'sentinel' | 'drake';

export interface CampDef {
  id: string;
  type: CampType;
  pos: Vec2;
}

// Blue-side camps; the red side is the point reflection. The drake sits in the bottom river.
const blueCamps: CampDef[] = [
  { id: 'blue-golem', type: 'golem', pos: vec(60, 80) },
  { id: 'blue-wolves', type: 'wolves', pos: vec(42, 138) },
  { id: 'blue-sentinel', type: 'sentinel', pos: vec(120, 140) },
  { id: 'blue-raptors', type: 'raptors', pos: vec(62, 158) },
];
const camps: CampDef[] = [
  ...blueCamps,
  ...blueCamps.map((c) => ({ ...c, id: c.id.replace('blue', 'red'), pos: reflect(c.pos) })),
  { id: 'drake', type: 'drake', pos: vec(138, 138) },
];

const rect = (cx: number, cy: number, w: number, h: number): Vec2[] => [
  vec(cx - w / 2, cy - h / 2),
  vec(cx + w / 2, cy - h / 2),
  vec(cx + w / 2, cy + h / 2),
  vec(cx - w / 2, cy + h / 2),
];

// Brush beside the top and mid lanes in one quadrant (mirrored to all four), plus two river patches.
const quadrantBrush: Vec2[][] = [rect(30.5, 87, 5, 10), rect(70, 116, 6, 6)];
const brushes: Vec2[][] = [];
for (const b of quadrantBrush) {
  const diag = b.map(mirrorDiag);
  brushes.push(b, diag, b.map(reflect), diag.map(reflect));
}
const riverBrush = rect(78, 78, 6, 6);
brushes.push(riverBrush, riverBrush.map(reflect));

/** Lane paths from the blue nexus to the red nexus. */
const lanePaths: Record<LaneId, Vec2[]> = {
  top: [vec(30, 170), vec(20, 155), vec(20, 40), vec(28, 28), vec(40, 20), vec(155, 20), vec(170, 30)],
  mid: [vec(30, 170), vec(170, 30)],
  bot: [vec(30, 170), vec(45, 180), vec(160, 180), vec(172, 172), vec(180, 160), vec(180, 45), vec(170, 30)],
};

// Blue base, as in League: three towers and an inhibitor per lane, two nexus turrets, the nexus.
const blueStructures: StructureDef[] = [
  { kind: 'tower', team: 'blue', lane: 'top', tier: 1, pos: vec(20, 80) },
  { kind: 'tower', team: 'blue', lane: 'top', tier: 2, pos: vec(20, 108) },
  { kind: 'tower', team: 'blue', lane: 'top', tier: 3, pos: vec(20, 132) },
  { kind: 'inhibitor', team: 'blue', lane: 'top', pos: vec(20, 146) },
  { kind: 'tower', team: 'blue', lane: 'mid', tier: 1, pos: vec(76, 124) },
  { kind: 'tower', team: 'blue', lane: 'mid', tier: 2, pos: vec(62, 138) },
  { kind: 'tower', team: 'blue', lane: 'mid', tier: 3, pos: vec(51, 149) },
  { kind: 'inhibitor', team: 'blue', lane: 'mid', pos: vec(43, 157) },
  { kind: 'tower', team: 'blue', lane: 'bot', tier: 1, pos: vec(120, 180) },
  { kind: 'tower', team: 'blue', lane: 'bot', tier: 2, pos: vec(92, 180) },
  { kind: 'tower', team: 'blue', lane: 'bot', tier: 3, pos: vec(68, 180) },
  { kind: 'inhibitor', team: 'blue', lane: 'bot', pos: vec(54, 180) },
  { kind: 'tower', team: 'blue', tier: 4, pos: vec(32, 161) },
  { kind: 'tower', team: 'blue', tier: 4, pos: vec(39, 168) },
  { kind: 'nexus', team: 'blue', pos: vec(30, 170) },
];

const swapLane = (l?: LaneId): LaneId | undefined => (l === 'top' ? 'bot' : l === 'bot' ? 'top' : l);

const redStructures: StructureDef[] = blueStructures.map((s) => ({
  ...s,
  team: 'red',
  lane: swapLane(s.lane),
  pos: reflect(s.pos),
}));

export const MAP = {
  size: SIZE,
  /** Units can't walk closer than this to the map edge. */
  boundary: 10,
  laneWidth: 14,
  riverWidth: 10,
  rocks,
  lanePaths,
  structures: [...blueStructures, ...redStructures],
  fountains: { blue: vec(14, 186), red: vec(186, 14) } as Record<Team, Vec2>,
  fountainRadius: 12,
  camps,
  brushes,
};

/** Waypoints a team's minions follow, starting at their own nexus. */
export function laneWaypoints(team: Team, lane: LaneId): Vec2[] {
  const path = MAP.lanePaths[lane];
  return team === 'blue' ? path : [...path].reverse();
}
