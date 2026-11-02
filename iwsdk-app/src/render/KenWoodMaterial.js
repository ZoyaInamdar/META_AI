/**
 * Celestial Kendama - Set 2: Galaxy Wood Ken Materials
 * Role: Person C (Visuals & Rendering)
 *
 * Defines the natural dark reddish-brown wood PBR material and procedural 3D wood
 * grain shader for the Kendama Ken components:
 * - Sarado crossbar, Big Cup, Small Cup, Base Cup, Spike, and Handle.
 *
 * Visual Direction:
 * - Natural dark reddish-brown wood (deep mahogany / rosewood tone).
 * - Visible organic wood grain flowing continuously across all kendama components.
 * - Subtle darker grain lines (annual latewood ring boundaries) and warm heartwood tonal variation.
 * - Rich polished wooden finish with glossy clearcoat, soft satin micro-roughness, and warm amber luster.
 * - Procedural 3D cylindrical grain evaluation in assembly space:
 *   models authentic lathe-turned lumber with end-grain ring ellipses on transverse cuts
 *   (cup rims, handle base) and sweeping longitudinal grain along handle shaft and spike.
 * - Zero external image dependencies, zero UV seams, and high performance suitable for Meta Quest.
 */

import { MeshPhysicalMaterial, Color, Matrix4, FrontSide } from 'three';

// --- Authoritative Galaxy Wood Palette ---
export const GALAXY_WOOD_PALETTE = Object.freeze({
    // Ken Wood Palette
    WOOD_DARK_GRAIN: '#1E0C07',     // Darkest annual ring boundary
    WOOD_BASE_BROWN: '#441E15',     // Dominant rich reddish-brown body
    WOOD_HEART_WARM: '#5C281B',     // Warm amber/chestnut radiant heartwood
    WOOD_GOLDEN_LUSTER: '#733522',  // Luminous wood fiber highlight
    WOOD_PORE_ESPRESSO: '#140704',  // Deep micro-grain pores

    // Tama Cosmic Nebula Palette
    NEBULA_INDIGO: '#2B1E66',       // Deep cosmic indigo base / space depth
    NEBULA_VIOLET: '#8544BA',       // Radiant galactic violet clouds
    NEBULA_MUTED_PINK: '#D47A9E',   // Soft cosmic pink filaments & dust
    NEBULA_TEAL: '#188B8A',         // Deep celestial teal currents
    NEBULA_TURQUOISE: '#3CD3C1',    // Luminous bright turquoise nebula clouds
    NEBULA_STAR_CORE: '#E4FBF7',    // Bright celestial star core highlight
});

// --- Authoritative Default Wood PBR Constants ---
export const DEFAULT_WOOD_BASE_COLOR = GALAXY_WOOD_PALETTE.WOOD_BASE_BROWN;
export const DEFAULT_WOOD_ROUGHNESS = 0.32;
export const DEFAULT_WOOD_METALNESS = 0.0;
export const DEFAULT_WOOD_CLEARCOAT = 0.72;
export const DEFAULT_WOOD_CLEARCOAT_ROUGHNESS = 0.16;
export const DEFAULT_WOOD_SHEEN = 0.40;
export const DEFAULT_WOOD_SHEEN_ROUGHNESS = 0.28;
export const DEFAULT_WOOD_SHEEN_COLOR = '#C88E70';

// --- Authoritative Wood Shader Constants ---
export const DEFAULT_WOOD_RING_FREQ = 310.0;      // Calibrated for ~10-14 visible growth rings
export const DEFAULT_WOOD_WARP_STRENGTH = 0.60;   // Growth fiber turbulence
export const DEFAULT_WOOD_GRAIN_INTENSITY = 0.72; // Contrast of dark annual ring lines
export const DEFAULT_WOOD_TONAL_BLEND = 0.65;     // Heartwood tonal variation strength

/**
 * Helper to convert hex string or Three.js Color to linear RGB array [r, g, b].
 *
 * @param {string | Color} input - Color hex string or Color instance
 * @returns {[number, number, number]} Linear RGB channel values clamped to 4 decimals
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
 * Enhances a Three.js MeshPhysicalMaterial with the procedural 3D wood grain shader.
 *
 * @param {MeshPhysicalMaterial} material - The material to enhance
 * @param {object} [options={}] - Customization options
 * @returns {MeshPhysicalMaterial} The enhanced material
 */
