/**
 * Celestial Kendama - Golden Celestial Orbital Belt Layer
 * Role: Person C (Visuals & Rendering)
 *
 * Implements a visible celestial design element:
 * - A large, distant golden celestial orbital belt / ring surrounding the gameplay space.
 * - Positioned behind the Kendama in distant 3D space (~50–65m), angled in 3D to frame the world.
 * - Fragmented and organic: curved arc segments, gaps, varied lengths, and fading ends (NOT a solid hoop).
 * - Secondary fragmented arcs: 2–4 smaller, fainter arc fragments at different radii and depths.
 * - Elegant Champagne Gold palette hierarchy:
 *   - Soft Gold (#DBB67D)
 *   - Champagne Gold (#E8C68D) [Primary]
 *   - Warm Pearl-Gold (#F5E2BD)
 *   - Bright White-Gold highlights (#FDF7EA)
 * - Energy nodes along the belt: brighter points of light / stars along the orbit with varied spacing and size.
 * - Golden sparkle bursts: distinctive 4-point cross-shaped sparkle highlights (✦, ✧) with gentle pulse.
 * - Visual integration with Astraea (Champagne Gold rings) and Selene along the galactic plane.
 * - Translation-free sky behavior via mat4(mat3(viewMatrix)) preserving WebXR stereo rotation.
 * - Clip-space depth pinning at z/w = 0.99988 behind foreground scene objects (Kendama z <= 0.98).
 * - Ultra-lightweight performance: All arcs merged into 1 Mesh draw call, all nodes/sparkles in 1 Points draw call.
 */

import {
    BufferAttribute,
    BufferGeometry,
    Color,
    Group,
    LessEqualDepth,
    Mesh,
    NormalBlending,
    Points,
    Quaternion,
    ShaderMaterial,
    TorusGeometry,
    Vector3,
} from 'three';

/**
 * Palette constants for the Golden Celestial Belt.
 */
export const CELESTIAL_BELT_PALETTE = Object.freeze({
    CHAMPAGNE_GOLD: '#E8C68D',
    SOFT_GOLD: '#DBB67D',
    WARM_PEARL_GOLD: '#F5E2BD',
    WHITE_GOLD: '#FDF7EA',
    DEEP_GOLD_SHADOW: '#9E783D',
});

/**
 * Normal vector of the celestial belt orbital plane.
 * Tilted at ~19.4° elevation in the forward direction (-Z), passing near Astraea (-30, 21, -62)
 * and Selene (30, 20, -64) to unify the cosmic ring system.
 */
export const CELESTIAL_BELT_NORMAL = Object.freeze([0.045, 0.942, 0.332]);

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
 * GLSL Vertex Shader for the Golden Belt Arc Mesh.
 * Strips camera translation so room-scale walking produces zero sky parallax,
 * while preserving camera orientation and multiview per-eye transforms.
 * Pins clip-space depth at z/w = 0.99988 (behind Kendama, in front of landmarks).
 */
export const CELESTIAL_BELT_VERTEX_SHADER = /* glsl */ `
attribute float aArcWeight;
attribute float aUvU;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewNormal;
varying vec3 vWorldDirection;
varying float vArcWeight;

void main() {
  vUv = uv;
  vArcWeight = aArcWeight;

  vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  vWorldDirection = normalize(worldPos);
  vNormal = normalize(mat3(modelMatrix) * normal);
  vViewNormal = normalize(normalMatrix * normal);

  // Strip camera translation from viewMatrix; preserves per-eye stereo rotation in WebXR
  vec4 clipPosition = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(worldPos, 1.0);

  // Pin clip-space depth just inside distant landmarks (z/w = 0.99988)
  // Behind foreground Kendama & scene objects (z <= 0.98)
  gl_Position = vec4(clipPosition.xy, clipPosition.w * 0.99988, clipPosition.w);
}
`;

/**
 * GLSL Fragment Shader for the Golden Belt Arc Mesh.
 * Renders fragmented celestial arcs with longitudinal fading tips,
 * soft cross-sectional core glow, champagne-gold color hierarchy, and slow shimmer.
 */
export const CELESTIAL_BELT_FRAGMENT_SHADER = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform float uBeltIntensity;

