import * as THREE from 'three';
import { CHAMPIONS, type DamageKind, type EntityId, type Team, type Vec2, type World, isInvulnerable } from '@lol/shared';
import type { EntityViewManager } from '../render/entityViews';

interface Bar {
  el: HTMLDivElement;
  fill: HTMLDivElement;
  mana?: HTMLDivElement;
  level?: HTMLDivElement;
  width: number;
  lastHp: number;
}

interface FloatText {
  el: HTMLDivElement;
  world: THREE.Vector3;
  age: number;
  life: number;
  drift: number;
}

/** DOM elements pinned to world positions: health bars and floating combat text. */
export class WorldOverlay {
  private readonly bars = new Map<EntityId, Bar>();
  private floats: FloatText[] = [];
  private readonly v = new THREE.Vector3();

  constructor(
    private readonly root: HTMLElement,
    private readonly camera: THREE.Camera,
    private readonly playerTeam: Team,
  ) {}

  private toScreen(p: THREE.Vector3): { x: number; y: number; visible: boolean } {
    this.v.copy(p).project(this.camera);
    const w = this.root.clientWidth;
    const h = this.root.clientHeight;
    return {
      x: (this.v.x * 0.5 + 0.5) * w,
      y: (-this.v.y * 0.5 + 0.5) * h,
      visible: this.v.z < 1 && this.v.x > -1.2 && this.v.x < 1.2 && this.v.y > -1.2 && this.v.y < 1.2,
    };
  }

  private createBar(world: World, id: EntityId): Bar {
    const e = world.get(id)!;
    const el = document.createElement('div');
    const group = e.kind === 'champion' ? 'champion' : e.kind === 'minion' ? 'minion' : 'structure';
    el.className = `hb ${group} ${e.team === this.playerTeam ? 'ally' : 'enemy'}`;
    const bar: Partial<Bar> = { el };
    if (e.champion) {
      const name = document.createElement('div');
      name.className = 'hb-name';
      name.textContent = `${e.champion.name} · ${CHAMPIONS[e.champion.defId].name}`;
      el.appendChild(name);
    }
    const track = document.createElement('div');
    track.className = 'hb-bar';
    const fill = document.createElement('div');
    fill.className = 'hb-fill';
    track.appendChild(fill);
    el.appendChild(track);
    if (e.champion) {
      const level = document.createElement('div');
      level.className = 'hb-level';
      track.appendChild(level);
      bar.level = level;
      const mana = document.createElement('div');
      mana.className = 'hb-mana';
      const mf = document.createElement('div');
      mana.appendChild(mf);
      el.appendChild(mana);
      bar.mana = mf;
    }
    this.root.appendChild(el);
    bar.fill = fill;
    bar.width = group === 'champion' ? 90 : group === 'minion' ? 34 : 110;
    bar.lastHp = -1;
    return bar as Bar;
  }

  update(world: World, views: EntityViewManager, dt: number): void {
    for (const [id, view] of views.views) {
      const e = world.get(id);
      let bar = this.bars.get(id);
      if (!e || e.dead || view.dying) {
        if (bar) {
          bar.el.remove();
          this.bars.delete(id);
        }
        continue;
      }
      if (!bar) {
        bar = this.createBar(world, id);
        this.bars.set(id, bar);
      }
      const s = this.toScreen(this.v.copy(view.renderPos).setY(view.height + 0.6));
      if (!s.visible) {
        bar.el.style.display = 'none';
        continue;
      }
      bar.el.style.display = '';
      const yOffset = e.champion ? 28 : 8;
      bar.el.style.transform = `translate(${(s.x - bar.width / 2).toFixed(1)}px, ${(s.y - yOffset).toFixed(1)}px)`;
      if (bar.lastHp !== e.hp) {
        bar.fill.style.width = `${Math.max(0, (e.hp / e.maxHp) * 100)}%`;
        bar.lastHp = e.hp;
      }
      if (bar.mana) bar.mana.style.width = `${(e.mana / Math.max(1, e.maxMana)) * 100}%`;
      if (bar.level && e.champion) bar.level.textContent = String(e.champion.level);
      if (e.kind === 'tower' || e.kind === 'nexus') bar.el.classList.toggle('invulnerable', isInvulnerable(world, e));
    }
    for (const [id, bar] of this.bars) {
      if (!views.views.has(id)) {
        bar.el.remove();
        this.bars.delete(id);
      }
    }

    const alive: FloatText[] = [];
    for (const f of this.floats) {
      f.age += dt;
      if (f.age >= f.life) {
        f.el.remove();
        continue;
      }
      const t = f.age / f.life;
      const s = this.toScreen(f.world);
      f.el.style.display = s.visible ? '' : 'none';
      f.el.style.transform = `translate(${(s.x + f.drift * t * 30).toFixed(1)}px, ${(s.y - 30 - t * 40).toFixed(1)}px) scale(${t < 0.15 ? 1 + (0.15 - t) * 4 : 1})`;
      f.el.style.opacity = String(t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1);
      alive.push(f);
    }
    this.floats = alive;
  }

  floatText(pos: Vec2, height: number, text: string, cls: DamageKind | 'taken' | 'gold'): void {
    const el = document.createElement('div');
    el.className = `float-text ${cls}`;
    el.textContent = text;
    this.root.appendChild(el);
    this.floats.push({
      el,
      world: new THREE.Vector3(pos.x, height, pos.y),
      age: 0,
      life: cls === 'gold' ? 1.2 : 0.9,
      drift: (Math.random() - 0.5) * 2,
    });
  }
}
