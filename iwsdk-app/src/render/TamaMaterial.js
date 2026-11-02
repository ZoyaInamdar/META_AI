/**
 * Celestial Kendama - Celestial Tama (Ball) Material System
 * Role: Person C (Visuals & Rendering)
 *
 * Defines the dedicated PBR material and procedural 3D galaxy shader for the
 * Celestial Kendama Tama (ball).
 *
 * Visual Direction:
 * - Slightly dark lavender galaxy with flowing white, black and blue nebula swirls.
 * - Dominant base: Dark Lavender (#786A9E) covering ~45-50% of the surface.
 * - Flowing nebula clouds: Luminous Pearl White (#F8F5FF) forming soft, billowy clouds (~22%).
 * - Flowing swirls: Rich Galaxy Blue (#344F91) drifting along cosmic channels (~24%).
 * - Subtle contrast patches: Deep Cosmic Black (#111321) localized in deep cosmic voids (~8%).
 * - Multi-octave domain-warped 3D noise producing fluid organic swirls and marble ribbons.
 * - Fine, restrained starlight micro-sparkles.
 * - Polished pearlescent nacre finish with clearcoat depth and soft iridescent highlights.
 * - Sensible bore interior handling: clean transition into the cavity, suppression of sparkles
 *   inside the hole, and soft internal cavity occlusion.
 * - Invariant local coordinate system: stable across translation, rotation, cup seating,
 *   and gameplay flight with zero per-frame CPU matrix inversions or scene hierarchy dependencies.
 */

import { MeshPhysicalMaterial, Color, FrontSide } from 'three';
import { KEN_PALETTE } from './KenMaterials.js';

// --- Authoritative Tama Galaxy Palette ---
export const TAMA_PALETTE = Object.freeze({
    DARK_LAVENDER: '#786A9E', // Dominant base
    PEARL_WHITE: '#F8F5FF',   // Flowing nebula clouds
    COSMIC_BLACK: '#111321',  // Subtle contrast patches
    GALAXY_BLUE: '#344F91',   // Flowing swirls
});

// --- Authoritative Default Tama Material Constants ---
export const DEFAULT_TAMA_BASE_COLOR = TAMA_PALETTE.DARK_LAVENDER;
export const DEFAULT_TAMA_ROUGHNESS = 0.24;
export const DEFAULT_TAMA_METALNESS = 0.02;
export const DEFAULT_TAMA_CLEARCOAT = 0.78;
export const DEFAULT_TAMA_CLEARCOAT_ROUGHNESS = 0.14;
export const DEFAULT_TAMA_SHEEN = 0.55;
export const DEFAULT_TAMA_SHEEN_ROUGHNESS = 0.22;
export const DEFAULT_TAMA_SHEEN_COLOR = '#D8CEF2';
export const DEFAULT_TAMA_IRIDESCENCE = 0.38;
export const DEFAULT_TAMA_IRIDESCENCE_IOR = 1.34;
export const DEFAULT_TAMA_IRIDESCENCE_THICKNESS = [120, 340];

// --- Authoritative Shader Parameter Constants ---
export const DEFAULT_TAMA_FREQ = 48.0;          // Tuned for ~2.1 organic flowing cloud waves across 9 cm sphere
export const DEFAULT_TAMA_WARP_STRENGTH = 0.65; // Multi-octave vector displacement turbulence creating fluid swirls
export const DEFAULT_TAMA_T_SHIFT = -0.02;     // Centers distribution solidly on dark lavender base
export const DEFAULT_TAMA_T_SCALE = 1.05;      // Balances full range coverage across four colors
export const DEFAULT_TAMA_NEBULA_WEIGHT = 0.82; // Blends nebula flow into dark lavender albedo
export const DEFAULT_TAMA_BLUE_WEIGHT = 0.25;   // Visible galaxy blue presence
export const DEFAULT_TAMA_SHEEN_WEIGHT = 0.38;  // Angle-dependent pearlescent Fresnel shift
export const DEFAULT_TAMA_SPARKLE_WEIGHT = 1.00; // Subtle pinprick starlight glitter
export const DEFAULT_TAMA_BORE_CAVITY_DEPTH = 0.70; // Internal cavity occlusion depth

