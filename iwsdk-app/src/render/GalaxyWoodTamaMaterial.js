/**
 * Celestial Kendama - Set 2: Galaxy Wood Tama Material System (Solar Flare Palette)
 * Role: Person C (Visuals & Rendering)
 *
 * Defines the Solar Flare cosmic nebula PBR material and procedural 3D solar flare
 * shader for the Galaxy Wood Tama (ball).
 *
 * Visual Direction:
 * - Solar Flare cosmic nebula pairing with natural dark reddish-brown wood Ken.
 * - Authoritative Solar Flare 5-color palette:
 *   - Primary molten gold: Rich golden yellow (#F5B82E)
 *   - Bright highlights: Solar yellow (#FFD95A)
 *   - Secondary colour: Amber orange (#E88724)
 *   - Nebula transitions: Burnt orange (#C95725)
 *   - Deep shadows: Dark burgundy (#481B2B)
 * - Flowing, irregular, cloud-like solar nebula patterns across spherical surface (zero stripes or decals).
 * - Vibrant and saturated with enough dark burgundy to provide dramatic depth and contrast.
 * - Golden and yellow highlights creating a luminous molten appearance.
 * - Retains glossy, polished finish, clearcoat depth, satin sheen, and subtle iridescence.
 * - Authentic bore interior handling: dark cavity occlusion and sparkle suppression inside the spike hole.
 */

import { MeshPhysicalMaterial, Color, FrontSide } from 'three';

// --- Authoritative Galaxy Wood Tama Palette: Solar Flare ---
export const GALAXY_WOOD_TAMA_PALETTE = Object.freeze({
    // Primary roles
    MOLTEN_GOLD: '#F5B82E',      // Primary molten gold: Rich golden yellow
    SOLAR_YELLOW: '#FFD95A',     // Bright highlights: Solar yellow
    AMBER_ORANGE: '#E88724',     // Secondary colour: Amber orange
    BURNT_ORANGE: '#C95725',     // Nebula transitions: Burnt orange
    DARK_BURGUNDY: '#481B2B',    // Deep shadows: Dark burgundy

    // Semantic role aliases
    PRIMARY_GOLD: '#F5B82E',
    HIGHLIGHT: '#FFD95A',
    SECONDARY: '#E88724',
    TRANSITION: '#C95725',
    DEEP_SHADOW: '#481B2B',
});

// Alias for explicit naming
export const SOLAR_FLARE_TAMA_PALETTE = GALAXY_WOOD_TAMA_PALETTE;

// --- Authoritative Default PBR Constants ---
export const DEFAULT_GW_TAMA_BASE_COLOR = GALAXY_WOOD_TAMA_PALETTE.DARK_BURGUNDY;
export const DEFAULT_GW_TAMA_ROUGHNESS = 0.22;
export const DEFAULT_GW_TAMA_METALNESS = 0.02;
export const DEFAULT_GW_TAMA_CLEARCOAT = 0.82;
export const DEFAULT_GW_TAMA_CLEARCOAT_ROUGHNESS = 0.12;
export const DEFAULT_GW_TAMA_SHEEN = 0.55;
export const DEFAULT_GW_TAMA_SHEEN_ROUGHNESS = 0.22;
export const DEFAULT_GW_TAMA_SHEEN_COLOR = '#FFD285';
export const DEFAULT_GW_TAMA_IRIDESCENCE = 0.32;
export const DEFAULT_GW_TAMA_IRIDESCENCE_IOR = 1.34;
export const DEFAULT_GW_TAMA_IRIDESCENCE_THICKNESS = [120, 320];

