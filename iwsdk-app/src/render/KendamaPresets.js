/**
 * Celestial Kendama - Paired Preset Registry
 * Role: Person C (Visuals & Rendering)
 *
 * Defines the unified preset configurations for Celestial Kendama:
 * - Set 1: Celestial Kendama (Pastel galaxy PBR Ken with porcelain finish + Dark lavender galaxy Tama)
 * - Set 2: Galaxy Wood (Natural dark reddish-brown wood Ken with organic grain + Colourful cosmic nebula Tama)
 *
 * Each preset registers a matching Ken + Tama pair guaranteeing coherent visual
 * styling and seamless preset switching without modifying underlying geometries.
 */

import {
    COMPONENT_MATERIAL_MAP,
    KEN_PALETTE,
    KEN_MATERIALS,
} from './KenMaterials.js';
import {
    celestialTamaMaterial,
    TAMA_PALETTE,
} from './TamaMaterial.js';
import {
    GALAXY_WOOD_COMPONENT_MATERIAL_MAP,
    GALAXY_WOOD_PALETTE,
    createKenWoodMaterial,
} from './KenWoodMaterial.js';
import {
    galaxyWoodTamaMaterial,
    GALAXY_WOOD_TAMA_PALETTE,
    createGalaxyWoodTamaMaterial,
} from './GalaxyWoodTamaMaterial.js';
import {
    BUBBLEGUM_POP_COMPONENT_MATERIAL_MAP,
    BUBBLEGUM_POP_KEN_PALETTE,
    createBubblegumKenMaterial,
} from './BubblegumKenMaterial.js';
import {
    bubblegumPopTamaMaterial,
    BUBBLEGUM_POP_TAMA_PALETTE,
    createBubblegumTamaMaterial,
} from './BubblegumTamaMaterial.js';
import {
    DARK_MATTER_COMPONENT_MATERIAL_MAP,
    DARK_MATTER_KEN_PALETTE,
    createDarkMatterKenMaterial,
} from './DarkMatterKenMaterial.js';
import {
    darkMatterTamaMaterial,
    DARK_MATTER_TAMA_PALETTE,
    createDarkMatterTamaMaterial,
} from './DarkMatterTamaMaterial.js';
import {
    PORCELAIN_COMPONENT_MATERIAL_MAP,
    PORCELAIN_PALETTE,
    createPorcelainKenMaterial,
} from './PorcelainKenMaterial.js';
import {
    porcelainTamaMaterial,
    createPorcelainTamaMaterial,
} from './PorcelainTamaMaterial.js';

/**
 * Authoritative canonical preset identifiers.
 * @readonly
 * @enum {string}
 */
export const KENDAMA_PRESET_IDS = Object.freeze({
    CELESTIAL: 'celestial',
    GALAXY_WOOD: 'galaxy-wood',
    BUBBLEGUM_POP: 'bubblegum-pop',
    DARK_MATTER: 'dark-matter',
    PORCELAIN_DREAMS: 'porcelain-dreams',
});

/**
 * Preset 1: Celestial Kendama
 * Reusable softcore pastel galaxy finish.
 */
export const CELESTIAL_PRESET = Object.freeze({
    id: KENDAMA_PRESET_IDS.CELESTIAL,
    name: 'Celestial Kendama',
    description: 'Softcore pastel galaxy PBR finish with moon pearl handle, rose nebula cups, and dark lavender galaxy planetoid Tama.',
    kenMaterials: COMPONENT_MATERIAL_MAP,
    tamaMaterial: celestialTamaMaterial,
    kenPalette: KEN_PALETTE,
    tamaPalette: TAMA_PALETTE,
});

/**
 * Preset 2: Galaxy Wood
 * Natural dark reddish-brown wood Ken paired with a colourful cosmic nebula Tama.
 */
export const GALAXY_WOOD_PRESET = Object.freeze({
    id: KENDAMA_PRESET_IDS.GALAXY_WOOD,
    name: 'Galaxy Wood',
    description: 'Natural dark reddish-brown polished wood Ken with visible organic grain lines, paired with a vibrant Solar Flare molten gold, amber orange, and dark burgundy nebula Tama.',
    kenMaterials: GALAXY_WOOD_COMPONENT_MATERIAL_MAP,
    tamaMaterial: galaxyWoodTamaMaterial,
    kenPalette: GALAXY_WOOD_PALETTE,
    tamaPalette: GALAXY_WOOD_TAMA_PALETTE,
});

