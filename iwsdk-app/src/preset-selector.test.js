/**
 * Celestial Kendama - Unit Tests for PresetSelectorSystem & Collectible Cards UI
 * Role: Person C (Visuals & Rendering)
 *
 * Verifies:
 * - Proper initialization and delayed panel availability handling
 * - Collectible product card binding ('preset-card-*' / 'badge-*') and fallback buttons ('preset-btn-*')
 * - Prominent Hero Showcase synchronization (title, description, image, tag, and swatch dots)
 * - Initial state synchronization with CupInspectionSystem.currentPresetId (defaulting to porcelain-dreams)
 * - Click handling and real-time hero showcase updates across all 5 presets:
 *   1. Celestial Kendama ('celestial')
 *   2. Galaxy Wood ('galaxy-wood')
 *   3. Bubblegum Pop ('bubblegum-pop')
 *   4. Dark Matter ('dark-matter')
 *   5. Porcelain Dreams ('porcelain-dreams')
 * - Visual active state toggling (primary variant + flex badge for active; secondary + none for inactive)
 * - Atomic failure protection (failed selections preserve both active card and hero showcase)
 * - External state synchronization during update()
 * - Clean teardown and event listener removal on destroy()
 */

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
    PresetSelectorSystem,
    PRESET_SELECTOR_IDS,
    PRESET_EDITION_TAGS,
    PRESET_HERO_SWATCHES,
} from './preset-selector.js';
import { CupInspectionSystem } from './render/CupInspectionSystem.js';
import { createPorcelainDreamsPreviewAsset } from './scene-assets/cup-preview.scene-asset.js';
import { KENDAMA_PRESET_IDS, getKendamaPreset } from './render/KendamaPresets.js';

/**
 * Creates a mock UIKit element with setProperties and event listener tracking.
 * @param {string} id - Element identifier.
 */
function createMockUIKitElement(id) {
    const listeners = new Map();
    let properties = {};

    return {
        id,
        properties,
        setProperties(newProps) {
            properties = { ...properties, ...newProps };
            this.properties = properties;
        },
        addEventListener(event, callback) {
            if (!listeners.has(event)) {
                listeners.set(event, []);
            }
            listeners.get(event).push(callback);
        },
        removeEventListener(event, callback) {
            const list = listeners.get(event);
            if (list) {
                const idx = list.indexOf(callback);
                if (idx !== -1) {
                    list.splice(idx, 1);
                }
            }
        },
        dispatchEvent(event) {
            const list = listeners.get(event);
            if (list) {
                for (const cb of [...list]) {
                    cb();
                }
            }
        },
        getListenerCount(event) {
            return listeners.get(event)?.length ?? 0;
        },
    };
}

/**
 * Creates a mock UIKit panel object with collectible cards, fallback buttons, and hero showcase.
 * @param {object} options
 * @param {boolean} [options.useLegacyButtons=false] - If true, only exposes preset-btn-* and indicator-*
 */
function createMockPresetPanel(options = {}) {
    const { useLegacyButtons = false } = options;
    const elements = new Map();

    for (const presetId of PRESET_SELECTOR_IDS) {
        if (!useLegacyButtons) {
            elements.set(`preset-card-${presetId}`, createMockUIKitElement(`preset-card-${presetId}`));
            elements.set(`badge-${presetId}`, createMockUIKitElement(`badge-${presetId}`));
        }
        elements.set(`preset-btn-${presetId}`, createMockUIKitElement(`preset-btn-${presetId}`));
        elements.set(`indicator-${presetId}`, createMockUIKitElement(`indicator-${presetId}`));
        elements.set(`thumb-${presetId}`, createMockUIKitElement(`thumb-${presetId}`));
    }

    // Hero Showcase elements
    elements.set('hero-container', createMockUIKitElement('hero-container'));
    elements.set('hero-img', createMockUIKitElement('hero-img'));
    elements.set('hero-title', createMockUIKitElement('hero-title'));
    elements.set('hero-desc', createMockUIKitElement('hero-desc'));
    elements.set('hero-tag', createMockUIKitElement('hero-tag'));
    elements.set('hero-dot-1', createMockUIKitElement('hero-dot-1'));
    elements.set('hero-dot-2', createMockUIKitElement('hero-dot-2'));
    elements.set('hero-dot-3', createMockUIKitElement('hero-dot-3'));

    return {
        name: 'preset-selector',
        getElementById(id) {
            return elements.get(id) ?? null;
        },
        getElement(id) {
            return elements.get(id);
        },
    };
}

/**
 * Creates a mock IWSDK World for testing PresetSelectorSystem alongside CupInspectionSystem.
 */