// --- Authoritative Shader Parameter Constants ---
export const DEFAULT_GW_TAMA_FREQ = 46.0;          // Tuned for ~2.0 organic cloud formations across 9 cm sphere
export const DEFAULT_GW_TAMA_WARP_STRENGTH = 0.65; // Multi-octave vector displacement turbulence
export const DEFAULT_GW_TAMA_T_SHIFT = 0.00;      // Symmetrical ramp centering
export const DEFAULT_GW_TAMA_T_SCALE = 1.00;      // Full ramp spectrum coverage
export const DEFAULT_GW_TAMA_NEBULA_WEIGHT = 0.90; // Blend into albedo
export const DEFAULT_GW_TAMA_SHEEN_WEIGHT = 0.35;  // Pearlescent Fresnel nacre highlight
export const DEFAULT_GW_TAMA_SPARKLE_WEIGHT = 0.95;// Subtle pinprick solar micro-sparks
export const DEFAULT_GW_TAMA_LUMINOUS_WEIGHT = 0.20; // Subtle molten core glow
export const DEFAULT_GW_TAMA_BORE_CAVITY_DEPTH = 0.75; // Internal cavity occlusion depth

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
 * Enhances a Three.js MeshPhysicalMaterial with the Galaxy Wood colourful cosmic nebula shader.
 *
 * @param {MeshPhysicalMaterial} material - The material to enhance
 * @param {object} [options={}] - Customization options
 * @returns {MeshPhysicalMaterial} The enhanced material
 */