export function applyWoodShader(material, options = {}) {
    if (!material || !material.isMaterial) return material;

    const {
        ringFreq = DEFAULT_WOOD_RING_FREQ,
        warpStrength = DEFAULT_WOOD_WARP_STRENGTH,
        grainIntensity = DEFAULT_WOOD_GRAIN_INTENSITY,
        tonalBlend = DEFAULT_WOOD_TONAL_BLEND,
    } = options;

    const cDarkGrain = toLinearRgb(GALAXY_WOOD_PALETTE.WOOD_DARK_GRAIN);
    const cBaseBrown = toLinearRgb(GALAXY_WOOD_PALETTE.WOOD_BASE_BROWN);
    const cHeartWarm = toLinearRgb(GALAXY_WOOD_PALETTE.WOOD_HEART_WARM);
    const cGoldenLuster = toLinearRgb(GALAXY_WOOD_PALETTE.WOOD_GOLDEN_LUSTER);

    // Assembly coordinate inverse transformation matrix uniform
    material.userData.kenAssemblyInv = new Matrix4();

    // Dynamically update assembly inverse matrix and upload before each draw call
    const previousOnBeforeRender = material.onBeforeRender;
    material.onBeforeRender = function (renderer, scene, camera, geometry, object, group) {
        if (typeof previousOnBeforeRender === 'function') {
            previousOnBeforeRender.call(this, renderer, scene, camera, geometry, object, group);
        }
        if (!object) return;
        const assembly = (object.parent && !object.parent.isScene) ? object.parent : object;
        const inv = material.userData.kenAssemblyInv;
        if (inv) {
            inv.copy(assembly.matrixWorld).invert();
        }
        if (renderer && renderer.properties) {
            const matProps = renderer.properties.get(material);
            if (matProps && matProps.currentProgram) {
                const pUniforms = matProps.currentProgram.getUniforms();
                const gl = renderer.getContext ? renderer.getContext() : null;
                if (pUniforms && gl && inv) {
                    pUniforms.setValue(gl, 'kenAssemblyInv', inv);
                }
            }
        }
    };

    material.customProgramCacheKey = () => `ken-wood-v1-${material.name || 'custom'}`;

    material.onBeforeCompile = (shader, renderer) => {
        try {
            console.log(`[WOOD-SHADER] onBeforeCompile executed for material "${material.name}"`);

            shader.uniforms.kenAssemblyInv = { value: material.userData.kenAssemblyInv };

            // 1. Vertex Shader: Transform to shared assembly coordinates
            shader.vertexShader = shader.vertexShader.replace(
                '#include <common>',
                `#include <common>
varying vec3 vWoodPos;
uniform mat4 kenAssemblyInv;
`
            );
            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `#include <begin_vertex>
vec4 kenWorldPos = modelMatrix * vec4(transformed, 1.0);
vWoodPos = (kenAssemblyInv * kenWorldPos).xyz;
`
            );

            // 2. Fragment Shader Definitions: Analytical 3D Wood Grain generator
            const glslDefinitions = `
varying vec3 vWoodPos;

// Analytical 3D domain warping vector field for natural tree fiber turbulence
vec3 kenWoodTurbulence(vec3 p) {
    return vec3(
        sin(p.y * 28.0 + p.z * 16.0) * 0.0035 + sin(p.y * 95.0) * 0.0012,
        cos(p.x * 24.0 + p.z * 20.0) * 0.0020,
        sin(p.y * 32.0 + p.x * 18.0) * 0.0035 + cos(p.y * 85.0) * 0.0012
    );
}

// 3D Procedural Wood Grain Generator
// Evaluates cylindrical tree growth rings around an off-center axis
vec4 computeKenWoodMetrics(vec3 pos, float rFreq, float wStrength) {
    // Off-center tree trunk axis with slight organic offset
    vec3 trunkOrigin = vec3(0.012, 0.0, -0.008);
    vec3 p = pos - trunkOrigin;

    // Domain-warped turbulence
    vec3 warp = kenWoodTurbulence(p) * wStrength;
    vec3 warpedP = p + warp;

    // Radial distance from tree pith in transverse plane
    float r = length(vec2(warpedP.x * 1.08, warpedP.z * 0.94));

    // Annual growth ring phase with natural harmonic fiber ripples
    float ringPhase = r * rFreq;
    ringPhase += sin(p.y * 14.0 + p.x * 7.0) * 0.65;
    ringPhase += sin(p.y * 48.0 + p.z * 10.0) * 0.35;

    // Asymmetric annual ring profile: gradual earlywood growth, sharp dark line at latewood boundary
    float u = fract(ringPhase);
    float grainLine = pow(clamp(1.0 - abs(u * 2.0 - 1.0), 0.0, 1.0), 3.2);

    // Fine longitudinal wood tracheid rays
    float fiberNoise = sin(warpedP.x * 750.0 + sin(warpedP.z * 550.0)) * 0.5 + 0.5;
    float microRay = pow(fiberNoise, 4.0) * 0.14;

    // Tonal wood variation (heartwood warmth vs sapwood variation)
    float tonalNoise = sin(p.y * 10.0 + p.x * 8.0 + p.z * 9.0) * 0.5 + 0.5;

    return vec4(u, grainLine, microRay, tonalNoise);
}
`;

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <common>',
                `#include <common>
${glslDefinitions}
`
            );

            // 3. Fragment Shader Logic: Blend organic wood colors into diffuseColor
            const glslWoodLogic = `
    #include <normal_fragment_begin>

    vec4 woodMetrics = computeKenWoodMetrics(vWoodPos, ${ringFreq.toFixed(1)}, ${warpStrength.toFixed(2)});
    float uRing = woodMetrics.x;
    float grainLine = woodMetrics.y;
    float microRay = woodMetrics.z;
    float tonalNoise = woodMetrics.w;

    vec3 cDark = vec3(${cDarkGrain.join(', ')});
    vec3 cBase = vec3(${cBaseBrown.join(', ')});
    vec3 cHeart = vec3(${cHeartWarm.join(', ')});
    vec3 cGolden = vec3(${cGoldenLuster.join(', ')});

    // 1. Base heartwood body with organic natural tonal shifts
    vec3 woodBody = mix(cBase, cHeart, tonalNoise * ${tonalBlend.toFixed(2)});

    // 2. Micro-ray wood fiber luster
    woodBody = mix(woodBody, cGolden, microRay);

    // 3. Subtle dark annual latewood grain lines
    vec3 woodFinal = mix(woodBody, cDark, grainLine * ${grainIntensity.toFixed(2)});

    // 4. Smooth blend into diffuse color
    diffuseColor.rgb = woodFinal;
`;

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <normal_fragment_begin>',
                glslWoodLogic
            );
        } catch (err) {
            console.warn('[KenWoodMaterial] Wood shader enhancement failed, falling back to PBR base:', err);
        }
    };

    return material;
}

