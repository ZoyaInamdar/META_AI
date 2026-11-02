/**
 * Celestial Kendama - Set 3: Bubblegum Pop Ken Material System
 * Role: Person C (Visuals & Rendering)
 *
 * Defines the vibrant, glossy bubblegum pink PBR materials and procedural curvature-enhanced
 * shader for the Bubblegum Pop Ken (handle, crossbar, and cups).
 *
 * Visual Direction:
 * - Bold, playful, vibrant pink kendama set.
 * - Dominant vivid bubblegum pink (#F23891).
 * - Rich hot-pink shading in recessed areas (#C91E70).
 * - Slightly lighter pink highlights along curved surfaces and rims (#FF83C2).
 * - Deep pink shadow in crevices and cavity depths (#861044).
 * - High-gloss polished lacquer finish with smooth clearcoat.
 * - Clear visual separation between individual Ken components through subtle tonal variation.
 * - Avoids an overly pale or washed-out pink; stays saturated, vibrant, and energetic.
 */

import { MeshPhysicalMaterial, Color, FrontSide } from 'three';

// --- Authoritative Bubblegum Pop Ken Palette ---
export const BUBBLEGUM_POP_KEN_PALETTE = Object.freeze({
    PRIMARY_PINK: '#F23891',     // Dominant vivid bubblegum pink
    HOT_PINK: '#C91E70',         // Rich hot-pink shading in recessed areas
    HIGHLIGHT_PINK: '#FF83C2',   // Slightly lighter pink curved highlights & rim edges
    DEEP_PINK_SHADOW: '#861044', // Deep crevice & cavity shadow
    SHEEN_PINK: '#FF6EBD',       // Glossy lacquer sheen tone
});

// --- Authoritative Default Ken PBR Constants ---
export const DEFAULT_BG_KEN_BASE_COLOR = BUBBLEGUM_POP_KEN_PALETTE.PRIMARY_PINK;
export const DEFAULT_BG_KEN_ROUGHNESS = 0.20;
export const DEFAULT_BG_KEN_METALNESS = 0.0;
export const DEFAULT_BG_KEN_CLEARCOAT = 0.85;
export const DEFAULT_BG_KEN_CLEARCOAT_ROUGHNESS = 0.08;
export const DEFAULT_BG_KEN_SHEEN = 0.45;
export const DEFAULT_BG_KEN_SHEEN_ROUGHNESS = 0.20;
export const DEFAULT_BG_KEN_SHEEN_COLOR = BUBBLEGUM_POP_KEN_PALETTE.SHEEN_PINK;

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
 * Injects procedural curvature highlights and recessed hot-pink shading into a Ken MeshPhysicalMaterial.
 *
 * @param {MeshPhysicalMaterial} material - The physical material to enhance
 * @param {object} [options={}] - Customization options
 * @returns {MeshPhysicalMaterial} The enhanced material
 */
export function applyBubblegumKenShader(material, options = {}) {
    if (!material || !material.isMaterial) return material;

    const {
        highlightWeight = 0.42,
        recessWeight = 0.38,
        sheenWeight = 0.35,
    } = options;

    const cPrimary = toLinearRgb(BUBBLEGUM_POP_KEN_PALETTE.PRIMARY_PINK);
    const cHot = toLinearRgb(BUBBLEGUM_POP_KEN_PALETTE.HOT_PINK);
    const cHighlight = toLinearRgb(BUBBLEGUM_POP_KEN_PALETTE.HIGHLIGHT_PINK);
    const cShadow = toLinearRgb(BUBBLEGUM_POP_KEN_PALETTE.DEEP_PINK_SHADOW);

    material.customProgramCacheKey = () => `bg-ken-v1-${material.name || 'default'}`;

    material.onBeforeCompile = (shader) => {
        try {
            console.log(`[BG-KEN-SHADER] onBeforeCompile executed for material "${material.name}"`);

            // 1. Vertex Shader: Pass local vertex position
            shader.vertexShader = shader.vertexShader.replace(
                '#include <common>',
                `#include <common>
varying vec3 vKenLocalPos;
`
            );
            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `#include <begin_vertex>
vKenLocalPos = transformed;
`
            );

            // 2. Fragment Shader Definitions: Curvature highlight and subtle tonal shading
            const glslDefinitions = `
varying vec3 vKenLocalPos;

// Computes subtle tonal variation and rim highlights
vec3 computeBubblegumKenShading(vec3 baseColor, vec3 worldNormal, vec3 viewDir) {
    // 1. Fresnel / glancing angle highlight along curved surfaces
    float NdotV = clamp(dot(worldNormal, viewDir), 0.0, 1.0);
    float fresnel = pow(1.0 - NdotV, 2.2);

    // 2. Recess shading based on normal deviation and local vertical curvature
    float upwardFacing = worldNormal.y * 0.5 + 0.5;
    float recessFactor = smoothstep(0.8, 0.2, NdotV) * (1.0 - upwardFacing * 0.3);

    // 3. Blend lighter pink highlights along curved silhouette
    vec3 col = mix(baseColor, vec3(${cHighlight.join(', ')}), fresnel * ${highlightWeight.toFixed(2)});

    // 4. Blend rich hot-pink into deeper recessed angles
    col = mix(col, vec3(${cHot.join(', ')}), recessFactor * ${recessWeight.toFixed(2)});

    return col;
}
`;

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <common>',
                `#include <common>
${glslDefinitions}
`
            );

            // 3. Fragment Shader Logic: Apply curvature shading before lighting
            const glslLogic = `
    #include <normal_fragment_begin>

    vec3 kenViewDir = normalize(-vViewPosition);
    diffuseColor.rgb = computeBubblegumKenShading(diffuseColor.rgb, normal, kenViewDir);
`;

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <normal_fragment_begin>',
                glslLogic
            );
        } catch (err) {
            console.warn('[BubblegumKenMaterial] Shader compilation failed, using standard PBR:', err);
        }
    };

    return material;
}

