/**
 * Celestial Kendama - Set 4: Dark Matter Ken Material System
 * Role: Person C (Visuals & Rendering)
 *
 * Defines the deep charcoal and smoky black cloudy marble PBR materials and procedural 3D
 * marble shader for the Dark Matter Ken (handle, crossbar, cups, and spike).
 *
 * Visual Direction:
 * - Deep charcoal and smoky black base with organic cloudy marble pattern.
 * - Subtle grey variations and delicate organic flowing veins cutting through the stone.
 * - Glossy polished lacquer finish with smooth clearcoat depth.
 * - Distinctly avoids a flat solid-black appearance; rich in tonal variations and mineral depth.
 * - Clear component separation through subtle tonal balancing across individual Ken parts.
 * - 3D procedural evaluation: seamless across all components with zero UV seams.
 */

import { MeshPhysicalMaterial, Color, FrontSide } from 'three';

// --- Authoritative Dark Matter Ken Palette ---
export const DARK_MATTER_KEN_PALETTE = Object.freeze({
    SMOKY_BLACK: '#121215',      // Deepest background void / smoky base
    DEEP_CHARCOAL: '#1E1F24',    // Dominant dark charcoal body
    SMOKY_GREY: '#353740',       // Cloudy marble volume tone
    VEIN_GREY: '#5A5D6B',        // Subtle flowing marble veins
    MINERAL_HIGHLIGHT: '#888C9D',// Fine veining and rim highlight
    SHEEN_MINERAL: '#4E5261',    // Subtle mineral sheen
});

// --- Authoritative Default Ken PBR Constants ---
export const DEFAULT_DM_KEN_BASE_COLOR = DARK_MATTER_KEN_PALETTE.DEEP_CHARCOAL;
export const DEFAULT_DM_KEN_ROUGHNESS = 0.22;
export const DEFAULT_DM_KEN_METALNESS = 0.0;
export const DEFAULT_DM_KEN_CLEARCOAT = 0.86;
export const DEFAULT_DM_KEN_CLEARCOAT_ROUGHNESS = 0.08;
export const DEFAULT_DM_KEN_SHEEN = 0.35;
export const DEFAULT_DM_KEN_SHEEN_ROUGHNESS = 0.22;
export const DEFAULT_DM_KEN_SHEEN_COLOR = DARK_MATTER_KEN_PALETTE.SHEEN_MINERAL;

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
 * Enhances a Three.js MeshPhysicalMaterial with the Dark Matter procedural cloudy marble shader.
 *
 * @param {MeshPhysicalMaterial} material - The physical material to enhance
 * @param {object} [options={}] - Customization options
 * @returns {MeshPhysicalMaterial} The enhanced material
 */
