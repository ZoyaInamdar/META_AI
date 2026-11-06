/**
 * Celestial Kendama - In-Game Kendama Preset Selection System
 * Role: Person C (Visuals & Rendering)
 *
 * Implements the spatial UI controller for selecting among the five Kendama designs:
 * 1. Celestial Kendama ('celestial')
 * 2. Galaxy Wood ('galaxy-wood')
 * 3. Bubblegum Pop ('bubblegum-pop')
 * 4. Dark Matter ('dark-matter')
 * 5. Porcelain Dreams ('porcelain-dreams')
 *
 * Features:
 * - Collectible product-card selection interface with individual preview cards and prominent hero showcase.
 * - Robust binding to 'preset-selector' scene object with safe delayed-availability handling.
 * - Interactive click listeners on each preset card invoking CupInspectionSystem.selectPreset(presetId).
 * - Canonical synchronization with CupInspectionSystem.currentPresetId as single source of truth.
 * - Real-time hero showcase updates: large rendered Kendama preview, name, description, edition badge, and palette swatches.
 * - Visual card state toggling between primary (selected) and secondary (unselected) variants and badge visibility.
 * - Atomic failure protection: if selection fails or preview root is missing, active UI remains unchanged.
 */

import { createSystem } from '@iwsdk/core';
import { CupInspectionSystem } from './render/CupInspectionSystem.js';
import { KENDAMA_PRESET_IDS, getKendamaPreset } from './render/KendamaPresets.js';

/** Ordered list of canonical preset IDs supported by the selector UI. */
export const PRESET_SELECTOR_IDS = Object.freeze([
    KENDAMA_PRESET_IDS.CELESTIAL,
    KENDAMA_PRESET_IDS.GALAXY_WOOD,
    KENDAMA_PRESET_IDS.BUBBLEGUM_POP,
    KENDAMA_PRESET_IDS.DARK_MATTER,
    KENDAMA_PRESET_IDS.PORCELAIN_DREAMS,
]);

/** Edition badge labels for the 5 collectible presets. */
export const PRESET_EDITION_TAGS = Object.freeze({
    [KENDAMA_PRESET_IDS.CELESTIAL]: 'COLLECTIBLE EDITIONS - 01/05',
    [KENDAMA_PRESET_IDS.GALAXY_WOOD]: 'COLLECTIBLE EDITIONS - 02/05',
    [KENDAMA_PRESET_IDS.BUBBLEGUM_POP]: 'COLLECTIBLE EDITIONS - 03/05',
    [KENDAMA_PRESET_IDS.DARK_MATTER]: 'COLLECTIBLE EDITIONS - 04/05',
    [KENDAMA_PRESET_IDS.PORCELAIN_DREAMS]: 'COLLECTIBLE EDITIONS - 05/05',
});

/** Representative 3-color palette swatches for the hero showcase. */
export const PRESET_HERO_SWATCHES = Object.freeze({
    [KENDAMA_PRESET_IDS.CELESTIAL]: ['#efb9d5', '#786a9e', '#344f91'],
    [KENDAMA_PRESET_IDS.GALAXY_WOOD]: ['#441e15', '#f5b82e', '#e88724'],
    [KENDAMA_PRESET_IDS.BUBBLEGUM_POP]: ['#f23891', '#7436c8', '#ffd447'],
    [KENDAMA_PRESET_IDS.DARK_MATTER]: ['#1a1a22', '#ff1e8a', '#5e5b6e'],
    [KENDAMA_PRESET_IDS.PORCELAIN_DREAMS]: ['#f5f0e5', '#174a9c', '#245eb8'],
});

export class PresetSelectorSystem extends createSystem({}) {
    /** @type {string | null} */
    activePresetId = null;

    /** @type {any} */
    panelObject = null;

    /** @type {Map<string, { button: any, indicator: any, onClick: Function }>} */
    presetElements = new Map();

    /** @type {any} */
    heroContainer = null;

    /** @type {any} */
    heroImg = null;

    /** @type {any} */
    heroTitle = null;

    /** @type {any} */
    heroDesc = null;

    /** @type {any} */
    heroTag = null;

    /** @type {any[]} */
    heroDots = [];

    /** @type {boolean} */
    isInitialized = false;

    init() {
        this.activePresetId = null;
        this.presetElements.clear();
        this.heroContainer = null;
        this.heroImg = null;
        this.heroTitle = null;
        this.heroDesc = null;
        this.heroTag = null;
        this.heroDots = [];
        this.isInitialized = false;

        this.bindPanel();
    }

