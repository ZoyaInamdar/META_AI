/**
 * Celestial Kendama - Set 4: Dark Matter Tama Material System
 * Role: Person C (Visuals & Rendering)
 *
 * Defines the PBR material and procedural 3D spherical shader for the Dark Matter Tama (ball),
 * featuring a strong hot-pink upper region organically transitioning into smoky charcoal and deep black.
 *
 * Visual Direction:
 * - Strong, vibrant hot-pink upper region (#FF2B95).
 * - Gradual organic transition into smoky charcoal and deep space black (#0F1014).
 * - Organic cloud-like boundary between colours with subtle marble-like variations.
 * - Glossy polished spherical finish with smooth clearcoat depth and subtle pink mineral sheen.
 * - Seamless 3D procedural evaluation: zero UV seams, poles, or distortion.
 * - Readable bore interior handling: deep black cavity occlusion inside the spike hole.
 */

import { MeshPhysicalMaterial, Color, FrontSide } from 'three';

// --- Authoritative Dark Matter Tama Palette ---
export const DARK_MATTER_TAMA_PALETTE = Object.freeze({
    HOT_PINK: '#FF2B95',         // Strong hot-pink upper region
    MAGENTA_BURST: '#C61A74',    // Radiant magenta transitional cloud
    SMOKY_PLUM: '#4E2138',       // Deep smoky plum boundary bridge
    SMOKY_CHARCOAL: '#20222A',   // Smoky charcoal middle/lower body
    DEEP_BLACK: '#0F1014',       // Deep space black base & bore hemisphere
    BORE_SHADOW: '#090A0D',      // Deep cavity shadow tone
});

// --- Authoritative Default PBR Constants ---
export const DEFAULT_DM_TAMA_BASE_COLOR = DARK_MATTER_TAMA_PALETTE.DEEP_BLACK;
export const DEFAULT_DM_TAMA_ROUGHNESS = 0.18;
export const DEFAULT_DM_TAMA_METALNESS = 0.0;
export const DEFAULT_DM_TAMA_CLEARCOAT = 0.88;
export const DEFAULT_DM_TAMA_CLEARCOAT_ROUGHNESS = 0.08;
export const DEFAULT_DM_TAMA_SHEEN = 0.42;
export const DEFAULT_DM_TAMA_SHEEN_ROUGHNESS = 0.18;
export const DEFAULT_DM_TAMA_SHEEN_COLOR = '#FF66B2';
export const DEFAULT_DM_TAMA_IRIDESCENCE = 0.24;
export const DEFAULT_DM_TAMA_IRIDESCENCE_IOR = 1.34;
export const DEFAULT_DM_TAMA_IRIDESCENCE_THICKNESS = [120, 320];

// --- Authoritative Shader Parameter Constants ---
export const DEFAULT_DM_TAMA_WARP_STRENGTH = 0.65;
export const DEFAULT_DM_TAMA_FLOW_WEIGHT = 0.95;
export const DEFAULT_DM_TAMA_SHEEN_WEIGHT = 0.35;
export const DEFAULT_DM_TAMA_BORE_CAVITY_DEPTH = 0.85;

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
 * Injects procedural 3D organic hot-pink to smoky black gradient and bore cavity shading into a MeshPhysicalMaterial.
 *
 * @param {MeshPhysicalMaterial} material - The physical material to enhance
 * @param {object} [options={}] - Customization options
 * @returns {MeshPhysicalMaterial} The enhanced material
 */
