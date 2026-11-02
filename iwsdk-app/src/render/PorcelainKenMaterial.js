/**
 * Celestial Kendama - Set 5: Porcelain Dreams Ken Material System
 * Role: Person C (Visuals & Rendering)
 *
 * Defines the glazed blue-and-white porcelain PBR materials and component-specific textures
 * for the Porcelain Dreams Ken (handle, crossbar, cups, and spike).
 *
 * Visual Direction:
 * - Warm porcelain ivory base (#F5F0E5).
 * - Original blue floral motifs, fine curling vines, and leaves.
 * - Geometric ornamental borders around selected areas.
 * - Glossy glazed ceramic appearance with mirror-smooth clearcoat.
 * - Separate, tailored texture layouts for individual Ken components.
 */

import { MeshPhysicalMaterial, Color, FrontSide } from 'three';
import {
    PORCELAIN_PALETTE,
    createPorcelainCupTexture,
    createPorcelainHandleTexture,
    createPorcelainCrossbarTexture,
    createPorcelainSpikeTexture,
} from './PorcelainPattern.js';

export { PORCELAIN_PALETTE };

// --- Authoritative Default Ken PBR Constants ---
export const DEFAULT_PORCELAIN_KEN_BASE_COLOR = PORCELAIN_PALETTE.WARM_IVORY;
export const DEFAULT_PORCELAIN_KEN_ROUGHNESS = 0.12;
export const DEFAULT_PORCELAIN_KEN_METALNESS = 0.0;
export const DEFAULT_PORCELAIN_KEN_CLEARCOAT = 0.95;
export const DEFAULT_PORCELAIN_KEN_CLEARCOAT_ROUGHNESS = 0.04;
export const DEFAULT_PORCELAIN_KEN_SHEEN = 0.20;
export const DEFAULT_PORCELAIN_KEN_SHEEN_ROUGHNESS = 0.15;
export const DEFAULT_PORCELAIN_KEN_SHEEN_COLOR = PORCELAIN_PALETTE.WARM_IVORY;

/**
 * Injects crossbar cylindrical projection handling into Three.js physical shader.
 * Ensures that if geometry lacks UV attributes, coordinates are computed analytically from local position.
 *
 * @param {MeshPhysicalMaterial} material - The crossbar material
 * @param {object} crossbarTexture - CanvasTexture for crossbar
 */
export function applyPorcelainCrossbarShader(material, crossbarTexture) {
    if (!material || !material.isMaterial) return material;

    material.onBeforeCompile = (shader) => {
        // Uniforms
        shader.uniforms.uPorcelainCrossbarMap = { value: crossbarTexture };

        // Vertex shader: compute cylindrical UV from transformed position
        shader.vertexShader = shader.vertexShader.replace(
            '#include <uv_pars_vertex>',
            /* glsl */ `
            #include <uv_pars_vertex>
            varying vec2 vPorcelainCrossbarUv;
            `
        );

        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            /* glsl */ `
            #include <begin_vertex>
            // Crossbar span: [-0.06075, 0.06075] (total length: 0.1215 m)
            float uSpan = clamp((transformed.x + 0.06075) / 0.1215, 0.0, 1.0);
            float vCirc = atan(transformed.z, transformed.y) / (2.0 * 3.14159265) + 0.5;
            vPorcelainCrossbarUv = vec2(uSpan, vCirc);
            `
        );

        // Fragment shader: sample texture using analytical UV if map_fragment is not active or as primary diffuse
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <uv_pars_fragment>',
            /* glsl */ `
            #include <uv_pars_fragment>
            uniform sampler2D uPorcelainCrossbarMap;
            varying vec2 vPorcelainCrossbarUv;
            `
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_fragment>',
            /* glsl */ `
            #ifdef USE_MAP
                vec4 texelColor = texture2D( map, vMapUv );
                diffuseColor *= texelColor;
            #else
                vec4 texelColor = texture2D( uPorcelainCrossbarMap, vPorcelainCrossbarUv );
                diffuseColor *= texelColor;
            #endif
            `
        );
    };

    return material;
}

