/**
 * Celestial Kendama - Set 3: Bubblegum Pop Tama Material System
 * Role: Person C (Visuals & Rendering)
 *
 * Defines the vibrant, seamless 3-color organic gradient PBR material and procedural 3D
 * spherical shader for the Bubblegum Pop Tama (ball).
 *
 * Visual Direction:
 * - Bold, playful, vibrant candy aesthetic pairing with the vivid bubblegum pink Ken.
 * - Three dominant, highly saturated colour regions:
 *   - Deep vibrant purple: #7436C8
 *   - Bright bubblegum pink: #F044A0
 *   - Sunny golden yellow: #FFD447
 * - Organic spherical gradient flowing seamlessly from purple through pink into yellow.
 * - Soft transitions with subtle flowing harmonic variations (zero hard boundaries, stripes, or flat linear bands).
 * - All three colours remain prominently visible, rich, and saturated across the spherical surface.
 * - Seamless 3D procedural evaluation: zero UV seams, poles, or texture artifacts.
 * - High-gloss polished candy lacquer finish with smooth clearcoat, radiant sheen, and subtle iridescence.
 * - Readable bore interior handling: deep purple cavity occlusion and highlight suppression inside the spike hole.
 */

import { MeshPhysicalMaterial, Color, FrontSide } from 'three';

// --- Authoritative Bubblegum Pop Tama Palette ---
export const BUBBLEGUM_POP_TAMA_PALETTE = Object.freeze({
    VIBRANT_PURPLE: '#7436C8',   // Deep vibrant purple
    BUBBLEGUM_PINK: '#F044A0',   // Bright bubblegum pink
    GOLDEN_YELLOW: '#FFD447',    // Sunny golden yellow

    // Harmonic depth & highlight tones
    PURPLE_SHADOW: '#481E8A',    // Deep purple cavity shadow tone
    YELLOW_HIGHLIGHT: '#FFE57F', // Sunny yellow radiant crest highlight
});

// --- Authoritative Default PBR Constants ---
export const DEFAULT_BG_TAMA_BASE_COLOR = BUBBLEGUM_POP_TAMA_PALETTE.BUBBLEGUM_PINK;
export const DEFAULT_BG_TAMA_ROUGHNESS = 0.18;
export const DEFAULT_BG_TAMA_METALNESS = 0.0;
export const DEFAULT_BG_TAMA_CLEARCOAT = 0.88;
export const DEFAULT_BG_TAMA_CLEARCOAT_ROUGHNESS = 0.08;
export const DEFAULT_BG_TAMA_SHEEN = 0.48;
export const DEFAULT_BG_TAMA_SHEEN_ROUGHNESS = 0.18;
export const DEFAULT_BG_TAMA_SHEEN_COLOR = '#FFB2E2';
export const DEFAULT_BG_TAMA_IRIDESCENCE = 0.28;
export const DEFAULT_BG_TAMA_IRIDESCENCE_IOR = 1.34;
export const DEFAULT_BG_TAMA_IRIDESCENCE_THICKNESS = [120, 300];

// --- Authoritative Shader Parameter Constants ---
export const DEFAULT_BG_TAMA_WARP_STRENGTH = 0.60;
export const DEFAULT_BG_TAMA_FLOW_WEIGHT = 0.95;
export const DEFAULT_BG_TAMA_SHEEN_WEIGHT = 0.35;
export const DEFAULT_BG_TAMA_BORE_CAVITY_DEPTH = 0.80;

/**
 * Helper to convert hex string or Three.js Color to linear RGB array [r, g, b].
 *
 * @param {string | Color} input - Color hex string or Color instance
 * @returns {[string, string, string]} Linear RGB channel values formatted to 4 decimals
 */
function toLinearRgb(input) {
    const c = input instanceof Color ? input : new Color(input);
    return [
        c.r.toFixed(4),
        c.g.toFixed(4),
        c.b.toFixed(4),
    ];
}

