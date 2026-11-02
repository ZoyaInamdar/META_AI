/**
 * Celestial Kendama - Set 5: Porcelain Dreams Tama Material System
 * Role: Person C (Visuals & Rendering)
 *
 * Defines the glazed blue-and-white porcelain PBR material, procedural texture,
 * and bore cavity shading for the Porcelain Dreams Tama (ball).
 *
 * Visual Direction:
 * - Warm porcelain ivory spherical base (#F5F0E5).
 * - Original cobalt-blue floral bouquets and ornamental patterns.
 * - Decorative motifs wrap naturally around the sphere without visible seams.
 * - High-gloss vitreous porcelain glaze finish with smooth clearcoat.
 * - Authentically shaded bore cavity for realistic depth perception when seated on the spike.
 */

import { MeshPhysicalMaterial, Color, FrontSide } from 'three';
import {
    PORCELAIN_PALETTE,
    createPorcelainTamaTexture,
} from './PorcelainPattern.js';

export { PORCELAIN_PALETTE };

// --- Authoritative Default Tama PBR Constants ---
export const DEFAULT_PORCELAIN_TAMA_BASE_COLOR = PORCELAIN_PALETTE.WARM_IVORY;
export const DEFAULT_PORCELAIN_TAMA_ROUGHNESS = 0.10;
export const DEFAULT_PORCELAIN_TAMA_METALNESS = 0.0;
export const DEFAULT_PORCELAIN_TAMA_CLEARCOAT = 0.96;
export const DEFAULT_PORCELAIN_TAMA_CLEARCOAT_ROUGHNESS = 0.04;
export const DEFAULT_PORCELAIN_TAMA_SHEEN = 0.22;
export const DEFAULT_PORCELAIN_TAMA_SHEEN_ROUGHNESS = 0.15;
export const DEFAULT_PORCELAIN_TAMA_SHEEN_COLOR = PORCELAIN_PALETTE.WARM_IVORY;

/**
 * Injects bore cavity detection, occlusion, and specular suppression into the Tama material.
 *
 * @param {MeshPhysicalMaterial} material - The physical material to enhance
 * @returns {MeshPhysicalMaterial} The enhanced material
 */
export function applyPorcelainTamaShader(material) {
    if (!material || !material.isMaterial) return material;

    material.onBeforeCompile = (shader) => {
        // 1. Vertex Shader: compute local transformed coordinate for bore cavity detection
        shader.vertexShader = shader.vertexShader.replace(
            '#include <uv_pars_vertex>',
            /* glsl */ `
            #include <uv_pars_vertex>
            varying vec3 vPorcelainTamaPos;
            `
        );

        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            /* glsl */ `
            #include <begin_vertex>
            vPorcelainTamaPos = transformed;
            `
        );

        // 2. Fragment Shader: bore cavity detection and darkening
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <uv_pars_fragment>',
            /* glsl */ `
            #include <uv_pars_fragment>
            varying vec3 vPorcelainTamaPos;
            `
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_fragment>',
            /* glsl */ `
            #include <map_fragment>

            // Bore cavity detection: cylinder around Y-axis extending from bottom opening inward
            float boreDist = length(vPorcelainTamaPos.xz);
            float boreDepth = smoothstep(0.005, -0.042, vPorcelainTamaPos.y);
            float boreRadius = 1.0 - smoothstep(0.010, 0.016, boreDist);
            float boreFactor = clamp(boreDepth * boreRadius, 0.0, 1.0);

            // Blend deep cavity shadow into inner hole for realistic spike seating depth
            vec3 boreCavityTone = vec3(0.06, 0.07, 0.09);
            diffuseColor.rgb = mix(diffuseColor.rgb, boreCavityTone, boreFactor * 0.78);
            `
        );
    };

    return material;
}

/**
 * Creates the glazed porcelain MeshPhysicalMaterial for the Porcelain Dreams Tama.
 *
 * @param {object} [options={}] - Customization options
 * @returns {MeshPhysicalMaterial} Glazed porcelain Tama material
 */
export function createPorcelainTamaMaterial(options = {}) {
    const {
        roughness = DEFAULT_PORCELAIN_TAMA_ROUGHNESS,
        metalness = DEFAULT_PORCELAIN_TAMA_METALNESS,
        clearcoat = DEFAULT_PORCELAIN_TAMA_CLEARCOAT,
        clearcoatRoughness = DEFAULT_PORCELAIN_TAMA_CLEARCOAT_ROUGHNESS,
        sheen = DEFAULT_PORCELAIN_TAMA_SHEEN,
        sheenColor = DEFAULT_PORCELAIN_TAMA_SHEEN_COLOR,
        texture = null,
    } = options;

    const tamaTexture = texture || createPorcelainTamaTexture();

    const material = new MeshPhysicalMaterial({
        name: 'mat-porcelain-tama',
        color: new Color(PORCELAIN_PALETTE.WARM_IVORY),
        roughness,
        metalness,
        clearcoat,
        clearcoatRoughness,
        sheen,
        sheenRoughness: DEFAULT_PORCELAIN_TAMA_SHEEN_ROUGHNESS,
        sheenColor: new Color(sheenColor),
        map: tamaTexture,
        side: FrontSide,
    });

    applyPorcelainTamaShader(material);

    return material;
}

// --- Pre-instantiated Shared Singleton ---
export const porcelainTamaMaterial = createPorcelainTamaMaterial();

export default porcelainTamaMaterial;
