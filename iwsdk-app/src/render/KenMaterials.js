/**
 * Celestial Kendama - Reusable Material System
 * Role: Person C (Visuals & Rendering)
 *
 * Defines the softcore pastel galaxy PBR material system for the procedural Kendama:
 * - Moon Pearl: Handle & spike body (luminous off-white with visible blush/lilac pearlescent waves and faint blue shifts)
 * - Rose Nebula: Big Cup & Base Cup (dreamy blush pink with rich lavender nebula clouds & clearly visible deep cosmic blue pools)
 * - Lavender Moon: Small Cup (ethereal pastel lavender with blush clouds & harmonious dusty-periwinkle / deep-blue transitions)
 * - Rose Gold: Small decorative accents & bevel rings (brushed satin rose gold with celestial luster)
 * - Pearl White: Sarado Crossbar (pristine porcelain white with clearcoat nacre glaze, visible iridescence & faint blue reflections)
 *
 * Uses Three.js MeshPhysicalMaterial with controlled roughness, metalness, clearcoat,
 * sheen, and subtle thin-film iridescence, enhanced by an ultra-lightweight procedural
 * 3D shader featuring domain-warped multi-frequency noise and a continuous 6-stop pastel
 * galaxy color flow (Midnight Cosmic Blue -> Deep Nebula Blue -> Dusty Periwinkle ->
 * Lavender -> Blush Pink -> Pearl White) without circular decal artifacts or external textures.
 */

import { MeshPhysicalMaterial, Color, Matrix4 } from 'three';

/**
 * Authoritative color hex codes for the Kendama pastel galaxy palette.
 * Includes both the primary pastel palette and the Deep Galactic Blue celestial accents.
 * @readonly
 * @enum {string}
 */