export function applyGalaxyWoodTamaShader(material, options = {}) {
    if (!material || !material.isMaterial) return material;

    const {
        freq = DEFAULT_GW_TAMA_FREQ,
        warpStrength = DEFAULT_GW_TAMA_WARP_STRENGTH,
        tShift = DEFAULT_GW_TAMA_T_SHIFT,
        tScale = DEFAULT_GW_TAMA_T_SCALE,
        nebulaWeight = DEFAULT_GW_TAMA_NEBULA_WEIGHT,
        sheenWeight = DEFAULT_GW_TAMA_SHEEN_WEIGHT,
        sparkleWeight = DEFAULT_GW_TAMA_SPARKLE_WEIGHT,
        luminousWeight = DEFAULT_GW_TAMA_LUMINOUS_WEIGHT,
        boreCavityDepth = DEFAULT_GW_TAMA_BORE_CAVITY_DEPTH,
        sheenColorA = [0.98, 0.75, 0.35],
        sheenColorB = [0.92, 0.45, 0.20],
    } = options;

    const cDarkBurgundy = toLinearRgb(GALAXY_WOOD_TAMA_PALETTE.DARK_BURGUNDY);
    const cBurntOrange = toLinearRgb(GALAXY_WOOD_TAMA_PALETTE.BURNT_ORANGE);
    const cAmberOrange = toLinearRgb(GALAXY_WOOD_TAMA_PALETTE.AMBER_ORANGE);
    const cMoltenGold = toLinearRgb(GALAXY_WOOD_TAMA_PALETTE.MOLTEN_GOLD);
    const cSolarYellow = toLinearRgb(GALAXY_WOOD_TAMA_PALETTE.SOLAR_YELLOW);

    material.customProgramCacheKey = () => `gw-tama-solar-flare-v1-${material.name || 'default'}`;

    material.onBeforeCompile = (shader, renderer) => {
        try {
            console.log(`[GW-TAMA-SHADER] onBeforeCompile executed for material "${material.name}"`);

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

            // 2. Fragment Shader Definitions: Domain-warped multi-octave nebula and Solar Flare 5-color ramp
            const glslDefinitions = `
varying vec3 vTamaPos;

// Stage 1 3D vector displacement field for domain warping
vec3 gwTamaWarp3D_A(vec3 p) {
    return vec3(
        sin(p.y * 1.35 + p.z * 0.85),
        sin(p.z * 1.45 + p.x * 0.95),
        sin(p.x * 1.25 + p.y * 1.05)
    );
}

// Stage 2 3D vector displacement field for domain warping
vec3 gwTamaWarp3D_B(vec3 q) {
    return vec3(
        cos(q.z * 1.65 + q.y * 1.05 + 1.7),
        cos(q.x * 1.55 + q.z * 1.25 + 9.2),
        cos(q.y * 1.75 + q.x * 0.95 + 3.4)
    );
}

// Domain-warped multi-octave 3D noise field for billowy nebula clouds
float gwTamaNebulaFbm(vec3 p, float warpStrength) {
    vec3 q = p + warpStrength * gwTamaWarp3D_A(p);
    vec3 r = q + (warpStrength * 0.85) * gwTamaWarp3D_B(q);

    // Octave 1: broad billowing cosmic clouds
    float o1 = sin(r.x * 1.1 + sin(r.y * 1.25 + r.z * 0.85)) * cos(r.y * 1.15 + sin(r.z * 1.2 + r.x * 0.9));

    // Octave 2: medium swirling eddies
    vec3 r2 = r * 2.15 + vec3(2.4, 5.1, 7.8);
    float o2 = sin(r2.z * 1.3 + cos(r2.x * 1.35 + r2.y * 1.05)) * cos(r2.x * 1.25 + sin(r2.y * 1.4 + r2.z * 0.8));

    // Octave 3: delicate filaments and wisp edges
    vec3 r3 = r * 4.3 + vec3(8.7, 1.3, 4.9);
    float o3 = sin(r3.y * 1.4 + r3.x * 1.1) * cos(r3.z * 1.3 + r3.y * 0.9);

    float fbm = 0.5 + 0.32 * o1 + 0.14 * o2 + 0.04 * o3;
    return clamp(fbm, 0.0, 1.0);
}

// 5-color continuous flowing Solar Flare cosmic nebula ramp:
// 1. Deep Shadows: Dark Burgundy (#481B2B) -> deep space depth & shadow
// 2. Nebula Transitions: Burnt Orange (#C95725) -> billowing solar turbulence
// 3. Secondary Colour: Amber Orange (#E88724) -> warm solar convection currents
// 4. Primary Molten Gold: Rich Golden Yellow (#F5B82E) -> vibrant molten surface
// 5. Bright Highlights: Solar Yellow (#FFD95A) -> intense solar flare peaks
vec3 gwTamaGalaxyRamp(float t) {
    vec3 c0 = vec3(${cDarkBurgundy.join(', ')}); // Dark Burgundy (#481B2B)
    vec3 c1 = vec3(${cBurntOrange.join(', ')});   // Burnt Orange (#C95725)
    vec3 c2 = vec3(${cAmberOrange.join(', ')});   // Amber Orange (#E88724)
    vec3 c3 = vec3(${cMoltenGold.join(', ')});    // Molten Gold (#F5B82E)
    vec3 c4 = vec3(${cSolarYellow.join(', ')});   // Solar Yellow (#FFD95A)

    if (t < 0.22) {
        return mix(c0, c1, t / 0.22);
    } else if (t < 0.48) {
        return mix(c1, c2, (t - 0.22) / 0.26);
    } else if (t < 0.74) {
        return mix(c2, c3, (t - 0.48) / 0.26);
    } else {
        return mix(c3, c4, clamp((t - 0.74) / 0.26, 0.0, 1.0));
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
            const hasLuminous = luminousWeight > 0.005;

            // 3. Fragment Shader Logic: Domain-warped nebula flow, cavity occlusion, nacre sheen, sparkles
            const glslLogic = `
    #include <normal_fragment_begin>

    // 1. Procedural 3D coordinates in local space (zero UV seams across sphere)
    vec3 tPos = vTamaPos * ${freq.toFixed(1)};
    float nebulaFbm = gwTamaNebulaFbm(tPos, ${warpStrength.toFixed(2)});

    // 2. Continuous 5-color Solar Flare cosmic nebula flow
    float tFlow = clamp((nebulaFbm + ${tShift.toFixed(2)}) * ${tScale.toFixed(2)}, 0.0, 1.0);
    vec3 galaxyFlowColor = gwTamaGalaxyRamp(tFlow);

    // 3. Smooth blend into albedo
    diffuseColor.rgb = mix(diffuseColor.rgb, galaxyFlowColor, ${nebulaWeight.toFixed(2)});

    // 4. Bore cavity occlusion & interior shading
    float boreDepthFactor = clamp((-0.0065 - vTamaPos.y) / 0.035, 0.0, 1.0);
    float boreRadiusFactor = smoothstep(0.0150, 0.0125, length(vTamaPos.xz));
    float boreCavity = boreDepthFactor * boreRadiusFactor;
    vec3 boreInteriorTone = mix(vec3(${cDarkBurgundy.join(', ')}), vec3(${cBurntOrange.join(', ')}), 0.20) * 0.60;
    diffuseColor.rgb = mix(diffuseColor.rgb, boreInteriorTone, boreCavity * ${boreCavityDepth.toFixed(2)});
${hasLuminous ? `
    // 5. Subtle luminous molten regions in solar flare peaks
    float coreLuminance = smoothstep(0.82, 1.0, tFlow);
    vec3 solarGlowTone = mix(vec3(${cMoltenGold.join(', ')}), vec3(${cSolarYellow.join(', ')}), 0.70);
    totalEmissiveRadiance += solarGlowTone * (coreLuminance * ${luminousWeight.toFixed(2)} * (1.0 - boreCavity));
` : ''}
${hasSheen ? `
    // 6. Angle-dependent pearlescent sheen shift (NdotV Fresnel highlights)
    vec3 viewDir = normalize(-vViewPosition);
    float NdotV = clamp(dot(normal, viewDir), 0.0, 1.0);
    float fresnel = pow(1.0 - NdotV, 2.4);
    vec3 sColor = mix(vec3(${sheenColorA.join(', ')}), vec3(${sheenColorB.join(', ')}), sin(vTamaPos.y * 50.0) * 0.5 + 0.5);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb + sColor * 0.28, fresnel * ${sheenWeight.toFixed(2)} * (1.0 - boreCavity * 0.7));
` : ''}
${hasSparkle ? `
    // 7. Tiny delicate solar micro-sparkles (suppressed inside the bore hole)
    vec3 starGrid = floor(vTamaPos * 800.0);
    float starHash = fract(sin(dot(starGrid, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
    if (starHash > 0.988) {
        float starIntensity = pow((starHash - 0.988) / 0.012, 2.0);
        vec3 starTint = mix(vec3(1.0, 0.92, 0.65), vec3(1.0, 0.80, 0.45), fract(starHash * 13.0));
        totalEmissiveRadiance += starTint * (starIntensity * ${sparkleWeight.toFixed(2)} * (1.0 - boreCavity));
    }
` : ''}
`;

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <normal_fragment_begin>',
                glslLogic
            );
        } catch (err) {
            console.warn('[GalaxyWoodTamaMaterial] Nebula shader enhancement failed, falling back to PBR base:', err);
        }
    };

    return material;
}

/**
 * Factory creating a fresh, independent Galaxy Wood Tama MeshPhysicalMaterial.
 *
 * @param {object} [options={}] - Customization options
 * @returns {MeshPhysicalMaterial} Configured Tama material
 */
export function createGalaxyWoodTamaMaterial(options = {}) {
    const {
        color = DEFAULT_GW_TAMA_BASE_COLOR,
        roughness = DEFAULT_GW_TAMA_ROUGHNESS,
        metalness = DEFAULT_GW_TAMA_METALNESS,
        clearcoat = DEFAULT_GW_TAMA_CLEARCOAT,
        clearcoatRoughness = DEFAULT_GW_TAMA_CLEARCOAT_ROUGHNESS,
        sheen = DEFAULT_GW_TAMA_SHEEN,
        sheenRoughness = DEFAULT_GW_TAMA_SHEEN_ROUGHNESS,
        sheenColor = DEFAULT_GW_TAMA_SHEEN_COLOR,
        iridescence = DEFAULT_GW_TAMA_IRIDESCENCE,
        iridescenceIOR = DEFAULT_GW_TAMA_IRIDESCENCE_IOR,
        iridescenceThicknessRange = DEFAULT_GW_TAMA_IRIDESCENCE_THICKNESS,
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

    material.name = 'mat-galaxy-wood-tama';

    applyGalaxyWoodTamaShader(material, shaderOptions);

    return material;
}

/**
 * Singleton instance of Galaxy Wood Tama material.
 */
export const galaxyWoodTamaMaterial = createGalaxyWoodTamaMaterial();

export default galaxyWoodTamaMaterial;
