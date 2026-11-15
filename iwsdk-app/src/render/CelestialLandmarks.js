/**
 * Celestial Kendama - Distant Celestial Landmarks Layer
 * Role: Person C (Visuals & Rendering)
 *
 * Implements Section 6 distant celestial landmarks for the Pastel Cosmic Fantasy galaxy:
 * - One distant ringed pastel gas giant ("Astraea") at ~73m in the forward upper-left sky.
 * - One distant pastel moon ("Selene") at ~74m along the forward upper-right galactic arch.
 * - One subtle distant silhouette world ("Chroma") at ~78m in the forward-right lower horizon.
 * - Modest visual sizes (~1.2–2.9 deg angular diameter) to establish cosmic scale without dominating.
 * - Positioned outside the forward central interaction cone so kendama and hand tracking remain uncluttered.
 * - Translation-free sky behavior via mat4(mat3(viewMatrix)) preserving per-eye stereo rotation in WebXR.
 * - Clip-space depth pinning (z/w = 0.99990) behind foreground objects (z <= 0.98), in front of stardust/starfield.
 * - depthTest: true with LessEqualDepth, depthWrite: false, renderOrder: -920.
 * - Low-poly procedural geometry and zero external image assets or heavy textures.
 * - Modular architecture designed for seamless later integration with Person B's planet evolution system.
 */

import {
    BackSide,
    Color,
    DoubleSide,
    Group,
    LessEqualDepth,
    Mesh,
    NormalBlending,
    RingGeometry,
    ShaderMaterial,
    SphereGeometry,
    Vector3,
} from 'three';
import { GALACTIC_NORMAL } from './CelestialNebulaShader.js';

/**
 * Palette constants for the Distant Celestial Landmarks.
 */
export const CELESTIAL_LANDMARKS_PALETTE = Object.freeze({
    ASTRAEA_BASE: '#7886C5',      // Dusty Periwinkle
    ASTRAEA_CRESCENT: '#F2B8D0',  // Blush Pink
    ASTRAEA_RIM: '#B9A4D6',       // Soft Lavender
    RING_CHAMPAGNE: '#E8C68D',    // Champagne Gold
    SELENE_BASE: '#B9A4D6',       // Soft Lavender
    SELENE_CRESCENT: '#FFF5F5',   // Pearl White
    CHROMA_BASE: '#18264F',       // Midnight Cosmic Blue
    CHROMA_RIM: '#7886C5',        // Dusty Periwinkle
});

/**
 * Converts a hex string '#RRGGBB' to normalized RGB float array [r, g, b].
 * @param {string} hex
 * @returns {[number, number, number]}
 */