/**
 * Injects procedural 3D organic spherical gradient and bore cavity shading into a MeshPhysicalMaterial.
 *
 * @param {MeshPhysicalMaterial} material - The physical material to enhance
 * @param {object} [options={}] - Customization options
 * @returns {MeshPhysicalMaterial} The enhanced material
 */
export function applyBubblegumTamaShader(material, options = {}) {
    if (!material || !material.isMaterial) return material;

    const {
        warpStrength = DEFAULT_BG_TAMA_WARP_STRENGTH,
        flowWeight = DEFAULT_BG_TAMA_FLOW_WEIGHT,
        sheenWeight = DEFAULT_BG_TAMA_SHEEN_WEIGHT,
        boreCavityDepth = DEFAULT_BG_TAMA_BORE_CAVITY_DEPTH,
        sheenColorA = [0.95, 0.65, 0.90], // Delicate candy pink
        sheenColorB = [1.00, 0.90, 0.55], // Soft golden shimmer
    } = options;

    const cPurple = toLinearRgb(BUBBLEGUM_POP_TAMA_PALETTE.VIBRANT_PURPLE);
    const cPink = toLinearRgb(BUBBLEGUM_POP_TAMA_PALETTE.BUBBLEGUM_PINK);
    const cYellow = toLinearRgb(BUBBLEGUM_POP_TAMA_PALETTE.GOLDEN_YELLOW);
    const cPurpleShadow = toLinearRgb(BUBBLEGUM_POP_TAMA_PALETTE.PURPLE_SHADOW);

    material.customProgramCacheKey = () => `bg-tama-v1-${material.name || 'default'}`;

    material.onBeforeCompile = (shader) => {
        try {
            console.log(`[BG-TAMA-SHADER] onBeforeCompile executed for material "${material.name}"`);

            // 1. Vertex Shader: Pass local 3D position
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

            // 2. Fragment Shader Definitions: 3D vector warp and organic 3-color ramp
            const glslDefinitions = `
varying vec3 vTamaPos;

// 3D vector displacement field for organic flowing contours across the sphere
vec3 bgTamaWarp(vec3 p) {
    return vec3(
        sin(p.y * 36.0 + p.z * 22.0) * 0.0075 + sin(p.y * 78.0) * 0.0025,
        cos(p.x * 32.0 + p.z * 24.0) * 0.0050,
        sin(p.y * 38.0 + p.x * 24.0) * 0.0075 + cos(p.y * 72.0) * 0.0025
    );
}

// Seamless 3D organic spherical gradient:
// Evaluates along an angled directional vector through the ball with harmonic turbulence,
// creating soft cloud-like contours connecting the three prominent zones:
// 1. Deep Vibrant Purple (#7436C8)
// 2. Bright Bubblegum Pink (#F044A0)
// 3. Sunny Golden Yellow (#FFD447)
vec3 bgTamaColorRamp(float t) {
    vec3 cPurple = vec3(${cPurple.join(', ')});
    vec3 cPink = vec3(${cPink.join(', ')});
    vec3 cYellow = vec3(${cYellow.join(', ')});

    if (t < 0.44) {
        float u = smoothstep(0.12, 0.44, t);
        return mix(cPurple, cPink, u);
    } else {
        float u = smoothstep(0.44, 0.78, t);
        return mix(cPink, cYellow, u);
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

            // 3. Fragment Shader Logic: 3D gradient flow, bore cavity shading, and candy sheen
            const glslLogic = `
    #include <normal_fragment_begin>

    // 1. Procedural 3D organic spherical coordinate
    // Angled flow vector tilted at (0.30, 0.90, 0.32)
    vec3 flowDir = normalize(vec3(0.30, 0.90, 0.32));
    vec3 warpedPos = vTamaPos + bgTamaWarp(vTamaPos) * ${warpStrength.toFixed(2)};

    // Normalized projection along flow vector across sphere diameter (radius = 0.045 m)
    float baseProj = dot(warpedPos, flowDir) / 0.045; // roughly [-1.0, 1.0]
    float normU = clamp(baseProj * 0.5 + 0.5, 0.0, 1.0);

    // Multi-harmonic swirling eddy modulation
    float swirl = (sin(warpedPos.x * 48.0 + sin(warpedPos.y * 52.0)) * 0.5 + 0.5) * 0.12;
    float tGradient = clamp(normU + swirl - 0.06, 0.0, 1.0);

    // 2. Continuous 3-color organic gradient evaluation
    vec3 gradientColor = bgTamaColorRamp(tGradient);

    // 3. Blend into albedo
    diffuseColor.rgb = mix(diffuseColor.rgb, gradientColor, ${flowWeight.toFixed(2)});

    // 4. Bore cavity occlusion & interior shading
    float boreDepthFactor = clamp((-0.0065 - vTamaPos.y) / 0.035, 0.0, 1.0);
    float boreRadiusFactor = smoothstep(0.0150, 0.0125, length(vTamaPos.xz));
    float boreCavity = boreDepthFactor * boreRadiusFactor;
    vec3 boreInteriorTone = vec3(${cPurpleShadow.join(', ')}) * 0.65;
    diffuseColor.rgb = mix(diffuseColor.rgb, boreInteriorTone, boreCavity * ${boreCavityDepth.toFixed(2)});

${hasSheen ? `
    // 5. Candy lacquer Fresnel sheen highlight
    vec3 viewDir = normalize(-vViewPosition);
    float NdotV = clamp(dot(normal, viewDir), 0.0, 1.0);
    float fresnel = pow(1.0 - NdotV, 2.4);
    vec3 sColor = mix(vec3(${sheenColorA.join(', ')}), vec3(${sheenColorB.join(', ')}), sin(vTamaPos.y * 45.0) * 0.5 + 0.5);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb + sColor * 0.25, fresnel * ${sheenWeight.toFixed(2)} * (1.0 - boreCavity * 0.8));
` : ''}
`;

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <normal_fragment_begin>',
                glslLogic
            );
        } catch (err) {
            console.warn('[BubblegumTamaMaterial] Shader compilation failed, using standard PBR:', err);
        }
    };

    return material;
}

/**
 * Factory creating a Bubblegum Pop Tama MeshPhysicalMaterial.
 *
 * @param {object} [options={}] - Customization options
 * @returns {MeshPhysicalMaterial} Configured Tama material
 */
export function createBubblegumTamaMaterial(options = {}) {
    const {
        color = DEFAULT_BG_TAMA_BASE_COLOR,
        roughness = DEFAULT_BG_TAMA_ROUGHNESS,
        metalness = DEFAULT_BG_TAMA_METALNESS,
        clearcoat = DEFAULT_BG_TAMA_CLEARCOAT,
        clearcoatRoughness = DEFAULT_BG_TAMA_CLEARCOAT_ROUGHNESS,
        sheen = DEFAULT_BG_TAMA_SHEEN,
        sheenRoughness = DEFAULT_BG_TAMA_SHEEN_ROUGHNESS,
        sheenColor = DEFAULT_BG_TAMA_SHEEN_COLOR,
        iridescence = DEFAULT_BG_TAMA_IRIDESCENCE,
        iridescenceIOR = DEFAULT_BG_TAMA_IRIDESCENCE_IOR,
        iridescenceThicknessRange = DEFAULT_BG_TAMA_IRIDESCENCE_THICKNESS,
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

    material.name = 'mat-bubblegum-pop-tama';

    applyBubblegumTamaShader(material, shaderOptions);

    return material;
}

/**
 * Singleton instance of Bubblegum Pop Tama material.
 */
export const bubblegumPopTamaMaterial = createBubblegumTamaMaterial();

export default bubblegumPopTamaMaterial;
