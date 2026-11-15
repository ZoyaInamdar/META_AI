/**
 * Celestial Kendama - Procedural Pastel Nebula Shader & Layer
 * Role: Person C (Visuals & Rendering)
 *
 * Implements the Phase 2 procedural pastel nebula layer:
 * - Lightweight 2-octave 3D Simplex noise with restrained domain warping.
 * - Softcore pastel galaxy palette:
 *   - Blush Pink (#F5B7B1)
 *   - Soft Lavender (#C5B4E3)
 *   - Soft Rose Orchid (#D882A7)
 *   - Soft Peach / Warm Champagne (#F8D5B8)
 *   - Pearl White Luminous Glow (#FFF8FA)
 *   - Dusty Periwinkle (#8B9DC3)
 *   - Deep Midnight Violet (#2B1D45) - subtle depth accents only
 * - Clip-space depth placement just inside the far plane (z/w = 0.99999) and camera translation stripping
 *   via mat4(mat3(viewMatrix)) for infinite distance, WebXR multiview compatibility, and correct depth occlusion.
 * - depthTest: true with LessEqualDepth, depthWrite: false, renderOrder: -950, and smooth horizon/nadir fade to preserve IWSDK DomeFade.
 * - Zero external textures or heavy image assets: 100% procedural GLSL math.
 */

import {
    BackSide,
    Color,
    LessEqualDepth,
    Mesh,
    NormalBlending,
    ShaderMaterial,
    SphereGeometry,
} from 'three';

/**
 * Shared mathematical definition of the diagonal galactic plane normal vector.
 * Oriented so the galactic band sweeps gracefully across the forward viewing hemisphere,
 * passing through the forward meridian at ~17.3 degrees elevation to frame the central
 * Kendama play area without occluding it.
 */
export const GALACTIC_NORMAL = Object.freeze([-0.3215, 0.9042, 0.2813]);

/**
 * Palette constants for the Celestial Nebula shader (Pastel Cosmic Fantasy).
 */
export const CELESTIAL_NEBULA_PALETTE = Object.freeze({
    MIDNIGHT_BLUE: '#18264F',
    DEEP_NEBULA_BLUE: '#344B83',
    DUSTY_PERIWINKLE: '#7886C5',
    DEEP_LAVENDER: '#796A9F',
    SOFT_LAVENDER: '#B9A4D6',
    BLUSH_PINK: '#F2B8D0',
    SOFT_PEACH: '#F6D2C2',
    PEARL_WHITE: '#FFF5F5',
    CHAMPAGNE_GOLD: '#E8C68D',
    SOFT_GOLD: '#DBB67D',
    WARM_PEARL_GOLD: '#F5E2BD',
    WHITE_GOLD: '#FDF7EA',
    // Compatibility aliases
    DEEP_VIOLET: '#18264F',
    ROSE_ORCHID: '#F2B8D0',
});

/**
 * GLSL Vertex Shader for the Celestial Nebula Layer.
 * Strips camera translation so movement produces zero sky parallax,
 * while preserving camera orientation and multiview per-eye transforms.
 * Positions clip-space depth just inside the far plane (z/w = 0.99999)
 * so depth testing passes against background clear depth (1.0) while being
 * reliably occluded by all foreground opaque geometry (kendama, hands, plinth).
 */
export const CELESTIAL_NEBULA_VERTEX_SHADER = /* glsl */ `
varying vec3 vWorldDirection;

void main() {
  vec3 worldDirection = mat3(modelMatrix) * position;
  vWorldDirection = normalize(worldDirection);

  // Strip camera translation from viewMatrix; preserves per-eye stereo rotation in WebXR
  vec4 clipPosition = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(worldDirection, 1.0);

  // Pin clip-space depth just inside the far plane (z/w = 0.99999 < 1.0)
  gl_Position = vec4(clipPosition.xy, clipPosition.w * 0.99999, clipPosition.w);
}
`;

/**
 * GLSL Fragment Shader for the Celestial Nebula Layer.
 * Uses analytical 3D Simplex noise with 1 domain-warp step and 2 octaves,
 * mapped to the softcore pastel color ramp with horizon falloff.
 */
export const CELESTIAL_NEBULA_FRAGMENT_SHADER = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform float uNebulaIntensity;

varying vec3 vWorldDirection;