/**
 * Helper to convert hex string or Three.js Color to linear RGB array [r, g, b].
 *
 * @param {string | Color} input - Color hex string or Color instance
 * @returns {[number, number, number]} Linear RGB channel values clamped to 4 decimals
 */
function toLinearRgb(input) {
    const c = input instanceof Color ? input : new Color(input);
    return [
        Number(c.r.toFixed(4)),
        Number(c.g.toFixed(4)),
        Number(c.b.toFixed(4)),
    ];
}

/**
 * Enhances a Three.js MeshPhysicalMaterial with the procedural Celestial Tama galaxy shader.
 *
 * Shader Features:
 * 1. Local-Space 3D Evaluation: Evaluates procedural coordinates directly in local mesh space
 *    (vTamaPos = transformed). The pattern stays rigidly locked to the ball during rotation,
 *    velocity changes, and cup catches without world-space swimming artifacts or hierarchy dependencies.
 * 2. Multi-Octave Domain Warping: Three harmonic octaves warped through two nonlinear 3D vector fields
 *    stretch level sets into flowing marble veins and filament clouds, avoiding circular decal spots.
 * 3. 4-Color Continuous Flowing Color Ramp: Six-stop piecewise-linear color ramp calibrated for
 *    dominant dark lavender (#786A9E) base, flowing pearl-white (#F8F5FF) nebula clouds,
 *    galaxy-blue (#344F91) swirls, and subtle deep cosmic-black (#111321) contrast patches.
 * 4. Angle-Dependent Bicolor Nacre Sheen: Viewing angle Fresnel highlights shift smoothly between
 *    soft violet-nacre and celestial ice-blue at glancing angles.
 * 5. Fine Starlight Glitter: High-frequency 3D micro-hash creates tiny, restrained pinprick sparkles
 *    embedded in the lacquer surface.
 * 6. Authentic Bore Interior Handling: Detects the cylindrical bore cavity based on local coordinates,
 *    smoothly suppressing starlight sparkles and adding realistic cavity occlusion shading inside the hole.
 *
 * @param {MeshPhysicalMaterial} material - The material to enhance
 * @param {object} [options={}] - Customization options
 * @returns {MeshPhysicalMaterial} The enhanced material
 */
