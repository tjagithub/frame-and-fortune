import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

/** Studio reactions: a colour wash that decays back to the warm idle look. */
export type Cue = "good" | "bad" | "bonus" | "party";

const GOLD = new THREE.Color(0xffc24a);
const CUE: Record<Cue, THREE.Color> = {
  good: new THREE.Color(0x3ecf8e),
  bad: new THREE.Color(0xff3344),
  bonus: new THREE.Color(0xff4d9d),
  party: new THREE.Color(0xffffff),
};
const SPOT_COLORS = [0xffc24a, 0xff4d9d, 0x4cc9f0];

let cue: { kind: Cue; level: number; until: number } | null = null;

export function studioCue(kind: Cue, seconds = kind === "party" ? 4 : 1.2): void {
  cue = { kind, level: 1, until: performance.now() + seconds * 1000 };
}

function bulbRing(radius: number, count: number, z: number, y = 0): THREE.Vector3[] {
  return Array.from({ length: count }, (_, i) => {
    const a = (i / (count - 1)) * Math.PI;
    return new THREE.Vector3(Math.cos(a) * radius, y + Math.sin(a) * radius, z);
  });
}

function column(x: number, z: number, count: number): THREE.Vector3[] {
  return Array.from({ length: count }, (_, i) => new THREE.Vector3(x, 0.3 + i * 0.42, z));
}

/** Additive cone of light pointing down +Z from its apex, brightest near the lamp. */
function beam(color: number): THREE.Mesh {
  const geo = new THREE.ConeGeometry(2.4, 12, 48, 1, true);
  geo.translate(0, -6, 0);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uAlpha: { value: 0.16 } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vView;
      void main() { vUv = uv; vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0); vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uAlpha; varying vec2 vUv; varying vec3 vN; varying vec3 vView;
      void main() { float edge = pow(abs(dot(vN, vView)), 1.6);
        gl_FragColor = vec4(uColor, uAlpha * pow(vUv.y, 1.4) * edge); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  return new THREE.Mesh(geo, mat);
}

export function startStudio(): void {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.domElement.className = "studio";
  document.body.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05050a);
  scene.fog = new THREE.FogExp2(0x05050a, 0.05);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ color: 0x0b0b14, metalness: 0.7, roughness: 0.28 }),
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor, new THREE.AmbientLight(0x404060, 0.4));

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.6, 2.75, 96),
    new THREE.MeshBasicMaterial({ color: 0xffc24a, toneMapped: false, transparent: true, opacity: 0.5 }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(0, 0.01, -1);
  scene.add(ring);

  const spots: { light: THREE.SpotLight; beam: THREE.Mesh; base: THREE.Color; phase: number }[] = [];
  SPOT_COLORS.forEach((c, i) => {
    const light = new THREE.SpotLight(c, 90, 30, 0.38, 0.6, 1.2);
    light.position.set((i - 1) * 5, 10, 1);
    scene.add(light, light.target);
    const b = beam(c);
    b.position.copy(light.position);
    scene.add(b);
    spots.push({ light, beam: b, base: new THREE.Color(c), phase: i * 2.1 });
  });

  const points = [
    ...bulbRing(7.4, 52, -6, -1), ...bulbRing(9.2, 64, -9, -1), ...bulbRing(11, 76, -12, -1),
    ...column(-9.5, -2, 16), ...column(9.5, -2, 16), ...column(-12, -5, 20), ...column(12, -5, 20),
  ];
  const bulbs = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.075, 10, 8),
    new THREE.MeshBasicMaterial({ toneMapped: false }),
    points.length,
  );
  const m = new THREE.Matrix4();
  points.forEach((p, i) => {
    bulbs.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z));
    bulbs.setColorAt(i, GOLD);
  });
  scene.add(bulbs);

  const dustGeo = new THREE.BufferGeometry();
  const dust = new Float32Array(900 * 3).map((_, i) => (i % 3 === 0 ? (Math.random() - 0.5) * 24 : i % 3 === 1 ? Math.random() * 10 : -Math.random() * 16 + 4));
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dust, 3));
  const motes = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: 0xffe8b0, size: 0.035, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  scene.add(motes);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.85, 0.6, 0.15);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const resize = () => {
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
    bloom.resolution.set(innerWidth / 2, innerHeight / 2);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener("resize", resize);
  resize();

  const mouse = new THREE.Vector2();
  window.addEventListener("pointermove", (e) => mouse.set((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1));

  const tint = new THREE.Color();
  const col = new THREE.Color();
  const clock = new THREE.Clock();
  const frame = () => {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    const t = clock.getElapsedTime();
    const now = performance.now();
    if (cue && now > cue.until) cue.level = Math.max(0, cue.level - 0.03);
    if (cue && cue.level === 0) cue = null;
    const k = cue?.level ?? 0;
    const party = cue?.kind === "party" || cue?.kind === "bonus";
    if (cue) tint.copy(party ? col.setHSL((t * 0.6) % 1, 0.9, 0.6) : CUE[cue.kind]);

    camera.position.set(Math.sin(t * 0.07) * 0.8 + mouse.x * 0.7, 2.4 - mouse.y * 0.35, 9.5 + Math.sin(t * 0.05) * 0.4);
    camera.lookAt(0, 2.6, -3);

    const speed = party ? 14 : 6;
    points.forEach((_, i) => {
      const on = Math.sin(t * speed - i * 0.55) > 0 ? 1 : 0.18;
      col.copy(GOLD).lerp(tint, k).multiplyScalar(on * (1.6 + k * 1.5));
      bulbs.setColorAt(i, col);
    });
    bulbs.instanceColor!.needsUpdate = true;

    spots.forEach((s) => {
      const sweep = party ? 1.4 : 0.35;
      s.light.target.position.set(Math.sin(t * sweep + s.phase) * 5, 0, Math.cos(t * sweep * 0.7 + s.phase) * 3 - 2);
      s.beam.lookAt(s.light.target.position);
      col.copy(s.base).lerp(party ? tint.clone().offsetHSL(s.phase / 6, 0, 0) : tint, k);
      s.light.color.copy(col);
      s.light.intensity = 90 + k * 160;
      const u = (s.beam.material as THREE.ShaderMaterial).uniforms;
      u.uColor!.value.copy(col);
      u.uAlpha!.value = 0.16 + k * 0.22;
    });
    (ring.material as THREE.MeshBasicMaterial).color.copy(GOLD).lerp(tint, k);
    ring.scale.setScalar(1 + Math.sin(t * 2) * 0.02 + k * 0.15);
    motes.rotation.y = t * 0.01;
    bloom.strength = 0.85 + k * 0.6;
    composer.render();
  };
  frame();
}