// --- Analytical 3D Simplex Noise ---
vec4 permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  // First corner
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  // Other corners
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + 1.0 * C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;

  // Permutations
  i = mod(i, 289.0);
  vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  // Gradients
  float n_ = 1.0 / 7.0; // N=7
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z); // mod(p, N*N)

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_); // mod(j, N)

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  // Normalise gradients
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  // Mix contributions
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// --- Pastel Cosmic Fantasy Palette ---
const vec3 cMidnightBlue    = vec3(0.0941, 0.1490, 0.3098); // #18264F - concentrated in distant deep space
const vec3 cDeepNebulaBlue  = vec3(0.2039, 0.2941, 0.5137); // #344B83 - background spatial depth
const vec3 cDustyPeriwinkle = vec3(0.4706, 0.5255, 0.7725); // #7886C5 - outer cloud transition
const vec3 cDeepLavender    = vec3(0.4745, 0.4157, 0.6235); // #796A9F - cosmic contrast & shadow
const vec3 cSoftLavender    = vec3(0.7255, 0.6431, 0.8392); // #B9A4D6 - defining cloud body
const vec3 cLavender        = cSoftLavender;                // Alias for backwards compatibility
const vec3 cBlushPink       = vec3(0.9490, 0.7216, 0.8157); // #F2B8D0 - defining illuminated nebula
const vec3 cSoftPeach       = vec3(0.9647, 0.8235, 0.7608); // #F6D2C2 - delicate warm highlight
const vec3 cPearlWhite      = vec3(1.0000, 0.9608, 0.9608); // #FFF5F5 - brilliant core highlight
const vec3 cChampagneGold   = vec3(0.9098, 0.7765, 0.5529); // #E8C68D - delicate threaded filaments & primary belt
const vec3 cSoftGold        = vec3(0.8588, 0.7137, 0.4902); // #DBB67D - soft warm gold base
const vec3 cWarmPearlGold   = vec3(0.9608, 0.8863, 0.7412); // #F5E2BD - warm pearl-gold node transition
const vec3 cWhiteGold       = vec3(0.9922, 0.9686, 0.9176); // #FDF7EA - sparkling white-gold core highlight

// Shared diagonal galactic normal (-0.3215, 0.9042, 0.2813)
// Passes through forward sky at +17.3 deg elevation, framing above Kendama
const vec3 cGalacticNormal = vec3(-0.3215, 0.9042, 0.2813);