    /**
     * Attempts to find and bind to the preset selector panel document.
     * Supports both collectible product cards ('preset-card-*' / 'badge-*')
     * and fallback row buttons ('preset-btn-*' / 'indicator-*').
     * Safe to invoke multiple times if the scene object becomes available after init.
     * @returns {boolean} True if successfully bound.
     */
    bindPanel() {
        if (this.isInitialized) {
            return true;
        }

        const panel = this.world?.getSceneObject?.('preset-selector');
        if (!panel) {
            return false;
        }

        this.panelObject = panel;

        for (const presetId of PRESET_SELECTOR_IDS) {
            const button = panel.getElementById?.(`preset-card-${presetId}`) ||
                           panel.getElementById?.(`preset-btn-${presetId}`);
            const indicator = panel.getElementById?.(`badge-${presetId}`) ||
                              panel.getElementById?.(`indicator-${presetId}`);

            if (button) {
                const onClick = () => this.handlePresetClick(presetId);
                button.addEventListener?.('click', onClick);

                this.presetElements.set(presetId, { button, indicator, onClick });

                if (Array.isArray(this.cleanupFuncs)) {
                    this.cleanupFuncs.push(() => {
                        button.removeEventListener?.('click', onClick);
                    });
                }
            }
        }

        // Cache hero showcase elements
        this.heroContainer = panel.getElementById?.('hero-container') ?? null;
        this.heroImg = panel.getElementById?.('hero-img') ?? null;
        this.heroTitle = panel.getElementById?.('hero-title') ?? null;
        this.heroDesc = panel.getElementById?.('hero-desc') ?? null;
        this.heroTag = panel.getElementById?.('hero-tag') ?? null;
        this.heroDots = [
            panel.getElementById?.('hero-dot-1'),
            panel.getElementById?.('hero-dot-2'),
            panel.getElementById?.('hero-dot-3'),
        ].filter(Boolean);

        this.isInitialized = true;

        // Synchronize initial active state with CupInspectionSystem
        const inspection = this.world?.getSystem?.(CupInspectionSystem);
        const initialPresetId = inspection?.currentPresetId ?? KENDAMA_PRESET_IDS.PORCELAIN_DREAMS;
        this.syncActiveState(initialPresetId);

        return true;
    }

    /**
     * Handles user interaction with a preset card or button.
     * Delegates to CupInspectionSystem.selectPreset(presetId) and synchronizes UI on success.
     * @param {string} presetId - The target preset ID.
     * @returns {boolean} True if preset was successfully applied.
     */
    handlePresetClick(presetId) {
        const inspection = this.world?.getSystem?.(CupInspectionSystem);
        if (!inspection) {
            console.warn('[PresetSelectorSystem] CupInspectionSystem not available in world.');
            return false;
        }

        const appliedPreset = inspection.selectPreset(presetId);
        if (appliedPreset) {
            this.syncActiveState(inspection.currentPresetId);
            return true;
        }

        console.warn(`[PresetSelectorSystem] selectPreset failed for "${presetId}". Active state preserved.`);
        return false;
    }

    /**
     * Synchronizes visual active state across all preset UI elements and the hero showcase.
     * Strictly reflects canonical activeId; deactivates all other cards.
     * @param {string} activeId - Canonical preset ID to set as active.
     */
    syncActiveState(activeId) {
        if (!activeId) {
            return;
        }

        this.activePresetId = activeId;

        // 1. Update individual product cards
        for (const [presetId, entry] of this.presetElements.entries()) {
            const isSelected = (presetId === activeId);

            if (entry.button?.setProperties) {
                entry.button.setProperties({
                    variant: isSelected ? 'primary' : 'secondary',
                    borderColor: isSelected ? '#4da6ff' : '#282b3a',
                    backgroundColor: isSelected ? '#1c2236' : '#15161f',
                });
            }

            if (entry.indicator?.setProperties) {
                entry.indicator.setProperties({
                    display: isSelected ? 'flex' : 'none',
                });
            }
        }

        // 2. Update prominent selected-design hero showcase area
        const preset = getKendamaPreset(activeId);
        if (preset) {
            if (this.heroImg?.setProperties) {
                this.heroImg.setProperties({
                    src: `textures/previews/${activeId}.png`,
                });
            }

            if (this.heroTitle?.setProperties) {
                this.heroTitle.setProperties({
                    text: preset.name,
                });
            }

            if (this.heroDesc?.setProperties) {
                this.heroDesc.setProperties({
                    text: preset.description,
                });
            }

            if (this.heroTag?.setProperties) {
                this.heroTag.setProperties({
                    text: PRESET_EDITION_TAGS[activeId] ?? 'COLLECTIBLE EDITIONS',
                });
            }

            const swatches = PRESET_HERO_SWATCHES[activeId];
            if (Array.isArray(swatches)) {
                this.heroDots.forEach((dot, idx) => {
                    if (dot?.setProperties && swatches[idx]) {
                        dot.setProperties({
                            backgroundColor: swatches[idx],
                        });
                    }
                });
            }
        }
    }

    /**
     * Per-frame update hook.
     * Handles delayed panel availability and canonical state synchronization.
     */
    update() {
        if (!this.isInitialized) {
            this.bindPanel();
            if (!this.isInitialized) {
                return;
            }
        }

        // Canonical state synchronization with CupInspectionSystem
        const inspection = this.world?.getSystem?.(CupInspectionSystem);
        if (inspection && inspection.currentPresetId && inspection.currentPresetId !== this.activePresetId) {
            this.syncActiveState(inspection.currentPresetId);
        }
    }

    /**
     * Cleanup and resource disposal.
     */
    destroy() {
        for (const [_, entry] of this.presetElements.entries()) {
            if (entry.button && entry.onClick) {
                entry.button.removeEventListener?.('click', entry.onClick);
            }
        }
        this.presetElements.clear();
        this.panelObject = null;
        this.heroContainer = null;
        this.heroImg = null;
        this.heroTitle = null;
        this.heroDesc = null;
        this.heroTag = null;
        this.heroDots = [];
        this.isInitialized = false;
        this.activePresetId = null;
    }
}

export default PresetSelectorSystem;
