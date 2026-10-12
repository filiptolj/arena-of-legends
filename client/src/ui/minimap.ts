import { MAP, type EntityId, type Vec2, type World } from '@lol/shared';
import { paintGroundCanvas } from '../render/mapView';

const SIZE = 220;
const RES = 2;

/** Minimap with unit dots and the camera's view box. Left-click pans, right-click moves. */
export class Minimap {
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly background: HTMLCanvasElement;
  private dragging = false;

  constructor(
    root: HTMLElement,
    private readonly playerId: EntityId,
    private readonly onPan: (p: Vec2) => void,
    private readonly onMove: (p: Vec2) => void,
  ) {
    const wrap = document.createElement('div');
    wrap.className = 'minimap panel';
    this.canvas.width = this.canvas.height = SIZE * RES;
    wrap.appendChild(this.canvas);
    root.appendChild(wrap);
    this.ctx = this.canvas.getContext('2d')!;
    this.background = paintGroundCanvas(SIZE * RES);

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      const p = this.toWorld(e);
      if (e.button === 0) {
        this.dragging = true;
        this.onPan(p);
      } else if (e.button === 2) {
        this.onMove(p);
      }
    });
    window.addEventListener('mousemove', (e) => {
      if (this.dragging) this.onPan(this.toWorld(e));
    });
    window.addEventListener('mouseup', () => (this.dragging = false));
  }

  private toWorld(e: MouseEvent): Vec2 {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * MAP.size,
      y: ((e.clientY - r.top) / r.height) * MAP.size,
    };
  }

  draw(world: World, frustum: Vec2[]): void {
    const g = this.ctx;
    const k = (SIZE * RES) / MAP.size;
    g.drawImage(this.background, 0, 0);

    for (const e of world.entities.values()) {
      if (e.dead) continue;
      const color = e.team === 'blue' ? '#4c9bff' : '#ff5a5a';
      const x = e.pos.x * k;
      const y = e.pos.y * k;
      g.fillStyle = color;
      g.strokeStyle = '#000';
      g.lineWidth = 2;
      if (e.kind === 'minion') {
        g.fillRect(x - 2, y - 2, 4, 4);
      } else if (e.kind === 'tower') {
        g.beginPath();
        g.rect(x - 6, y - 6, 12, 12);
        g.fill();
        g.stroke();
      } else if (e.kind === 'nexus') {
        g.beginPath();
        g.moveTo(x, y - 12);
        g.lineTo(x + 12, y);
        g.lineTo(x, y + 12);
        g.lineTo(x - 12, y);
        g.closePath();
        g.fill();
        g.stroke();
      }
    }
    // Champions on top.
    for (const c of world.champions()) {
      if (c.dead) continue;
      const x = c.pos.x * k;
      const y = c.pos.y * k;
      g.beginPath();
      g.arc(x, y, 9, 0, Math.PI * 2);
      g.fillStyle = c.team === 'blue' ? '#4c9bff' : '#ff5a5a';
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = c.id === this.playerId ? '#ffe066' : '#111';
      g.stroke();
    }

    if (frustum.length === 4) {
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      g.lineWidth = 2;
      g.beginPath();
      frustum.forEach((p, i) => (i === 0 ? g.moveTo(p.x * k, p.y * k) : g.lineTo(p.x * k, p.y * k)));
      g.closePath();
      g.stroke();
    }
  }
}