/**
 * Creates a component-specific Porcelain Dreams Ken MeshPhysicalMaterial.
 *
 * @param {string} componentKey - The Ken component identifier
 * @param {object} [options={}] - Customization options
 * @returns {MeshPhysicalMaterial} Glazed porcelain PBR material
 */
export function createPorcelainKenMaterial(componentKey, options = {}) {
    const {
        roughness = DEFAULT_PORCELAIN_KEN_ROUGHNESS,
        metalness = DEFAULT_PORCELAIN_KEN_METALNESS,
        clearcoat = DEFAULT_PORCELAIN_KEN_CLEARCOAT,
        clearcoatRoughness = DEFAULT_PORCELAIN_KEN_CLEARCOAT_ROUGHNESS,
        sheen = DEFAULT_PORCELAIN_KEN_SHEEN,
        sheenColor = DEFAULT_PORCELAIN_KEN_SHEEN_COLOR,
    } = options;

    const baseColor = new Color(PORCELAIN_PALETTE.WARM_IVORY);

    let texture = null;
    let isCrossbar = false;

    switch (componentKey) {
        case 'big-cup-oozara':
            texture = createPorcelainCupTexture('big');
            break;
        case 'small-cup-kozara':
            texture = createPorcelainCupTexture('small');
            break;
        case 'base-cup-chuzara':
            texture = createPorcelainCupTexture('base');
            break;
        case 'handle-ken':
            texture = createPorcelainHandleTexture();
            break;
        case 'spike-kensaki':
            texture = createPorcelainSpikeTexture();
            break;
        case 'sarado-crossbar':
            texture = createPorcelainCrossbarTexture();
            isCrossbar = true;
            break;
        default:
            texture = createPorcelainHandleTexture();
            break;
    }

    const materialConfig = {
        name: `mat-porcelain-${componentKey}`,
        color: baseColor,
        roughness,
        metalness,
        clearcoat,
        clearcoatRoughness,
        sheen,
        sheenRoughness: DEFAULT_PORCELAIN_KEN_SHEEN_ROUGHNESS,
        sheenColor: new Color(sheenColor),
        side: FrontSide,
    };

    // For components with native UVs, set map directly
    if (!isCrossbar && texture) {
        materialConfig.map = texture;
    }

    const material = new MeshPhysicalMaterial(materialConfig);

    // For crossbar, attach analytical shader and texture
    if (isCrossbar && texture) {
        material.userData.porcelainTexture = texture;
        applyPorcelainCrossbarShader(material, texture);
    }

    return material;
}

// --- Pre-instantiated Shared Singletons for Performance ---
export const porcelainCrossbarMaterial = createPorcelainKenMaterial('sarado-crossbar');
export const porcelainBigCupMaterial = createPorcelainKenMaterial('big-cup-oozara');
export const porcelainSmallCupMaterial = createPorcelainKenMaterial('small-cup-kozara');
export const porcelainBaseCupMaterial = createPorcelainKenMaterial('base-cup-chuzara');
export const porcelainSpikeMaterial = createPorcelainKenMaterial('spike-kensaki');
export const porcelainHandleMaterial = createPorcelainKenMaterial('handle-ken');

/**
 * Authoritative component-to-material mapping for the Porcelain Dreams Ken.
 * @readonly
 */
export const PORCELAIN_COMPONENT_MATERIAL_MAP = Object.freeze({
    'sarado-crossbar': porcelainCrossbarMaterial,
    'big-cup-oozara': porcelainBigCupMaterial,
    'small-cup-kozara': porcelainSmallCupMaterial,
    'base-cup-chuzara': porcelainBaseCupMaterial,
    'spike-kensaki': porcelainSpikeMaterial,
    'handle-ken': porcelainHandleMaterial,
});

export default PORCELAIN_COMPONENT_MATERIAL_MAP;
