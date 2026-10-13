import * as THREE from 'three';
import { MAP, type Team, type World } from '@lol/shared';

const RES = 160;
/** Brightness multiplier for terrain in the fog. */
const FOG_DARKNESS = 0.32;

/**
 * Fog of war: a low-res vision mask (white = visible) painted from the player's
 * team viewers each frame, sampled by patched terrain materials and the minimap.
 */
export class FogOfWar {
  readonly canvas = document.createElement('canvas');
  readonly texture: THREE.CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly uniform: { value: THREE.Texture };

  constructor(private readonly team: Team) {
    this.canvas.width = this.canvas.height = RES;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    // Canvas row 0 is world z = 0, so sample without flipping.
    this.texture.flipY = false;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.uniform = { value: this.texture };
  }

  update(world: World): void {
    const g = this.ctx;
    const k = RES / MAP.size;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#000';
    g.fillRect(0, 0, RES, RES);
    g.globalCompositeOperation = 'lighter';
    for (const e of world.entities.values()) {
      if (e.dead || e.team !== this.team || e.sightRange <= 0) continue;
      const r = e.sightRange * k;
      const x = e.pos.x * k;
      const y = e.pos.y * k;
      const grad = g.createRadialGradient(x, y, r * 0.75, x, y, r);
      grad.addColorStop(0, '#fff');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    this.texture.needsUpdate = true;
  }

  /** Makes a material darker wherever the player's team has no vision. */
  apply(material: THREE.Material): void {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.fogMap = this.uniform;
      shader.vertexShader = `varying vec3 vFogWorld;\n${shader.vertexShader}`.replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vec4 fogPos = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          fogPos = instanceMatrix * fogPos;
        #endif
        vFogWorld = (modelMatrix * fogPos).xyz;`,
      );
      shader.fragmentShader = `uniform sampler2D fogMap;\nvarying vec3 vFogWorld;\n${shader.fragmentShader}`.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        float fogVis = texture2D(fogMap, clamp(vFogWorld.xz / ${MAP.size.toFixed(1)}, 0.0, 1.0)).r;
        gl_FragColor.rgb *= mix(${FOG_DARKNESS.toFixed(2)}, 1.0, fogVis);`,
      );
    };
    material.needsUpdate = true;
  }

  /** Applies the fog to every mesh material under `root`. */
  applyTree(root: THREE.Object3D): void {
    root.traverse((o) => {
      const mat = (o as THREE.Mesh).material;
      if (!mat || o instanceof THREE.Sprite) return;
      for (const m of Array.isArray(mat) ? mat : [mat]) this.apply(m);
    });
  }
}
