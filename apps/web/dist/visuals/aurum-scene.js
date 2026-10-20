/**
 * Noklith Aurum scene, adapted from the user's supplied aurum-peak.html.
 * Actual source heightfield, barycentric wireframe, clouds, hover subdivision,
 * lens distortion, parallax, mist, grain and vignette are preserved.
 * Three.js r143 is local; no CDN, network requests, storage or page controls.
 */
import * as THREE from './vendor/three-r143.module.js';

const AURUM_DEFAULTS = Object.freeze({
  // clouds / atmosphere
  bgColor:        '#1e1915',   // deep charcoal base
  cloudColor:     '#5d4c3c',   // mid warm cloud
  cloudHigh:      '#c8b08c',   // hot golden cloud rim
  cloudScale:     3.2,         // fbm frequency
  cloudCover:     0.34,        // lower = more cloud (distinct puffs, not just haze)
  cloudSpeed:     0.07,        // horizontal drift (visible animated march across the sky)
  hazeColor:      '#75624c',   // warm haze the far terrain dissolves into (hides the horizon edge)
  hazeStart:      18.0,        // camera distance where the haze/fade begins
  hazeEnd:        21.0,        // camera distance where the terrain is fully faded out (past the mesh's far edge)
  // drifting mist band that hugs the lower mountain (height-gaussian, slowly animated)
  mistColor:      '#72614e',   // fog tint
  mistAmt:        0.45,        // fog opacity (0 = off)
  mistHeight:     0.7,         // world-Y centre of the fog belt (just above the floor)
  mistBand:       1.6,         // vertical thickness of the belt
  // wireframe mountain
  lineColor:      '#b39268',   // base gold edge
  peakColor:      '#efe3c9',   // hot peak / rim edge
  faceColor:      '#4b3a2c',   // dark mountain surface tint (relief shading)
  faceFootDark:   0.55,        // how much the surface darkens toward the FOOT of the mountain (0 = flat, 1 = base goes black)
  lineWidth:      1.1,         // edge thickness (px)
  lineBright:     1.0,         // edge core brightness
  lineGlow:       0.32,        // soft in-shader halo (replaces bloom → no flicker)
  bottomFade:     1.0,         // wireframe fades toward the near foreground (by camera distance)
  footFade:       0.85,        // wireframe line colour dims toward the FOOT of the mountain (low height)
  peakHeight:     4.4,         // central summit height (taller → steeper)
  ridgeAmp:       1.35,        // jagged ridge amplitude (strong relief)
  // hover triangle fill
  fillColor:      '#dcc8a4',   // small-triangle fill tint
  hoverRadius:    2.6,         // world radius of the fill zone (soft feathered patch under the cursor)
  subDiv:         6.0,         // sub-triangles per edge (denser small-triangle grid)
  subWidth:       1.25,        // sub-line thickness (px)
  fillGlow:       0.36,         // interior wash inside the zone
  // interaction / post
  parallaxAmt:    0.55,        // camera parallax on mouse
  distortAmt:     0.12,        // lens pull under cursor (strong warp on hover)
  distortRadius:  0.34,        // distortion reach (uv)
  chromatic:      0.0004,      // RGB-split fringe on the edges (subtle — no coloured line split)
  grain:          0.024,       // film grain
  vignette:       0.58,        // corner darkening
  bloomStr:       0.0,         // selective bloom (off — glow is in-shader now)
  bloomRadius:    0.55,
  bloomThresh:    0.0,
  appearFade:     0.0
})

/**
 * Draw one continuous scene on a canvas. Parent controls its CSS size.
 * @param {HTMLCanvasElement} canvas
 * @param {{pointerTarget?:Element,maxDpr?:number,fps?:number,config?:object,
 *          onError?:(error:Error)=>void}} [options]
 * @returns {{pause:Function,resume:Function,resize:Function,dispose:Function,
 *            renderAt:Function,readonly reducedMotion:boolean}}
 */
