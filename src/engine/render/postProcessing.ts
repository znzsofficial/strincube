import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FilmPass } from 'three/addons/postprocessing/FilmPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import type { GameSettings } from '../types';

/** Owns all postprocess targets. Created on enable and released on disable. */
export class PostProcessing {
  readonly composer: EffectComposer;
  private bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.18, 0.4, 0.9);
  private film = new FilmPass(0.15);
  private vignette = new ShaderPass(VignetteShader);
  private scanlines = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, strength: { value: 0 } },
    vertexShader:
      'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:
      'uniform sampler2D tDiffuse; uniform float strength; varying vec2 vUv; void main(){vec4 c=texture2D(tDiffuse,vUv); c.rgb*=1.0-strength*(0.5+0.5*sin(gl_FragCoord.y*3.14159265));gl_FragColor=c;}',
  });
  private width = 0;
  private height = 0;
  private ratio: number;
  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.composer = new EffectComposer(renderer);
    this.ratio = renderer.getPixelRatio();
    for (const pass of [
      new RenderPass(scene, camera),
      this.bloom,
      this.vignette,
      this.film,
      this.scanlines,
      new OutputPass(),
      new FXAAPass(),
    ])
      this.composer.addPass(pass);
  }
  apply(settings: GameSettings) {
    this.bloom.enabled = settings.bloomStrength > 0;
    this.bloom.strength = settings.bloomStrength;
    this.vignette.enabled = settings.vignette;
    this.vignette.uniforms.darkness.value = settings.vignetteDarkness;
    this.film.enabled = settings.filmGrain;
    (this.film.uniforms as Record<string, THREE.IUniform>).intensity.value = settings.filmNoise;
    this.scanlines.enabled = settings.filmGrain && settings.filmScanlines > 0;
    this.scanlines.uniforms.strength.value = settings.filmScanlines;
  }
  resize(w: number, h: number, ratio: number) {
    if (ratio !== this.ratio) {
      this.composer.setPixelRatio(ratio);
      this.ratio = ratio;
    }
    if (w !== this.width || h !== this.height) {
      this.composer.setSize(w, h);
      this.width = w;
      this.height = h;
    }
  }
  dispose() {
    for (const pass of this.composer.passes) pass.dispose();
    this.composer.dispose();
  }
}