export function applyTamaGalaxyShader(material, options = {}) {
    if (!material || !material.isMaterial) return material;

    const {
        freq = DEFAULT_TAMA_FREQ,
        warpStrength = DEFAULT_TAMA_WARP_STRENGTH,
        tShift = DEFAULT_TAMA_T_SHIFT,
        tScale = DEFAULT_TAMA_T_SCALE,
        nebulaWeight = DEFAULT_TAMA_NEBULA_WEIGHT,
        blueWeight = DEFAULT_TAMA_BLUE_WEIGHT,
        sheenWeight = DEFAULT_TAMA_SHEEN_WEIGHT,
        sparkleWeight = DEFAULT_TAMA_SPARKLE_WEIGHT,
        boreCavityDepth = DEFAULT_TAMA_BORE_CAVITY_DEPTH,
        sheenColorA = [0.88, 0.82, 0.98],
        sheenColorB = [0.78, 0.85, 1.0],
    } = options;

    const cBlack = toLinearRgb(TAMA_PALETTE.COSMIC_BLACK);
    const cBlue = toLinearRgb(TAMA_PALETTE.GALAXY_BLUE);
    const cLavender = toLinearRgb(TAMA_PALETTE.DARK_LAVENDER);
    const cWhite = toLinearRgb(TAMA_PALETTE.PEARL_WHITE);
    const cMoonPearl = toLinearRgb(KEN_PALETTE.MOON_PEARL);

    // Unique program cache key ensures Three.js compiles an independent program for the Tama
    material.customProgramCacheKey = () => `celestial-tama-v2-${material.name || 'default'}`;

    material.onBeforeCompile = (shader, renderer) => {
        try {
            console.log(`[TAMA-SHADER] onBeforeCompile executed for material "${material.name}"`);

            // 1. Vertex Shader: Pass local object position
            shader.vertexShader = shader.vertexShader.replace(
                '#include <common>',
                `#include <common>
varying vec3 vTamaPos;
`
            );
            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `#include <begin_vertex>
vTamaPos = transformed;
`
            );

            // 2. Fragment Shader Definitions: Domain-warped multi-octave noise and 6-stop color ramp
            const glslDefinitions = `
varying vec3 vTamaPos;

// Stage 1 3D vector displacement field for domain warping
vec3 tamaWarp3D_A(vec3 p) {
    return vec3(
        sin(p.y * 1.3 + p.z * 0.8),
        sin(p.z * 1.4 + p.x * 0.9),
        sin(p.x * 1.2 + p.y * 1.0)
    );
}

// Stage 2 3D vector displacement field for domain warping
vec3 tamaWarp3D_B(vec3 q) {
    return vec3(
        cos(q.z * 1.6 + q.y * 1.0 + 1.7),
        cos(q.x * 1.5 + q.z * 1.2 + 9.2),
        cos(q.y * 1.7 + q.x * 0.9 + 3.4)
    );
}

// Domain-warped multi-octave 3D noise field
// Distorts coordinates through two vector fields before evaluating harmonic waves,
// turning would-be circular level sets into organic flowing filaments and marble ribbons.
float tamaNebulaFbm(vec3 p, float warpStrength) {
    vec3 q = p + warpStrength * tamaWarp3D_A(p);
    vec3 r = q + (warpStrength * 0.85) * tamaWarp3D_B(q);

    // Octave 1: broad flowing celestial bands
    float o1 = sin(r.x * 1.1 + sin(r.y * 1.25 + r.z * 0.85)) * cos(r.y * 1.15 + sin(r.z * 1.2 + r.x * 0.9));

    // Octave 2: medium marble swirls
    vec3 r2 = r * 2.15 + vec3(2.4, 5.1, 7.8);
    float o2 = sin(r2.z * 1.3 + cos(r2.x * 1.35 + r2.y * 1.05)) * cos(r2.x * 1.25 + sin(r2.y * 1.4 + r2.z * 0.8));

    // Octave 3: fine delicate filaments
    vec3 r3 = r * 4.3 + vec3(8.7, 1.3, 4.9);
    float o3 = sin(r3.y * 1.4 + r3.x * 1.1) * cos(r3.z * 1.3 + r3.y * 0.9);

    float fbm = 0.5 + 0.32 * o1 + 0.14 * o2 + 0.04 * o3;
    return clamp(fbm, 0.0, 1.0);
}

// 6-stop continuous flowing galaxy color ramp:
// 1. Deep Cosmic Black (#111321) -> subtle contrast patches in deepest troughs (~8% area)
// 2. Galaxy Blue (#344F91) -> flowing celestial swirls bordering cosmic voids (~24% area)
// 3. Dark Lavender (#786A9E) -> dominant celestial base spanning the central body (~46% area)
// 4. Dark Lavender (#786A9E) -> wide central plateau preventing premature white dominance
// 5. Pearl White (#F8F5FF) -> flowing luminous nebula clouds confined to upper ridges (~22% area)
vec3 tamaGalaxyRamp(float t) {
    vec3 c0 = vec3(${cBlack.join(', ')});        // Deep Cosmic Black (#111321)
    vec3 c1 = mix(c0, vec3(${cBlue.join(', ')}), 0.35); // Subtle Cosmic Deep Transition
    vec3 c2 = vec3(${cBlue.join(', ')});         // Galaxy Blue (#344F91)
    vec3 c3 = vec3(${cLavender.join(', ')});     // Dark Lavender Base (#786A9E)
    vec3 c4 = vec3(${cLavender.join(', ')});     // Dark Lavender Base Plateau (#786A9E)
    vec3 c5 = vec3(${cWhite.join(', ')});        // Pearl White Cloud (#F8F5FF)

    if (t < 0.08) {
        return mix(c0, c1, t / 0.08);
    } else if (t < 0.22) {
        return mix(c1, c2, (t - 0.08) / 0.14);
    } else if (t < 0.38) {
        return mix(c2, c3, (t - 0.22) / 0.16);
    } else if (t < 0.72) {
        return mix(c3, c4, (t - 0.38) / 0.34);
    } else {
        return mix(c4, c5, clamp((t - 0.72) / 0.28, 0.0, 1.0));
    }
}
`;

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <common>',
                `#include <common>
${glslDefinitions}
`
            );

            const hasSheen = sheenWeight > 0.005;
            const hasSparkle = sparkleWeight > 0.005;

            // 3. Fragment Shader Logic: Domain-warped flow, cavity occlusion, nacre Fresnel, sparkles
            const glslTamaLogic = `
    #include <normal_fragment_begin>

    // 1. Procedural 3D coordinates in Tama local space (zero UV seams, zero lathe distortion)
    vec3 tPos = vTamaPos * ${freq.toFixed(1)};
    float nebulaFbm = tamaNebulaFbm(tPos, ${warpStrength.toFixed(2)});

    // 2. Continuous flowing celestial ramp with dominant dark lavender base
    float tFlow = clamp((nebulaFbm + ${tShift.toFixed(2)}) * ${tScale.toFixed(2)}, 0.0, 1.0);
    vec3 galaxyFlowColor = tamaGalaxyRamp(tFlow);

    // 3. Smooth organic blending into dark lavender base albedo
    diffuseColor.rgb = mix(diffuseColor.rgb, galaxyFlowColor, ${nebulaWeight.toFixed(2)});

    // 4. Bore cavity occlusion & interior shading
    // Detects internal bore cavity: y < -0.0065 m and radial distance r < 0.0145 m
    float boreDepthFactor = clamp((-0.0065 - vTamaPos.y) / 0.035, 0.0, 1.0);
    float boreRadiusFactor = smoothstep(0.0150, 0.0125, length(vTamaPos.xz));
    float boreCavity = boreDepthFactor * boreRadiusFactor;
    vec3 boreInteriorTone = mix(vec3(${cMoonPearl.join(', ')}), vec3(${cLavender.join(', ')}), 0.35) * 0.80;
    diffuseColor.rgb = mix(diffuseColor.rgb, boreInteriorTone, boreCavity * ${boreCavityDepth.toFixed(2)});
${hasSheen ? `
    // 5. Angle-dependent pearlescent sheen shift (NdotV Fresnel nacre highlights)
    vec3 viewDir = normalize(-vViewPosition);
    float NdotV = clamp(dot(normal, viewDir), 0.0, 1.0);
    float fresnel = pow(1.0 - NdotV, 2.4);
    vec3 sColor = mix(vec3(${sheenColorA.join(', ')}), vec3(${sheenColorB.join(', ')}), sin(vTamaPos.y * 55.0) * 0.5 + 0.5);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb + sColor * 0.28, fresnel * ${sheenWeight.toFixed(2)} * (1.0 - boreCavity * 0.7));
