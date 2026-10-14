import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { type EntityId, type GameEvent, ITEMS, type Team, type Vec2, type World, brushAt, dist } from '@lol/shared';
import { CameraController } from './camera';
import { InputController } from './input';
import { EntityViewManager } from './render/entityViews';
import { Effects } from './render/effects';
import { FogOfWar } from './render/fog';
import { type MapView, buildMap } from './render/mapView';
import { makeGroundRing } from './render/util';
import { Hud } from './ui/hud';
import { Minimap } from './ui/minimap';
import { WorldOverlay } from './ui/overlay';
import type { Session } from './session';
import { Shop } from './ui/shop';

/** Client game: renders a Session's world with interpolation and turns input into commands. */
export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly rimLight: THREE.DirectionalLight;
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
  private readonly fog: FogOfWar;
  private readonly mapView: MapView;
  private readonly team: Team;
  private lastFrame = performance.now();
  private elapsed = 0;

  constructor(
    canvas: HTMLCanvasElement,
    overlayRoot: HTMLElement,
    hudRoot: HTMLElement,
    private readonly session: Session,
  ) {
    this.world = session.world;
    this.playerId = session.playerId;
    this.team = session.team;
    this.fog = new FogOfWar(this.team);
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
    // A cool back light from the far side of the map outlines characters, League-style.
    this.rimLight = new THREE.DirectionalLight(0x9fc8ff, 1.4);
    this.scene.add(this.rimLight, this.rimLight.target);

    // Bloom makes glowing things (projectiles, crystals, auras) actually glow.
    this.composer = new EffectComposer(this.renderer);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.45, 0.82);


    this.mapView = buildMap(this.scene, this.fog);


    this.cam = new CameraController(window.innerWidth / window.innerHeight);
    this.composer.addPass(new RenderPass(this.scene, this.cam.camera));
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.cam.jumpTo(this.world.get(this.playerId)!.pos);
    this.views = new EntityViewManager(this.scene, this.playerId, this.team, this.fog);
    this.effects = new Effects(this.scene);

    this.hoverRing = makeGroundRing(0.9, 1.15, 0xff3b3b, 0.9);
    this.hoverRing.visible = false;
    this.scene.add(this.hoverRing);

    this.overlay = new WorldOverlay(overlayRoot, this.cam.camera, this.team);
    this.hud = new Hud(hudRoot, this.world, this.playerId, this.team);
    this.hud.onRestart = () => location.reload();
    this.shop = new Shop(hudRoot, this.world, this.playerId, (cmd) => session.send(cmd));
    this.hud.onOpenShop = () => this.shop.toggle(true);
    // Start in the fountain with the shop open, like a real match.
    this.shop.toggle(true);

    this.input = new InputController(canvas, this.cam, this.world, this.playerId, this.views, {
      send: (cmd) => session.send(cmd),
      clickMarker: (p, attack) => this.effects.clickMarker(p, attack),
      toggleHelp: () => this.hud.toggleHelp(),
      toggleShop: (open) => this.shop.toggle(open),
    });

    this.minimap = new Minimap(
      hudRoot,
      this.playerId,
      this.team,
      this.fog,
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
    this.composer.setSize(w, h);
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

    // Offline games pause while the help screen is open; online games can't.
    const { events, alpha } = this.session.advance(dt, this.hud.helpVisible);
    for (const ev of events) this.handleEvent(ev);

    this.input.update(dt);
    this.views.sync(this.world, alpha, dt, this.elapsed);
    const playerView = this.views.get(this.playerId);
    const player = this.world.get(this.playerId)!;
    const followPos: Vec2 | null = playerView && !player.dead ? { x: playerView.renderPos.x, y: playerView.renderPos.z } : null;
    this.cam.update(dt, followPos, { w: window.innerWidth, h: window.innerHeight }, this.effects.shake);

    this.effects.sync(this.world, alpha, this.world.vision[this.team]);
    this.effects.update(dt);
    this.updateIndicators(player.pos);
    this.fog.update(this.world);
    // Brush you're standing in turns see-through so you can still see your champion.
    const inBrush = player.dead ? -1 : brushAt(player.pos);
    this.mapView.brushes.forEach((mesh, i) => {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.opacity += ((i === inBrush ? 0.35 : 1) - mat.opacity) * Math.min(1, dt * 10);
      mat.depthWrite = mat.opacity > 0.99;
    });

    // Keep the shadow frustum centered on what the camera sees.
    const f = this.cam.focus;
    this.sun.position.set(f.x + 40, 70, f.z + 25);
    this.sun.target.position.set(f.x, 0, f.z);

    this.rimLight.position.set(f.x - 20, 45, f.z - 60);
    this.rimLight.target.position.set(f.x, 0, f.z);
    this.composer.render();
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
      if (e.kind !== 'tower' || e.team === this.team) continue;
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
      case 'cast':
        this.views.get(ev.id)?.cast();
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
      case 'healed': {
        const target = this.world.get(ev.id);
        if (target && (ev.id === this.playerId || ev.sourceId === this.playerId)) {
          this.overlay.floatText(target.pos, this.views.get(ev.id)?.height ?? 3, `+${Math.round(ev.amount)}`, 'heal');
        }
        break;
      }
      case 'itemUsed':
        if (ev.id === this.playerId && player) {
          const item = ITEMS[ev.itemId];
          this.overlay.floatText(player.pos, 4.5, `${item.icon} ${item.active?.name ?? ''}`, 'magic');
        }
        break;
      default:
        break;
    }
    this.effects.handleEvent(ev, this.world, player && !player.dead ? player.pos : null);
    this.hud.handleEvent(ev, this.world);
  }
}
