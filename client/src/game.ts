import * as THREE from 'three';
import { CHAMPION_IDS, type ChampionSpawn, DT, type EntityId, type GameEvent, ITEMS, type LaneId, type Team, type Vec2, World, dist } from '@lol/shared';
import { CameraController } from './camera';
import { InputController } from './input';
import { EntityViewManager } from './render/entityViews';
import { Effects } from './render/effects';
import { buildMap } from './render/mapView';
import { makeGroundRing } from './render/util';
import { Hud } from './ui/hud';
import { Minimap } from './ui/minimap';
import { WorldOverlay } from './ui/overlay';
import { Shop } from './ui/shop';

const MAX_STEPS_PER_FRAME = 5;

const PLAYER_TEAM: Team = 'blue';
const BOT_SLOTS: { team: Team; lane: LaneId; name: string }[] = [
  { team: 'blue', lane: 'top', name: 'Rook' },
  { team: 'blue', lane: 'bot', name: 'Vale' },
  { team: 'red', lane: 'top', name: 'Ember' },
  { team: 'red', lane: 'mid', name: 'Nyx' },
  { team: 'red', lane: 'bot', name: 'Frost' },
];

const shuffled = <T,>(xs: T[]): T[] => xs.map((x) => [Math.random(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x);

/** Player in mid; bots get random champions with no duplicates within a team. */
function buildRoster(playerChampion: string): ChampionSpawn[] {
  const roster: ChampionSpawn[] = [{ team: PLAYER_TEAM, defId: playerChampion, name: 'You', lane: 'mid', isBot: false }];
  const pools: Record<Team, string[]> = {
    blue: shuffled(CHAMPION_IDS.filter((id) => id !== playerChampion)),
    red: shuffled([...CHAMPION_IDS]),
  };
  for (const slot of BOT_SLOTS) {
    const defId = pools[slot.team].pop() ?? CHAMPION_IDS[0];
    roster.push({ team: slot.team, defId, name: slot.name, lane: slot.lane, isBot: true });
  }
  return roster;
}

/** Client game: runs the simulation locally at a fixed tick and renders it with interpolation. */
export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly sun: THREE.DirectionalLight;
  private readonly cam: CameraController;
  private readonly world: World;
  private readonly playerId: EntityId;
  private readonly views: EntityViewManager;
  private readonly effects: Effects;
  private readonly input: InputController;
  private readonly overlay: WorldOverlay;
  private readonly hud: Hud;
  private readonly minimap: Minimap;
  private readonly hoverRing: THREE.Mesh;
  private readonly shop: Shop;
  private accumulator = 0;
  private lastFrame = performance.now();
  private elapsed = 0;

  constructor(canvas: HTMLCanvasElement, overlayRoot: HTMLElement, hudRoot: HTMLElement, playerChampion: string) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene.background = new THREE.Color(0x0d1a12);
    this.scene.fog = new THREE.Fog(0x0d1a12, 120, 260);
    this.scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x30402a, 1.3));
    this.sun = new THREE.DirectionalLight(0xfff0d0, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -70;
    sc.right = sc.top = 70;
    sc.near = 1;
    sc.far = 200;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun, this.sun.target);

    buildMap(this.scene);

    this.world = new World({ champions: buildRoster(playerChampion) });
    this.playerId = this.world.champions().find((c) => !c.champion!.isBot)!.id;

    this.cam = new CameraController(window.innerWidth / window.innerHeight);
    this.cam.jumpTo(this.world.get(this.playerId)!.pos);
    this.views = new EntityViewManager(this.scene, this.playerId);
    this.effects = new Effects(this.scene);

    this.hoverRing = makeGroundRing(0.9, 1.15, 0xff3b3b, 0.9);
    this.hoverRing.visible = false;
    this.scene.add(this.hoverRing);

    this.overlay = new WorldOverlay(overlayRoot, this.cam.camera, PLAYER_TEAM);
    this.hud = new Hud(hudRoot, this.world, this.playerId, PLAYER_TEAM);
    this.hud.onRestart = () => location.reload();
    this.shop = new Shop(hudRoot, this.world, this.playerId, (cmd) => this.world.issue(cmd));
    this.hud.onOpenShop = () => this.shop.toggle(true);
    // Start in the fountain with the shop open, like a real match.
    this.shop.toggle(true);

    this.input = new InputController(canvas, this.cam, this.world, this.playerId, this.views, {
      send: (cmd) => this.world.issue(cmd),
      clickMarker: (p, attack) => this.effects.clickMarker(p, attack),
      toggleHelp: () => this.hud.toggleHelp(),
      toggleShop: (open) => this.shop.toggle(open),
    });

    this.minimap = new Minimap(
      hudRoot,
      this.playerId,
      (p) => {
        this.cam.locked = false;
        this.cam.jumpTo(p);
      },
      (p) => this.input.moveTo(p),
    );

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.cam.camera.aspect = w / h;
    this.cam.camera.updateProjectionMatrix();
  }

  start(): void {
    const frame = (now: number) => {
      this.frame(now);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  private frame(now: number): void {
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.elapsed += dt;

    // Pause the simulation while the help screen is open.
    if (!this.hud.helpVisible && !this.world.winner) {
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= DT && steps < MAX_STEPS_PER_FRAME) {
        this.world.step();
        for (const ev of this.world.drainEvents()) this.handleEvent(ev);
        this.accumulator -= DT;
        steps++;
      }
      if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0;
    }
    const alpha = this.accumulator / DT;

    this.input.update(dt);
    this.views.sync(this.world, alpha, dt, this.elapsed);
    const playerView = this.views.get(this.playerId);
    const player = this.world.get(this.playerId)!;
    const followPos: Vec2 | null = playerView && !player.dead ? { x: playerView.renderPos.x, y: playerView.renderPos.z } : null;
    this.cam.update(dt, followPos, { w: window.innerWidth, h: window.innerHeight }, this.effects.shake);

    this.effects.sync(this.world, alpha);
    this.effects.update(dt);
    this.updateIndicators(player.pos);

    // Keep the shadow frustum centered on what the camera sees.
    const f = this.cam.focus;
    this.sun.position.set(f.x + 40, 70, f.z + 25);
    this.sun.target.position.set(f.x, 0, f.z);

    this.renderer.render(this.scene, this.cam.camera);
    this.overlay.update(this.world, this.views, dt);
    this.hud.update(this.world, dt);
    this.shop.update();
    this.minimap.draw(this.world, this.cam.groundFrustum());
  }

  private updateIndicators(playerPos: Vec2): void {
    const hovered = this.input.hovered;
    const hv = hovered && this.views.get(hovered.id);
    this.hoverRing.visible = !!hv;
    if (hovered && hv) {
      this.hoverRing.position.set(hv.renderPos.x, 0.06, hv.renderPos.z);
      this.hoverRing.scale.setScalar(hovered.radius + 0.3);
    }

    // Enemy tower range rings appear when the player gets close; red when it's targeting you.
    for (const e of this.world.entities.values()) {
      if (e.kind !== 'tower' || e.team === PLAYER_TEAM) continue;
      const view = this.views.get(e.id);
      if (!view) continue;
      const reach = e.attackRange + e.radius;
      const near = !e.dead && dist(e.pos, playerPos) < reach + 8;
      view.setRangeRing(near, reach, e.targetId === this.playerId);
    }
  }

  private handleEvent(ev: GameEvent): void {
    const player = this.world.get(this.playerId);
    switch (ev.type) {
      case 'attack':
        this.views.get(ev.sourceId)?.attack();
        break;
      case 'damage': {
        this.views.get(ev.targetId)?.hit();
        const target = this.world.get(ev.targetId);
        const view = this.views.get(ev.targetId);
        if (target && view && ev.amount >= 1) {
          if (ev.sourceId === this.playerId) {
            this.overlay.floatText(target.pos, view.height, String(Math.round(ev.amount)), ev.kind);
          } else if (ev.targetId === this.playerId && ev.sourceId !== 0) {
            this.overlay.floatText(target.pos, view.height, `-${Math.round(ev.amount)}`, 'taken');
          }
        }
        break;
      }
      case 'itemBought':
        if (ev.id === this.playerId && player) {
          const item = ITEMS[ev.itemId];
          this.overlay.floatText(player.pos, 4, `${item.icon} ${item.name}`, 'gold');
        }
        break;
      case 'gold':
        if (ev.id === this.playerId) this.overlay.floatText(ev.pos, 2.5, `+${ev.amount}g`, 'gold');
        break;
      default:
        break;
    }
    this.effects.handleEvent(ev, this.world, player && !player.dead ? player.pos : null);
    this.hud.handleEvent(ev, this.world);
  }
}