` : ''}
${hasSparkle ? `
    // 6. Tiny delicate celestial star sparkles (suppressed inside the bore hole)
    vec3 starGrid = floor(vTamaPos * 850.0);
    float starHash = fract(sin(dot(starGrid, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
    if (starHash > 0.988) {
        float starIntensity = pow((starHash - 0.988) / 0.012, 2.0);
        vec3 starTint = mix(vec3(1.0, 0.98, 0.95), vec3(0.92, 0.88, 1.0), fract(starHash * 19.0));
        totalEmissiveRadiance += starTint * (starIntensity * ${sparkleWeight.toFixed(2)} * (1.0 - boreCavity));
    }
` : ''}
`;

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <normal_fragment_begin>',
                glslTamaLogic
            );
        } catch (err) {
            console.warn('[TamaMaterial] Celestial Tama galaxy shader enhancement failed, falling back to PBR base:', err);
        }
    };

    return material;
}

/**
 * Factory creating a fresh, independent Celestial Tama MeshPhysicalMaterial.
 *
 * @param {object} [options={}] - Customization options
 * @param {string | Color} [options.color=DEFAULT_TAMA_BASE_COLOR] - Base albedo color
 * @param {number} [options.roughness=DEFAULT_TAMA_ROUGHNESS] - Surface micro-roughness [0, 1]
 * @param {number} [options.metalness=DEFAULT_TAMA_METALNESS] - Metallic factor [0, 1]
 * @param {number} [options.clearcoat=DEFAULT_TAMA_CLEARCOAT] - Clearcoat protective nacre glaze [0, 1]
 * @param {number} [options.clearcoatRoughness=DEFAULT_TAMA_CLEARCOAT_ROUGHNESS] - Clearcoat roughness [0, 1]
 * @param {number} [options.sheen=DEFAULT_TAMA_SHEEN] - Sheen factor [0, 1]
 * @param {number} [options.sheenRoughness=DEFAULT_TAMA_SHEEN_ROUGHNESS] - Sheen roughness [0, 1]
 * @param {string | Color} [options.sheenColor=DEFAULT_TAMA_SHEEN_COLOR] - Sheen tint color
 * @param {number} [options.iridescence=DEFAULT_TAMA_IRIDESCENCE] - Thin-film iridescence factor [0, 1]
 * @param {number} [options.iridescenceIOR=DEFAULT_TAMA_IRIDESCENCE_IOR] - Thin-film IOR
 * @param {number[]} [options.iridescenceThicknessRange=DEFAULT_TAMA_IRIDESCENCE_THICKNESS] - Film thickness range in nm
 * @param {number} [options.side=FrontSide] - Face rendering side
 * @param {object} [options.shaderOptions={}] - Custom shader parameters for applyTamaGalaxyShader
 * @returns {MeshPhysicalMaterial} Fully configured, deterministic Celestial Tama material
 */