export function hexToRgb(hex) {
    const clean = hex.replace(/^#/u, '').trim();
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    return [
        Math.round(r * 10000) / 10000,
        Math.round(g * 10000) / 10000,
        Math.round(b * 10000) / 10000,
    ];
}

/**
 * GLSL Vertex Shader for distant celestial spheres.
 * Strips camera translation so room-scale walking produces zero parallax,
 * while preserving camera orientation and multiview per-eye transforms.
 * Pins clip-space depth at z/w = 0.99990 (just inside stardust/starfield).
 */
export const CELESTIAL_PLANET_VERTEX_SHADER = /* glsl */ `
varying vec3 vNormal;
varying vec3 vWorldDirection;
varying vec3 vViewNormal;

void main() {
  vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  vWorldDirection = normalize(worldPos);
  vNormal = normalize(mat3(modelMatrix) * normal);
  vViewNormal = normalize(normalMatrix * normal);

  // Strip camera translation from viewMatrix; preserves per-eye stereo rotation in WebXR
  vec4 clipPosition = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(worldPos, 1.0);

  // Pin clip-space depth just inside stardust (z/w = 0.99990)
  gl_Position = vec4(clipPosition.xy, clipPosition.w * 0.99990, clipPosition.w);
}
`;

/**
 * GLSL Fragment Shader for distant celestial spheres.
 * Renders smooth pastel atmospheric crescent illumination with soft fresnel rim.
 */
export const CELESTIAL_PLANET_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uBaseColor;
uniform vec3 uCrescentColor;
uniform vec3 uRimColor;
uniform vec3 uLightDir;
uniform float uOpacity;

varying vec3 vNormal;
varying vec3 vWorldDirection;
varying vec3 vViewNormal;

void main() {
  // Diffuse illumination term - crisp celestial crescent
  float NdotL = dot(vNormal, normalize(uLightDir));
  float crescent = smoothstep(-0.10, 0.58, NdotL);

  // Fresnel atmospheric edge rim glow / halo
  float fresnel = 1.0 - abs(vViewNormal.z);
  float rim = smoothstep(0.35, 0.90, fresnel);

  // Blend from deep base space into luminous crescent
  vec3 color = mix(uBaseColor, uCrescentColor, crescent);
  color = mix(color, uRimColor, rim * 0.60);

  // Subtle Champagne Gold terminator accent
  float goldKiss = smoothstep(0.40, 0.55, NdotL) * (1.0 - smoothstep(0.55, 0.70, NdotL));
  color = mix(color, vec3(0.9098, 0.7765, 0.5529), goldKiss * 0.22);

  // Defined silhouette disc with luminous crescent and atmospheric halo
  float alpha = clamp((crescent * 0.85 + rim * 0.48 + 0.30) * uOpacity, 0.0, 1.0);
  gl_FragColor = vec4(color, alpha);
}
`;

/**
 * GLSL Vertex Shader for planetary ring discs.
 */
export const CELESTIAL_RING_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorldDirection;

void main() {
  vUv = uv;
  vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  vWorldDirection = normalize(worldPos);

  // Strip camera translation; pin clip depth at z/w = 0.99989 (slightly in front of planet)
  vec4 clipPosition = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(worldPos, 1.0);
  gl_Position = vec4(clipPosition.xy, clipPosition.w * 0.99989, clipPosition.w);
}
`;

/**
 * GLSL Fragment Shader for planetary ring discs.
 * Renders antialiased concentric translucent rings in champagne-gold.
 */
export const CELESTIAL_RING_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uRingColor;
uniform float uOpacity;

varying vec2 vUv;
varying vec3 vWorldDirection;

void main() {
  // Analytical radial distance from center
  float dist = length(vUv - vec2(0.5)) * 2.0;

  // Soft inner and outer edge falloff with concentric subtle grooving
  float outerFade = 1.0 - smoothstep(0.85, 1.0, dist);
  float innerFade = smoothstep(0.55, 0.68, dist);
  float groove = 0.82 + 0.18 * sin(dist * 48.0);

  // Subtle gold emissive response and soft golden core glow
  float coreGlow = smoothstep(0.65, 0.80, dist) * (1.0 - smoothstep(0.80, 0.95, dist)) * 0.40;
  vec3 ringColor = mix(uRingColor, vec3(1.0, 0.95, 0.85), coreGlow);

  float ringAlpha = outerFade * innerFade * groove * (uOpacity * 0.92 + coreGlow * 0.15);
  if (ringAlpha < 0.005) {
    discard;
  }

  gl_FragColor = vec4(ringColor, ringAlpha);
}
`;

/**
 * Creates a ShaderMaterial for a distant celestial sphere.
 * @param {object} options
 * @returns {ShaderMaterial}
 */
export function createCelestialPlanetMaterial(options = {}) {
    const {
        baseColor = CELESTIAL_LANDMARKS_PALETTE.ASTRAEA_BASE,
        crescentColor = CELESTIAL_LANDMARKS_PALETTE.ASTRAEA_CRESCENT,
        rimColor = CELESTIAL_LANDMARKS_PALETTE.ASTRAEA_RIM,
        lightDirection = [-0.65, 0.70, 0.30],
        opacity = 1.0,
    } = options;

    const baseRgb = hexToRgb(baseColor);
    const crescentRgb = hexToRgb(crescentColor);
    const rimRgb = hexToRgb(rimColor);

    return new ShaderMaterial({
        uniforms: {
            uBaseColor: { value: new Color(baseRgb[0], baseRgb[1], baseRgb[2]) },
            uCrescentColor: { value: new Color(crescentRgb[0], crescentRgb[1], crescentRgb[2]) },
            uRimColor: { value: new Color(rimRgb[0], rimRgb[1], rimRgb[2]) },
            uLightDir: { value: new Vector3(...lightDirection).normalize() },
            uOpacity: { value: opacity },
        },
        vertexShader: CELESTIAL_PLANET_VERTEX_SHADER,
        fragmentShader: CELESTIAL_PLANET_FRAGMENT_SHADER,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        depthFunc: LessEqualDepth,
        blending: NormalBlending,
    });
}

/**
 * Creates a ShaderMaterial for a planetary ring disc.
 * @param {object} options
 * @returns {ShaderMaterial}
 */
export function createCelestialRingMaterial(options = {}) {
    const {
        ringColor = CELESTIAL_LANDMARKS_PALETTE.RING_CHAMPAGNE,
        opacity = 0.85,
    } = options;

    const colorRgb = hexToRgb(ringColor);

    return new ShaderMaterial({
        uniforms: {
            uRingColor: { value: new Color(colorRgb[0], colorRgb[1], colorRgb[2]) },
            uOpacity: { value: opacity },
        },
        vertexShader: CELESTIAL_RING_VERTEX_SHADER,
        fragmentShader: CELESTIAL_RING_FRAGMENT_SHADER,
        side: DoubleSide,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        depthFunc: LessEqualDepth,
        blending: NormalBlending,
    });
}

/**
 * Creates the complete batched Celestial Landmarks Group containing:
 * 1. Astraea - Distant Ringed Pastel Gas Giant
 * 2. Selene - Distant Pastel Moon
 * 3. Chroma - Distant Silhouette Planet
 *
 * @param {object} [options={}]
 * @returns {Group}
 */
export function createCelestialLandmarks(options = {}) {
    const landmarksGroup = new Group();
    landmarksGroup.name = 'celestial-landmarks';
    landmarksGroup.renderOrder = -920;

    // --- 1. Distant Ringed Gas Giant ("Astraea") ---
    // Cool celestial glow in the forward-left sky (~72.0m away, azimuth -25.8 deg, elevation +16.0 deg)
    const astraeaGeom = new SphereGeometry(2.4, 24, 16);
    const astraeaMat = createCelestialPlanetMaterial({
        baseColor: CELESTIAL_LANDMARKS_PALETTE.ASTRAEA_BASE,
        crescentColor: CELESTIAL_LANDMARKS_PALETTE.SELENE_CRESCENT,
        rimColor: CELESTIAL_LANDMARKS_PALETTE.ASTRAEA_RIM,
        lightDirection: [-0.65, 0.70, 0.30],
        opacity: 0.98,
    });
    const astraeaMesh = new Mesh(astraeaGeom, astraeaMat);
    astraeaMesh.name = 'landmark-astraea';
    astraeaMesh.position.set(-30.0, 21.0, -62.0);
    astraeaMesh.renderOrder = -920;
    astraeaMesh.frustumCulled = false;

    // Ring disc around Astraea
    const ringGeom = new RingGeometry(3.0, 4.6, 32);
    const ringMat = createCelestialRingMaterial({
        ringColor: CELESTIAL_LANDMARKS_PALETTE.RING_CHAMPAGNE,
        opacity: 0.88,
    });
    const ringMesh = new Mesh(ringGeom, ringMat);
    ringMesh.name = 'landmark-astraea-ring';
    ringMesh.rotation.x = Math.PI * 0.42; // Tilted ring plane
    ringMesh.rotation.y = Math.PI * 0.12;
    ringMesh.renderOrder = -919;
    ringMesh.frustumCulled = false;
    astraeaMesh.add(ringMesh);

    landmarksGroup.add(astraeaMesh);

    // --- 2. Distant Pastel Moon ("Selene") ---
    // Soft lunar appearance along the forward-right galactic arch (~73.5m away, azimuth +25.1 deg, elevation +14.9 deg)
    const seleneGeom = new SphereGeometry(1.4, 16, 12);
    const seleneMat = createCelestialPlanetMaterial({
        baseColor: CELESTIAL_LANDMARKS_PALETTE.SELENE_BASE,
        crescentColor: CELESTIAL_LANDMARKS_PALETTE.SELENE_CRESCENT,
        rimColor: CELESTIAL_LANDMARKS_PALETTE.ASTRAEA_CRESCENT,
        lightDirection: [-0.45, 0.70, 0.35],
        opacity: 0.95,
    });
    const seleneMesh = new Mesh(seleneGeom, seleneMat);
    seleneMesh.name = 'landmark-selene';
    seleneMesh.position.set(30.0, 20.0, -64.0);
    seleneMesh.renderOrder = -920;
    seleneMesh.frustumCulled = false;

    landmarksGroup.add(seleneMesh);

    // --- 3. Distant Silhouette Planet ("Chroma") ---
    // Subtle colorful/emissive appearance in the lower-right horizon (~77.7m away, azimuth +16.6 deg, elevation +5.9 deg)
    const chromaGeom = new SphereGeometry(1.7, 16, 12);
    const chromaMat = createCelestialPlanetMaterial({
        baseColor: CELESTIAL_LANDMARKS_PALETTE.CHROMA_BASE,
        crescentColor: CELESTIAL_LANDMARKS_PALETTE.ASTRAEA_CRESCENT,
        rimColor: CELESTIAL_LANDMARKS_PALETTE.CHROMA_RIM,
        lightDirection: [-0.40, 0.60, 0.40],
        opacity: 0.92,
    });
    const chromaMesh = new Mesh(chromaGeom, chromaMat);
    chromaMesh.name = 'landmark-chroma';
    chromaMesh.position.set(22.0, 9.0, -74.0);
    chromaMesh.renderOrder = -920;
    chromaMesh.frustumCulled = false;

    landmarksGroup.add(chromaMesh);

    return landmarksGroup;
}

/**
 * Disposes all geometries and materials contained in a Celestial Landmarks group.
 * @param {Group} group
 */
export function disposeCelestialLandmarks(group) {
    if (!group || typeof group.traverse !== 'function') return;
    group.traverse((child) => {
        if (child.isMesh) {
            child.geometry?.dispose?.();
            if (Array.isArray(child.material)) {
                child.material.forEach((m) => m?.dispose?.());
            } else {
                child.material?.dispose?.();
            }
        }
    });
}