export function applyDarkMatterKenShader(material, options = {}) {
    if (!material || !material.isMaterial) return material;

    const {
        cloudScale = 28.0,
        veinScale = 45.0,
        veinIntensity = 0.45,
        sheenWeight = 0.35,
    } = options;

    const cBlack = toLinearRgb(DARK_MATTER_KEN_PALETTE.SMOKY_BLACK);
    const cCharcoal = toLinearRgb(DARK_MATTER_KEN_PALETTE.DEEP_CHARCOAL);
    const cGrey = toLinearRgb(DARK_MATTER_KEN_PALETTE.SMOKY_GREY);
    const cVein = toLinearRgb(DARK_MATTER_KEN_PALETTE.VEIN_GREY);
    const cHighlight = toLinearRgb(DARK_MATTER_KEN_PALETTE.MINERAL_HIGHLIGHT);

    material.customProgramCacheKey = () => `dm-ken-v1-${material.name || 'default'}`;

    material.onBeforeCompile = (shader) => {
        try {
            console.log(`[DM-KEN-SHADER] onBeforeCompile executed for material "${material.name}"`);

            // 1. Vertex Shader: Pass local object position
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

            // 2. Fragment Shader Definitions: Procedural 3D cloudy marble & veins
            const glslDefinitions = `
varying vec3 vKenLocalPos;

// 3D vector displacement field for organic flowing stone turbulence
vec3 dmKenTurbulence(vec3 p) {
    return vec3(
        sin(p.y * 24.0 + p.z * 18.0) * 0.005 + sin(p.y * 60.0) * 0.0018,
        cos(p.x * 20.0 + p.z * 22.0) * 0.0035,
        sin(p.y * 28.0 + p.x * 16.0) * 0.005 + cos(p.y * 55.0) * 0.0018
    );
}

// Evaluates 3D cloudy marble matrix with flowing grey veins
vec3 computeDarkMatterMarble(vec3 baseCol, vec3 p, vec3 worldNormal, vec3 viewDir) {
    vec3 q = p + dmKenTurbulence(p) * 0.65;

    // 1. Broad cloudy marble billows
    float cloudNoise = sin(q.y * ${cloudScale.toFixed(1)} + cos(q.x * 22.0 + q.z * 19.0)) * 0.5 + 0.5;
    float cloudNoise2 = cos(q.z * 32.0 + sin(q.x * 26.0 + q.y * 18.0)) * 0.5 + 0.5;
    float cloud = cloudNoise * 0.65 + cloudNoise2 * 0.35;

    // Blend between deep smoky black, charcoal, and smoky grey
    vec3 marbleBody = mix(vec3(${cBlack.join(', ')}), vec3(${cCharcoal.join(', ')}), cloud);
    marbleBody = mix(marbleBody, vec3(${cGrey.join(', ')}), smoothstep(0.55, 0.95, cloud) * 0.50);

    // 2. Organic flowing veins (turbulent ridge noise)
    float veinWave = abs(sin(q.y * ${veinScale.toFixed(1)} + q.x * 32.0 + sin(q.z * 38.0)));
    float primaryVein = pow(1.0 - clamp(veinWave, 0.0, 1.0), 4.5);

    float microVeinWave = abs(sin(q.y * 85.0 + q.z * 70.0 + cos(q.x * 55.0)));
    float microVein = pow(1.0 - clamp(microVeinWave, 0.0, 1.0), 6.0) * 0.35;

    float totalVein = clamp(primaryVein + microVein, 0.0, 1.0) * ${veinIntensity.toFixed(2)};
    vec3 veinColor = mix(vec3(${cVein.join(', ')}), vec3(${cHighlight.join(', ')}), microVein);
    vec3 finalStone = mix(marbleBody, veinColor, totalVein);

    // 3. Glancing angle Fresnel highlight along curved silhouette
    float NdotV = clamp(dot(worldNormal, viewDir), 0.0, 1.0);
    float fresnel = pow(1.0 - NdotV, 2.4);
    finalStone = mix(finalStone, finalStone + vec3(${cHighlight.join(', ')}) * 0.22, fresnel * ${sheenWeight.toFixed(2)});

    return mix(baseCol, finalStone, 0.92);
}
`;

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <common>',
                `#include <common>
${glslDefinitions}
`
            );

            // 3. Fragment Shader Logic: Apply procedural marble before PBR lighting
            const glslLogic = `
    #include <normal_fragment_begin>

    vec3 kenViewDir = normalize(-vViewPosition);
    diffuseColor.rgb = computeDarkMatterMarble(diffuseColor.rgb, vKenLocalPos, normal, kenViewDir);
`;

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <normal_fragment_begin>',
                glslLogic
            );
        } catch (err) {
            console.warn('[DarkMatterKenMaterial] Shader compilation failed, using standard PBR base:', err);
        }
    };

    return material;
}

/**
 * Factory creating a Dark Matter Ken MeshPhysicalMaterial.
 *
 * @param {object} [options={}] - Configuration options
 * @returns {MeshPhysicalMaterial} Configured PBR material
 */