function createMockWorldWithSystems(options = {}) {
    const {
        previewRoot = createPorcelainDreamsPreviewAsset(),
        panel = createMockPresetPanel(),
    } = options;

    let currentPreview = previewRoot;
    let currentPanel = panel;

    const systems = new Map();

    const world = {
        getSceneObject(id) {
            if (id === 'cup-preview') return currentPreview;
            if (id === 'preset-selector') return currentPanel;
            return null;
        },
        setPreviewRoot(node) {
            currentPreview = node;
        },
        setPanel(panelNode) {
            currentPanel = panelNode;
        },
        getSystem(SystemClass) {
            return systems.get(SystemClass);
        },
        registerSystemInstance(SystemClass, instance) {
            systems.set(SystemClass, instance);
        },
    };

    const inspectionSystem = new CupInspectionSystem(world);
    inspectionSystem.init();
    world.registerSystemInstance(CupInspectionSystem, inspectionSystem);

    return { world, inspectionSystem, panel: currentPanel };
}

describe('PresetSelectorSystem & Collectible UI Showcase', () => {
    describe('A. Initialization & Initial Synchronization', () => {
        it('binds to collectible cards and initializes Hero Showcase with Porcelain Dreams preset', () => {
            const { world, inspectionSystem, panel } = createMockWorldWithSystems();
            const selectorSystem = new PresetSelectorSystem(world);
            selectorSystem.init();

            assert.equal(selectorSystem.isInitialized, true);
            assert.equal(selectorSystem.activePresetId, KENDAMA_PRESET_IDS.PORCELAIN_DREAMS);
            assert.equal(inspectionSystem.currentPresetId, KENDAMA_PRESET_IDS.PORCELAIN_DREAMS);

            // Porcelain Dreams card should have primary variant and display: flex badge
            const porcelainCard = panel.getElement('preset-card-porcelain-dreams');
            const porcelainBadge = panel.getElement('badge-porcelain-dreams');
            assert.equal(porcelainCard.properties.variant, 'primary');
            assert.equal(porcelainBadge.properties.display, 'flex');

            // Other 4 cards should have secondary variant and display: none badge
            const otherIds = [
                KENDAMA_PRESET_IDS.CELESTIAL,
                KENDAMA_PRESET_IDS.GALAXY_WOOD,
                KENDAMA_PRESET_IDS.BUBBLEGUM_POP,
                KENDAMA_PRESET_IDS.DARK_MATTER,
            ];

            for (const id of otherIds) {
                const card = panel.getElement(`preset-card-${id}`);
                const badge = panel.getElement(`badge-${id}`);
                assert.equal(card.properties.variant, 'secondary');
                assert.equal(badge.properties.display, 'none');
            }

            // Verify Hero Showcase matches Porcelain Dreams preset data
            const porcelainPreset = getKendamaPreset(KENDAMA_PRESET_IDS.PORCELAIN_DREAMS);
            const heroImg = panel.getElement('hero-img');
            const heroTitle = panel.getElement('hero-title');
            const heroDesc = panel.getElement('hero-desc');
            const heroTag = panel.getElement('hero-tag');

            assert.equal(heroImg.properties.src, 'textures/previews/porcelain-dreams.png');
            assert.equal(heroTitle.properties.text, porcelainPreset.name);
            assert.equal(heroDesc.properties.text, porcelainPreset.description);
            assert.equal(heroTag.properties.text, PRESET_EDITION_TAGS[KENDAMA_PRESET_IDS.PORCELAIN_DREAMS]);

            const heroDot1 = panel.getElement('hero-dot-1');
            const heroDot2 = panel.getElement('hero-dot-2');
            const heroDot3 = panel.getElement('hero-dot-3');
            const expectedSwatches = PRESET_HERO_SWATCHES[KENDAMA_PRESET_IDS.PORCELAIN_DREAMS];
            assert.equal(heroDot1.properties.backgroundColor, expectedSwatches[0]);
            assert.equal(heroDot2.properties.backgroundColor, expectedSwatches[1]);
            assert.equal(heroDot3.properties.backgroundColor, expectedSwatches[2]);
        });

        it('handles delayed panel availability gracefully and binds during update()', () => {
            const { world } = createMockWorldWithSystems({ panel: null });
            const selectorSystem = new PresetSelectorSystem(world);
            selectorSystem.init();

            assert.equal(selectorSystem.isInitialized, false);
            assert.equal(selectorSystem.activePresetId, null);

            // Now make the panel available in the scene
            const newPanel = createMockPresetPanel();
            world.setPanel(newPanel);

            // Trigger update frame
            selectorSystem.update();

            assert.equal(selectorSystem.isInitialized, true);
            assert.equal(selectorSystem.activePresetId, KENDAMA_PRESET_IDS.PORCELAIN_DREAMS);

            const porcelainCard = newPanel.getElement('preset-card-porcelain-dreams');
            assert.equal(porcelainCard.properties.variant, 'primary');

            const heroTitle = newPanel.getElement('hero-title');
            assert.equal(heroTitle.properties.text, 'Porcelain Dreams');
        });

        it('supports legacy fallback button IDs (preset-btn-* / indicator-*)', () => {
            const legacyPanel = createMockPresetPanel({ useLegacyButtons: true });
            const { world } = createMockWorldWithSystems({ panel: legacyPanel });
            const selectorSystem = new PresetSelectorSystem(world);
            selectorSystem.init();

            assert.equal(selectorSystem.isInitialized, true);
            const porcelainBtn = legacyPanel.getElement('preset-btn-porcelain-dreams');
            const porcelainInd = legacyPanel.getElement('indicator-porcelain-dreams');
            assert.equal(porcelainBtn.properties.variant, 'primary');
            assert.equal(porcelainInd.properties.display, 'flex');
        });
    });

    describe('B. Preset Selection & State Synchronization', () => {
        it('switches to celestial preset when celestial card is clicked, updating card and hero showcase', () => {
            const { world, inspectionSystem, panel } = createMockWorldWithSystems();
            const selectorSystem = new PresetSelectorSystem(world);
            selectorSystem.init();

            const celestialCard = panel.getElement('preset-card-celestial');
            const celestialBadge = panel.getElement('badge-celestial');
            const porcelainCard = panel.getElement('preset-card-porcelain-dreams');
            const porcelainBadge = panel.getElement('badge-porcelain-dreams');

            // Dispatch click event on celestial card
            celestialCard.dispatchEvent('click');

            // CupInspectionSystem should now be celestial
            assert.equal(inspectionSystem.currentPresetId, KENDAMA_PRESET_IDS.CELESTIAL);
            assert.equal(selectorSystem.activePresetId, KENDAMA_PRESET_IDS.CELESTIAL);

            // Celestial card should now be primary and badge flex
            assert.equal(celestialCard.properties.variant, 'primary');
            assert.equal(celestialBadge.properties.display, 'flex');

            // Porcelain Dreams should now be secondary and badge none
            assert.equal(porcelainCard.properties.variant, 'secondary');
            assert.equal(porcelainBadge.properties.display, 'none');

            // Hero showcase must update to Celestial Kendama
            const celestialPreset = getKendamaPreset(KENDAMA_PRESET_IDS.CELESTIAL);
            const heroImg = panel.getElement('hero-img');
            const heroTitle = panel.getElement('hero-title');
            const heroDesc = panel.getElement('hero-desc');
            const heroTag = panel.getElement('hero-tag');

            assert.equal(heroImg.properties.src, 'textures/previews/celestial.png');
            assert.equal(heroTitle.properties.text, celestialPreset.name);
            assert.equal(heroDesc.properties.text, celestialPreset.description);
            assert.equal(heroTag.properties.text, PRESET_EDITION_TAGS[KENDAMA_PRESET_IDS.CELESTIAL]);
        });

        it('switches through all five presets sequentially and correctly updates UI and hero showcase at each step', () => {
            const { world, inspectionSystem, panel } = createMockWorldWithSystems();
            const selectorSystem = new PresetSelectorSystem(world);
            selectorSystem.init();

            const sequence = [
                KENDAMA_PRESET_IDS.GALAXY_WOOD,
                KENDAMA_PRESET_IDS.DARK_MATTER,
                KENDAMA_PRESET_IDS.BUBBLEGUM_POP,
                KENDAMA_PRESET_IDS.CELESTIAL,
                KENDAMA_PRESET_IDS.PORCELAIN_DREAMS,
            ];

            for (const targetId of sequence) {
                const card = panel.getElement(`preset-card-${targetId}`);
                card.dispatchEvent('click');

                assert.equal(inspectionSystem.currentPresetId, targetId);
                assert.equal(selectorSystem.activePresetId, targetId);

                // Target card is active
                assert.equal(card.properties.variant, 'primary');
                assert.equal(panel.getElement(`badge-${targetId}`).properties.display, 'flex');

                // All other cards are inactive
                for (const otherId of PRESET_SELECTOR_IDS) {
                    if (otherId !== targetId) {
                        assert.equal(panel.getElement(`preset-card-${otherId}`).properties.variant, 'secondary');
                        assert.equal(panel.getElement(`badge-${otherId}`).properties.display, 'none');
                    }
                }

                // Hero Showcase matches target preset
                const preset = getKendamaPreset(targetId);
                assert.equal(panel.getElement('hero-img').properties.src, `textures/previews/${targetId}.png`);
                assert.equal(panel.getElement('hero-title').properties.text, preset.name);
                assert.equal(panel.getElement('hero-desc').properties.text, preset.description);
                assert.equal(panel.getElement('hero-tag').properties.text, PRESET_EDITION_TAGS[targetId]);
            }
        });

        it('synchronizes UI and hero showcase automatically when CupInspectionSystem.selectPreset is called externally', () => {
            const { world, inspectionSystem, panel } = createMockWorldWithSystems();
            const selectorSystem = new PresetSelectorSystem(world);
            selectorSystem.init();

            assert.equal(selectorSystem.activePresetId, KENDAMA_PRESET_IDS.PORCELAIN_DREAMS);

            // Externally select dark-matter
            inspectionSystem.selectPreset(KENDAMA_PRESET_IDS.DARK_MATTER);
            assert.equal(inspectionSystem.currentPresetId, KENDAMA_PRESET_IDS.DARK_MATTER);

            // Trigger update frame
            selectorSystem.update();

            // Selector UI should now be dark-matter
            assert.equal(selectorSystem.activePresetId, KENDAMA_PRESET_IDS.DARK_MATTER);
            assert.equal(panel.getElement('preset-card-dark-matter').properties.variant, 'primary');
            assert.equal(panel.getElement('badge-dark-matter').properties.display, 'flex');
            assert.equal(panel.getElement('preset-card-porcelain-dreams').properties.variant, 'secondary');
            assert.equal(panel.getElement('badge-porcelain-dreams').properties.display, 'none');

            // Hero showcase reflects dark-matter
            assert.equal(panel.getElement('hero-img').properties.src, 'textures/previews/dark-matter.png');
            assert.equal(panel.getElement('hero-title').properties.text, 'Dark Matter');
        });
    });

    describe('C. Failure Protection & Edge Cases', () => {
        it('preserves existing active UI state and hero showcase if selectPreset fails due to missing preview root', () => {
            const { world, inspectionSystem, panel } = createMockWorldWithSystems();
            const selectorSystem = new PresetSelectorSystem(world);
            selectorSystem.init();

            assert.equal(selectorSystem.activePresetId, KENDAMA_PRESET_IDS.PORCELAIN_DREAMS);

            // Remove preview root so selectPreset fails
            world.setPreviewRoot(null);
            inspectionSystem.cupPreviewNode = null;

            // Click galaxy-wood card
            const galaxyCard = panel.getElement('preset-card-galaxy-wood');
            galaxyCard.dispatchEvent('click');

            // Active preset must remain porcelain-dreams
            assert.equal(inspectionSystem.currentPresetId, KENDAMA_PRESET_IDS.PORCELAIN_DREAMS);
            assert.equal(selectorSystem.activePresetId, KENDAMA_PRESET_IDS.PORCELAIN_DREAMS);

            // Porcelain card still primary, galaxy still secondary
            assert.equal(panel.getElement('preset-card-porcelain-dreams').properties.variant, 'primary');
            assert.equal(panel.getElement('badge-porcelain-dreams').properties.display, 'flex');
            assert.equal(galaxyCard.properties.variant, 'secondary');
            assert.equal(panel.getElement('badge-galaxy-wood').properties.display, 'none');

            // Hero showcase remains Porcelain Dreams
            assert.equal(panel.getElement('hero-img').properties.src, 'textures/previews/porcelain-dreams.png');
            assert.equal(panel.getElement('hero-title').properties.text, 'Porcelain Dreams');
        });

        it('handles missing CupInspectionSystem gracefully when card is clicked', () => {
            const { world, panel } = createMockWorldWithSystems();
            // Remove CupInspectionSystem from world
            world.registerSystemInstance(CupInspectionSystem, null);

            const selectorSystem = new PresetSelectorSystem(world);
            selectorSystem.init();
            const celestialCard = panel.getElement('preset-card-celestial');

            // Should return false and not throw
            const result = selectorSystem.handlePresetClick(KENDAMA_PRESET_IDS.CELESTIAL);
            assert.equal(result, false);
        });

        it('removes click event listeners and clears state when destroy() is called', () => {
            const { world, panel } = createMockWorldWithSystems();
            const selectorSystem = new PresetSelectorSystem(world);
            selectorSystem.init();

            for (const id of PRESET_SELECTOR_IDS) {
                const card = panel.getElement(`preset-card-${id}`);
                assert.equal(card.getListenerCount('click'), 1);
            }

            selectorSystem.destroy();

            for (const id of PRESET_SELECTOR_IDS) {
                const card = panel.getElement(`preset-card-${id}`);
                assert.equal(card.getListenerCount('click'), 0);
            }

            assert.equal(selectorSystem.isInitialized, false);
            assert.equal(selectorSystem.activePresetId, null);
            assert.equal(selectorSystem.presetElements.size, 0);
            assert.equal(selectorSystem.heroContainer, null);
            assert.equal(selectorSystem.heroImg, null);
            assert.equal(selectorSystem.heroTitle, null);
        });
    });
});
