import * as THREE from 'three';
import { type GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

/** Rigged, animated base models (KayKit, CC0) in client/public/models. */
export type BaseModel =
  | 'knight'
  | 'barbarian'
  | 'mage'
  | 'rogue'
  | 'rogue_hooded'
  | 'skeleton_minion'
  | 'skeleton_mage'
  | 'skeleton_warrior';

const MODELS: BaseModel[] = [
  'knight', 'barbarian', 'mage', 'rogue', 'rogue_hooded',
  'skeleton_minion', 'skeleton_mage', 'skeleton_warrior',
];

/** Weapons and accessories each model ships with; a spec picks which to show. */
const OPTIONAL_PARTS: Record<BaseModel, string[]> = {
  knight: ['1H_Sword_Offhand', 'Badge_Shield', 'Rectangle_Shield', 'Round_Shield', 'Spike_Shield', '1H_Sword', '2H_Sword', 'Knight_Helmet', 'Knight_Cape'],
  barbarian: ['1H_Axe_Offhand', 'Barbarian_Round_Shield', '1H_Axe', '2H_Axe', 'Mug', 'Barbarian_Hat', 'Barbarian_Cape'],
  mage: ['Spellbook', 'Spellbook_open', '1H_Wand', '2H_Staff', 'Mage_Hat', 'Mage_Cape'],
  rogue: ['Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Knife', 'Throwable', 'Rogue_Cape'],
  rogue_hooded: ['Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Knife', 'Throwable', 'Rogue_Cape'],
  skeleton_minion: [],
  skeleton_mage: ['Skeleton_Mage_Hat'],
  skeleton_warrior: ['Skeleton_Warrior_Helmet'],
};

/** Clothing/armor meshes that take the champion's tint (skin, heads and weapons keep their colors). */
const TINTABLE = /(Body|Cape|Cloak|Hat|Helmet|Hood|Leg)/;
const BLUE_TEAM = 0x3b82f6;
/** Minion gear dyed in team colors (their bones stay bone-colored). */
const TEAM_DYED = /(Cloak|Hat|Helmet|Hood|Cape)/;
/** Meshes that only get the hue shift (they contain skin, which the shader protects). */
const HUE_ONLY = /(Head|Arm)/;

export interface CharacterSpec {
  model: BaseModel;
  /** Optional parts to keep visible. */
  show: string[];
  /** Team color for minions: dyes cloaks/hats/helmets and lights up the eyes. */
  teamColor?: number;
  /** Rotates the hue of clothing/armor (degrees) — gives each champion its own color scheme. */
  hue?: number;
  /** Saturation multiplier for clothing/armor. */
  sat?: number;
  /** Height in world units. */
  height: number;
  idle: string;
  attack: string;
  cast: string;
  /** Extra glow on the right hand (wands, orbs, lanterns...). */
  handGlow?: number;
}

const champion = (model: BaseModel, show: string[], hue: number, attack: string, opts: Partial<CharacterSpec> = {}): CharacterSpec => ({
  model,
  show,
  hue,
  height: 3.6,
  idle: 'Idle',
  attack,
  cast: attack.startsWith('Spellcast') || attack.includes('Ranged') ? 'Spellcast_Shoot' : 'Spellcast_Raise',
  ...opts,
});

const MELEE_1H = '1H_Melee_Attack_Chop';
const MELEE_2H = '2H_Melee_Attack_Slice';
const DUAL = 'Dualwield_Melee_Attack_Slice';
const PUNCH = 'Unarmed_Melee_Attack_Punch_A';
const SPELL = 'Spellcast_Shoot';

// Hues are rotations from each base model's own palette (knight: steel blue, mage: purple,
// rogue: green, barbarian: red-brown, skeleton mage: violet).
export const CHAMPION_CHARACTERS: Record<string, CharacterSpec> = {
  arcanist: champion('mage', ['2H_Staff', 'Mage_Hat', 'Mage_Cape'], 0, SPELL, { handGlow: 0xc77dff }),
  ranger: champion('rogue', ['2H_Crossbow', 'Rogue_Cape'], 0, '2H_Ranged_Shoot'),
  warden: champion('knight', ['1H_Sword', 'Badge_Shield', 'Knight_Helmet', 'Knight_Cape'], 0, MELEE_1H, { height: 3.8 }),
  shade: champion('rogue_hooded', ['Knife', 'Knife_Offhand'], 150, DUAL, { sat: 0.6 }),
  ironhook: champion('barbarian', [], 25, PUNCH, { height: 4.3, sat: 1.3, cast: '2H_Melee_Attack_Spin' }),
  valor: champion('knight', ['2H_Sword', 'Knight_Helmet', 'Knight_Cape'], 140, MELEE_2H, { idle: '2H_Melee_Idle', height: 3.9, cast: '2H_Melee_Attack_Spin' }),
  sunweaver: champion('mage', ['1H_Wand', 'Spellbook_open'], 135, SPELL, { handGlow: 0xfff3a0, sat: 0.7 }),
  frostbloom: champion('rogue_hooded', ['2H_Crossbow', 'Rogue_Cape'], 70, '2H_Ranged_Shoot', { sat: 0.8 }),
  bloodreaver: champion('barbarian', ['2H_Axe', 'Barbarian_Cape'], -20, MELEE_2H, { idle: '2H_Melee_Idle', height: 4.1, sat: 1.4, cast: '2H_Melee_Attack_Spin' }),
  mistweaver: champion('mage', ['2H_Staff', 'Mage_Cape'], -100, SPELL, { handGlow: 0x6aff9a }),
  nightstalker: champion('rogue_hooded', ['Knife', 'Knife_Offhand', 'Rogue_Cape'], 170, DUAL, { sat: 1.2 }),
  stonewall: champion('barbarian', [], 0, PUNCH, { height: 4.5, sat: 0.15, cast: '2H_Melee_Attack_Spin' }),
  volt: champion('rogue', ['1H_Crossbow', 'Rogue_Cape'], 140, '1H_Ranged_Shoot'),
  tempest: champion('knight', ['1H_Sword', 'Knight_Cape'], -40, '1H_Melee_Attack_Slice_Diagonal'),
  kitsu: champion('mage', ['1H_Wand', 'Mage_Cape'], 60, SPELL, { handGlow: 0xff7ab8, sat: 1.2 }),
  lanternkeeper: champion('skeleton_mage', ['Skeleton_Mage_Hat'], -140, SPELL, { handGlow: 0x6aff9a, height: 3.8 }),
  firecracker: champion('rogue', ['2H_Crossbow'], 190, '2H_Ranged_Shoot', { sat: 1.3 }),
  pyra: champion('mage', ['Spellbook_open', 'Mage_Hat'], 90, SPELL, { handGlow: 0xff7a30, height: 3.0, sat: 1.3 }),
  umbra: champion('rogue_hooded', ['Knife', 'Knife_Offhand', 'Rogue_Cape'], 230, DUAL, { sat: 0.35 }),
  dawnshield: champion('knight', ['1H_Sword', 'Round_Shield', 'Knight_Helmet', 'Knight_Cape'], 185, MELEE_1H, { height: 3.9, sat: 1.2 }),
};

/** Minions are KayKit skeletons wearing their team's colors. */
export const MINION_CHARACTERS: Record<'melee' | 'caster' | 'super', CharacterSpec> = {
  melee: { model: 'skeleton_minion', show: [], height: 2.3, idle: 'Idle', attack: MELEE_1H, cast: MELEE_1H },
  caster: { model: 'skeleton_mage', show: ['Skeleton_Mage_Hat'], height: 2.2, idle: 'Idle', attack: SPELL, cast: SPELL, handGlow: 0xffffff },
  super: { model: 'skeleton_warrior', show: ['Skeleton_Warrior_Helmet'], height: 3.4, idle: 'Idle', attack: PUNCH, cast: PUNCH },
};

const loaded = new Map<BaseModel, GLTF>();

/** Loads every base model; resolves even if some fail (those fall back to primitive models). */
export async function loadCharacters(onProgress?: (done: number, total: number) => void): Promise<void> {
  const loader = new GLTFLoader();
  let done = 0;
  await Promise.all(
    MODELS.map(async (name) => {
      try {
        loaded.set(name, await loader.loadAsync(`${import.meta.env.BASE_URL}models/${name}.glb`));
      } catch (e) {
        console.warn(`Could not load model ${name}`, e);
      }
      onProgress?.(++done, MODELS.length);
    }),
  );
}

export function hasCharacter(model: BaseModel): boolean {
  return loaded.has(model);
}

/** Rotates the hue (YIQ space) and scales the saturation of the textured color in the shader. */
function applyHueShift(material: THREE.MeshStandardMaterial, degrees: number, saturation: number): void {
  const uniforms = { uHue: { value: (degrees * Math.PI) / 180 }, uSat: { value: saturation } };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uHue;
        uniform float uSat;
        vec3 shiftHue(vec3 c) {
          const mat3 toYIQ = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312);
          const mat3 toRGB = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703);
          vec3 yiq = toYIQ * c;
          float h0 = atan(yiq.z, yiq.y);
          // Leave skin (and other warm browns) alone so faces under hoods and hats keep their color.
          // Textures arrive in linear space; skin there is roughly r > g > b with g ≈ 0.4–0.85 r.
          float gr = c.g / max(c.r, 1e-3);
          float skin = step(c.b, c.g) * step(c.g, c.r) * step(0.12, c.r)
            * smoothstep(0.32, 0.42, gr) * (1.0 - smoothstep(0.82, 0.9, gr));
          float h = h0 + uHue * (1.0 - skin);
          float chroma = length(yiq.yz) * mix(uSat, 1.0, skin);
          return max(toRGB * vec3(yiq.x, chroma * cos(h), chroma * sin(h)), 0.0);
        }`,
      )
      .replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb = shiftHue(diffuseColor.rgb);');
  };
  // Each distinct shift compiles its own program variant.
  material.customProgramCacheKey = () => `hue:${degrees}:${saturation}`;
}

/**
 * One animated character instance: a skinned clone of a base model with its own
 * materials (so hit flashes, tints and stealth don't leak between units) and mixer.
 */
export class AnimatedCharacter {
  readonly object: THREE.Group;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private oneShot: THREE.AnimationAction | null = null;
  private locked = false;
  readonly handSlot: THREE.Object3D | null;

  constructor(spec: CharacterSpec) {
    const gltf = loaded.get(spec.model)!;
    const object = cloneSkinned(gltf.scene) as THREE.Group;
    const optional = new Set(OPTIONAL_PARTS[spec.model]);
    const show = new Set(spec.show);
    const team = spec.teamColor !== undefined ? new THREE.Color(spec.teamColor) : null;

    object.traverse((o) => {
      if (optional.has(o.name)) o.visible = show.has(o.name);
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      // Skinned bounds don't follow the animation; avoid popping out at screen edges.
      mesh.frustumCulled = false;
      const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
      mat.userData.baseEmissive = 0;
      const clothing = TINTABLE.test(mesh.name);
      if (team && TEAM_DYED.test(mesh.name)) {
        // Hats, helmets and cloaks are painted solid in the team color.
        mat.map = null;
        mat.color.copy(team);
      } else if (team && spec.teamColor === BLUE_TEAM && !/Eyes/.test(mesh.name)) {
        // The skeletons' cloth is red in the texture; turn it blue for the blue team.
        applyHueShift(mat, 215, 1.1);
      }
      if (team && /Eyes/.test(mesh.name)) {
        mat.emissive.copy(team);
        mat.emissiveIntensity = 2;
        mat.userData.baseEmissive = 2;
      }
      if (!team && (clothing || HUE_ONLY.test(mesh.name)) && (spec.hue || (spec.sat !== undefined && spec.sat !== 1))) {
        applyHueShift(mat, spec.hue ?? 0, spec.sat ?? 1);
      }
      mesh.material = mat;
    });

    // Normalize height so every model fits the game's scale.
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    const h = Math.max(0.01, box.max.y - box.min.y);
    object.scale.setScalar(spec.height / h);

    this.object = object;
    this.handSlot = object.getObjectByName('handslot.r') ?? null;
    this.mixer = new THREE.AnimationMixer(object);
    for (const clip of gltf.animations) this.actions.set(clip.name, this.mixer.clipAction(clip));
    this.mixer.addEventListener('finished', (ev) => this.onFinished(ev.action as THREE.AnimationAction));
  }

  /** Loops `name`, cross-fading from whatever is playing (or after the current one-shot). */
  loop(name: string, timeScale = 1): void {
    if (this.locked) return;
    const action = this.actions.get(name) ?? this.actions.get('Idle');
    if (!action) return;
    action.timeScale = timeScale;
    if (action === this.current) return;
    const prev = this.current;
    this.current = action;
    if (this.oneShot) return; // resumes when the one-shot finishes
    action.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.15).play();
    prev?.fadeOut(0.15);
  }

  /** Plays `name` once, fully taking over, then cross-fades back to the loop. */
  playOnce(name: string, timeScale = 1): void {
    if (this.locked) return;
    const action = this.actions.get(name);
    if (!action) return;
    if (this.oneShot && this.oneShot !== action) this.oneShot.fadeOut(0.05);
    this.current?.fadeOut(0.08);
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.timeScale = timeScale;
    action.fadeIn(0.05).play();
    this.oneShot = action;
  }

  private onFinished(action: THREE.AnimationAction): void {
    if (action !== this.oneShot || this.locked) return;
    this.oneShot = null;
    action.fadeOut(0.15);
    this.current?.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.15).play();
  }

  /** Plays a death animation and freezes on its last frame until `revive()`. */
  die(): void {
    if (this.locked) return;
    const action = this.actions.get('Death_A');
    this.mixer.stopAllAction();
    this.current = null;
    this.oneShot = null;
    if (action) {
      action.reset().setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
    }
    this.locked = true;
  }

  revive(): void {
    if (!this.locked) return;
    this.locked = false;
    this.mixer.stopAllAction();
    this.current = null;
    this.oneShot = null;
    this.loop('Idle');
  }

  get dead(): boolean {
    return this.locked;
  }

  clipDuration(name: string): number {
    return this.actions.get(name)?.getClip().duration ?? 1;
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }
}
