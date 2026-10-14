import { MAP, type EntityId, type Team, type Vec2, type World } from '@lol/shared';
import type { FogOfWar } from '../render/fog';
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
    private readonly playerTeam: Team,
    private readonly fog: FogOfWar,
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

    // Darken everything outside the team's vision.
    g.save();
    g.globalCompositeOperation = 'multiply';
    g.globalAlpha = 0.6;
    g.imageSmoothingEnabled = true;
    g.drawImage(this.fog.canvas, 0, 0, SIZE * RES, SIZE * RES);
    g.restore();

    // Jungle camps: gold when up, grey with a countdown while respawning.
    g.font = `bold ${10 * RES}px sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const camp of world.camps) {
      const x = camp.def.pos.x * k;
      const y = camp.def.pos.y * k;
      const up = camp.monsterIds.length > 0;
      const big = camp.def.type === 'drake' || camp.def.type === 'golem' || camp.def.type === 'sentinel';
      const r = (big ? 7 : 5) * RES;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fillStyle = up ? (camp.def.type === 'golem' ? '#3bb8ff' : camp.def.type === 'sentinel' ? '#ff4b4b' : camp.def.type === 'drake' ? '#ff9a3b' : '#e0c050') : '#555';
      g.fill();
      g.lineWidth = 1.5 * RES;
      g.strokeStyle = '#111';
      g.stroke();
      const left = camp.spawnAt - world.time;
      if (!up && Number.isFinite(left) && left > 0) {
        g.fillStyle = '#fff';
        g.fillText(String(Math.ceil(left)), x, y - r - 6 * RES);
      }
    }

    const visible = world.vision[this.playerTeam];
    for (const e of world.entities.values()) {
      if (e.dead || !visible.has(e.id) || e.kind === 'monster') continue;
      const color = e.team === 'blue' ? '#4c9bff' : '#ff5a5a';
      const x = e.pos.x * k;
      const y = e.pos.y * k;
      g.fillStyle = color;
      g.strokeStyle = '#000';
      g.lineWidth = 2;
      if (e.kind === 'minion') {
        g.fillRect(x - 2, y - 2, 4, 4);
      } else if (e.kind === 'ward') {
        g.beginPath();
        g.arc(x, y, 4, 0, Math.PI * 2);
        g.fillStyle = '#ffe9a8';
        g.fill();
        g.stroke();
      } else if (e.kind === 'inhibitor') {
        g.beginPath();
        g.arc(x, y, 7, 0, Math.PI * 2);
        g.fill();
        g.stroke();
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
      if (c.dead || !visible.has(c.id)) continue;
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