export function mountAurumScene(canvas, options = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') {
    throw new TypeError('mountAurumScene requires a canvas element.');
  }
  const CONFIG = { ...AURUM_DEFAULTS, ...options.config };
  const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = reducedQuery.matches;
  const pointerTarget = options.pointerTarget || canvas;
  let renderer;
  try {
    renderer = new THREE.WebGL1Renderer({ canvas, antialias: true,
      alpha: false, powerPreference: 'low-power', preserveDrawingBuffer: false });
  } catch (error) {
    canvas.dataset.sceneStatus = 'fallback';
    if (options.onError) options.onError(error);
    return {pause(){}, resume(){}, resize(){}, dispose(){}, renderAt(){},
      get reducedMotion(){return reducedMotion;}};
  }
  canvas.dataset.sceneStatus = 'ready';
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(CONFIG.bgColor);
  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 140);
  const CAM_BASE = new THREE.Vector3(0, 2.7, 10.5);
  const CAM_TARGET = new THREE.Vector3(0, 0.7, -1.2);
  camera.position.copy(CAM_BASE);
  camera.layers.set(3);
  scene.add(camera);
const LAYERS = { ENTIRE_SCENE: 3 }
const clamp = (v, mn, mx) => Math.max(mn, Math.min(mx, v))
const Lerp = (a, b, t) => a + (b - a) * t

function hexToVec3(hex) {
  const n = parseInt(hex.slice(1), 16)
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

/* ---------- CPU value noise (drives the terrain height field) ---------- */
function jhash(x, y) { const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.floor(h) }
function jnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf)
  const a = jhash(xi, yi), b = jhash(xi + 1, yi), c = jhash(xi, yi + 1), d = jhash(xi + 1, yi + 1)
  return a + (b - a) * u + (c - a) * v * (1 - u) + (d - b) * u * v
}
function jfbm(x, y) { let f = 0, amp = 0.5; for (let i = 0; i < 4; i++) { f += amp * jnoise(x, y); x *= 2.03; y *= 2.01; amp *= 0.5 } return f }
function jridge(x, y) { return 1 - Math.abs(jnoise(x, y) * 2 - 1) }
function jridgefbm(x, y) { let f = 0, amp = 0.5; for (let i = 0; i < 5; i++) { f += amp * jridge(x, y); x *= 2.05; y *= 2.03; amp *= 0.5 } return f }

