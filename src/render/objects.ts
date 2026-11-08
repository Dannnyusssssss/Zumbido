/**
 * Objetos del nivel en 3D: la puerta de salida (con su luz tenue), los fusibles y las marcas de tiza.
 * Solo lee el estado del mundo; nunca lo modifica. Se crea por nivel y se libera con dispose().
 */
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  SRGBColorSpace,
  type Scene,
} from 'three';
import { CHALK, OBJECTS } from '../data/balance';
import { Rng } from '../core/rng';
import type { World } from '../game/world';

const EXIT_IDLE = new Color('#6f8fb8');
const EXIT_ACTIVE = new Color('#ffcf86');

/** Dibuja un trazo de tiza irregular. */
function chalkCanvas(kind: 'x' | 'arrow'): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx === null) return c;
  const rng = new Rng(kind === 'x' ? 11 : 22);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const stroke = (pts: ReadonlyArray<[number, number]>): void => {
    // Varias pasadas finas y algo desplazadas imitan el grano de la tiza.
    for (let pass = 0; pass < 5; pass++) {
      ctx.strokeStyle = `rgba(245,242,230,${0.35 + rng.next() * 0.3})`;
      ctx.lineWidth = 5 + rng.next() * 4;
      ctx.beginPath();
      pts.forEach(([x, y], i) => {
        const jx = x + rng.range(-2, 2);
        const jy = y + rng.range(-2, 2);
        if (i === 0) ctx.moveTo(jx, jy);
        else ctx.lineTo(jx, jy);
      });
      ctx.stroke();
    }
  };
  if (kind === 'x') {
    stroke([
      [24, 24],
      [104, 104],
    ]);
    stroke([
      [104, 24],
      [24, 104],
    ]);
  } else {
    // Flecha hacia arriba del lienzo (= hacia donde miraba el jugador).
    stroke([
      [64, 112],
      [64, 18],
    ]);
    stroke([
      [30, 52],
      [64, 18],
      [98, 52],
    ]);
  }
  return c;
}

function chalkMaterial(kind: 'x' | 'arrow'): MeshBasicMaterial {
  const tex = new CanvasTexture(chalkCanvas(kind));
  tex.colorSpace = SRGBColorSpace;
  return new MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    side: DoubleSide,
  });
}

export class ObjectsView {
  private readonly root = new Group();
  private readonly doorMaterial: MeshLambertMaterial;
  private readonly exitLight: PointLight;
  private readonly fuseMeshes: Mesh[] = [];
  private readonly wallMarks: InstancedMesh;
  private readonly floorMarks: InstancedMesh;
  private readonly geometries: Array<BoxGeometry | PlaneGeometry> = [];
  private readonly materials: Array<MeshLambertMaterial | MeshBasicMaterial> = [];
  private chalkVersion = -1;
  private exitWasActive: boolean | null = null;
  private readonly dummy = new Object3D();