void main() {
  vec3 dir = normalize(vWorldDirection);
  float t = uTime * 0.035;

  // 1. Multi-scale 3D domain-warp flow
  vec3 warp = vec3(
    snoise(dir * 1.6 + vec3(0.0, t * 0.35, 1.2)),
    snoise(dir * 1.6 + vec3(3.7, 1.1, -t * 0.28)),
    snoise(dir * 1.6 + vec3(-1.8, -t * 0.32, 4.2))
  );

  // 2. Warped galactic band structure (sweeping 360-degree diagonal ribbon across the sky)
  // Narrowed band envelope: concentrated distant galactic plane with soft falloff and restrained sky coverage
  vec3 warpedDir = dir + 0.30 * warp;
  float galDist = abs(dot(normalize(warpedDir), cGalacticNormal));

  // Concentrated diagonal band: narrow core (~9 deg half-width) and soft wisps (~16 deg half-width)
  float bandCore = 1.0 - smoothstep(0.02, 0.16, galDist);
  float bandWisps = (1.0 - smoothstep(0.06, 0.28, galDist)) * 0.50;

  // 3. Multi-octave FBM for detailed organic wisps and irregular layered cloud formations
  vec3 fbmCoords = dir * 2.80 + 0.40 * warp;
  float oct1 = snoise(fbmCoords);
  float oct2 = snoise(fbmCoords * 2.25 + vec3(-t * 0.2, t * 0.15, 0.5));
  float oct3 = snoise(fbmCoords * 4.60 + vec3(t * 0.1, -t * 0.25, -0.8));
  float fbm = oct1 * 0.52 + oct2 * 0.33 + oct3 * 0.15; // Three octaves [-1..1]

  // 4. Subtle dark cosmic crevices / dust lanes giving clouds 3D depth and distinct dark gaps
  float creviceNoise = abs(snoise(fbmCoords * 2.10 + vec3(1.7, -2.3, 0.9)));
  float dustLane = smoothstep(0.04, 0.34, creviceNoise);

  // 5. Cloud density with galactic concentration:
  // Clouds are soft, distant, and localized into layered structures rather than filling the camera
  float rawCloud = smoothstep(-0.06, 0.70, fbm);
  float galacticCloud = rawCloud * (bandCore * 0.75 + bandWisps * (oct2 * 0.40 + 0.50));
  galacticCloud *= mix(0.18, 1.0, dustLane); // Dark cosmic crevices creating depth gaps

  // Faint deep-space ethereal background haze outside the main band (midnight/deep blue depth)
  float deepCosmicHaze = (oct1 * 0.5 + 0.5) * 0.10 * (1.0 - bandCore);
  float density = clamp(galacticCloud + deepCosmicHaze, 0.0, 1.0);

  // 6. 9-Stop Pastel Cosmic Fantasy Color Ramp
  // Strict hierarchy: deep blue -> blue/lavender -> lavender -> pink/peach -> occasional white/gold highlights
  vec3 color;
  if (density < 0.25) {
    float f = smoothstep(0.0, 0.25, density);
    color = mix(cMidnightBlue, cDeepNebulaBlue, f);
  } else if (density < 0.45) {
    float f = smoothstep(0.25, 0.45, density);
    color = mix(cDeepNebulaBlue, cDeepLavender, f);
  } else if (density < 0.64) {
    float f = smoothstep(0.45, 0.64, density);
    color = mix(cDeepLavender, cDustyPeriwinkle, f);
  } else if (density < 0.80) {
    float f = smoothstep(0.64, 0.80, density);
    color = mix(cDustyPeriwinkle, cSoftLavender, f);
  } else if (density < 0.91) {
    float f = smoothstep(0.80, 0.91, density);
    color = mix(cSoftLavender, cBlushPink, f);
  } else if (density < 0.97) {
    float f = smoothstep(0.91, 0.97, density);
    color = mix(cBlushPink, cSoftPeach, f);
  } else {
    float f = smoothstep(0.97, 1.0, density);
    color = mix(cSoftPeach, cPearlWhite, f);
  }

  // 7. Delicate champagne-gold filaments and peak-density cosmic highlights
  float filament = smoothstep(0.42, 0.85, warp.x * 0.5 + 0.5) * bandCore * smoothstep(0.55, 0.88, density);
  float peakGold = smoothstep(0.92, 1.0, density) * bandCore;
  color = mix(color, cChampagneGold, clamp(filament * 0.24 + peakGold * 0.32, 0.0, 0.50));

  // 8. Forward focal bloom and horizon fade reference
  float horizonFade = smoothstep(-0.65, 0.05, dir.y);
  float forwardFocal = (1.0 - smoothstep(-0.6, 0.5, dir.z)) * 0.03;
  density = clamp(density + forwardFocal, 0.0, 1.0);

  // 9. Whimsical Lower Atmosphere: Dreamcore Blush Pink & Soft Peach Glow
  // Gradual vertical transition: Deep Blue (zenith) -> Periwinkle/Lavender -> Soft Lavender -> Blush Pink -> Soft Peach
  // Combines whimsical pink character with blue-violet spatial depth and subtle 3D noise (never a flat wall)
  float lowerAtmosphere = smoothstep(0.18, -0.42, dir.y);
  float lowerSpatialNoise = snoise(dir * 2.2 + vec3(1.1, 2.3, 3.4)) * 0.06;
  float pinkDepth = clamp(lowerAtmosphere + lowerSpatialNoise, 0.0, 1.0);

  // Soft atmospheric gradient with blue-violet depth underneath:
  vec3 pinkAtmosphereColor = mix(cDeepLavender, cSoftLavender, smoothstep(0.10, 0.40, pinkDepth));
  pinkAtmosphereColor = mix(pinkAtmosphereColor, cBlushPink, smoothstep(0.40, 0.75, pinkDepth));
  pinkAtmosphereColor = mix(pinkAtmosphereColor, cSoftPeach, smoothstep(0.75, 1.0, pinkDepth) * 0.50);

  // Deep blue-violet foundation remains present in the lowest depth:
  vec3 deepSpaceFloor = mix(cDeepNebulaBlue, cMidnightBlue, smoothstep(-0.10, -0.85, dir.y));
  pinkAtmosphereColor = mix(pinkAtmosphereColor, deepSpaceFloor, smoothstep(-0.35, -0.95, dir.y) * 0.45);

  // Smoothly blend the whimsical pink atmosphere into the environment:
  color = mix(color, pinkAtmosphereColor, smoothstep(0.15, -0.25, dir.y) * 0.78);

  // 10. Golden Celestial Orbital Belt & Astronomical Ring System
  // Angled 3D orbital plane tilted at ~21 degrees, arching behind Kendama (+18 deg to +26 deg elevation in forward sky)
  // Passing near Astraea (forward-left) and Selene (forward-right) to unify the cosmic ring system
  const vec3 cBeltNormal = vec3(0.1387, 0.9245, 0.3547);
  vec3 beltU = normalize(cross(cBeltNormal, vec3(0.0, 1.0, 0.0)));
  vec3 beltV = cross(cBeltNormal, beltU);

  float distToBelt = abs(dot(dir, cBeltNormal));
  float beltAngle = atan(dot(dir, beltV), dot(dir, beltU));

  // Extremely slow, tranquil orbital drift (~785s complete rotation period)
  float beltTime = uTime * 0.008;
  float angleAnim = beltAngle - beltTime;

  // Fragmented organic arc segments: gaps, varied segment lengths, and soft fading tips
  float segPattern = sin(angleAnim * 2.0 + 0.4) * 0.55 + 
                     sin(angleAnim * 5.0 - 0.8) * 0.30 + 
                     cos(angleAnim * 1.0 + 1.2) * 0.25;
  float arcMask = smoothstep(0.08, 0.45, segPattern);

  // Primary belt cross-section: luminous champagne-gold core arc + soft ethereal halo + fine ring micro-grooving
  float coreArc = 1.0 - smoothstep(0.002, 0.012, distToBelt);
  float haloArc = (1.0 - smoothstep(0.006, 0.035, distToBelt)) * 0.42;
  float beltGroove = 0.85 + 0.15 * sin(distToBelt * 420.0);
  float primaryBelt = (coreArc * 0.75 + haloArc) * beltGroove * arcMask;

  // 2-4 Secondary fragmented arcs at different depths and inclinations:
  // Secondary Arc 1: Inner concentric resonance arc
  float distSec1 = abs(dot(dir, cBeltNormal) - 0.042);
  float arcMaskSec1 = smoothstep(0.32, 0.65, sin(angleAnim * 4.0 + 2.1) * 0.5 + 0.5);
  float secArc1 = (1.0 - smoothstep(0.002, 0.015, distSec1)) * arcMaskSec1 * 0.35;

  // Secondary Arc 2: Tilted cross-inclined arc passing behind Selene & upper arch
  const vec3 cSecNormal2 = vec3(0.28, 0.82, 0.48);
  float distSec2 = abs(dot(dir, normalize(cSecNormal2)) + 0.038);
  float arcMaskSec2 = smoothstep(0.30, 0.65, cos((angleAnim + 1.5) * 3.2) * 0.5 + 0.5);
  float secArc2 = (1.0 - smoothstep(0.002, 0.018, distSec2)) * arcMaskSec2 * 0.28;

  // Secondary Arc 3: Distant faint whispering arc passing near Astraea & upper left
  const vec3 cSecNormal3 = vec3(-0.12, 0.91, 0.38);
  float distSec3 = abs(dot(dir, normalize(cSecNormal3)) - 0.065);
  float arcMaskSec3 = smoothstep(0.38, 0.70, sin((angleAnim - 0.9) * 3.8) * 0.5 + 0.5);
  float secArc3 = (1.0 - smoothstep(0.002, 0.016, distSec3)) * arcMaskSec3 * 0.22;

  float secondaryArcs = secArc1 + secArc2 + secArc3;

  // Gold energy nodes along the belt (stars / points of light along the orbit)
  float nodeWave1 = pow(max(0.0, sin(angleAnim * 6.0 + 1.1)), 18.0);
  float nodeWave2 = pow(max(0.0, cos(angleAnim * 9.0 - 0.6)), 24.0);
  float nodeWave3 = pow(max(0.0, sin(angleAnim * 4.0 + 3.2)), 16.0);
  float nodeIntensity = nodeWave1 * 0.95 + nodeWave2 * 0.68 + nodeWave3 * 0.82;
  float nodes = nodeIntensity * (1.0 - smoothstep(0.003, 0.024, distToBelt)) * (arcMask * 0.8 + 0.2);

  // Small number of distinctive golden sparkle bursts (star-shaped cross glints)
  float sparkPhase1 = pow(max(0.0, sin(angleAnim * 3.0 + 0.7)), 32.0);
  float sparkPhase2 = pow(max(0.0, cos(angleAnim * 5.0 - 2.3)), 36.0);
  float sparkPulse = 0.80 + 0.20 * sin(uTime * 1.5 + angleAnim * 6.0);
  float sparkleCore = (sparkPhase1 * 1.0 + sparkPhase2 * 0.75) * sparkPulse;

  float rayBelt = max(0.0, 1.0 - distToBelt * 50.0);
  float rayTan = max(0.0, 1.0 - abs(fract(angleAnim * 1.5 + 0.2) - 0.5) * 20.0);
  float sparkleGlint = sparkleCore * (rayBelt * 0.7 + rayTan * 0.5);

  // Golden color hierarchy: soft gold -> champagne gold -> warm pearl-gold -> white-gold highlights
  vec3 beltBaseColor = mix(cSoftGold, cChampagneGold, arcMask);
  float highlightFactor = clamp(nodes * 0.85 + sparkleGlint * 1.2, 0.0, 1.0);
  vec3 beltShineColor = mix(beltBaseColor, cWarmPearlGold, smoothstep(0.25, 0.70, highlightFactor));
  beltShineColor = mix(beltShineColor, cWhiteGold, smoothstep(0.70, 0.98, highlightFactor));

  // Atmospheric fade: softly dissolves into lower pink/lavender atmosphere
  float beltAtmosphereFade = smoothstep(-0.30, 0.08, dir.y);
  // Subtle 3D volumetric noise variation for cosmic depth:
  float beltDepthNoise = 0.82 + 0.18 * snoise(dir * 3.2 + vec3(1.4, 2.8, -1.2));

  float totalBeltStrength = (primaryBelt * 0.70 + secondaryArcs * 0.40 + nodes * 0.60 + sparkleGlint * 0.75) * beltAtmosphereFade * beltDepthNoise;
  totalBeltStrength = clamp(totalBeltStrength, 0.0, 0.82);

  // Blend golden celestial belt into cosmic scene
  color = mix(color, beltShineColor, totalBeltStrength * 0.78);

  // Output alpha blending over native DomeGradient
  // Multi-tier alpha curve: deep space foundation (0.75), volumetric clouds (0.12), localized luminous core (0.05), and golden belt (0.05)
  float baseAlpha = 0.75;
  float cloudAlpha = smoothstep(0.28, 0.78, density) * 0.12;
  float coreAlpha = smoothstep(0.78, 0.97, density) * 0.05;
  float beltAlpha = totalBeltStrength * 0.05;
  float alpha = (baseAlpha + cloudAlpha + coreAlpha + beltAlpha) * uOpacity * uNebulaIntensity;
  alpha = clamp(alpha, 0.0, 0.88);

  gl_FragColor = vec4(color, alpha);
}
`;

/**
 * Creates the ShaderMaterial for the Celestial Nebula Layer.
 * @param {object} [options={}]
 * @param {number} [options.opacity=1.0] - Overall opacity multiplier.
 * @param {number} [options.intensity=0.85] - Nebula intensity factor.
 * @returns {ShaderMaterial}
 */
export function createCelestialNebulaMaterial(options = {}) {
    const {
        opacity = 1.0,
        intensity = 0.85,
    } = options;

    return new ShaderMaterial({
        uniforms: {
            uTime: { value: 0.0 },
            uOpacity: { value: opacity },
            uNebulaIntensity: { value: intensity },
        },
        vertexShader: CELESTIAL_NEBULA_VERTEX_SHADER,
        fragmentShader: CELESTIAL_NEBULA_FRAGMENT_SHADER,
        side: BackSide,
        depthWrite: false,
        depthTest: true,
        depthFunc: LessEqualDepth,
        transparent: true,
        blending: NormalBlending,
    });
}

/**
 * Creates the Three.js Mesh for the Celestial Nebula Layer.
 * Uses a lightweight SphereGeometry, rendered with BackSide and renderOrder: -950
 * so it draws immediately after IWSDK DomeGradient (-1e9) and strictly before
 * all standard scene objects (0).
 *
 * @param {object} [options={}]
 * @param {number} [options.radius=1.0] - Unit radius (clip-space depth handles actual distance).
 * @param {number} [options.widthSegments=32]
 * @param {number} [options.heightSegments=16]
 * @returns {Mesh}
 */
export function createCelestialNebulaMesh(options = {}) {
    const {
        radius = 1.0,
        widthSegments = 32,
        heightSegments = 16,
        ...materialOptions
    } = options;

    const geometry = new SphereGeometry(radius, widthSegments, heightSegments);
    const material = createCelestialNebulaMaterial(materialOptions);

    const mesh = new Mesh(geometry, material);
    mesh.name = 'celestial-nebula-shell';
    mesh.renderOrder = -950;
    mesh.frustumCulled = false;

    return mesh;
}