export function createDarkMatterKenMaterial(options = {}) {
    const {
        name = 'mat-dark-matter-ken',
        color = DEFAULT_DM_KEN_BASE_COLOR,
        roughness = DEFAULT_DM_KEN_ROUGHNESS,
        metalness = DEFAULT_DM_KEN_METALNESS,
        clearcoat = DEFAULT_DM_KEN_CLEARCOAT,
        clearcoatRoughness = DEFAULT_DM_KEN_CLEARCOAT_ROUGHNESS,
        sheen = DEFAULT_DM_KEN_SHEEN,
        sheenRoughness = DEFAULT_DM_KEN_SHEEN_ROUGHNESS,
        sheenColor = DEFAULT_DM_KEN_SHEEN_COLOR,
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

    applyDarkMatterKenShader(material, shaderOptions);

    return material;
}

// --- Pre-configured Component Material Singletons for Dark Matter Ken ---
// Subtle tonal differentiation maintains clear component separation while adhering to the dark marble palette:

/** Handle (Ken stem): Dominant dark charcoal with rich cloudy marble body */
export const darkMatterHandleMaterial = createDarkMatterKenMaterial({
    name: 'mat-dark-matter-handle',
    color: '#1E1F24',
    roughness: 0.22,
    clearcoat: 0.86,
    shaderOptions: { cloudScale: 28.0, veinScale: 42.0, veinIntensity: 0.44 },
});

/** Crossbar (Sarado): Slightly deeper charcoal (#18191E) grounding the wing junction */
export const darkMatterCrossbarMaterial = createDarkMatterKenMaterial({
    name: 'mat-dark-matter-crossbar',
    color: '#18191E',
    roughness: 0.22,
    clearcoat: 0.86,
    shaderOptions: { cloudScale: 30.0, veinScale: 46.0, veinIntensity: 0.48 },
});

/** Big Cup (Oozara): Rich charcoal (#202228) with visible cloudy billows and crisp rim */
export const darkMatterBigCupMaterial = createDarkMatterKenMaterial({
    name: 'mat-dark-matter-big-cup',
    color: '#202228',
    roughness: 0.20,
    clearcoat: 0.88,
    shaderOptions: { cloudScale: 26.0, veinScale: 40.0, veinIntensity: 0.50 },
});

/** Small Cup (Kozara): Subtle lighter charcoal (#22242B) for wing symmetry contrast */
export const darkMatterSmallCupMaterial = createDarkMatterKenMaterial({
    name: 'mat-dark-matter-small-cup',
    color: '#22242B',
    roughness: 0.20,
    clearcoat: 0.88,
    shaderOptions: { cloudScale: 26.0, veinScale: 40.0, veinIntensity: 0.50 },
});

/** Base Cup (Chuzara): Deep smoky black (#141519) grounding the base cup cavity */
export const darkMatterBaseCupMaterial = createDarkMatterKenMaterial({
    name: 'mat-dark-matter-base-cup',
    color: '#141519',
    roughness: 0.24,
    clearcoat: 0.84,
    shaderOptions: { cloudScale: 32.0, veinScale: 48.0, veinIntensity: 0.42 },
});

/** Spike (Kensaki): Sleek dark marble taper with delicate longitudinal veining */
export const darkMatterSpikeMaterial = createDarkMatterKenMaterial({
    name: 'mat-dark-matter-spike',
    color: '#21232A',
    roughness: 0.18,
    clearcoat: 0.90,
    shaderOptions: { cloudScale: 34.0, veinScale: 52.0, veinIntensity: 0.46 },
});

/**
 * Authoritative mapping from Kendama component mesh names to their assigned Dark Matter materials.
 * @readonly
 */
export const DARK_MATTER_COMPONENT_MATERIAL_MAP = Object.freeze({
    'sarado-crossbar': darkMatterCrossbarMaterial,
    'big-cup-oozara': darkMatterBigCupMaterial,
    'small-cup-kozara': darkMatterSmallCupMaterial,
    'base-cup-chuzara': darkMatterBaseCupMaterial,
    'spike-kensaki': darkMatterSpikeMaterial,
    'handle-ken': darkMatterHandleMaterial,
});

export default DARK_MATTER_COMPONENT_MATERIAL_MAP;
