/**
 * Celestial Kendama - Procedural Champagne-Gold Stardust Layer
 * Role: Person C (Visuals & Rendering)
 *
 * Implements Phase 3B subtle, luminous champagne-gold stardust:
 * - Single batched THREE.Points draw call (~120–180 particles, default 150) on a single THREE.BufferGeometry.
 * - Mid-distance distribution (approximately 30–50 metres) suspended organically in the pastel galaxy.
 * - Non-uniform volumetric distribution: Gentle galactic bias aligning with the pastel nebula ribbon,
 *   with an open, quiet central gameplay cone.
 * - Restrained warm palette:
 *   - Champagne Gold: #F7E7CE (dominant, ~65%)
 *   - Pale Gold: #F5D77F (~20% gentle highlight)
 *   - Soft Peach: #F6D2C2 (~12% warm accent)
 *   - Pearl White: #FFF8FA (~3% delicate accent)
 * - Slow, organic drift animation evaluated in GLSL vertex shader:
 *   - Harmonic 3D oscillation with per-particle frequencies, amplitudes, and phases.
 *   - Bounded movement (0.6–1.8m amplitude over 40–120s periods) with zero CPU memory allocations per frame.
 * - Translation-free sky behavior via mat4(mat3(viewMatrix)) preserving per-eye stereo rotation in WebXR.
 * - Clip-space depth pinning just inside starfield (z/w = 0.99995) behind foreground scene objects,
 *   with depthTest: true, LessEqualDepth, depthWrite: false, and renderOrder: -930.
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
 * Palette constants for the Celestial Stardust layer (Pastel Cosmic Fantasy).
 */
export const CELESTIAL_STARDUST_PALETTE = Object.freeze({
    CHAMPAGNE_GOLD: '#E8C68D',
    PALE_GOLD: '#F5D77F',
    SOFT_PEACH: '#F6D2C2',
    PEARL_WHITE: '#FFF5F5',
    SOFT_LAVENDER: '#B9A4D6',
});

export const DEFAULT_STARDUST_COUNT = 150;
export const DEFAULT_MIN_DISTANCE = 30.0;
export const DEFAULT_MAX_DISTANCE = 50.0;
export const DEFAULT_STARDUST_SEED = 0x57A8D057;

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
 * @param {number} [seed=DEFAULT_STARDUST_SEED]
 * @returns {() => number}
 */
