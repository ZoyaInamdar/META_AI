/**
 * Celestial Kendama - Procedural Pastel Galaxy Starfield Layer
 * Role: Person C (Visuals & Rendering)
 *
 * Implements Phase 3A subtle, elegant pastel starfield:
 * - Single batched THREE.Points draw call (~1,200 stars) on a single THREE.BufferGeometry.
 * - Deterministic pseudo-random distribution around the player at 75–85 metres.
 * - Full 360-degree unbiased spherical distribution with a quiet central gameplay cone.
 * - Restrained pastel galaxy palette:
 *   - Pearl White: #FFF8FA (dominant, ~80%)
 *   - Pale Lavender: #DCCCF5 (~11%)
 *   - Warm Champagne: #F7E7CE (~6%)
 *   - Soft Blush: #F5C8D8 (~3% subtle accent)
 * - Restrained twinkling: Per-star frequency, phase, and amplitude in GLSL with zero CPU allocations per frame.
 * - Translation-free sky behavior via mat4(mat3(viewMatrix)) preserving per-eye stereo rotation in WebXR.
 * - Clip-space depth pinning just inside far plane (z/w = 0.99998) behind foreground scene objects,
 *   with depthTest: true, LessEqualDepth, depthWrite: false, and renderOrder: -940.
 * - Antialiased circular point discs via analytical smoothstep in fragment shader.
 * - Complete showroom preservation: Hidden in showroom mode, active only in gameplay mode.
 */

import {
    BufferAttribute,
    BufferGeometry,
    Color,
    LessEqualDepth,
    NormalBlending,
    Points,
    ShaderMaterial,
} from 'three';
import { GALACTIC_NORMAL } from './CelestialNebulaShader.js';

/**
 * Palette constants for the Celestial Starfield (Pastel Cosmic Fantasy).
 */
export const CELESTIAL_STARFIELD_PALETTE = Object.freeze({
    PEARL_WHITE: '#FFF5F5',
    CHAMPAGNE_GOLD: '#E8C68D',
    SOFT_LAVENDER: '#B9A4D6',
    BLUSH_PINK: '#F2B8D0',
    DUSTY_PERIWINKLE: '#7886C5',
    // Compatibility aliases
    WARM_CHAMPAGNE: '#E8C68D',
    PALE_LAVENDER: '#B9A4D6',
    SOFT_BLUSH: '#F2B8D0',
});

export const DEFAULT_STAR_COUNT = 1200;
export const DEFAULT_MIN_DISTANCE = 75.0;
export const DEFAULT_MAX_DISTANCE = 85.0;
export const DEFAULT_RANDOM_SEED = 0xCE1E57;

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
 * Mulberry32 deterministic 32-bit pseudo-random number generator.
 * Produces uniform float values in [0, 1) from a reproducible integer seed.
 * @param {number} [seed=DEFAULT_RANDOM_SEED]
 * @returns {() => number}
 */