  constructor(
    private readonly scene: Scene,
    world: World,
  ) {
    const exit = world.layout.exit;
    const H = OBJECTS.doorHeight;
    const W = OBJECTS.doorWidth;
    const D = OBJECTS.doorDepth;

    // Puerta exenta: marco oscuro y hoja con brillo tenue.
    const frameMat = new MeshLambertMaterial({ color: '#2b2a26' });
    this.doorMaterial = new MeshLambertMaterial({
      color: '#1a1a1a',
      emissive: EXIT_IDLE.clone(),
      emissiveIntensity: 0.3,
    });
    this.materials.push(frameMat, this.doorMaterial);
    const side = new BoxGeometry(0.1, H, D);
    const top = new BoxGeometry(W, 0.1, D);
    const leaf = new BoxGeometry(W - 0.2, H - 0.1, D * 0.5);
    this.geometries.push(side, top, leaf);
    const door = new Group();
    const left = new Mesh(side, frameMat);
    left.position.set(-W / 2 + 0.05, H / 2, 0);
    const right = new Mesh(side, frameMat);
    right.position.set(W / 2 - 0.05, H / 2, 0);
    const lintel = new Mesh(top, frameMat);
    lintel.position.set(0, H - 0.05, 0);
    const leafMesh = new Mesh(leaf, this.doorMaterial);
    leafMesh.position.set(0, (H - 0.1) / 2, 0);
    door.add(left, right, lintel, leafMesh);
    // Luz tenue propia de la salida (fija durante todo el nivel: no cambia el número de luces).
    this.exitLight = new PointLight(EXIT_IDLE.clone(), 1.4, 7, 2);
    // En el modo Deriva no hay salida: ni la puerta ni su luz entran en la escena.
    if (exit !== null) {
      door.position.set(exit.x, 0, exit.z);
      door.rotation.y = exit.rot === 0 ? 0 : Math.PI / 2;
      this.root.add(door);
      this.exitLight.position.set(exit.x, 1.6, exit.z);
      this.root.add(this.exitLight);
    }

    // Fusibles: caja con un piloto fijo (sin parpadeo).
    const fuseGeo = new BoxGeometry(
      OBJECTS.fuseSize,
      OBJECTS.fuseSize * 0.7,
      OBJECTS.fuseSize * 0.5,
    );
    const pilotGeo = new BoxGeometry(0.06, 0.06, 0.02);
    this.geometries.push(fuseGeo, pilotGeo);
    const fuseMat = new MeshLambertMaterial({ color: '#4a4f55' });
    const pilotMat = new MeshBasicMaterial({ color: '#ffd36a' });
    this.materials.push(fuseMat, pilotMat);
    const pedestalGeo = new BoxGeometry(
      OBJECTS.pedestalSize,
      OBJECTS.pedestalHeight,
      OBJECTS.pedestalSize,
    );
    this.geometries.push(pedestalGeo);
    const pedestalMat = new MeshLambertMaterial({ color: '#3a3833' });
    this.materials.push(pedestalMat);
    for (const f of world.layout.fuses) {
      const pedestal = new Mesh(pedestalGeo, pedestalMat);
      pedestal.position.set(f.x, OBJECTS.pedestalHeight / 2, f.z);
      this.root.add(pedestal);
      const body = new Mesh(fuseGeo, fuseMat);
      body.position.set(f.x, OBJECTS.pedestalHeight + (OBJECTS.fuseSize * 0.7) / 2, f.z);
      const pilot = new Mesh(pilotGeo, pilotMat);
      pilot.position.set(0, 0.04, (OBJECTS.fuseSize * 0.5) / 2 + 0.011);
      body.add(pilot);
      body.rotation.y = f.rot * (Math.PI / 2) + 0.4;
      this.fuseMeshes.push(body);
      this.root.add(body);
    }

    // Marcas de tiza instanciadas (pool fijo).
    const markGeo = new PlaneGeometry(CHALK.markSize, CHALK.markSize);
    this.geometries.push(markGeo);
    const xMat = chalkMaterial('x');
    const arrowMat = chalkMaterial('arrow');
    this.materials.push(xMat, arrowMat);
    this.wallMarks = new InstancedMesh(markGeo, xMat, CHALK.poolSize);
    this.floorMarks = new InstancedMesh(markGeo, arrowMat, CHALK.poolSize);
    this.wallMarks.count = 0;
    this.floorMarks.count = 0;
    this.wallMarks.frustumCulled = false;
    this.floorMarks.frustumCulled = false;
    this.root.add(this.wallMarks, this.floorMarks);

    scene.add(this.root);
  }

  update(world: World): void {
    // Estado de la salida: fría e inactiva, cálida al activarse.
    const active = world.exitActive;
    if (active !== this.exitWasActive) {
      this.exitWasActive = active;
      const c = active ? EXIT_ACTIVE : EXIT_IDLE;
      this.doorMaterial.emissive.copy(c);
      this.doorMaterial.emissiveIntensity = active ? 0.5 : 0.3;
      this.exitLight.color.copy(c);
      this.exitLight.intensity = active ? 2.6 : 1.4;
    }
    for (let i = 0; i < this.fuseMeshes.length; i++) {
      (this.fuseMeshes[i] as Mesh).visible = !world.fuseTaken[i];
    }
    if (world.chalk.version !== this.chalkVersion) {
      this.chalkVersion = world.chalk.version;
      this.rebuildChalk(world);
    }
  }

  private rebuildChalk(world: World): void {
    let w = 0;
    let f = 0;
    const d = this.dummy;
    for (const m of world.chalk.marks) {
      d.position.set(m.x, m.y, m.z);
      if (m.onWall) {
        // El plano mira hacia +z por defecto: se gira hacia la normal de la pared.
        d.rotation.set(0, Math.atan2(m.nx, m.nz), 0, 'YXZ');
        d.updateMatrix();
        this.wallMarks.setMatrixAt(w++, d.matrix);
      } else {
        // En el suelo: tumbado y con la flecha hacia donde miraba el jugador.
        d.rotation.set(-Math.PI / 2, m.angle, 0, 'YXZ');
        d.updateMatrix();
        this.floorMarks.setMatrixAt(f++, d.matrix);
      }
    }
    this.wallMarks.count = w;
    this.floorMarks.count = f;
    this.wallMarks.instanceMatrix.needsUpdate = true;
    this.floorMarks.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.scene.remove(this.root);
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) {
      if (m instanceof MeshBasicMaterial) m.map?.dispose();
      m.dispose();
    }
    this.wallMarks.dispose();
    this.floorMarks.dispose();
    this.exitLight.dispose();
  }
}