export function createDeterministicPrng(seed = DEFAULT_STARDUST_SEED) {
    let s = (typeof seed === 'number' && Number.isFinite(seed) ? seed : DEFAULT_STARDUST_SEED) >>> 0;
    return function next() {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * GLSL Vertex Shader for the Celestial Stardust Layer.
 * Strips camera translation so stardust maintains infinite distance behavior relative
 * to room-scale walking, while preserving per-eye stereo rotation in WebXR.
 * Evaluates smooth, bounded 3D harmonic drift and slow brightness pulse per particle.
 * Pins clip-space depth just inside the starfield (z/w = 0.99995).
 */
export const CELESTIAL_STARDUST_VERTEX_SHADER = /* glsl */ `
attribute vec3 color;
attribute float aSize;
attribute float aBaseAlpha;
attribute vec3 aDrift;  // (frequencyX, frequencyY, frequencyZ)
attribute vec3 aPhase;  // (phaseX, phaseY, phaseZ)
attribute vec3 aAmp;    // (amplitudeX, amplitudeY, amplitudeZ)
attribute vec2 aPulse;  // (phase, frequency)

varying vec3 vColor;
varying float vAlpha;
varying vec3 vWorldDirection;

uniform float uTime;
uniform float uStardustScale;

void main() {
  // Shared diagonal galactic normal for coordinated celestial stream flow
  const vec3 cGalacticNormal = vec3(-0.3215, 0.9042, 0.2813);
  vec3 streamTangent = normalize(cross(cGalacticNormal, position));

  // Coherent directional drift that complements the galactic structure
  vec3 drift = streamTangent * (sin(uTime * aDrift.x + aPhase.x) * aAmp.x * 1.25) +
               cGalacticNormal * (sin(uTime * aDrift.y + aPhase.y) * aAmp.y * 0.40) +
               normalize(position) * (cos(uTime * aDrift.z + aPhase.z) * aAmp.z * 0.45);

  vec3 animatedPosition = position + drift;
  vec3 worldDirection = mat3(modelMatrix) * animatedPosition;
  vWorldDirection = normalize(worldDirection);
  vColor = color;

  // Organic, breathing sparkle twinkle with individual phases
  // normal -> slightly brighter -> soft peak -> fade -> normal
  float pulseWave = sin(uTime * aPulse.y * 1.6 + aPulse.x);
  float sparklePulse = 0.82 + 0.38 * pow(max(0.0, pulseWave), 2.2);
  vAlpha = aBaseAlpha * sparklePulse;

  // Translation stripping from viewMatrix; preserves per-eye stereo rotation in WebXR
  vec4 clipPosition = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(worldDirection, 1.0);

  // Pin clip-space depth just inside the starfield (z/w = 0.99995)
  // Behind foreground scene objects (z <= 0.98), in front of starfield (0.99998), nebula (0.99999), and DomeGradient (1.0)
  gl_Position = vec4(clipPosition.xy, clipPosition.w * 0.99995, clipPosition.w);

  gl_PointSize = aSize * uStardustScale;
}
`;

/**
 * GLSL Fragment Shader for the Celestial Stardust Layer.
 * Renders smooth circular antialiased point discs with soft radial falloff
 * and nadir/horizon fade to preserve the studio floor and DomeFade.
 */
export const CELESTIAL_STARDUST_FRAGMENT_SHADER = /* glsl */ `
uniform float uOpacity;
uniform float uStardustIntensity;

varying vec3 vColor;
varying float vAlpha;
varying vec3 vWorldDirection;

void main() {
  // Soft circular point disk: discard fragments outside radius 0.5
  vec2 coord = gl_PointCoord - vec2(0.5);
  float distSq = dot(coord, coord);
  if (distSq > 0.25) {
    discard;
  }

  // Smooth circular falloff from center (0.0) to edge (0.5) with luminous spark core
  float dist = sqrt(distSq);
  float radialFalloff = 1.0 - smoothstep(0.15, 0.5, dist);
  float coreGlow = (1.0 - smoothstep(0.0, 0.35, dist)) * 0.45;
  // Delicate celestial cross-glint accent for clearly visible sparkles
  float glint = max(0.0, 1.0 - abs(coord.x) * 10.0) * max(0.0, 1.0 - abs(coord.y) * 2.8) +
                max(0.0, 1.0 - abs(coord.y) * 10.0) * max(0.0, 1.0 - abs(coord.x) * 2.8);
  float particleShape = clamp(radialFalloff + coreGlow + glint * 0.28, 0.0, 1.0);

  // Soft horizon/nadir fade: Continuous across horizon with smooth lower hemisphere taper
  float groundFade = smoothstep(-0.45, -0.08, vWorldDirection.y);

  float finalAlpha = vAlpha * particleShape * groundFade * uOpacity * uStardustIntensity;
  if (finalAlpha < 0.005) {
    discard;
  }

  // Enhance luminous Champagne Gold brilliance
  vec3 sparkColor = mix(vColor, vec3(1.0, 0.96, 0.90), coreGlow * 0.35);
  gl_FragColor = vec4(sparkColor, finalAlpha);
}
`;

/**
 * Generates deterministic stardust vertex data arrays.
 * @param {object} [options={}]
 * @param {number} [options.count=DEFAULT_STARDUST_COUNT]
 * @param {number} [options.minDistance=DEFAULT_MIN_DISTANCE]
 * @param {number} [options.maxDistance=DEFAULT_MAX_DISTANCE]
 * @param {number} [options.seed=DEFAULT_STARDUST_SEED]
 * @returns {{
 *   positions: Float32Array,
 *   colors: Float32Array,
 *   sizes: Float32Array,
 *   baseAlphas: Float32Array,
 *   drifts: Float32Array,
 *   phases: Float32Array,
 *   amps: Float32Array,
 *   pulses: Float32Array,
 *   count: number,
 *   stats: object
 * }}
 */
export function generateStardustData(options = {}) {
    const {
        count = DEFAULT_STARDUST_COUNT,
        minDistance = DEFAULT_MIN_DISTANCE,
        maxDistance = DEFAULT_MAX_DISTANCE,
        seed = DEFAULT_STARDUST_SEED,
    } = options;

    const prng = createDeterministicPrng(seed);

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const baseAlphas = new Float32Array(count);
    const drifts = new Float32Array(count * 3);
    const phases = new Float32Array(count * 3);
    const amps = new Float32Array(count * 3);
    const pulses = new Float32Array(count * 2);

    const cChampagne = hexToRgb(CELESTIAL_STARDUST_PALETTE.CHAMPAGNE_GOLD);
    const cPaleGold = hexToRgb(CELESTIAL_STARDUST_PALETTE.PALE_GOLD);
    const cPeach = hexToRgb(CELESTIAL_STARDUST_PALETTE.SOFT_PEACH);
    const cPearl = hexToRgb(CELESTIAL_STARDUST_PALETTE.PEARL_WHITE);

    let quietZoneCount = 0;
    let champagneCount = 0;
    let paleGoldCount = 0;
    let peachCount = 0;
    let pearlCount = 0;

    for (let i = 0; i < count; i++) {
        // Uniform spherical seed direction
        const theta = 2.0 * Math.PI * prng();
        const uniformCos = 2.0 * prng() - 1.0;
        const sinPhi = Math.sqrt(Math.max(0.0, 1.0 - uniformCos * uniformCos));

        let dirX = sinPhi * Math.cos(theta);
        let dirY = uniformCos;
        let dirZ = sinPhi * Math.sin(theta);

        // Concentrate particles along the diagonal galactic band
        const dotN = dirX * GALACTIC_NORMAL[0] + dirY * GALACTIC_NORMAL[1] + dirZ * GALACTIC_NORMAL[2];
        const planeX = dirX - dotN * GALACTIC_NORMAL[0];
        const planeY = dirY - dotN * GALACTIC_NORMAL[1];
        const planeZ = dirZ - dotN * GALACTIC_NORMAL[2];
        const planeLen = Math.sqrt(planeX * planeX + planeY * planeY + planeZ * planeZ);

        if (planeLen > 1e-4) {
            // Biased into the galactic ribbon with soft cluster concentrations
            const attract = 0.42 + prng() * 0.42;
            dirX = dirX * (1.0 - attract) + (planeX / planeLen) * attract;
            dirY = dirY * (1.0 - attract) + (planeY / planeLen) * attract;
            dirZ = dirZ * (1.0 - attract) + (planeZ / planeLen) * attract;
            const newLen = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
            dirX /= newLen;
            dirY /= newLen;
            dirZ /= newLen;
        }

        // Distance in 30–50 meters mid-distance zone with non-uniform volume bias
        const distT = prng();
        const curvedT = distT * 0.7 + (distT * distT) * 0.3;
        const dist = minDistance + curvedT * (maxDistance - minDistance);

        const idx3 = i * 3;
        const idx2 = i * 2;

        positions[idx3] = dirX * dist;
        positions[idx3 + 1] = dirY * dist;
        positions[idx3 + 2] = dirZ * dist;

        // Check if particle falls in the forward central gameplay interaction cone
        // Player forward is -Z. Hands & Kendama volume: dirZ < -0.70, |dirY| < 0.40, |dirX| < 0.45
        const isQuietZone = (dirZ < -0.70 && Math.abs(dirY) < 0.40 && Math.abs(dirX) < 0.45);

        let pColor;
        let pSize;
        let pAlpha;
        let driftAmp;

        if (isQuietZone) {
            quietZoneCount++;
            champagneCount++;
            pColor = cChampagne;
            pSize = 2.4 + prng() * 0.8; // 2.4 - 3.2 px (delicate, non-distracting)
            pAlpha = 0.18 + prng() * 0.16; // 0.18 - 0.34
            driftAmp = 0.25 + prng() * 0.25; // 0.25 - 0.50m (very calm drift)
        } else {
            const roll = prng();
            if (roll < 0.60) {
                pColor = cChampagne;
                champagneCount++;
            } else if (roll < 0.78) {
                pColor = cPaleGold;
                paleGoldCount++;
            } else if (roll < 0.90) {
                pColor = cPeach;
                peachCount++;
            } else {
                pColor = cPearl;
                pearlCount++;
            }

            const tierRoll = prng();
            if (tierRoll < 0.72) {
                // Tier 1: Majority luminous champagne stardust (~72%)
                pSize = 4.8 + prng() * 2.4; // 4.8 - 7.2 px
                pAlpha = 0.60 + prng() * 0.32; // 0.60 - 0.92
                driftAmp = 0.6 + prng() * 0.6; // 0.6 - 1.2m
            } else {
                // Tier 2: Soft cluster concentrations of larger luminous gold sparkles (~28%)
                pSize = 7.2 + prng() * 2.8; // 7.2 - 10.0 px
                pAlpha = 0.75 + prng() * 0.25; // 0.75 - 1.00
                driftAmp = 0.8 + prng() * 0.8; // 0.8 - 1.6m
            }
        }

        colors[idx3] = pColor[0];
        colors[idx3 + 1] = pColor[1];
        colors[idx3 + 2] = pColor[2];

        sizes[i] = pSize;
        baseAlphas[i] = pAlpha;

        // Slow, organic drift parameters (frequencies in [0.05, 0.18] rad/s -> periods ~35s-125s)
        drifts[idx3] = 0.06 + prng() * 0.09;
        drifts[idx3 + 1] = 0.05 + prng() * 0.07;
        drifts[idx3 + 2] = 0.06 + prng() * 0.09;

        phases[idx3] = prng() * 2.0 * Math.PI;
        phases[idx3 + 1] = prng() * 2.0 * Math.PI;
        phases[idx3 + 2] = prng() * 2.0 * Math.PI;

        amps[idx3] = driftAmp * (0.8 + prng() * 0.4);
        amps[idx3 + 1] = driftAmp * (0.6 + prng() * 0.5);
        amps[idx3 + 2] = driftAmp * (0.8 + prng() * 0.4);

        // Slow breathing pulse
        pulses[idx2] = prng() * 2.0 * Math.PI;
        pulses[idx2 + 1] = 0.2 + prng() * 0.4; // frequency in rad/s
    }

    return {
        positions,
        colors,
        sizes,
        baseAlphas,
        drifts,
        phases,
        amps,
        pulses,
        count,
        stats: {
            quietZoneCount,
            champagneCount,
            paleGoldCount,
            peachCount,
            pearlCount,
        },
    };
}

/**
 * Creates the BufferGeometry for the Celestial Stardust layer.
 * @param {object} [options={}]
 * @returns {BufferGeometry}
 */
export function createCelestialStardustGeometry(options = {}) {
    const {
        positions,
        colors,
        sizes,
        baseAlphas,
        drifts,
        phases,
        amps,
        pulses,
    } = generateStardustData(options);

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    geometry.setAttribute('aSize', new BufferAttribute(sizes, 1));
    geometry.setAttribute('aBaseAlpha', new BufferAttribute(baseAlphas, 1));
    geometry.setAttribute('aDrift', new BufferAttribute(drifts, 3));
    geometry.setAttribute('aPhase', new BufferAttribute(phases, 3));
    geometry.setAttribute('aAmp', new BufferAttribute(amps, 3));
    geometry.setAttribute('aPulse', new BufferAttribute(pulses, 2));

    return geometry;
}

/**
 * Creates the ShaderMaterial for the Celestial Stardust layer.
 * @param {object} [options={}]
 * @param {number} [options.opacity=1.0]
 * @param {number} [options.intensity=0.85]
 * @param {number} [options.stardustScale=1.0]
 * @returns {ShaderMaterial}
 */
export function createCelestialStardustMaterial(options = {}) {
    const {
        opacity = 1.0,
        intensity = 1.0,
        stardustScale = 1.0,
    } = options;

    return new ShaderMaterial({
        uniforms: {
            uTime: { value: 0.0 },
            uOpacity: { value: opacity },
            uStardustIntensity: { value: intensity },
            uStardustScale: { value: stardustScale },
        },
        vertexShader: CELESTIAL_STARDUST_VERTEX_SHADER,
        fragmentShader: CELESTIAL_STARDUST_FRAGMENT_SHADER,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        depthFunc: LessEqualDepth,
        blending: NormalBlending,
    });
}

/**
 * Creates the batched THREE.Points instance for the Celestial Stardust layer.
 * Uses renderOrder: -930 so it draws after DomeGradient (-1e9), Nebula (-950), and Starfield (-940),
 * but well before all scene objects and UI (0).
 *
 * @param {object} [options={}]
 * @returns {Points}
 */
export function createCelestialStardust(options = {}) {
    const {
        count = DEFAULT_STARDUST_COUNT,
        minDistance = DEFAULT_MIN_DISTANCE,
        maxDistance = DEFAULT_MAX_DISTANCE,
        seed = DEFAULT_STARDUST_SEED,
        opacity = 1.0,
        intensity = 1.0,
        stardustScale = 1.0,
    } = options;

    const geometry = createCelestialStardustGeometry({ count, minDistance, maxDistance, seed });
    const material = createCelestialStardustMaterial({ opacity, intensity, stardustScale });

    const points = new Points(geometry, material);
    points.name = 'celestial-stardust';
    points.renderOrder = -930;
    points.frustumCulled = false;

    return points;
}