uniform vec3 uChampagneGold;
uniform vec3 uSoftGold;
uniform vec3 uWarmPearlGold;
uniform vec3 uWhiteGold;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewNormal;
varying vec3 vWorldDirection;
varying float vArcWeight;

void main() {
  // Longitudinal tip fading: Arc edges dissolve softly into empty space (no harsh cuts)
  float tipFade = smoothstep(0.0, 0.14, vUv.x) * (1.0 - smoothstep(0.86, 1.0, vUv.x));

  // Cross-sectional tube glow: center of the band is luminous and bright, falling off to edges
  float tubeCross = abs(vUv.y - 0.5) * 2.0; // 0 at tube core, 1 at tube boundary
  float coreLuminance = 1.0 - smoothstep(0.0, 0.85, tubeCross);
  float tubeRim = 1.0 - abs(vViewNormal.z);
  float rimGlow = smoothstep(0.35, 0.90, tubeRim) * 0.40;

  // Concentric fine micro-grooves (Saturn-like astronomical ring structure)
  float ringGroove = 0.84 + 0.16 * sin(vUv.y * 38.0);

  // Subtle traveling celestial shimmer along the arc
  float shimmer = 0.88 + 0.12 * sin(uTime * 0.45 + vUv.x * 14.0);

  // Color hierarchy:
  // Edge: Soft Gold -> Main body: Champagne Gold -> Core: Warm Pearl-Gold -> Center glint: White-Gold
  vec3 color = mix(uSoftGold, uChampagneGold, smoothstep(0.20, 0.70, coreLuminance));
  color = mix(color, uWarmPearlGold, smoothstep(0.60, 0.92, coreLuminance));
  color = mix(color, uWhiteGold, smoothstep(0.92, 1.0, coreLuminance) * 0.45);

  // Atmospheric nadir fade: dissolves gently into the lower pink/lavender atmosphere
  float groundFade = smoothstep(-0.45, -0.05, vWorldDirection.y);

  float alpha = tipFade * (coreLuminance * 0.72 + rimGlow) * ringGroove * shimmer * vArcWeight * groundFade * uOpacity * uBeltIntensity;

  if (alpha < 0.005) {
    discard;
  }

  gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.92));
}
`;

/**
 * GLSL Vertex Shader for Belt Energy Nodes & Sparkles (Batched Points).
 */
export const CELESTIAL_NODE_VERTEX_SHADER = /* glsl */ `
attribute vec3 color;
attribute float aSize;
attribute float aBaseAlpha;
attribute float aType; // 0.0 = circular energy node, 1.0 = star-shaped sparkle burst (✦)
attribute vec2 aPulse; // (phase, frequency)

varying vec3 vColor;
varying float vAlpha;
varying float vType;
varying vec3 vWorldDirection;

uniform float uTime;
uniform float uNodeScale;

void main() {
  vColor = color;
  vType = aType;

  vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  vWorldDirection = normalize(worldPos);

  // Slow, gentle breathing / twinkle pulse
  float pulseWave = sin(uTime * aPulse.y + aPulse.x);
  float pulse = 0.82 + 0.35 * pow(max(0.0, pulseWave), 2.0);
  vAlpha = aBaseAlpha * pulse;

  // Strip camera translation from viewMatrix; preserves per-eye stereo rotation in WebXR
  vec4 clipPosition = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(worldPos, 1.0);

  // Pin clip-space depth just inside landmarks (z/w = 0.99987)
  gl_Position = vec4(clipPosition.xy, clipPosition.w * 0.99987, clipPosition.w);

  gl_PointSize = aSize * uNodeScale * (0.90 + 0.20 * pulse);
}
`;

/**
 * GLSL Fragment Shader for Belt Energy Nodes & Sparkles (Batched Points).
 * Renders circular glowing energy nodes and distinctive 4-point star sparkle highlights (✦, ✧).
 */
export const CELESTIAL_NODE_FRAGMENT_SHADER = /* glsl */ `
uniform float uOpacity;
uniform float uNodeIntensity;

varying vec3 vColor;
varying float vAlpha;
varying float vType;
varying vec3 vWorldDirection;