/**
 * Preset 3: Bubblegum Pop
 * Bold, playful, vibrant pink Kendama set with glossy hot-pink Ken and an organic purple, bubblegum pink, and golden yellow gradient Tama.
 */
export const BUBBLEGUM_POP_PRESET = Object.freeze({
    id: KENDAMA_PRESET_IDS.BUBBLEGUM_POP,
    name: 'Bubblegum Pop',
    description: 'Bold, playful, vibrant pink Kendama set with glossy hot-pink Ken and an organic purple, bubblegum pink, and golden yellow gradient Tama.',
    kenMaterials: BUBBLEGUM_POP_COMPONENT_MATERIAL_MAP,
    tamaMaterial: bubblegumPopTamaMaterial,
    kenPalette: BUBBLEGUM_POP_KEN_PALETTE,
    tamaPalette: BUBBLEGUM_POP_TAMA_PALETTE,
});

/**
 * Preset 4: Dark Matter
 * Deep charcoal and smoky black cloudy marble Ken with flowing grey veins, paired with an organic hot-pink to smoky black gradient Tama.
 */
export const DARK_MATTER_PRESET = Object.freeze({
    id: KENDAMA_PRESET_IDS.DARK_MATTER,
    name: 'Dark Matter',
    description: 'Deep charcoal and smoky black cloudy marble Ken with flowing grey veins, paired with an organic hot-pink to smoky black gradient Tama.',
    kenMaterials: DARK_MATTER_COMPONENT_MATERIAL_MAP,
    tamaMaterial: darkMatterTamaMaterial,
    kenPalette: DARK_MATTER_KEN_PALETTE,
    tamaPalette: DARK_MATTER_TAMA_PALETTE,
});

/**
 * Preset 5: Porcelain Dreams
 * Glazed blue-and-white porcelain-inspired Ken with original floral motifs and ornamental borders,
 * paired with a matching glazed ivory and cobalt Tama.
 */
export const PORCELAIN_DREAMS_PRESET = Object.freeze({
    id: KENDAMA_PRESET_IDS.PORCELAIN_DREAMS,
    name: 'Porcelain Dreams',
    description: 'Glazed blue-and-white porcelain-inspired Ken with original floral motifs, curling vines, and ornamental borders, paired with a matching glazed ivory and cobalt Tama.',
    kenMaterials: PORCELAIN_COMPONENT_MATERIAL_MAP,
    tamaMaterial: porcelainTamaMaterial,
    kenPalette: PORCELAIN_PALETTE,
    tamaPalette: PORCELAIN_PALETTE,
});

/**
 * Master registry of all paired Kendama presets.
 * @readonly
 */
export const KENDAMA_PRESETS = Object.freeze({
    [KENDAMA_PRESET_IDS.CELESTIAL]: CELESTIAL_PRESET,
    [KENDAMA_PRESET_IDS.GALAXY_WOOD]: GALAXY_WOOD_PRESET,
    [KENDAMA_PRESET_IDS.BUBBLEGUM_POP]: BUBBLEGUM_POP_PRESET,
    [KENDAMA_PRESET_IDS.DARK_MATTER]: DARK_MATTER_PRESET,
    [KENDAMA_PRESET_IDS.PORCELAIN_DREAMS]: PORCELAIN_DREAMS_PRESET,
});

/**
 * Retrieves a paired Kendama preset by identifier.
 *
 * @param {string} [id=KENDAMA_PRESET_IDS.CELESTIAL] - Preset identifier (e.g. 'celestial', 'galaxy-wood')
 * @returns {typeof CELESTIAL_PRESET} The matching preset configuration (defaults to Celestial Kendama)
 */
export function getKendamaPreset(id = KENDAMA_PRESET_IDS.CELESTIAL) {
    if (typeof id === 'string') {
        const normalized = id.toLowerCase().trim();
        if (KENDAMA_PRESETS[normalized]) {
            return KENDAMA_PRESETS[normalized];
        }
    }
    return CELESTIAL_PRESET;
}

export default KENDAMA_PRESETS;