/**
 * Factory creating a fresh, independent Galaxy Wood MeshPhysicalMaterial.
 *
 * @param {object} [options={}] - Customization options
 * @param {string} [options.name='mat-galaxy-wood-ken'] - Material name
 * @param {string | Color} [options.color=DEFAULT_WOOD_BASE_COLOR] - Base albedo color
 * @param {number} [options.roughness=DEFAULT_WOOD_ROUGHNESS] - Roughness
 * @param {number} [options.metalness=DEFAULT_WOOD_METALNESS] - Metalness
 * @param {number} [options.clearcoat=DEFAULT_WOOD_CLEARCOAT] - Clearcoat
 * @param {number} [options.clearcoatRoughness=DEFAULT_WOOD_CLEARCOAT_ROUGHNESS] - Clearcoat roughness
 * @param {number} [options.sheen=DEFAULT_WOOD_SHEEN] - Sheen
 * @param {string | Color} [options.sheenColor=DEFAULT_WOOD_SHEEN_COLOR] - Sheen tint color
 * @param {object} [options.shaderOptions={}] - Wood shader parameter overrides
 * @returns {MeshPhysicalMaterial} Configured wood material
 */
export function createKenWoodMaterial(options = {}) {
    const {
        name = 'mat-galaxy-wood-ken',
        color = DEFAULT_WOOD_BASE_COLOR,
        roughness = DEFAULT_WOOD_ROUGHNESS,
        metalness = DEFAULT_WOOD_METALNESS,
        clearcoat = DEFAULT_WOOD_CLEARCOAT,
        clearcoatRoughness = DEFAULT_WOOD_CLEARCOAT_ROUGHNESS,
        sheen = DEFAULT_WOOD_SHEEN,
        sheenRoughness = DEFAULT_WOOD_SHEEN_ROUGHNESS,
        sheenColor = DEFAULT_WOOD_SHEEN_COLOR,
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

    applyWoodShader(material, shaderOptions);

    return material;
}

// --- Pre-configured Component Material Singletons for Galaxy Wood Ken ---
export const galaxyWoodCrossbarMaterial = createKenWoodMaterial({
    name: 'mat-wood-crossbar',
    shaderOptions: { ringFreq: 300.0, grainIntensity: 0.70 },
});

export const galaxyWoodBigCupMaterial = createKenWoodMaterial({
    name: 'mat-wood-big-cup',
    shaderOptions: { ringFreq: 310.0, grainIntensity: 0.72 },
});

export const galaxyWoodSmallCupMaterial = createKenWoodMaterial({
    name: 'mat-wood-small-cup',
    shaderOptions: { ringFreq: 310.0, grainIntensity: 0.72 },
});

export const galaxyWoodBaseCupMaterial = createKenWoodMaterial({
    name: 'mat-wood-base-cup',
    shaderOptions: { ringFreq: 320.0, grainIntensity: 0.74 },
});

export const galaxyWoodSpikeMaterial = createKenWoodMaterial({
    name: 'mat-wood-spike',
    shaderOptions: { ringFreq: 310.0, grainIntensity: 0.70 },
});

export const galaxyWoodHandleMaterial = createKenWoodMaterial({
    name: 'mat-wood-handle',
    shaderOptions: { ringFreq: 310.0, grainIntensity: 0.72 },
});

/**
 * Authoritative mapping from Kendama component mesh names to their assigned Galaxy Wood materials.
 * @readonly
 */
export const GALAXY_WOOD_COMPONENT_MATERIAL_MAP = Object.freeze({
    'sarado-crossbar': galaxyWoodCrossbarMaterial,
    'big-cup-oozara': galaxyWoodBigCupMaterial,
    'small-cup-kozara': galaxyWoodSmallCupMaterial,
    'base-cup-chuzara': galaxyWoodBaseCupMaterial,
    'spike-kensaki': galaxyWoodSpikeMaterial,
    'handle-ken': galaxyWoodHandleMaterial,
});

export default GALAXY_WOOD_COMPONENT_MATERIAL_MAP;