void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float distSq = dot(c, c);
  if (distSq > 0.25) {
    discard;
  }

  float dist = sqrt(distSq);
  float shape = 0.0;
  vec3 sparkColor = vColor;

  if (vType > 0.5) {
    // Distinctive star-shaped / cross-shaped sparkle burst (✦, ✧)
    float armH = max(0.0, 1.0 - abs(c.y) * 11.0) * max(0.0, 1.0 - abs(c.x) * 2.1);
    float armV = max(0.0, 1.0 - abs(c.x) * 11.0) * max(0.0, 1.0 - abs(c.y) * 2.1);
    // Delicate diagonal diamond accent
    vec2 diag = vec2(c.x + c.y, c.x - c.y) * 0.7071;
    float armDiag = (max(0.0, 1.0 - abs(diag.y) * 16.0) * max(0.0, 1.0 - abs(diag.x) * 3.5) +
                     max(0.0, 1.0 - abs(diag.x) * 16.0) * max(0.0, 1.0 - abs(diag.y) * 3.5)) * 0.32;
    float core = 1.0 - smoothstep(0.0, 0.18, dist);
    shape = clamp(max(armH, armV) * 1.35 + armDiag + core * 1.6, 0.0, 1.0);
    // Brilliant white-gold central highlight
    sparkColor = mix(vColor, vec3(0.9922, 0.9686, 0.9176), core * 0.85);
  } else {
    // Glowing celestial energy node / star disc
    float core = 1.0 - smoothstep(0.0, 0.22, dist);
    float halo = 1.0 - smoothstep(0.12, 0.50, dist);
    shape = clamp(core * 0.85 + halo * 0.45, 0.0, 1.0);
    // Warm pearl-gold transition
    sparkColor = mix(vColor, vec3(0.9608, 0.8863, 0.7412), core * 0.60);
  }

  // Horizon / nadir fade
  float groundFade = smoothstep(-0.45, -0.05, vWorldDirection.y);

  float finalAlpha = vAlpha * shape * groundFade * uOpacity * uNodeIntensity;
  if (finalAlpha < 0.005) {
    discard;
  }

  gl_FragColor = vec4(sparkColor, clamp(finalAlpha, 0.0, 0.98));
}
`;

/**
 * Creates the ShaderMaterial for the Golden Belt Arcs.
 * @param {object} [options={}]
 * @returns {ShaderMaterial}
 */
export function createCelestialBeltMaterial(options = {}) {
    const {
        opacity = 0.82,
        intensity = 0.95,
    } = options;

    const cChampagne = hexToRgb(CELESTIAL_BELT_PALETTE.CHAMPAGNE_GOLD);
    const cSoft = hexToRgb(CELESTIAL_BELT_PALETTE.SOFT_GOLD);
    const cWarmPearl = hexToRgb(CELESTIAL_BELT_PALETTE.WARM_PEARL_GOLD);
    const cWhite = hexToRgb(CELESTIAL_BELT_PALETTE.WHITE_GOLD);

    return new ShaderMaterial({
        uniforms: {
            uTime: { value: 0.0 },
            uOpacity: { value: opacity },
            uBeltIntensity: { value: intensity },
            uChampagneGold: { value: new Color(cChampagne[0], cChampagne[1], cChampagne[2]) },
            uSoftGold: { value: new Color(cSoft[0], cSoft[1], cSoft[2]) },
            uWarmPearlGold: { value: new Color(cWarmPearl[0], cWarmPearl[1], cWarmPearl[2]) },
            uWhiteGold: { value: new Color(cWhite[0], cWhite[1], cWhite[2]) },
        },
        vertexShader: CELESTIAL_BELT_VERTEX_SHADER,
        fragmentShader: CELESTIAL_BELT_FRAGMENT_SHADER,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        depthFunc: LessEqualDepth,
        blending: NormalBlending,
    });
}

/**
 * Creates the ShaderMaterial for the Golden Belt Nodes and Sparkles.
 * @param {object} [options={}]
 * @returns {ShaderMaterial}
 */
export function createCelestialBeltNodesMaterial(options = {}) {
    const {
        opacity = 0.95,
        intensity = 1.0,
        nodeScale = 1.0,
    } = options;

    return new ShaderMaterial({
        uniforms: {
            uTime: { value: 0.0 },
            uOpacity: { value: opacity },
            uNodeIntensity: { value: intensity },
            uNodeScale: { value: nodeScale },
        },
        vertexShader: CELESTIAL_NODE_VERTEX_SHADER,
        fragmentShader: CELESTIAL_NODE_FRAGMENT_SHADER,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        depthFunc: LessEqualDepth,
        blending: NormalBlending,
    });
}

/**
 * Merges multiple geometries into a single BufferGeometry.
 * Helper to ensure zero external dependency on three/addons/utils/BufferGeometryUtils.
 * @param {BufferGeometry[]} geometries
 * @param {number[]} arcWeights - Per-geometry weight values
 * @returns {BufferGeometry}
 */
export function mergeArcGeometries(geometries, arcWeights) {
    let totalPositions = 0;
    let totalIndices = 0;

    for (const geom of geometries) {
        totalPositions += geom.attributes.position.count;
        totalIndices += geom.index ? geom.index.count : geom.attributes.position.count;
    }

    const mergedPositions = new Float32Array(totalPositions * 3);
    const mergedNormals = new Float32Array(totalPositions * 3);
    const mergedUvs = new Float32Array(totalPositions * 2);
    const mergedWeights = new Float32Array(totalPositions);
    const mergedIndices = new Uint32Array(totalIndices);

    let posOffset = 0;
    let indexOffset = 0;
    let vertexBase = 0;

    for (let g = 0; g < geometries.length; g++) {
        const geom = geometries[g];
        const weight = arcWeights[g] ?? 1.0;
        const count = geom.attributes.position.count;

        // Positions
        mergedPositions.set(geom.attributes.position.array, posOffset * 3);

        // Normals
        if (geom.attributes.normal) {
            mergedNormals.set(geom.attributes.normal.array, posOffset * 3);
        }

        // UVs
        if (geom.attributes.uv) {
            mergedUvs.set(geom.attributes.uv.array, posOffset * 2);
        }

        // Custom weight
        for (let i = 0; i < count; i++) {
            mergedWeights[posOffset + i] = weight;
        }

        // Indices
        if (geom.index) {
            const idxArr = geom.index.array;
            for (let i = 0; i < idxArr.length; i++) {
                mergedIndices[indexOffset + i] = idxArr[i] + vertexBase;
            }
            indexOffset += idxArr.length;
        }

        posOffset += count;
        vertexBase += count;
    }

    const merged = new BufferGeometry();
    merged.setAttribute('position', new BufferAttribute(mergedPositions, 3));
    merged.setAttribute('normal', new BufferAttribute(mergedNormals, 3));
    merged.setAttribute('uv', new BufferAttribute(mergedUvs, 2));
    merged.setAttribute('aArcWeight', new BufferAttribute(mergedWeights, 1));
    merged.setIndex(new BufferAttribute(mergedIndices, 1));

    return merged;
}

/**
 * Creates the complete batched BufferGeometry containing all primary and secondary fragmented arcs.
 * @param {object} [options={}]
 * @returns {BufferGeometry}
 */
export function createCelestialBeltGeometry(options = {}) {
    const {
        primaryRadius = 56.0,
        radialSegments = 8,
        tubularSegments = 40,
    } = options;

    const geometries = [];
    const weights = [];

    // --- Primary Fragmented Belt Arcs ---
    // Arc 1: Main sweeping arch in upper forward sky (spans ~80° = 1.40 rad)
    // Centered around theta = -PI/2 (forward meridian)
    const arc1Geom = new TorusGeometry(primaryRadius, 0.42, radialSegments, tubularSegments, 1.40);
    arc1Geom.rotateZ(-Math.PI * 0.5 - 0.70); // Center around -PI/2
    geometries.push(arc1Geom);
    weights.push(1.0);

    // Arc 2: Upper-left arc segment passing near Astraea (spans ~36° = 0.63 rad)
    // Separated by an organic gap of ~14° (0.24 rad)
    const arc2Geom = new TorusGeometry(primaryRadius, 0.36, radialSegments, 24, 0.63);
    arc2Geom.rotateZ(-Math.PI * 0.5 - 0.70 - 0.24 - 0.63);
    geometries.push(arc2Geom);
    weights.push(0.88);

    // Arc 3: Upper-right arc segment passing near Selene (spans ~38° = 0.66 rad)
    // Separated by an organic gap of ~15° (0.26 rad)
    const arc3Geom = new TorusGeometry(primaryRadius, 0.38, radialSegments, 24, 0.66);
    arc3Geom.rotateZ(-Math.PI * 0.5 + 0.70 + 0.26);
    geometries.push(arc3Geom);
    weights.push(0.90);

    // Arc 4: Peripheral right continuation segment (spans ~30° = 0.52 rad)
    const arc4Geom = new TorusGeometry(primaryRadius * 0.99, 0.28, radialSegments, 18, 0.52);
    arc4Geom.rotateZ(-Math.PI * 0.5 + 0.70 + 0.26 + 0.66 + 0.38);
    geometries.push(arc4Geom);
    weights.push(0.65);

    // Arc 5: Peripheral left continuation segment (spans ~28° = 0.48 rad)
    const arc5Geom = new TorusGeometry(primaryRadius * 0.99, 0.26, radialSegments, 18, 0.48);
    arc5Geom.rotateZ(-Math.PI * 0.5 - 0.70 - 0.24 - 0.63 - 0.40 - 0.48);
    geometries.push(arc5Geom);
    weights.push(0.60);

    // --- Secondary Fragmented Arcs (2–4 smaller, fainter arcs at different depths) ---
    // Secondary Arc 1: Inner resonance arc fragment (radius ~52m, spans ~34° = 0.60 rad)
    const sec1Geom = new TorusGeometry(primaryRadius - 4.2, 0.20, radialSegments, 20, 0.60);
    sec1Geom.rotateZ(-Math.PI * 0.5 - 0.25);
    geometries.push(sec1Geom);
    weights.push(0.38); // Fainter than primary

    // Secondary Arc 2: Outer resonant arc fragment (radius ~60.5m, spans ~32° = 0.56 rad)
    const sec2Geom = new TorusGeometry(primaryRadius + 4.5, 0.18, radialSegments, 20, 0.56);
    sec2Geom.rotateZ(-Math.PI * 0.5 + 0.32);
    geometries.push(sec2Geom);
    weights.push(0.32); // Fainter than primary

    // Secondary Arc 3: Distant faint whispering arc fragment (radius ~54m, spans ~24° = 0.42 rad)
    const sec3Geom = new TorusGeometry(primaryRadius - 2.0, 0.16, radialSegments, 16, 0.42);
    sec3Geom.rotateZ(-Math.PI * 0.5 - 1.15);
    geometries.push(sec3Geom);
    weights.push(0.26);

    const merged = mergeArcGeometries(geometries, weights);

    // Clean up intermediate geometries
    for (const g of geometries) {
        g.dispose();
    }

    return merged;
}

/**
 * Creates the batched Points geometry for energy nodes and sparkles along the belt.
 * @param {object} [options={}]
 * @returns {BufferGeometry}
 */
export function createCelestialBeltNodesGeometry(options = {}) {
    const {
        primaryRadius = 56.0,
    } = options;

    // Defined angular positions along the belt arcs (radians around -PI/2 forward center)
    // Combining:
    // - Brighter energy nodes (type 0.0)
    // - Distinctive 4-point cross-shaped sparkle bursts (type 1.0, ✦)
    const nodeDefs = [
        // Upper-forward arch
        { angle: -Math.PI * 0.5 - 0.52, radius: primaryRadius, size: 24.0, alpha: 0.98, type: 1.0, color: CELESTIAL_BELT_PALETTE.WHITE_GOLD },       // Sparkle ✦
        { angle: -Math.PI * 0.5 - 0.36, radius: primaryRadius + 0.1, size: 14.0, alpha: 0.88, type: 0.0, color: CELESTIAL_BELT_PALETTE.WARM_PEARL_GOLD }, // Node
        { angle: -Math.PI * 0.5 - 0.18, radius: primaryRadius - 0.15, size: 12.0, alpha: 0.85, type: 0.0, color: CELESTIAL_BELT_PALETTE.CHAMPAGNE_GOLD },
        { angle: -Math.PI * 0.5 + 0.02, radius: primaryRadius + 0.05, size: 28.0, alpha: 1.00, type: 1.0, color: CELESTIAL_BELT_PALETTE.WHITE_GOLD },       // Bright Sparkle ✦ (meridian)
        { angle: -Math.PI * 0.5 + 0.22, radius: primaryRadius - 0.08, size: 13.0, alpha: 0.86, type: 0.0, color: CELESTIAL_BELT_PALETTE.WARM_PEARL_GOLD },
        { angle: -Math.PI * 0.5 + 0.42, radius: primaryRadius + 0.12, size: 16.0, alpha: 0.90, type: 0.0, color: CELESTIAL_BELT_PALETTE.CHAMPAGNE_GOLD },
        { angle: -Math.PI * 0.5 + 0.58, radius: primaryRadius, size: 22.0, alpha: 0.96, type: 1.0, color: CELESTIAL_BELT_PALETTE.WHITE_GOLD },       // Sparkle ✦

        // Astraea segment (upper-left)
        { angle: -Math.PI * 0.5 - 1.05, radius: primaryRadius + 0.1, size: 26.0, alpha: 0.98, type: 1.0, color: CELESTIAL_BELT_PALETTE.WHITE_GOLD },       // Astraea Sparkle ✦
        { angle: -Math.PI * 0.5 - 1.25, radius: primaryRadius - 0.05, size: 15.0, alpha: 0.88, type: 0.0, color: CELESTIAL_BELT_PALETTE.WARM_PEARL_GOLD },
        { angle: -Math.PI * 0.5 - 1.45, radius: primaryRadius + 0.15, size: 12.0, alpha: 0.82, type: 0.0, color: CELESTIAL_BELT_PALETTE.SOFT_GOLD },

        // Selene segment (upper-right)
        { angle: -Math.PI * 0.5 + 1.08, radius: primaryRadius - 0.05, size: 24.0, alpha: 0.96, type: 1.0, color: CELESTIAL_BELT_PALETTE.WHITE_GOLD },       // Selene Sparkle ✦
        { angle: -Math.PI * 0.5 + 1.28, radius: primaryRadius + 0.1, size: 14.0, alpha: 0.88, type: 0.0, color: CELESTIAL_BELT_PALETTE.WARM_PEARL_GOLD },
        { angle: -Math.PI * 0.5 + 1.48, radius: primaryRadius - 0.1, size: 11.0, alpha: 0.80, type: 0.0, color: CELESTIAL_BELT_PALETTE.SOFT_GOLD },

        // Secondary inner & outer arc nodes
        { angle: -Math.PI * 0.5 - 0.12, radius: primaryRadius - 4.2, size: 18.0, alpha: 0.75, type: 1.0, color: CELESTIAL_BELT_PALETTE.WARM_PEARL_GOLD }, // Inner Sparkle ✧
        { angle: -Math.PI * 0.5 + 0.15, radius: primaryRadius - 4.2, size: 10.0, alpha: 0.70, type: 0.0, color: CELESTIAL_BELT_PALETTE.CHAMPAGNE_GOLD },
        { angle: -Math.PI * 0.5 + 0.50, radius: primaryRadius + 4.5, size: 16.0, alpha: 0.72, type: 1.0, color: CELESTIAL_BELT_PALETTE.WARM_PEARL_GOLD }, // Outer Sparkle ✧
        { angle: -Math.PI * 0.5 + 0.72, radius: primaryRadius + 4.5, size: 10.0, alpha: 0.68, type: 0.0, color: CELESTIAL_BELT_PALETTE.SOFT_GOLD },

        // Peripheral nodes
        { angle: -Math.PI * 0.5 + 1.95, radius: primaryRadius * 0.99, size: 12.0, alpha: 0.70, type: 0.0, color: CELESTIAL_BELT_PALETTE.CHAMPAGNE_GOLD },
        { angle: -Math.PI * 0.5 - 2.05, radius: primaryRadius * 0.99, size: 12.0, alpha: 0.65, type: 0.0, color: CELESTIAL_BELT_PALETTE.SOFT_GOLD },
    ];

    const count = nodeDefs.length;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const baseAlphas = new Float32Array(count);
    const types = new Float32Array(count);
    const pulses = new Float32Array(count * 2);

    for (let i = 0; i < count; i++) {
        const def = nodeDefs[i];
        // Torus coordinate convention in XY plane:
        // x = r * cos(theta), y = r * sin(theta), z = 0
        positions[i * 3 + 0] = def.radius * Math.cos(def.angle);
        positions[i * 3 + 1] = def.radius * Math.sin(def.angle);
        positions[i * 3 + 2] = (Math.sin(i * 1.7) * 0.25); // tiny depth variation

        const rgb = hexToRgb(def.color);
        colors[i * 3 + 0] = rgb[0];
        colors[i * 3 + 1] = rgb[1];
        colors[i * 3 + 2] = rgb[2];

        sizes[i] = def.size;
        baseAlphas[i] = def.alpha;
        types[i] = def.type;

        // Individual pulse frequency and phase
        pulses[i * 2 + 0] = (i * 1.93) % (Math.PI * 2);       // phase
        pulses[i * 2 + 1] = 0.8 + ((i * 37) % 10) * 0.12;      // frequency rad/s
    }

    const geom = new BufferGeometry();
    geom.setAttribute('position', new BufferAttribute(positions, 3));
    geom.setAttribute('color', new BufferAttribute(colors, 3));
    geom.setAttribute('aSize', new BufferAttribute(sizes, 1));
    geom.setAttribute('aBaseAlpha', new BufferAttribute(baseAlphas, 1));
    geom.setAttribute('aType', new BufferAttribute(types, 1));
    geom.setAttribute('aPulse', new BufferAttribute(pulses, 2));

    return geom;
}

/**
 * Creates the complete Golden Celestial Belt Group.
 * Contains:
 * 1. 'celestial-belt-arcs': Single batched Mesh containing all primary and secondary curved arcs (1 draw call).
 * 2. 'celestial-belt-nodes': Single batched Points containing all energy nodes and sparkle bursts (1 draw call).
 *
 * @param {object} [options={}]
 * @returns {Group}
 */
export function createCelestialBelt(options = {}) {
    const beltGroup = new Group();
    beltGroup.name = 'celestial-belt';
    beltGroup.renderOrder = -918;

    // 1. Fragmented Arc Mesh (1 draw call)
    const arcGeometry = createCelestialBeltGeometry(options);
    const arcMaterial = createCelestialBeltMaterial(options);
    const arcMesh = new Mesh(arcGeometry, arcMaterial);
    arcMesh.name = 'celestial-belt-arcs';
    arcMesh.renderOrder = -918;
    arcMesh.frustumCulled = false;
    beltGroup.add(arcMesh);

    // 2. Nodes and Sparkles Points Mesh (1 draw call)
    const nodesGeometry = createCelestialBeltNodesGeometry(options);
    const nodesMaterial = createCelestialBeltNodesMaterial(options);
    const nodesPoints = new Points(nodesGeometry, nodesMaterial);
    nodesPoints.name = 'celestial-belt-nodes';
    nodesPoints.renderOrder = -917;
    nodesPoints.frustumCulled = false;
    beltGroup.add(nodesPoints);

    // 3. Orient the belt group into 3D cosmic space
    // Normal vector tilted at ~19.4° elevation in forward direction (-Z)
    const normal = new Vector3(...CELESTIAL_BELT_NORMAL).normalize();
    const up = new Vector3(0, 0, 1);
    const orientation = new Quaternion().setFromUnitVectors(up, normal);
    beltGroup.quaternion.copy(orientation);

    return beltGroup;
}

/**
 * Updates animations on the Golden Celestial Belt Group.
 * @param {Group} beltGroup
 * @param {number} dt - Elapsed time delta in seconds.
 */
export function updateCelestialBelt(beltGroup, dt = 0.016) {
    if (!beltGroup) return;

    // Extremely slow orbital drift around normal: 0.0006 rad/s (~10,400s per orbit)
    // Appears stationary at first glance, but alive and cosmic over time
    const driftAngle = dt * 0.0006;
    beltGroup.rotateOnAxis(new Vector3(0, 0, 1), driftAngle);

    // Advance material uniform times
    beltGroup.traverse((child) => {
        if (child.isMesh || child.isPoints) {
            const mat = child.material;
            if (mat?.uniforms?.uTime) {
                mat.uniforms.uTime.value += dt;
            }
        }
    });
}

/**
 * Disposes all geometries and materials contained in a Celestial Belt group.
 * @param {Group} beltGroup
 */
export function disposeCelestialBelt(beltGroup) {
    if (!beltGroup || typeof beltGroup.traverse !== 'function') return;
    beltGroup.traverse((child) => {
        if (child.isMesh || child.isPoints) {
            child.geometry?.dispose?.();
            if (Array.isArray(child.material)) {
                child.material.forEach((m) => m?.dispose?.());
            } else {
                child.material?.dispose?.();
            }
        }
    });
}