/**
 * Factory creating a Bubblegum Pop Ken MeshPhysicalMaterial.
 *
 * @param {object} [options={}] - Configuration options
 * @returns {MeshPhysicalMaterial} Configured PBR material
 */
export function createBubblegumKenMaterial(options = {}) {
    const {
        name = 'mat-bubblegum-ken',
        color = DEFAULT_BG_KEN_BASE_COLOR,
        roughness = DEFAULT_BG_KEN_ROUGHNESS,
        metalness = DEFAULT_BG_KEN_METALNESS,
        clearcoat = DEFAULT_BG_KEN_CLEARCOAT,
        clearcoatRoughness = DEFAULT_BG_KEN_CLEARCOAT_ROUGHNESS,
        sheen = DEFAULT_BG_KEN_SHEEN,
        sheenRoughness = DEFAULT_BG_KEN_SHEEN_ROUGHNESS,
        sheenColor = DEFAULT_BG_KEN_SHEEN_COLOR,
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
        side,
    });

    material.name = name;

    applyBubblegumKenShader(material, shaderOptions);

    return material;
}

// --- Pre-configured Component Material Singletons for Bubblegum Pop Ken ---
// Subtle tonal differentiation maintains clear component separation while adhering to the vivid palette:

/** Handle (Ken stem): Vivid bubblegum pink dominant body (#F23891) with rich lacquer */
export const bubblegumHandleMaterial = createBubblegumKenMaterial({
    name: 'mat-bubblegum-handle',
    color: '#F23891',
    roughness: 0.20,
    clearcoat: 0.85,
    shaderOptions: { highlightWeight: 0.40, recessWeight: 0.35 },
});

/** Crossbar (Sarado): Slightly deeper vivid pink (#EA2E88) anchoring the wing junction */
export const bubblegumCrossbarMaterial = createBubblegumKenMaterial({
    name: 'mat-bubblegum-crossbar',
    color: '#EA2E88',
    roughness: 0.20,
    clearcoat: 0.85,
    shaderOptions: { highlightWeight: 0.42, recessWeight: 0.38 },
});

/** Big Cup (Oozara): Energetic hot-pink rim tone (#F43D95) with rich interior */
export const bubblegumBigCupMaterial = createBubblegumKenMaterial({
    name: 'mat-bubblegum-big-cup',
    color: '#F43D95',
    roughness: 0.18,
    clearcoat: 0.88,
    shaderOptions: { highlightWeight: 0.48, recessWeight: 0.42 },
});

/** Small Cup (Kozara): Playful bubblegum pink (#F23891) with crisp rim highlight */
export const bubblegumSmallCupMaterial = createBubblegumKenMaterial({
    name: 'mat-bubblegum-small-cup',
    color: '#F23891',
    roughness: 0.18,
    clearcoat: 0.88,
    shaderOptions: { highlightWeight: 0.46, recessWeight: 0.40 },
});

/** Base Cup (Chuzara): Deep hot pink (#D4237B) grounding the base with shadow depth */
export const bubblegumBaseCupMaterial = createBubblegumKenMaterial({
    name: 'mat-bubblegum-base-cup',
    color: '#D4237B',
    roughness: 0.22,
    clearcoat: 0.82,
    shaderOptions: { highlightWeight: 0.38, recessWeight: 0.45 },
});

/** Spike (Kensaki): Sleek taper with lighter highlight pink sheen (#FF83C2 albedo blend / #F23891) */
export const bubblegumSpikeMaterial = createBubblegumKenMaterial({
    name: 'mat-bubblegum-spike',
    color: '#F5489B',
    roughness: 0.16,
    clearcoat: 0.90,
    shaderOptions: { highlightWeight: 0.52, recessWeight: 0.30 },
});

/**
 * Authoritative mapping from Kendama component mesh names to their assigned Bubblegum Pop materials.
 * @readonly
 */
export const BUBBLEGUM_POP_COMPONENT_MATERIAL_MAP = Object.freeze({
    'sarado-crossbar': bubblegumCrossbarMaterial,
    'big-cup-oozara': bubblegumBigCupMaterial,
    'small-cup-kozara': bubblegumSmallCupMaterial,
    'base-cup-chuzara': bubblegumBaseCupMaterial,
    'spike-kensaki': bubblegumSpikeMaterial,
    'handle-ken': bubblegumHandleMaterial,
});

export default BUBBLEGUM_POP_COMPONENT_MATERIAL_MAP;
