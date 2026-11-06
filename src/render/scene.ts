/**
 * Renderer, escena y cámara. Se ajusta al tamaño de la ventana y limita el devicePixelRatio.
 */
import { AmbientLight, Color, Fog, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { CAMERA_FX } from '../data/balance';
import type { LevelDef } from '../data/levels';
import type { QualityPreset } from '../data/quality';

export interface RenderContext {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  ambient: AmbientLight;
  fog: Fog;
}

/** Crea el contexto de render. Devuelve null si WebGL falla. */
export function createRenderContext(container: HTMLElement, level: LevelDef): RenderContext | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
  renderer.domElement.className = 'game-canvas';
  renderer.domElement.setAttribute('aria-label', 'Vista del juego');
  renderer.domElement.tabIndex = -1;
  container.appendChild(renderer.domElement);

  const scene = new Scene();
  const fogColor = new Color(level.palette.fog);
  scene.background = fogColor;
  const fog = new Fog(fogColor, 5, 40);
  scene.fog = fog;
  const ambient = new AmbientLight(
    new Color(level.palette.ambient),
    level.lighting.ambientIntensity,
  );
  scene.add(ambient);

  const camera = new PerspectiveCamera(75, 1, CAMERA_FX.near, 200);
  camera.rotation.order = 'YXZ';
  return { renderer, scene, camera, ambient, fog };
}

/** Aplica tamaño de ventana y tope de devicePixelRatio. */
export function resizeRenderer(ctx: RenderContext, preset: QualityPreset): void {
  const w = Math.max(1, window.innerWidth);
  const h = Math.max(1, window.innerHeight);
  const dpr = Math.min(window.devicePixelRatio || 1, preset.maxPixelRatio);
  ctx.renderer.setPixelRatio(dpr);
  ctx.renderer.setSize(w, h, true);
  ctx.camera.aspect = w / h;
  ctx.camera.updateProjectionMatrix();
}

/** Aplica los parámetros de niebla de la calidad. */
export function applyFog(ctx: RenderContext, preset: QualityPreset): void {
  ctx.fog.near = preset.fogNear;
  ctx.fog.far = preset.fogFar;
  ctx.camera.far = preset.fogFar + 10;
  ctx.camera.updateProjectionMatrix();
}