export function applyDarkMatterTamaShader(material, options = {}) {
    if (!material || !material.isMaterial) return material;

    const {
        warpStrength = DEFAULT_DM_TAMA_WARP_STRENGTH,
        flowWeight = DEFAULT_DM_TAMA_FLOW_WEIGHT,
        sheenWeight = DEFAULT_DM_TAMA_SHEEN_WEIGHT,
        boreCavityDepth = DEFAULT_DM_TAMA_BORE_CAVITY_DEPTH,
        sheenColorA = [1.00, 0.40, 0.75], // Radiant hot-pink sheen
        sheenColorB = [0.45, 0.50, 0.65], // Smoky mineral shimmer
    } = options;

    const cPink = toLinearRgb(DARK_MATTER_TAMA_PALETTE.HOT_PINK);
    const cMagenta = toLinearRgb(DARK_MATTER_TAMA_PALETTE.MAGENTA_BURST);
    const cPlum = toLinearRgb(DARK_MATTER_TAMA_PALETTE.SMOKY_PLUM);
    const cCharcoal = toLinearRgb(DARK_MATTER_TAMA_PALETTE.SMOKY_CHARCOAL);
    const cBlack = toLinearRgb(DARK_MATTER_TAMA_PALETTE.DEEP_BLACK);
    const cBore = toLinearRgb(DARK_MATTER_TAMA_PALETTE.BORE_SHADOW);

    material.customProgramCacheKey = () => `dm-tama-v1-${material.name || 'default'}`;

    material.onBeforeCompile = (shader) => {
        try {
            console.log(`[DM-TAMA-SHADER] onBeforeCompile executed for material "${material.name}"`);

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

            // 2. Fragment Shader Definitions: 3D vector warp, cloud turbulence, and hot-pink to black ramp
            const glslDefinitions = `
varying vec3 vTamaPos;

// 3D vector displacement field for organic flowing cloud contours
vec3 dmTamaWarp(vec3 p) {
    return vec3(
        sin(p.y * 35.0 + p.z * 20.0) * 0.007 + sin(p.x * 70.0) * 0.002,
        cos(p.x * 30.0 + p.z * 25.0) * 0.005,
        sin(p.y * 40.0 + p.x * 25.0) * 0.007 + cos(p.z * 65.0) * 0.002
    );
}

// 5-stage organic transition ramp from Deep Black through Smoky Plum to Strong Hot Pink
vec3 dmTamaColorRamp(float t) {
    vec3 cBlack = vec3(${cBlack.join(', ')});
    vec3 cCharcoal = vec3(${cCharcoal.join(', ')});
    vec3 cPlum = vec3(${cPlum.join(', ')});
    vec3 cMagenta = vec3(${cMagenta.join(', ')});
    vec3 cPink = vec3(${cPink.join(', ')});

    if (t < 0.25) {
        return mix(cBlack, cCharcoal, t / 0.25);
    } else if (t < 0.50) {
        return mix(cCharcoal, cPlum, (t - 0.25) / 0.25);
    } else if (t < 0.72) {
        return mix(cPlum, cMagenta, (t - 0.50) / 0.22);
    } else {
        return mix(cMagenta, cPink, clamp((t - 0.72) / 0.28, 0.0, 1.0));
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

            // 3. Fragment Shader Logic: 3D cloud-displaced gradient, bore cavity shading, and sheen
            const glslLogic = `
    #include <normal_fragment_begin>

    // 1. Procedural 3D coordinates with domain warping
    vec3 warpedPos = vTamaPos + dmTamaWarp(vTamaPos) * ${warpStrength.toFixed(2)};

    // 2. Organic cloud turbulence & subtle marble-like variation
    float cloudTurb = (sin(warpedPos.x * 42.0 + sin(warpedPos.y * 38.0 + warpedPos.z * 35.0)) * 0.5 + 0.5) * 0.26;
    float marbleVein = pow(1.0 - abs(sin(warpedPos.y * 80.0 + warpedPos.x * 60.0)), 3.0) * 0.10;

    // Transition parameter: vertical gradient from -Y (black) to +Y (hot pink)
    float baseGrad = (warpedPos.y / 0.045) * 0.5 + 0.5; // [-1, 1] mapped to [0, 1]
    float tTransition = clamp(baseGrad + cloudTurb - 0.13 + marbleVein * 0.04, 0.0, 1.0);

    // 3. Evaluate continuous color ramp
    vec3 gradientColor = dmTamaColorRamp(tTransition);

    // 4. Blend into albedo
    diffuseColor.rgb = mix(diffuseColor.rgb, gradientColor, ${flowWeight.toFixed(2)});

    // 5. Bore cavity occlusion & interior shading
    float boreDepthFactor = clamp((-0.0065 - vTamaPos.y) / 0.035, 0.0, 1.0);
    float boreRadiusFactor = smoothstep(0.0150, 0.0125, length(vTamaPos.xz));
    float boreCavity = boreDepthFactor * boreRadiusFactor;
    vec3 boreInteriorTone = vec3(${cBore.join(', ')}) * 0.55;
    diffuseColor.rgb = mix(diffuseColor.rgb, boreInteriorTone, boreCavity * ${boreCavityDepth.toFixed(2)});

${hasSheen ? `
    // 6. Polished lacquer Fresnel sheen highlight
    vec3 viewDir = normalize(-vViewPosition);
    float NdotV = clamp(dot(normal, viewDir), 0.0, 1.0);
    float fresnel = pow(1.0 - NdotV, 2.4);
    vec3 sColor = mix(vec3(${sheenColorB.join(', ')}), vec3(${sheenColorA.join(', ')}), tTransition);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb + sColor * 0.25, fresnel * ${sheenWeight.toFixed(2)} * (1.0 - boreCavity * 0.8));
` : ''}
`;

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <normal_fragment_begin>',
                glslLogic
            );
        } catch (err) {
            console.warn('[DarkMatterTamaMaterial] Shader compilation failed, using standard PBR base:', err);
        }
    };

    return material;
}

/**
 * Factory creating a Dark Matter Tama MeshPhysicalMaterial.
 *
 * @param {object} [options={}] - Customization options
 * @returns {MeshPhysicalMaterial} Configured Tama material
 */
export function createDarkMatterTamaMaterial(options = {}) {
    const {
        color = DEFAULT_DM_TAMA_BASE_COLOR,
        roughness = DEFAULT_DM_TAMA_ROUGHNESS,
        metalness = DEFAULT_DM_TAMA_METALNESS,
        clearcoat = DEFAULT_DM_TAMA_CLEARCOAT,
        clearcoatRoughness = DEFAULT_DM_TAMA_CLEARCOAT_ROUGHNESS,
        sheen = DEFAULT_DM_TAMA_SHEEN,
        sheenRoughness = DEFAULT_DM_TAMA_SHEEN_ROUGHNESS,
        sheenColor = DEFAULT_DM_TAMA_SHEEN_COLOR,
        iridescence = DEFAULT_DM_TAMA_IRIDESCENCE,
        iridescenceIOR = DEFAULT_DM_TAMA_IRIDESCENCE_IOR,
        iridescenceThicknessRange = DEFAULT_DM_TAMA_IRIDESCENCE_THICKNESS,
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

    material.name = 'mat-dark-matter-tama';

    applyDarkMatterTamaShader(material, shaderOptions);

    return material;
}

/**
 * Singleton instance of Dark Matter Tama material.
 */
export const darkMatterTamaMaterial = createDarkMatterTamaMaterial();

export default darkMatterTamaMaterial;