export function createDeterministicPrng(seed = DEFAULT_RANDOM_SEED) {
    let s = (typeof seed === 'number' && Number.isFinite(seed) ? seed : DEFAULT_RANDOM_SEED) >>> 0;
    return function next() {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * GLSL Vertex Shader for the Celestial Starfield.
 * Strips camera translation so stars follow room-scale tracking with zero sky parallax,
 * while preserving camera orientation and multiview per-eye transforms.
 * Evaluates per-star gentle twinkling and pins clip-space depth just inside the far plane (z/w = 0.99998).
 */
export const CELESTIAL_STARFIELD_VERTEX_SHADER = /* glsl */ `
attribute vec3 color;
attribute float aSize;
attribute vec3 aTwinkle; // (phase, frequency, amplitude)
attribute float aBaseAlpha;

varying vec3 vColor;
varying float vAlpha;
varying vec3 vWorldDirection;

uniform float uTime;
uniform float uStarScale;

void main() {
  vec3 worldDirection = mat3(modelMatrix) * position;
  vWorldDirection = normalize(worldDirection);
  vColor = color;

  // Gentle, slow twinkle calculation per star vertex
  // Modulates smoothly between (1.0 - amplitude) and 1.0 (never flashes or turns off completely)
  float sineWave = sin(uTime * aTwinkle.y + aTwinkle.x);
  float twinkleMod = 1.0 - aTwinkle.z * (0.5 + 0.5 * sineWave);
  vAlpha = aBaseAlpha * twinkleMod;

  // Translation stripping from viewMatrix; preserves per-eye stereo rotation in WebXR
  vec4 clipPosition = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(worldDirection, 1.0);

  // Pin clip-space depth just inside the far plane (z/w = 0.99998)
  // Behind foreground scene objects (z <= 0.98), in front of nebula (0.99999) and DomeGradient (1.0)
  gl_Position = vec4(clipPosition.xy, clipPosition.w * 0.99998, clipPosition.w);

  gl_PointSize = aSize * uStarScale;
}
`;

/**
 * GLSL Fragment Shader for the Celestial Starfield.
 * Renders smooth circular antialiased point discs with soft radial falloff
 * and nadir/horizon fade to preserve the studio floor and DomeFade.
 */
export const CELESTIAL_STARFIELD_FRAGMENT_SHADER = /* glsl */ `
uniform float uOpacity;
uniform float uStarfieldIntensity;

varying vec3 vColor;
varying float vAlpha;
varying vec3 vWorldDirection;

void main() {
  // Soft circular point disk: discard fragments outside unit circle
  vec2 coord = gl_PointCoord - vec2(0.5);
  float distSq = dot(coord, coord);
  if (distSq > 0.25) {
    discard;
  }

  // Smooth circular falloff from center (0.0) to edge (0.5) with crisp pinpoint core
  float dist = sqrt(distSq);
  float radialFalloff = 1.0 - smoothstep(0.18, 0.5, dist);
  float corePinpoint = (1.0 - smoothstep(0.0, 0.22, dist)) * 0.40;

  // Soft horizon/nadir fade: Continuous across horizon with smooth lower hemisphere taper
  float groundFade = smoothstep(-0.55, -0.05, vWorldDirection.y);

  float finalAlpha = vAlpha * (radialFalloff + corePinpoint) * groundFade * uOpacity * uStarfieldIntensity;
  if (finalAlpha < 0.005) {
    discard;
  }

  // Golden shimmer enhancement for Champagne Gold stars
  float isGold = step(0.85, vColor.r) * step(0.70, vColor.g) * (1.0 - step(0.65, vColor.b));
  vec3 outColor = mix(vColor, vec3(1.0, 0.94, 0.82), isGold * corePinpoint * 0.50);

  gl_FragColor = vec4(outColor, finalAlpha);
}
`;

/**
 * Generates deterministic starfield vertex data arrays.
 * @param {object} [options={}]
 * @param {number} [options.count=DEFAULT_STAR_COUNT]
 * @param {number} [options.minDistance=DEFAULT_MIN_DISTANCE]
 * @param {number} [options.maxDistance=DEFAULT_MAX_DISTANCE]
 * @param {number} [options.seed=DEFAULT_RANDOM_SEED]
 * @returns {{
 *   positions: Float32Array,
 *   colors: Float32Array,
 *   sizes: Float32Array,
 *   twinkles: Float32Array,
 *   baseAlphas: Float32Array,
 *   count: number,
 *   stats: object
 * }}
 */
export function generateStarfieldData(options = {}) {
    const {
        count = DEFAULT_STAR_COUNT,
        minDistance = DEFAULT_MIN_DISTANCE,
        maxDistance = DEFAULT_MAX_DISTANCE,
        seed = DEFAULT_RANDOM_SEED,
    } = options;

    const prng = createDeterministicPrng(seed);

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const twinkles = new Float32Array(count * 3);
    const baseAlphas = new Float32Array(count);

    const cPearlWhite = hexToRgb(CELESTIAL_STARFIELD_PALETTE.PEARL_WHITE);
    const cChampagne = hexToRgb(CELESTIAL_STARFIELD_PALETTE.WARM_CHAMPAGNE);
    const cLavender = hexToRgb(CELESTIAL_STARFIELD_PALETTE.PALE_LAVENDER);
    const cBlush = hexToRgb(CELESTIAL_STARFIELD_PALETTE.SOFT_BLUSH);

    let quietZoneCount = 0;
    let pearlCount = 0;
    let lavenderCount = 0;
    let champagneCount = 0;
    let blushCount = 0;

    for (let i = 0; i < count; i++) {
        // Uniform 3D spherical seed direction
        const theta = 2.0 * Math.PI * prng();
        const cosPhi = 2.0 * prng() - 1.0;
        const sinPhi = Math.sqrt(Math.max(0.0, 1.0 - cosPhi * cosPhi));

        let dirX = sinPhi * Math.cos(theta);
        let dirY = cosPhi;
        let dirZ = sinPhi * Math.sin(theta);

        // Clustered Galactic Distribution:
        // Project direction toward the diagonal galactic plane normal to concentrate stars
        // in dense galactic clouds, intermediate wisps, and sparse deep space
        const dotN = dirX * GALACTIC_NORMAL[0] + dirY * GALACTIC_NORMAL[1] + dirZ * GALACTIC_NORMAL[2];
        const planeX = dirX - dotN * GALACTIC_NORMAL[0];
        const planeY = dirY - dotN * GALACTIC_NORMAL[1];
        const planeZ = dirZ - dotN * GALACTIC_NORMAL[2];
        const planeLen = Math.sqrt(planeX * planeX + planeY * planeY + planeZ * planeZ);

        const clusterRoll = prng();
        let attractBias = 0.0;
        if (clusterRoll < 0.70) {
            // ~70% of stars: Dense galactic band clusters with longitudinal clumping
            const longitudinalPocket = 0.75 + 0.25 * Math.sin(theta * 5.0 + dirY * 3.5);
            attractBias = (0.50 + prng() * 0.35) * longitudinalPocket;
        } else if (clusterRoll < 0.90) {
            // ~20% of stars: Intermediate wisps and filament branches
            attractBias = 0.20 + prng() * 0.25;
        } else {
            // ~10% of stars: Sparse field stars in deep space (no attraction)
            attractBias = 0.0;
        }

        if (planeLen > 1e-4 && attractBias > 0.0) {
            dirX = dirX * (1.0 - attractBias) + (planeX / planeLen) * attractBias;
            dirY = dirY * (1.0 - attractBias) + (planeY / planeLen) * attractBias;
            dirZ = dirZ * (1.0 - attractBias) + (planeZ / planeLen) * attractBias;
            const newLen = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
            dirX /= newLen;
            dirY /= newLen;
            dirZ /= newLen;
        }

        // Distance in 75–85 meters shell
        const dist = minDistance + prng() * (maxDistance - minDistance);
        const idx3 = i * 3;

        positions[idx3] = dirX * dist;
        positions[idx3 + 1] = dirY * dist;
        positions[idx3 + 2] = dirZ * dist;

        // Check if star falls in the forward central interaction cone
        // Player forward is -Z. Kendama interaction zone: dirZ < -0.75, |dirY| < 0.42, |dirX| < 0.45
        const isQuietZone = (dirZ < -0.75 && Math.abs(dirY) < 0.42 && Math.abs(dirX) < 0.45);

        let starColor;
        let starSize;
        let starAlpha;
        let twinkleAmp;
        let twinkleFreq;
        const twinklePhase = prng() * 2.0 * Math.PI;

        if (isQuietZone) {
            quietZoneCount++;
            pearlCount++;
            starColor = cPearlWhite;
            starSize = 1.8 + prng() * 0.5; // 1.8 - 2.3 px (subtle, non-distracting)
            starAlpha = 0.25 + prng() * 0.20; // 0.25 - 0.45 dim
            twinkleFreq = 0.25 + prng() * 0.35;
            twinkleAmp = 0.02 + prng() * 0.04; // 2% - 6% minimal shimmer
        } else {
            const colorRoll = prng();
            if (colorRoll < 0.74) {
                starColor = cPearlWhite;
                pearlCount++;
            } else if (colorRoll < 0.86) {
                starColor = cLavender;
                lavenderCount++;
            } else if (colorRoll < 0.95) {
                starColor = cChampagne;
                champagneCount++;
            } else {
                starColor = cBlush;
                blushCount++;
            }

            const tierRoll = prng();
            if (tierRoll < 0.72) {
                // Tier 1: Dense background stars (~72%)
                starSize = 2.2 + prng() * 0.9; // 2.2 - 3.1 px
                starAlpha = 0.50 + prng() * 0.30; // 0.50 - 0.80
                twinkleAmp = 0.03 + prng() * 0.08;
                twinkleFreq = 0.30 + prng() * 0.40;
            } else if (tierRoll < 0.92) {
                // Tier 2: Mid-luminosity stars (~20%)
                starSize = 3.2 + prng() * 1.1; // 3.2 - 4.3 px
                starAlpha = 0.70 + prng() * 0.22; // 0.70 - 0.92
                twinkleAmp = 0.10 + prng() * 0.14;
                twinkleFreq = 0.40 + prng() * 0.50;
            } else {
                // Tier 3: Brighter distant landmark stars (~8%)
                starSize = 4.4 + prng() * 1.2; // 4.4 - 5.6 px
                starAlpha = 0.85 + prng() * 0.15; // 0.85 - 1.0
                twinkleAmp = 0.16 + prng() * 0.14;
                twinkleFreq = 0.45 + prng() * 0.55;
            }
            if (colorRoll >= 0.86 && colorRoll < 0.95) {
                // Champagne Gold accent stars: slightly larger and brighter sparkle
                starSize = Math.max(starSize, 3.2 + prng() * 1.5);
                starAlpha = Math.max(starAlpha, 0.75 + prng() * 0.20);
                twinkleAmp = Math.max(twinkleAmp, 0.14 + prng() * 0.12);
            }
        }

        colors[idx3] = starColor[0];
        colors[idx3 + 1] = starColor[1];
        colors[idx3 + 2] = starColor[2];

        sizes[i] = starSize;
        baseAlphas[i] = starAlpha;

        twinkles[idx3] = twinklePhase;
        twinkles[idx3 + 1] = twinkleFreq;
        twinkles[idx3 + 2] = twinkleAmp;
    }

    return {
        positions,
        colors,
        sizes,
        twinkles,
        baseAlphas,
        count,
        stats: {
            quietZoneCount,
            pearlCount,
            lavenderCount,
            champagneCount,
            blushCount,
        },
    };
}

/**
 * Creates the BufferGeometry for the Celestial Starfield.
 * @param {object} [options={}]
 * @returns {BufferGeometry}
 */
export function createCelestialStarfieldGeometry(options = {}) {
    const {
        positions,
        colors,
        sizes,
        twinkles,
        baseAlphas,
    } = generateStarfieldData(options);

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    geometry.setAttribute('aSize', new BufferAttribute(sizes, 1));
    geometry.setAttribute('aTwinkle', new BufferAttribute(twinkles, 3));
    geometry.setAttribute('aBaseAlpha', new BufferAttribute(baseAlphas, 1));

    return geometry;
}

/**
 * Creates the ShaderMaterial for the Celestial Starfield.
 * @param {object} [options={}]
 * @param {number} [options.opacity=1.0]
 * @param {number} [options.intensity=0.8]
 * @param {number} [options.starScale=1.0]
 * @returns {ShaderMaterial}
 */
export function createCelestialStarfieldMaterial(options = {}) {
    const {
        opacity = 1.0,
        intensity = 1.0,
        starScale = 1.0,
    } = options;

    return new ShaderMaterial({
        uniforms: {
            uTime: { value: 0.0 },
            uOpacity: { value: opacity },
            uStarfieldIntensity: { value: intensity },
            uStarScale: { value: starScale },
        },
        vertexShader: CELESTIAL_STARFIELD_VERTEX_SHADER,
        fragmentShader: CELESTIAL_STARFIELD_FRAGMENT_SHADER,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        depthFunc: LessEqualDepth,
        blending: NormalBlending,
    });
}

/**
 * Creates the batched THREE.Points instance for the Celestial Starfield.
 * Uses renderOrder: -940 so it draws after DomeGradient (-1e9) and Nebula (-950),
 * but well before all scene objects and UI (0).
 *
 * @param {object} [options={}]
 * @returns {Points}
 */
export function createCelestialStarfield(options = {}) {
    const {
        count = DEFAULT_STAR_COUNT,
        minDistance = DEFAULT_MIN_DISTANCE,
        maxDistance = DEFAULT_MAX_DISTANCE,
        seed = DEFAULT_RANDOM_SEED,
        opacity = 1.0,
        intensity = 1.0,
        starScale = 1.0,
    } = options;

    const geometry = createCelestialStarfieldGeometry({ count, minDistance, maxDistance, seed });
    const material = createCelestialStarfieldMaterial({ opacity, intensity, starScale });

    const points = new Points(geometry, material);
    points.name = 'celestial-starfield';
    points.renderOrder = -940;
    points.frustumCulled = false;

    return points;
}