export function createCelestialTamaMaterial(options = {}) {
    const {
        color = DEFAULT_TAMA_BASE_COLOR,
        roughness = DEFAULT_TAMA_ROUGHNESS,
        metalness = DEFAULT_TAMA_METALNESS,
        clearcoat = DEFAULT_TAMA_CLEARCOAT,
        clearcoatRoughness = DEFAULT_TAMA_CLEARCOAT_ROUGHNESS,
        sheen = DEFAULT_TAMA_SHEEN,
        sheenRoughness = DEFAULT_TAMA_SHEEN_ROUGHNESS,
        sheenColor = DEFAULT_TAMA_SHEEN_COLOR,
        iridescence = DEFAULT_TAMA_IRIDESCENCE,
        iridescenceIOR = DEFAULT_TAMA_IRIDESCENCE_IOR,
        iridescenceThicknessRange = DEFAULT_TAMA_IRIDESCENCE_THICKNESS,
        side = FrontSide,
        shaderOptions = {},
    } = options;

    const material = new MeshPhysicalMaterial({
        color: color instanceof Color ? color : new Color(color),
        roughness,
        metalness,
        clearcoat,
        clearcoatRoughness,
        sheen,
        sheenRoughness,
        sheenColor: sheenColor instanceof Color ? sheenColor : new Color(sheenColor),
        iridescence,
        iridescenceIOR,
        iridescenceThicknessRange: [...iridescenceThicknessRange],
        side,
    });

    material.name = 'mat-celestial-tama';

    applyTamaGalaxyShader(material, shaderOptions);

    return material;
}

/**
 * Authoritative default singleton instance of the Celestial Tama material.
 */
export const celestialTamaMaterial = createCelestialTamaMaterial();

export default celestialTamaMaterial;