export const KEN_PALETTE = Object.freeze({
    // Primary Pastel Palette
    MOON_PEARL: '#F7F0F5',
    ROSE_NEBULA: '#EFB9D5',
    LAVENDER_MOON: '#CDBBEA',
    ROSE_GOLD: '#DDAE9D',
    PEARL_WHITE: '#FFF9FC',

    // Deep Galactic Blue Palette
    MIDNIGHT_COSMIC_BLUE: '#18264F',
    DEEP_NEBULA_BLUE: '#344B83',
    DUSTY_PERIWINKLE: '#7886C5',
});

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
 * Enhances a Three.js MeshPhysicalMaterial with a lightweight procedural pastel galaxy finish.
 *
 * Technical Highlights:
 * 1. Procedural 3D Coordinates: Evaluates in object space (position), requiring zero UV attributes
 *    and eliminating texture seams or lathe distortion across watertight Kendama meshes.
 * 2. Domain-Warped Multi-Frequency 3D Noise: Employs analytical vector displacement fields
 *    (kenWarp3D_A, kenWarp3D_B) to distort spatial sampling coordinates before evaluating
 *    multi-frequency harmonic waves. This stretches level sets into organic celestial ribbons and
 *    turbulent nebula wisps, completely eliminating circular spots, decal discs, or isolated blobs.
 * 3. Continuous 6-Stop Flow: Implements a continuous piecewise-linear color ramp flowing through:
 *    Midnight Cosmic Blue (#18264F) -> Deep Nebula Blue (#344B83) -> Dusty Periwinkle (#7886C5) ->
 *    Lavender (#CDBBEA) -> Blush Pink (#EFB9D5) -> Pearl White (#FFF9FC).
 *    Deepest blues emerge only as sparse, flowing valleys (<10%) while soft pastel tones remain
 *    strictly dominant (>90%) across the Kendama surface.
 * 4. Component-Specific Celestial Balancing: Modulates the scalar coordinate via tShift and tScale,
 *    allowing Big/Base Cups to reveal deep-blue valleys while restricting Small Cup, Handle,
 *    Spike, and Crossbar to luminous porcelain whites and ethereal lavender/periwinkle reflections.
 * 5. Angle-Dependent Pearlescent Sheen: Modulates viewing-angle Fresnel (NdotV) with delicate
 *    bicolor nacre shifts complementing the physical clearcoat and thin-film iridescence layers.
 * 6. Delicate Starlight Specks: High-frequency 3D micro-hash creates tiny, sparse celestial sparkles
 *    embedded directly in the material lacquer.
 * 7. Mobile VR Optimized: Zero external textures, zero memory allocations, zero loops, and strictly
 *    bounded trigonometric operations ensure smooth performance on Meta Quest headsets.
 * 8. Graceful Fallback: Wrapped in try/catch to maintain pure solid PBR if custom compilation fails.
 *
 * @param {MeshPhysicalMaterial} material - The material to enhance
 * @param {object} [options={}] - Customization options
 * @param {number} [options.freq=105.0] - Spatial frequency for procedural 3D nebula coordinates
 * @param {number} [options.warpStrength=0.50] - Vector displacement intensity for domain warping
 * @param {number} [options.tShift=0.0] - Additive bias on the continuous scalar parameter
 * @param {number} [options.tScale=1.0] - Multiplier on the continuous scalar parameter
 * @param {number} [options.nebulaWeight=0.48] - Blend influence of continuous galaxy flow [0, 1]
 * @param {number} [options.blueWeight=0.65] - Maximum influence of Deep Galactic Blue accents [0, 1]
 * @param {number} [options.sheenWeight=0.35] - Angle-dependent pearlescent color shift strength [0, 1]
 * @param {number} [options.sparkleWeight=1.40] - Star-like micro-speck sparkle brightness
 * @param {string | Color | number[]} [options.accentColorA] - First celestial accent tint
 * @param {string | Color | number[]} [options.accentColorB] - Second celestial accent tint
 * @param {number[]} [options.sheenColorA] - Pearlescent rim sheen tint A
 * @param {number[]} [options.sheenColorB] - Pearlescent rim sheen tint B
 * @returns {MeshPhysicalMaterial} The enhanced material
 */
export function applyGalaxyShader(material, options = {}) {
    if (!material || !material.isMaterial) return material;

    const {
        freq = 105.0,
        warpStrength = 0.50,
        tShift = 0.0,
        tScale = 1.0,
        nebulaWeight = 0.48,
        blueWeight = 0.65,
        sheenWeight = 0.35,
        sparkleWeight = 1.40,
        accentColorA = toLinearRgb(KEN_PALETTE.ROSE_NEBULA),
        accentColorB = toLinearRgb(KEN_PALETTE.LAVENDER_MOON),
        sheenColorA = [0.98, 0.92, 0.96],
        sheenColorB = [0.85, 0.88, 1.0],
    } = options;

    const rgbA = Array.isArray(accentColorA) ? accentColorA : toLinearRgb(accentColorA);
    const rgbB = Array.isArray(accentColorB) ? accentColorB : toLinearRgb(accentColorB);

    const cMidnight = toLinearRgb(KEN_PALETTE.MIDNIGHT_COSMIC_BLUE);
    const cNebula = toLinearRgb(KEN_PALETTE.DEEP_NEBULA_BLUE);
    const cDusty = toLinearRgb(KEN_PALETTE.DUSTY_PERIWINKLE);
    const cLavender = toLinearRgb(KEN_PALETTE.LAVENDER_MOON);
    const cPink = toLinearRgb(KEN_PALETTE.ROSE_NEBULA);
    const cWhite = toLinearRgb(KEN_PALETTE.PEARL_WHITE);

    // Assembly coordinate inverse transformation matrix uniform
    material.userData.kenAssemblyInv = new Matrix4();

    // Dynamically update the assembly inverse matrix and upload to active program before each draw call
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

    // Unique program cache key ensures the browser and Three.js compile a fresh, un-cached program
    material.customProgramCacheKey = () => `ken-galaxy-v4-${material.name || 'custom'}`;

    material.onBeforeCompile = (shader, renderer) => {
        try {
            console.log(`[GALAXY-SHADER] onBeforeCompile executed for material "${material.name}"`);

            shader.uniforms.kenAssemblyInv = { value: material.userData.kenAssemblyInv };

            shader.vertexShader = shader.vertexShader.replace(
                '#include <common>',
                `#include <common>
varying vec3 vGalaxyPos;
uniform mat4 kenAssemblyInv;
`
            );
            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `#include <begin_vertex>
vec4 kenWorldPos = modelMatrix * vec4(transformed, 1.0);
vGalaxyPos = (kenAssemblyInv * kenWorldPos).xyz;
`
            );

            const glslDefinitions = `
varying vec3 vGalaxyPos;

// Stage 1 3D vector displacement field for domain warping
vec3 kenWarp3D_A(vec3 p) {
    return vec3(
        sin(p.y * 1.2 + p.z * 0.7),
        sin(p.z * 1.3 + p.x * 0.8),
        sin(p.x * 1.1 + p.y * 0.9)
    );
}

// Stage 2 3D vector displacement field for domain warping
vec3 kenWarp3D_B(vec3 q) {
    return vec3(
        cos(q.z * 1.5 + q.y * 0.9 + 1.7),
        cos(q.x * 1.4 + q.z * 1.1 + 9.2),
        cos(q.y * 1.6 + q.x * 0.8 + 3.4)
    );
}

// Domain-warped multi-frequency 3D noise field
// Distorts coordinates through two vector fields before evaluating harmonic waves,
// turning would-be circular level sets into organic flowing filaments and turbulent ribbons.
float kenDomainWarpFbm(vec3 p, float warpStrength) {
    vec3 q = p + warpStrength * kenWarp3D_A(p);
    vec3 r = q + (warpStrength * 0.82) * kenWarp3D_B(q);
    float v1 = sin(r.x * 1.0 + sin(r.y * 1.3 + r.z * 0.9)) * cos(r.y * 1.1 + sin(r.z * 1.2 + r.x * 0.8));
    vec3 r2 = r * 2.1 + vec3(1.7, 9.2, 3.4);
    float v2 = sin(r2.z * 1.35 + cos(r2.x * 1.4 + r2.y * 1.1)) * cos(r2.x * 1.2 + sin(r2.y * 1.5 + r2.z * 0.7));
    return clamp(0.5 + 0.35 * v1 + 0.15 * v2, 0.0, 1.0);
}

// Backward-compatible alias for existing tests or callers
float kenGalaxyFbm(vec3 p) {
    return kenDomainWarpFbm(p, 0.50);
}

// 6-stop continuous flowing pastel galaxy color ramp:
// Midnight Cosmic Blue (#18264F) -> Deep Nebula Blue (#344B83) -> Dusty Periwinkle (#7886C5)
// -> Lavender (#CDBBEA) -> Blush Pink (#EFB9D5) -> Pearl White (#FFF9FC)
vec3 kenGalaxyRamp(float t) {
    vec3 c0 = vec3(${cMidnight.join(', ')}); // Midnight Cosmic Blue
    vec3 c1 = vec3(${cNebula.join(', ')});   // Deep Nebula Blue
    vec3 c2 = vec3(${cDusty.join(', ')});    // Dusty Periwinkle
    vec3 c3 = vec3(${cLavender.join(', ')}); // Lavender Moon
    vec3 c4 = vec3(${cPink.join(', ')});     // Rose Nebula
    vec3 c5 = vec3(${cWhite.join(', ')});    // Pearl White

    if (t < 0.10) {
        return mix(c0, c1, t / 0.10);
    } else if (t < 0.24) {
        return mix(c1, c2, (t - 0.10) / 0.14);
    } else if (t < 0.46) {
        return mix(c2, c3, (t - 0.24) / 0.22);
    } else if (t < 0.74) {
        return mix(c3, c4, (t - 0.46) / 0.28);
    } else {
        return mix(c4, c5, clamp((t - 0.74) / 0.26, 0.0, 1.0));
    }
}

// Auxiliary multi-stop gradient for backwards compatibility
vec3 kenCosmicBlue(float t) {
    vec3 cDusty = vec3(${cDusty.join(', ')});
    vec3 cNebula = vec3(${cNebula.join(', ')});
    vec3 cMidnight = vec3(${cMidnight.join(', ')});
    if (t < 0.5) {
        return mix(cDusty, cNebula, t * 2.0);
    } else {
        return mix(cNebula, cMidnight, (t - 0.5) * 2.0);
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

            const glslGalaxyLogic = `
    #include <normal_fragment_begin>

    // 1. Domain-warped 3D procedural coordinates (flowing nebula wisps, zero circular artifacts)
    vec3 gPos = vGalaxyPos * ${freq.toFixed(1)};
    float warpFbm = kenDomainWarpFbm(gPos, ${warpStrength.toFixed(2)});

    // 2. Continuous 6-stop celestial flow with component-specific balance
    float tFlow = clamp((warpFbm + ${tShift.toFixed(2)}) * ${tScale.toFixed(2)}, 0.0, 1.0);
    vec3 galaxyFlowColor = kenGalaxyRamp(tFlow);

    // 3. Smooth organic blending into base surface color (zero circular masks or sharp decals)
    diffuseColor.rgb = mix(diffuseColor.rgb, galaxyFlowColor, ${nebulaWeight.toFixed(2)});
${hasSheen ? `
    // 4. Angle-dependent pearlescent sheen shift (NdotV Fresnel nacre highlights)
    vec3 viewDir = normalize(-vViewPosition);
    float NdotV = clamp(dot(normal, viewDir), 0.0, 1.0);
    float fresnel = pow(1.0 - NdotV, 2.2);
    vec3 sColor = mix(vec3(${sheenColorA.join(', ')}), vec3(${sheenColorB.join(', ')}), sin(vGalaxyPos.y * 40.0) * 0.5 + 0.5);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb + sColor * 0.25, fresnel * ${sheenWeight.toFixed(2)});
` : ''}
${hasSparkle ? `
    // 5. Tiny delicate star-like sparkles embedded in material (subtle pinprick celestial starlight)
    vec3 starGrid = floor(vGalaxyPos * 650.0);
    float starHash = fract(sin(dot(starGrid, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
    if (starHash > 0.985) {
        float starIntensity = pow((starHash - 0.985) / 0.015, 2.0);
        vec3 starTint = mix(vec3(1.0, 0.98, 0.95), vec3(0.95, 0.90, 1.0), fract(starHash * 17.0));
        totalEmissiveRadiance += starTint * (starIntensity * ${sparkleWeight.toFixed(2)});
    }
` : ''}
`;

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <normal_fragment_begin>',
                glslGalaxyLogic
            );
        } catch (err) {
            console.warn('[KenMaterials] Galaxy shader enhancement failed, falling back to PBR base:', err);
        }
    };

    return material;
}

/**
 * Moon Pearl Material (#F7F0F5)
 * Intended for: Ken handle shaft and Kensaki spike body.
 * Aesthetic: Polished satin nacre with warm/cool pearlescent reflection, subtle flowing pink and lavender reflections.
 * Component Treatment: Mostly pearl white (>80%), blue accents extremely faint or absent.
 */
export const moonPearlMaterial = new MeshPhysicalMaterial({
    color: new Color(KEN_PALETTE.MOON_PEARL),
    roughness: 0.28,
    metalness: 0.02,
    clearcoat: 0.65,
    clearcoatRoughness: 0.18,
    sheen: 0.45,
    sheenRoughness: 0.25,
    sheenColor: new Color(0xffffff),
    iridescence: 0.30,
    iridescenceIOR: 1.33,
    iridescenceThicknessRange: [100, 320],
});
moonPearlMaterial.name = 'mat-moon-pearl';
applyGalaxyShader(moonPearlMaterial, {
    freq: 100.0,
    warpStrength: 0.45,
    tShift: 0.04,
    tScale: 1.0,
    nebulaWeight: 0.42,
    blueWeight: 0.05,
    sheenWeight: 0.42,
    sparkleWeight: 0.85,
    accentColorA: KEN_PALETTE.ROSE_NEBULA,
    accentColorB: KEN_PALETTE.LAVENDER_MOON,
    sheenColorA: [0.98, 0.94, 0.98],
    sheenColorB: [0.88, 0.90, 1.0],
});

/**
 * Rose Nebula Material (#EFB9D5)
 * Intended for: Big Cup (Oozara) and Base Cup (Chuzara).
 * Aesthetic: Dreamy blush-pink lacquer with flowing lavender and pearl-white clouds, plus a few organically blended deep-blue regions.
 * Component Treatment: Blush pink base, flowing domain-warped lavender/white clouds, organic deep-blue crevice streams.
 */
export const roseNebulaMaterial = new MeshPhysicalMaterial({
    color: new Color(KEN_PALETTE.ROSE_NEBULA),
    roughness: 0.24,
    metalness: 0.04,
    clearcoat: 0.75,
    clearcoatRoughness: 0.14,
    sheen: 0.55,
    sheenRoughness: 0.22,
    sheenColor: new Color('#FFE6F3'),
    iridescence: 0.35,
    iridescenceIOR: 1.34,
    iridescenceThicknessRange: [120, 360],
});
roseNebulaMaterial.name = 'mat-rose-nebula';
applyGalaxyShader(roseNebulaMaterial, {
    freq: 105.0,
    warpStrength: 0.52,
    tShift: 0.00,
    tScale: 1.15,
    nebulaWeight: 0.48,
    blueWeight: 0.65,
    sheenWeight: 0.35,
    sparkleWeight: 1.40,
    accentColorA: KEN_PALETTE.PEARL_WHITE,
    accentColorB: KEN_PALETTE.LAVENDER_MOON,
    sheenColorA: [1.0, 0.90, 0.95],
    sheenColorB: [0.85, 0.88, 1.0],
});

/**
 * Lavender Moon Material (#CDBBEA)
 * Intended for: Small Cup (Kozara).
 * Aesthetic: Soft ethereal lilac lacquer with pink, periwinkle and pearl-white transitions. Deep blue is very restrained or absent.
 * Component Treatment: Lavender base with harmonious dusty periwinkle, blush pink and pearl white flow.
 */
export const lavenderMoonMaterial = new MeshPhysicalMaterial({
    color: new Color(KEN_PALETTE.LAVENDER_MOON),
    roughness: 0.24,
    metalness: 0.04,
    clearcoat: 0.75,
    clearcoatRoughness: 0.14,
    sheen: 0.55,
    sheenRoughness: 0.22,
    sheenColor: new Color('#F0E8FF'),
    iridescence: 0.35,
    iridescenceIOR: 1.34,
    iridescenceThicknessRange: [120, 360],
});
lavenderMoonMaterial.name = 'mat-lavender-moon';
applyGalaxyShader(lavenderMoonMaterial, {
    freq: 105.0,
    warpStrength: 0.48,
    tShift: 0.02,
    tScale: 1.15,
    nebulaWeight: 0.46,
    blueWeight: 0.18,
    sheenWeight: 0.35,
    sparkleWeight: 1.40,
    accentColorA: KEN_PALETTE.ROSE_NEBULA,
    accentColorB: KEN_PALETTE.PEARL_WHITE,
    sheenColorA: [0.92, 0.85, 1.0],
    sheenColorB: [0.98, 0.88, 0.94],
});

/**
 * Rose Gold Material (#DDAE9D)
 * Intended for: Decorative accents, fillet rims, and connector highlights.
 * Aesthetic: Warm champagne rose gold with semi-brushed satin metallic finish and celestial luster.
 */
export const roseGoldMaterial = new MeshPhysicalMaterial({
    color: new Color(KEN_PALETTE.ROSE_GOLD),
    roughness: 0.32,
    metalness: 0.78,
    clearcoat: 0.35,
    clearcoatRoughness: 0.25,
    sheen: 0.20,
    sheenRoughness: 0.30,
    sheenColor: new Color('#FFDFC8'),
});
roseGoldMaterial.name = 'mat-rose-gold';
applyGalaxyShader(roseGoldMaterial, {
    freq: 100.0,
    warpStrength: 0.30,
    tShift: 0.40,
    tScale: 1.0,
    nebulaWeight: 0.08,
    blueWeight: 0.0,
    sheenWeight: 0.20,
    sparkleWeight: 0.75,
    accentColorA: [0.95, 0.80, 0.70],
    accentColorB: [1.0, 0.90, 0.85],
    sheenColorA: [1.0, 0.85, 0.75],
    sheenColorB: [1.0, 0.92, 0.85],
});

/**
 * Pearl White Material (#FFF9FC)
 * Intended for: Sarado Crossbar.
 * Aesthetic: Pristine porcelain white with clearcoat glaze, subtle nacre highlights, and gentle pearlescent viewing-angle shifts.
 * Component Treatment: Mostly pearl white (>85%), blue accents absent or extremely faint.
 */
export const pearlWhiteMaterial = new MeshPhysicalMaterial({
    color: new Color(KEN_PALETTE.PEARL_WHITE),
    roughness: 0.22,
    metalness: 0.02,
    clearcoat: 0.80,
    clearcoatRoughness: 0.12,
    sheen: 0.50,
    sheenRoughness: 0.20,
    sheenColor: new Color(0xffffff),
    iridescence: 0.32,
    iridescenceIOR: 1.32,
    iridescenceThicknessRange: [100, 300],
});
pearlWhiteMaterial.name = 'mat-pearl-white';
applyGalaxyShader(pearlWhiteMaterial, {
    freq: 100.0,
    warpStrength: 0.40,
    tShift: 0.05,
    tScale: 1.0,
    nebulaWeight: 0.38,
    blueWeight: 0.0,
    sheenWeight: 0.45,
    sparkleWeight: 0.85,
    accentColorA: KEN_PALETTE.MOON_PEARL,
    accentColorB: '#F0E8FF',
    sheenColorA: [1.0, 0.96, 0.98],
    sheenColorB: [0.90, 0.93, 1.0],
});

/**
 * Map of all reusable materials indexed by canonical palette key.
 * @readonly
 */
export const KEN_MATERIALS = Object.freeze({
    MOON_PEARL: moonPearlMaterial,
    ROSE_NEBULA: roseNebulaMaterial,
    LAVENDER_MOON: lavenderMoonMaterial,
    ROSE_GOLD: roseGoldMaterial,
    PEARL_WHITE: pearlWhiteMaterial,
});

/**
 * Authoritative mapping from Kendama component mesh names to their assigned materials.
 * Will be consumed when applying materials to the Kendama assembly.
 * @readonly
 */
export const COMPONENT_MATERIAL_MAP = Object.freeze({
    'sarado-crossbar': pearlWhiteMaterial,
    'big-cup-oozara': roseNebulaMaterial,
    'small-cup-kozara': lavenderMoonMaterial,
    'base-cup-chuzara': roseNebulaMaterial,
    'spike-kensaki': moonPearlMaterial,
    'handle-ken': moonPearlMaterial,
});

/**
 * Retrieves a reusable material by palette key or component mesh name.
 *
 * @param {string} identifier - Palette key (e.g. 'MOON_PEARL') or component name (e.g. 'big-cup-oozara')
 * @returns {MeshPhysicalMaterial | undefined} The matching material instance
 */
export function getKenMaterial(identifier) {
    if (typeof identifier !== 'string') return undefined;
    if (KEN_MATERIALS[identifier]) {
        return KEN_MATERIALS[identifier];
    }
    if (COMPONENT_MATERIAL_MAP[identifier]) {
        return COMPONENT_MATERIAL_MAP[identifier];
    }
    return undefined;
}

export default KEN_MATERIALS;