// Single finishing pass applies the source's cursor lens, vignette and film grain.
const FinalPass = {
  uniforms: {
    tDiffuse:     { value: null },
    uMouse:       { value: new THREE.Vector2(0.5, 0.5) },
    uDistortAmt:  { value: CONFIG.distortAmt },
    uDistortR:    { value: CONFIG.distortRadius },
    uDistortAct:  { value: 0 },
    uAspect:      { value: 1 },
    uTime:        { value: 0 },
    uGrain:       { value: CONFIG.grain },
    uVignette:    { value: CONFIG.vignette },
    uCA:          { value: CONFIG.chromatic }
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 uMouse; uniform float uDistortAmt, uDistortR, uDistortAct, uAspect, uTime, uGrain, uVignette, uCA;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    vec3 sampleAll(vec2 u){ return texture2D(tDiffuse, u).rgb; }
    void main() {
      vec2 uv = vUv;
      // aspect-correct distance to the cursor
      vec2 d = uv - uMouse; d.x *= uAspect;
      float dist = length(d);
      float infl = smoothstep(uDistortR, 0.0, dist) * uDistortAct;
      // refractive lens: pull the image toward the cursor + a faint swirl
      float sw = infl * 0.14;
      mat2 rot = mat2(cos(sw), -sin(sw), sin(sw), cos(sw));
      vec2 off = (uv - uMouse);
      off = rot * off;
      uv = uMouse + off * (1.0 - infl * uDistortAmt);
      // chromatic aberration — radial RGB split (the orange/cyan fringe on the wire)
      vec2 caoff = (vUv - 0.5) * uCA;
      float r = sampleAll(uv + caoff).r;
      float g = sampleAll(uv).g;
      float b = sampleAll(uv - caoff).b;
      vec3 col = vec3(r, g, b);
      // vignette
      float vig = smoothstep(0.85, 0.24, length(vUv - 0.5));
      col *= mix(1.0, vig, uVignette);
      // film grain
      col += (hash(gl_FragCoord.xy + uTime) - 0.5) * uGrain;
      gl_FragColor = vec4(col, 1.0);
    }`
}

class AurumPeak {
  constructor(scene) {
    this.group = new THREE.Group()
    scene.add(this.group)
    this.hit = new THREE.Vector2(0, 0)
    this.hitActive = 0
    this.raycaster = new THREE.Raycaster()
    this.raycaster.layers.enable(LAYERS.ENTIRE_SCENE)   // terrain lives on ENTIRE_SCENE — without this the ray never hits it → hover fill stays dark

    this._buildClouds()
    this._buildTerrain()
  }

  /* ---- drifting cloud backdrop ---- */
  _buildClouds() {
    this.cloudUniforms = {
      uTime:  { value: 0 }, uAlpha: { value: 0 },
      uScale: { value: CONFIG.cloudScale }, uCover: { value: CONFIG.cloudCover }, uSpeed: { value: CONFIG.cloudSpeed },
      uBg:    { value: hexToVec3(CONFIG.bgColor) },
      uCloud: { value: hexToVec3(CONFIG.cloudColor) },
      uHigh:  { value: hexToVec3(CONFIG.cloudHigh) }
    }
    const mat = new THREE.ShaderMaterial({
      uniforms: this.cloudUniforms,
      depthWrite: true, depthTest: true,
      vertexShader: `
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        varying vec2 vUv;
        uniform float uTime, uAlpha, uScale, uCover, uSpeed;
        uniform vec3 uBg, uCloud, uHigh;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p){
          vec2 i = floor(p), f = fract(p);
          float a = hash(i), b = hash(i + vec2(1,0)), c = hash(i + vec2(0,1)), d = hash(i + vec2(1,1));
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
        }
        float fbm(vec2 p){
          float v = 0.0, a = 0.5;
          for(int i = 0; i < 6; i++){ v += a * noise(p); p *= 2.02; a *= 0.5; }
          return v;
        }
        void main(){
          vec2 p = vUv * uScale;
          p.x += uTime * uSpeed;
          float f  = fbm(p + vec2(0.0, uTime * uSpeed * 0.25));
          float f2 = fbm(p * 1.9 + vec2(11.0, -uTime * uSpeed * 0.6));
          float field = f * 0.65 + f2 * 0.5;
          float clouds = smoothstep(uCover, uCover + 0.55, field);
          float vgrad = smoothstep(-0.15, 1.0, vUv.y);           // brighter up top
          vec3 col = mix(uBg * 0.6, uBg * 1.1, vgrad);
          // hot horizon haze band across the full width — the sunset light behind the ranges
          float band = smoothstep(0.26, 0.46, vUv.y) * smoothstep(0.72, 0.46, vUv.y);
          col += uHigh * band * 0.5;
          // hot sunburst glow pushed to the UPPER-RIGHT (behind/right of the peak), like the ref
          float glow = smoothstep(0.74, 0.0, distance(vUv * vec2(1.0, 1.2), vec2(0.72, 0.82) * vec2(1.0, 1.2)));
          col += uHigh * glow * 0.78;
          col += uHigh * pow(glow, 3.0) * 0.65;                // hotter core
          vec3 cl = mix(uCloud, uHigh, smoothstep(0.45, 1.0, field));
          col = mix(col, cl, clouds * (0.35 + 0.65 * vgrad));
          // heavier darker clouds toward the TOP-LEFT (the ref's shadowed sky)
          float tl = smoothstep(0.35, 1.0, (1.0 - vUv.x) * 0.6 + vUv.y * 0.7);
          col *= mix(1.0, 0.55, tl);
          // distant SOLID mountain ranges behind the wireframe (dark silhouettes in the haze)
          float sil1 = 0.40 + 0.17 * fbm(vec2(vUv.x * 3.2 + 2.0, 1.7));
          float sil2 = 0.35 + 0.12 * fbm(vec2(vUv.x * 6.0 + 20.0, 4.2));
          float m1 = smoothstep(sil1 + 0.025, sil1 - 0.05, vUv.y);
          float m2 = smoothstep(sil2 + 0.02, sil2 - 0.05, vUv.y);
          col = mix(col, uBg * 0.42, m1 * 0.85);          // far range
          col = mix(col, uBg * 0.18, m2 * 0.95);          // nearer range
          gl_FragColor = vec4(col * uAlpha, 1.0);
        }`
    })
    // large plane filling the frustum, well behind the summit
    const geo = new THREE.PlaneGeometry(96, 56)
    this.clouds = new THREE.Mesh(geo, mat)
    this.clouds.position.set(0, 1.5, -16)
    this.clouds.renderOrder = -10
    this.clouds.layers.set(LAYERS.ENTIRE_SCENE)
    this.group.add(this.clouds)
  }

  /* ---- CPU height field (shared by mesh build + raycast shape) ---- */
  static height(x, z) {
    const P = CONFIG.peakHeight, A = CONFIG.ridgeAmp
    // TWO summits unioned by max() → a natural saddle / gully between them (ref shape)
    // SINGLE central massif (the ref is one pyramid-ish peak, not a two-summit ridge)
    const dxa = x - 0.0, dza = z + 1.0
    const ra = Math.sqrt(dxa * dxa * 0.45 + dza * dza * 0.85)   // lower X coeff → wider mountain base left/right
    const ma = Math.max(0, 1 - ra / 5.6)           // narrower base → reads as a peak
    const coneA = Math.pow(ma, 1.16) * P           // steeper sides
    let h = coneA
    const mask = ma                                // where the mountain mass is
    // broad curvature — bends the slopes so they aren't straight
    h += A * 0.9 * (jfbm(x * 0.24 + 7.0, z * 0.24) - 0.5) * Math.pow(mask, 0.5)
    // PRIMARY ridgelines — coherent crags spanning a few cells (the mountain's main relief)
    const rd = jridgefbm(x * 0.40 + 12.0, z * 0.40 + 3.0)   // ~0..1, sharp ridges
    h += A * 1.9 * (rd - 0.42) * Math.pow(mask, 0.55)
    // MID crags at ~cell scale → tilts individual facets (triangles distort)
    const rd2 = jridgefbm(x * 0.85 + 40.0, z * 0.85 + 8.0)
    h += A * 1.2 * (rd2 - 0.45) * Math.pow(mask, 0.8)
    // fine per-cell jitter for a rugged low-poly surface
    h += A * 0.7 * (jfbm(x * 1.7 + 20.0, z * 1.7) - 0.5) * Math.pow(mask, 1.0)
    // faint undulation on the flat floor (fades out under the mountain)
    h += 0.06 * (jfbm(x * 0.5 + 5.0, z * 0.5) - 0.5) * (1.0 - mask)
    return h - 0.15
  }

  _buildTerrain() {
    const NX = 42, NZ = 30                          // finer triangulation → denser wireframe net (matches the ref)
    const X0 = -19.0, X1 = 19.0, Z0 = -15.0, Z1 = 13.0  // wide L/R, deep back (haze hides the far edge), past camera → no bottom gap
    const H = AurumPeak.height
    // grid of heights
    const px = (i) => X0 + (X1 - X0) * (i / NX)
    const pz = (j) => Z0 + (Z1 - Z0) * (j / NZ)
    const pos = [], bary = []
    const B = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
    const pushVert = (x, z, k) => {
      pos.push(x, H(x, z), z)
      bary.push(B[k][0], B[k][1], B[k][2])
    }
    for (let j = 0; j < NZ; j++) {
      for (let i = 0; i < NX; i++) {
        const x0 = px(i), x1 = px(i + 1), z0 = pz(j), z1 = pz(j + 1)
        // tri A
        pushVert(x0, z0, 0); pushVert(x1, z0, 1); pushVert(x1, z1, 2)
        // tri B
        pushVert(x0, z0, 0); pushVert(x1, z1, 1); pushVert(x0, z1, 2)
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('bary', new THREE.Float32BufferAttribute(bary, 3))
    geo.computeBoundingSphere()

    this.terrainUniforms = {
      uAlpha:     { value: 0 },
      uLine:      { value: hexToVec3(CONFIG.lineColor) },
      uPeak:      { value: hexToVec3(CONFIG.peakColor) },
      uFill:      { value: hexToVec3(CONFIG.fillColor) },
      uFace:      { value: hexToVec3(CONFIG.faceColor) },
      uFaceFoot:  { value: CONFIG.faceFootDark },
      uLineW:     { value: CONFIG.lineWidth },
      uLineBright:{ value: CONFIG.lineBright },
      uGlow:      { value: CONFIG.lineGlow },
      uSubDiv:    { value: CONFIG.subDiv },
      uSubW:      { value: CONFIG.subWidth },
      uFillGlow:  { value: CONFIG.fillGlow },
      uHit:       { value: new THREE.Vector2(0, 0) },
      uHitR:      { value: CONFIG.hoverRadius },
      uHitAct:    { value: 0 },
      uPeakH:     { value: CONFIG.peakHeight },
      uResY:      { value: 1 },
      uFadeH:     { value: CONFIG.bottomFade },
      uFootFade:  { value: CONFIG.footFade },
      uHaze:      { value: hexToVec3(CONFIG.hazeColor) },
      uFogNear:   { value: CONFIG.hazeStart },
      uFogFar:    { value: CONFIG.hazeEnd },
      uTime:      { value: 0 },
      uMist:      { value: hexToVec3(CONFIG.mistColor) },
      uMistAmt:   { value: CONFIG.mistAmt },
      uMistY:     { value: CONFIG.mistHeight },
      uMistW:     { value: CONFIG.mistBand }
    }
    const mat = new THREE.ShaderMaterial({
      uniforms: this.terrainUniforms,
      transparent: true, depthWrite: true, depthTest: true,    // opaque body (alpha 1) that dissolves to alpha 0 at the far horizon
      side: THREE.DoubleSide,                                   // heightfield: never cull → no see-through
      extensions: { derivatives: true },
      vertexShader: `
        attribute vec3 bary;
        varying vec3 vBary; varying float vY; varying vec2 vXZ; varying vec3 vWorld; varying vec3 vView;
        void main(){
          vBary = bary; vY = position.y;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz; vXZ = wp.xz; vView = cameraPosition - wp.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        #extension GL_OES_standard_derivatives : enable
        precision highp float;
        varying vec3 vBary; varying float vY; varying vec2 vXZ; varying vec3 vWorld; varying vec3 vView;
        uniform float uAlpha, uLineW, uLineBright, uGlow, uSubDiv, uSubW, uFillGlow, uHitR, uHitAct, uPeakH, uResY, uFadeH, uFootFade, uFogNear, uFogFar, uTime, uMistAmt, uMistY, uMistW;
        uniform vec3 uLine, uPeak, uFill, uFace, uHaze, uMist; uniform vec2 uHit; uniform float uFaceFoot;
        // outer triangle edges (crisp, fwidth-antialiased)
        float edgeF(vec3 bc, float w){
          vec3 dd = fwidth(bc);
          vec3 a = smoothstep(vec3(0.0), dd * w, bc);
          return 1.0 - min(min(a.x, a.y), a.z);
        }
        // soft glow halo around every edge (subtle, no bloom → no flicker)
        float haloF(vec3 bc, float wpx){
          vec3 dd = fwidth(bc);
          vec3 an = bc / max(dd, vec3(1e-5));
          float md = min(min(an.x, an.y), an.z);
          return exp(-md / max(wpx, 0.001));
        }
        // triangular subdivision grid (3 line families → small triangles)
        float subF(vec3 bc, float N, float w){
          vec3 b = bc * N;
          vec3 fr = fract(b);
          vec3 dl = min(fr, 1.0 - fr);
          vec3 dd = fwidth(b);
          vec3 a = smoothstep(vec3(0.0), dd * w, dl);
          return 1.0 - min(min(a.x, a.y), a.z);
        }
        void main(){
          // flat (low-poly) face normal from screen-space derivatives — this is what
          // reveals the terrain RELIEF (each triangle shaded by its own facing).
          vec3 N = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
          vec3 V = normalize(vView);
          if (dot(N, V) < 0.0) N = -N;                       // face the viewer (DoubleSide-safe)
          vec3 L = normalize(vec3(0.15, 0.55, -1.0));       // low sun BEHIND the ridge (backlight)
          float diff = max(dot(N, L), 0.0);
          float rim = pow(1.0 - abs(dot(N, V)), 2.2);        // bright silhouette / crest rim
          float h = clamp((vY + 0.4) / (uPeakH + 0.4), 0.0, 1.0);
          // dark relief-shaded mountain surface (occludes whatever is behind it)
          vec3 face = uFace * (0.34 + 0.42 * diff) + uPeak * rim * 0.28;
          // darken the surface toward the FOOT of the mountain (low height) — base sinks into shadow
          face *= mix(1.0 - uFaceFoot, 1.0, h);
          // glowing wireframe edges riding the surface
          float wire = edgeF(vBary, uLineW);
          float halo = haloF(vBary, 6.0) * uGlow;
          vec3 edgeCol = mix(uLine, uPeak, max(h * 0.7, rim));
          // hover fill — fine sub-triangles light up near the cursor
          float hd = distance(vXZ, uHit);
          float fill = smoothstep(uHitR, 0.0, hd);
          fill = pow(fill, 2.2) * uHitAct;   // gamma-softened falloff → long feathered edge, gentle bloom to the core
          float sub = subF(vBary, uSubDiv, uSubW) * fill;
          // smooth fade of the glowing lines toward the near foreground — done by
          // CAMERA DISTANCE (not screen-Y) so it follows the floor perspective and
          // never reads as a hard horizontal band. uFadeH scales how strong it is.
          float nf = smoothstep(3.0, 12.5, length(vView));  // 0 close to camera → 1 further in (dark near foreground)
          float fadeB = mix(1.0, nf, clamp(uFadeH, 0.0, 1.0));
          // dim the line colour toward the FOOT of the mountain (low height) so the crest reads brightest
          float foot = mix(1.0, smoothstep(-0.05, 0.55, h), clamp(uFootFade, 0.0, 1.0));
          float lf = fadeB * foot;                          // combined line-fade factor
          vec3 col = face;
          col += edgeCol * halo * 0.5 * lf;
          col += uFill * fill * uFillGlow * 0.5 * fadeB;   // warm wash brightens the zone
          col = mix(col, edgeCol * uLineBright, wire * lf);
          col = mix(col, uFill * 2.2, clamp(sub * fadeB, 0.0, 1.0));  // fine sub-triangles light up hot
          // drifting mist belt hugging the lower mountain — a height-gaussian band,
          // broken up + slowly drifted by a cheap wave so it reads as fog, not a stripe.
          float drift = 0.6 + 0.4 * sin(vWorld.x * 0.55 + uTime * 0.14) * cos(vWorld.z * 0.5 - uTime * 0.11);
          float mist = exp(-pow((vY - uMistY) / max(uMistW, 0.001), 2.0)) * uMistAmt * drift;
          col = mix(col, uMist, clamp(mist, 0.0, 1.0));
          // distance haze — the far terrain first hazes to a warm tint, then dissolves to
          // ALPHA 0 so the real sky (cloud plane behind) shows through → no horizon seam.
          float fog = smoothstep(uFogNear, uFogFar, length(vView));
          col = mix(col, uHaze, fog * 0.7);
          gl_FragColor = vec4(col, uAlpha * (1.0 - fog));  // body opaque, far edge fades out; uAlpha = load fade-in
        }`
    })
    this.terrain = new THREE.Mesh(geo, mat)
    this.terrain.renderOrder = 2
    this.terrain.layers.set(LAYERS.ENTIRE_SCENE)   // off BLOOM_SCENE — glow is in-shader, no bloom flicker
    this.group.add(this.terrain)
  }

  /* ---- raycast the cursor onto the summit for the fill zone ---- */
  updateHit(ndc) {
    if (!this.terrain) return
    camera.updateMatrixWorld()
    this.terrain.updateMatrixWorld()
    this.raycaster.setFromCamera(ndc, camera)
    const hits = this.raycaster.intersectObject(this.terrain, false)
    if (hits.length) {
      this.hit.set(hits[0].point.x, hits[0].point.z)
      this.hitActive = 1
    } else {
      this.hitActive = 0
    }
  }

  resize() {}

  render(t) {
    this.cloudUniforms.uTime.value = t
    this.terrainUniforms.uTime.value = t
    // objects stay fully opaque — the load fade is a black DOM overlay fading UP from black
    this.cloudUniforms.uAlpha.value = 1
    this.terrainUniforms.uAlpha.value = 1
    // ease the hover state so the fill grows/shrinks smoothly
    this.terrainUniforms.uHit.value.lerp(this.hit, 0.25)
    this.terrainUniforms.uHitAct.value = Lerp(this.terrainUniforms.uHitAct.value, this.hitActive, 0.12)
  }
}


  const sceneObj = new AurumPeak(scene);
  const target = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false
  });
  const finalMaterial = new THREE.ShaderMaterial({
    uniforms: FinalPass.uniforms, vertexShader: FinalPass.vertexShader,
    fragmentShader: FinalPass.fragmentShader, depthWrite: false, depthTest: false
  });
  finalMaterial.uniforms.tDiffuse.value = target.texture;
  const screen = new THREE.Scene();
  const screenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const screenQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), finalMaterial);
  screen.add(screenQuad);
  const pointer = {x:0,y:0,tx:0,ty:0,active:0};
  const ndc = new THREE.Vector2();
  let width = 1, height = 1, dpr = 1, destroyed = false, manuallyPaused = false;
  let intersecting = true, hidden = document.hidden, contextLost = false;
  let raf = 0, time = 4.5, lastTime = 0, lastFrame = 0;
  const interval = 1000 / Math.max(12, Math.min(options.fps || 30, 60));
  const maxDpr = Math.max(1, Math.min(options.maxDpr || 2, 2));

  function resize() {
    if (destroyed) return;
    const box = canvas.getBoundingClientRect();
    width = Math.max(1, Math.round(box.width));
    height = Math.max(1, Math.round(box.height));
    dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    // Keep especially tall mobile canvases within a 4 MP render budget.
    dpr = Math.min(dpr, Math.sqrt(4000000 / (width * height)));
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    target.setSize(Math.round(width*dpr), Math.round(height*dpr));
    camera.aspect = width/height;
    // Tall panels still show the summit rather than cropping it into a wall.
    camera.position.z = width/height < .7 ? 12.5 : CAM_BASE.z;
    camera.updateProjectionMatrix();
    finalMaterial.uniforms.uAspect.value = width/height;
    sceneObj.terrainUniforms.uResY.value = height*dpr;
    sceneObj.terrainUniforms.uLineW.value = CONFIG.lineWidth*dpr;
    sceneObj.terrainUniforms.uSubW.value = CONFIG.subWidth*dpr;
    if (!contextLost) draw(time);
  }

  function draw(t) {
    if (destroyed || contextLost) return;
    pointer.x = Lerp(pointer.x, pointer.tx, .08);
    pointer.y = Lerp(pointer.y, pointer.ty, .08);
    const px = reducedMotion ? 0 : pointer.x*CONFIG.parallaxAmt;
    const py = reducedMotion ? 0 : pointer.y*CONFIG.parallaxAmt;
    camera.position.set(CAM_BASE.x+px, CAM_BASE.y-py*.5,
      width/height < .7 ? 12.5 : CAM_BASE.z);
    camera.lookAt(CAM_TARGET.x+px*.15, CAM_TARGET.y-py*.1, CAM_TARGET.z);
    if (pointer.active && !reducedMotion) sceneObj.updateHit(ndc);
    else sceneObj.hitActive = 0;
    sceneObj.render(t);
    finalMaterial.uniforms.uTime.value = t;
    finalMaterial.uniforms.uDistortAct.value = Lerp(
      finalMaterial.uniforms.uDistortAct.value, reducedMotion ? 0 : pointer.active, .1);
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(screen, screenCamera);
  }

  function shouldRun() {
    return !destroyed && !manuallyPaused && intersecting && !hidden && !contextLost && !reducedMotion;
  }
  function tick(now) {
    raf = 0;
    if (!shouldRun()) {lastTime = 0; return;}
    if (now-lastFrame >= interval-.5) {
      if (lastTime) time += Math.min((now-lastTime)/1000,.1);
      lastTime=now; lastFrame=now; draw(time);
    }
    raf=requestAnimationFrame(tick);
  }
  function sync() {
    if (shouldRun()) {if(!raf) raf=requestAnimationFrame(tick);}
    else {cancelAnimationFrame(raf); raf=0; lastTime=0;}
  }
  function onMove(event) {
    if(reducedMotion || destroyed) return;
    const rect=canvas.getBoundingClientRect();
    const nx=clamp((event.clientX-rect.left)/rect.width,0,1);
    const ny=clamp((event.clientY-rect.top)/rect.height,0,1);
    pointer.tx=nx*2-1; pointer.ty=ny*2-1; pointer.active=1;
    ndc.set(pointer.tx,-pointer.ty);
    finalMaterial.uniforms.uMouse.value.set(nx,1-ny);
  }
  function onLeave() {pointer.active=0; pointer.tx=0; pointer.ty=0;}
  function onVisibility() {hidden=document.hidden;sync();}
  function onMotion(event) {reducedMotion=event.matches;onLeave();draw(time);sync();}
  function onContextLost(event) {event.preventDefault();contextLost=true;sync();}
  function onContextRestored() {contextLost=false;resize();sync();}
  pointerTarget.addEventListener('pointermove',onMove,{passive:true});
  pointerTarget.addEventListener('pointerleave',onLeave,{passive:true});
  document.addEventListener('visibilitychange',onVisibility);
  reducedQuery.addEventListener('change',onMotion);
  canvas.addEventListener('webglcontextlost',onContextLost);
  canvas.addEventListener('webglcontextrestored',onContextRestored);
  const resizeObserver=new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  const intersectionObserver=new IntersectionObserver(entries=>{
    intersecting=entries[0].isIntersecting;sync();
  },{rootMargin:'120px'});
  intersectionObserver.observe(canvas);
  resize();sync();

  return {
    pause(){manuallyPaused=true;sync();},
    resume(){manuallyPaused=false;sync();},
    resize,
    // Deterministic still capture for the locally hosted fallback poster.
    renderAt(seconds){manuallyPaused=true;sync();time=Number(seconds)||0;draw(time);},
    get reducedMotion(){return reducedMotion;},
    dispose(){
      if(destroyed) return;
      destroyed=true;cancelAnimationFrame(raf);
      resizeObserver.disconnect();intersectionObserver.disconnect();
      pointerTarget.removeEventListener('pointermove',onMove);
      pointerTarget.removeEventListener('pointerleave',onLeave);
      document.removeEventListener('visibilitychange',onVisibility);
      reducedQuery.removeEventListener('change',onMotion);
      canvas.removeEventListener('webglcontextlost',onContextLost);
      canvas.removeEventListener('webglcontextrestored',onContextRestored);
      scene.traverse(object=>{
        if(object.geometry) object.geometry.dispose();
        if(object.material) object.material.dispose();
      });
      screenQuad.geometry.dispose();finalMaterial.dispose();
      target.dispose();renderer.dispose();
      canvas.dataset.sceneStatus='disposed';
    }
  };
}
