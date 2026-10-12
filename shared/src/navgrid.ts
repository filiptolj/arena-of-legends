import { type Vec2, dist, pointInPolygon, vec } from './math.js';
import { MAP } from './map.js';

const SQRT2 = Math.SQRT2;
const DIRS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
];

/**
 * Walkability grid with A* pathfinding. Static terrain is baked once;
 * structures add dynamic blockers that are removed when they die.
 */
export class NavGrid {
  readonly width: number;
  readonly height: number;
  private readonly staticBlocked: Uint8Array;
  private readonly dynamicCount: Uint16Array;

  constructor(
    readonly cellSize = 1,
    size = MAP.size,
  ) {
    this.width = Math.ceil(size / cellSize);
    this.height = Math.ceil(size / cellSize);
    this.staticBlocked = new Uint8Array(this.width * this.height);
    this.dynamicCount = new Uint16Array(this.width * this.height);
    this.bakeTerrain();
  }

  private bakeTerrain(): void {
    const raw = new Uint8Array(this.width * this.height);
    const b = MAP.boundary;
    for (let cy = 0; cy < this.height; cy++) {
      for (let cx = 0; cx < this.width; cx++) {
        const p = this.cellCenter(cx, cy);
        let blocked = p.x < b || p.y < b || p.x > MAP.size - b || p.y > MAP.size - b;
        if (!blocked) blocked = MAP.rocks.some((poly) => pointInPolygon(p, poly));
        raw[cy * this.width + cx] = blocked ? 1 : 0;
      }
    }
    // Dilate by one cell so units keep a little clearance from walls.
    for (let cy = 0; cy < this.height; cy++) {
      for (let cx = 0; cx < this.width; cx++) {
        let blocked = raw[cy * this.width + cx] === 1;
        for (let dy = -1; dy <= 1 && !blocked; dy++) {
          for (let dx = -1; dx <= 1 && !blocked; dx++) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (this.inBounds(nx, ny) && raw[ny * this.width + nx] === 1) blocked = true;
          }
        }
        this.staticBlocked[cy * this.width + cx] = blocked ? 1 : 0;
      }
    }
  }

  cellCenter(cx: number, cy: number): Vec2 {
    return vec((cx + 0.5) * this.cellSize, (cy + 0.5) * this.cellSize);
  }

  toCell(p: Vec2): [number, number] {
    return [Math.floor(p.x / this.cellSize), Math.floor(p.y / this.cellSize)];
  }

  inBounds(cx: number, cy: number): boolean {
    return cx >= 0 && cy >= 0 && cx < this.width && cy < this.height;
  }

  private cellWalkable(cx: number, cy: number): boolean {
    if (!this.inBounds(cx, cy)) return false;
    const i = cy * this.width + cx;
    return this.staticBlocked[i] === 0 && this.dynamicCount[i] === 0;
  }

  isWalkable(p: Vec2): boolean {
    const [cx, cy] = this.toCell(p);
    return this.cellWalkable(cx, cy);
  }

  /** Blocks (delta=1) or unblocks (delta=-1) every cell whose center is within radius of `center`. */
  private applyCircle(center: Vec2, radius: number, delta: number): void {
    const [x0, y0] = this.toCell(vec(center.x - radius, center.y - radius));
    const [x1, y1] = this.toCell(vec(center.x + radius, center.y + radius));
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (!this.inBounds(cx, cy)) continue;
        if (dist(this.cellCenter(cx, cy), center) <= radius) {
          this.dynamicCount[cy * this.width + cx] += delta;
        }
      }
    }
  }

  blockCircle(center: Vec2, radius: number): void {
    this.applyCircle(center, radius, 1);
  }

  unblockCircle(center: Vec2, radius: number): void {
    this.applyCircle(center, radius, -1);
  }

  /** True if a straight walk from a to b stays on walkable cells. */
  lineOfSight(a: Vec2, b: Vec2): boolean {
    const d = dist(a, b);
    const steps = Math.ceil(d / (this.cellSize * 0.4));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (!this.isWalkable(vec(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t))) return false;
    }
    return true;
  }

  /** Nearest walkable point to p, searching outward in rings. */
  nearestWalkable(p: Vec2, maxRadius = 30): Vec2 {
    if (this.isWalkable(p)) return p;
    const [cx, cy] = this.toCell(p);
    for (let r = 1; r <= maxRadius; r++) {
      let best: Vec2 | null = null;
      let bestD = Infinity;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (!this.cellWalkable(cx + dx, cy + dy)) continue;
          const c = this.cellCenter(cx + dx, cy + dy);
          const d = dist(c, p);
          if (d < bestD) {
            bestD = d;
            best = c;
          }
        }
      }
      if (best) return best;
    }
    return p;
  }

  /**
   * A* from `start` to `goal`. Returns smoothed waypoints (excluding start),
   * or null if unreachable. Goals inside blockers are snapped to the nearest walkable cell.
   */
  findPath(start: Vec2, goal: Vec2, maxExpansions = 40000): Vec2[] | null {
    const realGoal = this.nearestWalkable(goal);
    const from = this.nearestWalkable(start);
    if (this.lineOfSight(from, realGoal)) return [realGoal];

    const [sx, sy] = this.toCell(from);
    const [gx, gy] = this.toCell(realGoal);
    const W = this.width;
    const startIdx = sy * W + sx;
    const goalIdx = gy * W + gx;

    const g = new Float32Array(W * this.height).fill(Infinity);
    const parent = new Int32Array(W * this.height).fill(-1);
    const closed = new Uint8Array(W * this.height);
    const heap = new MinHeap();

    const h = (x: number, y: number): number => {
      const dx = Math.abs(x - gx);
      const dy = Math.abs(y - gy);
      return Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy);
    };

    g[startIdx] = 0;
    heap.push(startIdx, h(sx, sy));
    let expansions = 0;
    let found = false;

    while (heap.size > 0) {
      const cur = heap.pop();
      if (cur === goalIdx) {
        found = true;
        break;
      }
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (++expansions > maxExpansions) break;

      const cx = cur % W;
      const cy = (cur - cx) / W;
      for (const [dx, dy, cost] of DIRS) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (!this.cellWalkable(nx, ny)) continue;
        // No corner cutting on diagonals.
        if (dx !== 0 && dy !== 0 && (!this.cellWalkable(cx + dx, cy) || !this.cellWalkable(cx, cy + dy))) continue;
        const ni = ny * W + nx;
        if (closed[ni]) continue;
        const ng = g[cur] + cost;
        if (ng < g[ni]) {
          g[ni] = ng;
          parent[ni] = cur;
          heap.push(ni, ng + h(nx, ny));
        }
      }
    }

    if (!found) return null;

    const cells: Vec2[] = [];
    for (let i = goalIdx; i !== -1 && i !== startIdx; i = parent[i]) {
      cells.push(this.cellCenter(i % W, Math.floor(i / W)));
    }
    cells.reverse();
    cells[cells.length - 1] = realGoal;
    return this.smooth(from, cells);
  }

  /** String-pulling: drop waypoints that have direct line of sight past them. */
  private smooth(start: Vec2, cells: Vec2[]): Vec2[] {
    const out: Vec2[] = [];
    let anchor = start;
    let i = 0;
    while (i < cells.length) {
      let j = cells.length - 1;
      while (j > i && !this.lineOfSight(anchor, cells[j])) j--;
      out.push(cells[j]);
      anchor = cells[j];
      i = j + 1;
    }
    return out;
  }
}

class MinHeap {
  private items: number[] = [];
  private prio: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: number, p: number): void {
    this.items.push(item);
    this.prio.push(p);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.prio[parent] <= this.prio[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.items[0];
    const lastItem = this.items.pop()!;
    const lastPrio = this.prio.pop()!;
    if (this.items.length > 0) {
      this.items[0] = lastItem;
      this.prio[0] = lastPrio;
      let i = 0;
      const n = this.items.length;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < n && this.prio[l] < this.prio[m]) m = l;
        if (r < n && this.prio[r] < this.prio[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
    [this.prio[a], this.prio[b]] = [this.prio[b], this.prio[a]];
  }
}
