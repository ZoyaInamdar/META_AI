/**
 * Celestial Kendama - Unit Tests for CelestialEnvironment & Pastel Galaxy Foundation
 * Role: Person C (Visuals & Rendering)
 *
 * Verifies:
 * - Color conversion accuracy: hexToRgbaFloat and rgbaFloatToHex
 * - Exact palette fidelity for Soft Lavender (#C5B4E3), Blush Rose (#F5B7B1), and Dusty Periwinkle (#8B9DC3)
 * - Baseline SHOWROOM_ENVIRONMENT_CONFIG matches main.iwsdk.scene.json exact values
 * - GAMEPLAY_PASTEL_GALAXY_CONFIG preserves IBLGradient and material lighting
 * - Native gameplay scene file (public/scenes/gameplay.iwsdk.scene.json) schema and values
 * - Function applyEnvironmentConfig updates DomeGradient and IBLGradient reactively
 * - CelestialEnvironmentSystem lifecycle, default 'showroom' preservation, and mode switching
 */

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Group, Mesh } from 'three';
import {
    hexToRgbaFloat,
    rgbaFloatToHex,
    SHOWROOM_ENVIRONMENT_CONFIG,
    GAMEPLAY_PASTEL_GALAXY_CONFIG,
    applyEnvironmentConfig,
    readEnvironmentConfig,
    CelestialEnvironmentSystem,
} from './CelestialEnvironment.js';
import { DomeGradient, IBLGradient, LevelRoot } from '@iwsdk/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Creates a mock LevelRoot entity for testing environment applier and system.
 */
function createMockLevelRootEntity(initialConfig = SHOWROOM_ENVIRONMENT_CONFIG) {
    const components = new Set([LevelRoot, DomeGradient, IBLGradient]);

    const domeValues = {
        sky: new Float32Array(initialConfig.domeGradient.sky),
        equator: new Float32Array(initialConfig.domeGradient.equator),
        ground: new Float32Array(initialConfig.domeGradient.ground),
        elevationDeg: initialConfig.domeGradient.elevationDeg,
        azimuthDeg: initialConfig.domeGradient.azimuthDeg,
        dither: initialConfig.domeGradient.dither,
        intensity: initialConfig.domeGradient.intensity,
        _needsUpdate: false,
    };

    const iblValues = {
        sky: new Float32Array(initialConfig.iblGradient.sky),
        equator: new Float32Array(initialConfig.iblGradient.equator),
        ground: new Float32Array(initialConfig.iblGradient.ground),
        intensity: initialConfig.iblGradient.intensity,
        _needsUpdate: false,
    };

    return {
        hasComponent(comp) {
            return components.has(comp);
        },
        getVectorView(comp, prop) {
            if (comp === DomeGradient && domeValues[prop]) {
                return domeValues[prop];
            }
            if (comp === IBLGradient && iblValues[prop]) {
                return iblValues[prop];
            }
            return null;
        },
        getValue(comp, prop) {
            if (comp === DomeGradient) return domeValues[prop];
            if (comp === IBLGradient) return iblValues[prop];
            return undefined;
        },
        setValue(comp, prop, val) {
            if (comp === DomeGradient) domeValues[prop] = val;
            if (comp === IBLGradient) iblValues[prop] = val;
        },
    };
}

describe('CelestialEnvironment - Phase 1 Pastel Galaxy Foundation', () => {
    describe('A. Color Conversions & Palette Fidelity', () => {
        it('converts Soft Lavender #C5B4E3 to normalized RGBA float vector accurately', () => {
            const rgba = hexToRgbaFloat('#C5B4E3');
            assert.equal(rgba[0], 0.7725);
            assert.equal(rgba[1], 0.7059);
            assert.equal(rgba[2], 0.8902);
            assert.equal(rgba[3], 1.0);
            assert.equal(rgbaFloatToHex(rgba), '#C5B4E3');
        });

        it('converts Blush Rose #F5B7B1 to normalized RGBA float vector accurately', () => {
            const rgba = hexToRgbaFloat('#F5B7B1');
            assert.equal(rgba[0], 0.9608);
            assert.equal(rgba[1], 0.7176);
            assert.equal(rgba[2], 0.6941);
            assert.equal(rgba[3], 1.0);
            assert.equal(rgbaFloatToHex(rgba), '#F5B7B1');
        });

        it('converts Dusty Periwinkle #8B9DC3 to normalized RGBA float vector accurately', () => {
            const rgba = hexToRgbaFloat('#8B9DC3');
            assert.equal(rgba[0], 0.5451);
            assert.equal(rgba[1], 0.6157);
            assert.equal(rgba[2], 0.7647);
            assert.equal(rgba[3], 1.0);
            assert.equal(rgbaFloatToHex(rgba), '#8B9DC3');
        });

        it('throws an error when provided an invalid hex color string', () => {
            assert.throws(() => hexToRgbaFloat('xyz'), /Invalid hex color string/u);
            assert.throws(() => hexToRgbaFloat('#12345'), /Invalid hex color string/u);
        });
    });

    describe('B. Baseline Showroom Configuration & Active Scene Integrity', () => {
        it('verifies SHOWROOM_ENVIRONMENT_CONFIG matches main.iwsdk.scene.json exactly', () => {
            const scenePath = resolve(__dirname, '../../public/scenes/main.iwsdk.scene.json');
            const sceneJson = JSON.parse(readFileSync(scenePath, 'utf8'));

            const domeConfig = sceneJson.components['com.iwsdk.components.DomeGradient'];
            const iblConfig = sceneJson.components['com.iwsdk.components.IBLGradient'];

            assert.ok(domeConfig, 'main scene must contain DomeGradient component');
            assert.ok(iblConfig, 'main scene must contain IBLGradient component');

            // DomeGradient exact match
            assert.deepEqual(SHOWROOM_ENVIRONMENT_CONFIG.domeGradient.sky, domeConfig.sky);
            assert.deepEqual(SHOWROOM_ENVIRONMENT_CONFIG.domeGradient.equator, domeConfig.equator);
            assert.deepEqual(SHOWROOM_ENVIRONMENT_CONFIG.domeGradient.ground, domeConfig.ground);
            assert.equal(SHOWROOM_ENVIRONMENT_CONFIG.domeGradient.elevationDeg, domeConfig.elevationDeg);
            assert.equal(SHOWROOM_ENVIRONMENT_CONFIG.domeGradient.azimuthDeg, domeConfig.azimuthDeg);
            assert.equal(SHOWROOM_ENVIRONMENT_CONFIG.domeGradient.dither, domeConfig.dither);

            // IBLGradient exact match
            assert.deepEqual(SHOWROOM_ENVIRONMENT_CONFIG.iblGradient.sky, iblConfig.sky);
            assert.deepEqual(SHOWROOM_ENVIRONMENT_CONFIG.iblGradient.equator, iblConfig.equator);
            assert.deepEqual(SHOWROOM_ENVIRONMENT_CONFIG.iblGradient.ground, iblConfig.ground);
            assert.equal(SHOWROOM_ENVIRONMENT_CONFIG.iblGradient.intensity, iblConfig.intensity);
        });
    });

    describe('C. Gameplay Pastel Galaxy Configuration & Preservation of Lighting', () => {
        it('verifies GAMEPLAY_PASTEL_GALAXY_CONFIG conforms to the approved pastel palette specifications', () => {
            const { domeGradient } = GAMEPLAY_PASTEL_GALAXY_CONFIG;
            assert.equal(domeGradient.elevationDeg, 32);
            assert.equal(domeGradient.azimuthDeg, 0);
            assert.equal(domeGradient.dither, true);
            assert.equal(domeGradient.intensity, 1.0);

            // Hex reconstructions
            assert.equal(rgbaFloatToHex(domeGradient.sky), '#C5B4E3');
            assert.equal(rgbaFloatToHex(domeGradient.equator), '#F5B7B1');
            assert.equal(rgbaFloatToHex(domeGradient.ground), '#8B9DC3');
        });

        it('preserves showroom IBLGradient in gameplay environment to protect kendama material reflections', () => {
            assert.deepEqual(
                GAMEPLAY_PASTEL_GALAXY_CONFIG.iblGradient,
                SHOWROOM_ENVIRONMENT_CONFIG.iblGradient,
                'IBLGradient must be identical to showroom to preserve kendama reflections'
            );
        });
    });

    describe('D. Standalone Gameplay Scene Document (public/scenes/gameplay.iwsdk.scene.json)', () => {
        it('confirms gameplay.iwsdk.scene.json exists and is valid native IWSDK scene JSON', () => {
            const scenePath = resolve(__dirname, '../../public/scenes/gameplay.iwsdk.scene.json');
            assert.ok(existsSync(scenePath), 'gameplay.iwsdk.scene.json must exist in public/scenes/');

            const sceneJson = JSON.parse(readFileSync(scenePath, 'utf8'));
            assert.equal(sceneJson.version, 'iwsdk.scene.v1');
            assert.equal(sceneJson.units, 'meters');

            // Components
            const dome = sceneJson.components['com.iwsdk.components.DomeGradient'];
            assert.ok(dome, 'gameplay scene must contain com.iwsdk.components.DomeGradient');
            assert.equal(dome.elevationDeg, 32);
            assert.equal(dome.azimuthDeg, 0);
            assert.equal(dome.dither, true);
            assert.equal(dome.intensity, 1.0);
            assert.equal(rgbaFloatToHex(dome.sky), '#C5B4E3');
            assert.equal(rgbaFloatToHex(dome.equator), '#F5B7B1');
            assert.equal(rgbaFloatToHex(dome.ground), '#8B9DC3');

            // IBLGradient preserved
            const ibl = sceneJson.components['com.iwsdk.components.IBLGradient'];
            assert.ok(ibl, 'gameplay scene must contain com.iwsdk.components.IBLGradient');
            assert.equal(ibl.intensity, 0.2025);

            // Renderer environment preserved
            assert.equal(sceneJson.environment.toneMapping, 'aces');
            assert.equal(sceneJson.environment.exposure, 1.2);

            // Nodes include all 4 celestial layers
            const nodeIds = sceneJson.nodes.map((n) => n.id);
            assert.ok(nodeIds.includes('celestial-nebula'), 'must include celestial-nebula node');
            assert.ok(nodeIds.includes('celestial-starfield'), 'must include celestial-starfield node');
            assert.ok(nodeIds.includes('celestial-stardust'), 'must include celestial-stardust node');
            assert.ok(nodeIds.includes('celestial-landmarks'), 'must include celestial-landmarks node');
        });
    });

    describe('E. applyEnvironmentConfig & readEnvironmentConfig', () => {
        it('applies gameplay configuration to level root entity and updates properties', () => {
            const mockRoot = createMockLevelRootEntity(SHOWROOM_ENVIRONMENT_CONFIG);

            const initialRead = readEnvironmentConfig(mockRoot);
            assert.equal(initialRead.domeGradient.elevationDeg, 24);

            const result = applyEnvironmentConfig(mockRoot, GAMEPLAY_PASTEL_GALAXY_CONFIG);
            assert.equal(result, true);

            const updatedRead = readEnvironmentConfig(mockRoot);
            assert.equal(updatedRead.domeGradient.elevationDeg, 32);
            assert.equal(updatedRead.domeGradient.azimuthDeg, 0);
            assert.equal(rgbaFloatToHex(updatedRead.domeGradient.sky), '#C5B4E3');
            assert.equal(rgbaFloatToHex(updatedRead.domeGradient.equator), '#F5B7B1');
            assert.equal(rgbaFloatToHex(updatedRead.domeGradient.ground), '#8B9DC3');
            assert.equal(mockRoot.getValue(DomeGradient, '_needsUpdate'), true);
        });

        it('returns false gracefully when level root entity is null or missing', () => {
            assert.equal(applyEnvironmentConfig(null, GAMEPLAY_PASTEL_GALAXY_CONFIG), false);
            assert.equal(readEnvironmentConfig(null), null);
        });
    });

    describe('F. CelestialEnvironmentSystem Mode Switching & State Preservation', () => {
        it('initializes in showroom mode without altering the active showroom level root', () => {
            const mockRoot = createMockLevelRootEntity(SHOWROOM_ENVIRONMENT_CONFIG);
            const mockWorld = {
                activeLevel: { value: mockRoot },
            };

            const system = new CelestialEnvironmentSystem(mockWorld);
            system.init();

            assert.equal(system.getMode(), 'showroom');
            assert.equal(system.isInitialized, true);

            // Showroom dome elevation must still be 24 (unchanged)
            assert.equal(mockRoot.getValue(DomeGradient, 'elevationDeg'), 24);
        });

        it('switches between showroom and gameplay modes cleanly', () => {
            const mockRoot = createMockLevelRootEntity(SHOWROOM_ENVIRONMENT_CONFIG);
            const mockWorld = {
                activeLevel: { value: mockRoot },
            };

            const system = new CelestialEnvironmentSystem(mockWorld);
            system.init();

            // Switch to gameplay
            const success = system.setMode('gameplay');
            assert.equal(success, true);
            assert.equal(system.getMode(), 'gameplay');
            assert.equal(mockRoot.getValue(DomeGradient, 'elevationDeg'), 32);
            assert.equal(rgbaFloatToHex(mockRoot.getVectorView(DomeGradient, 'sky')), '#C5B4E3');

            // Switch back to showroom
            system.setMode('showroom');
            assert.equal(system.getMode(), 'showroom');
            assert.equal(mockRoot.getValue(DomeGradient, 'elevationDeg'), 24);
            assert.equal(mockRoot.getValue(DomeGradient, 'azimuthDeg'), -31);

            // Toggle mode
            const toggledMode = system.toggleMode();
            assert.equal(toggledMode, 'gameplay');
            assert.equal(system.getMode(), 'gameplay');
            assert.equal(mockRoot.getValue(DomeGradient, 'elevationDeg'), 32);
        });

        it('rejects invalid mode string with a warning and returns false', () => {
            const mockRoot = createMockLevelRootEntity(SHOWROOM_ENVIRONMENT_CONFIG);
            const mockWorld = { activeLevel: { value: mockRoot } };
            const system = new CelestialEnvironmentSystem(mockWorld);
            system.init();

            assert.equal(system.setMode('invalid-mode'), false);
            assert.equal(system.getMode(), 'showroom');
        });

        it('cleans up state and resets to showroom mode on destroy()', () => {
            const mockRoot = createMockLevelRootEntity(SHOWROOM_ENVIRONMENT_CONFIG);
            const mockWorld = { activeLevel: { value: mockRoot } };
            const system = new CelestialEnvironmentSystem(mockWorld);
            system.init();

            system.setMode('gameplay');
            assert.equal(system.getMode(), 'gameplay');

            system.destroy();
            assert.equal(system.isInitialized, false);
            assert.equal(system.getMode(), 'showroom');
        });

        it('hides showroom studio floor in gameplay mode and restores it in showroom mode and destroy()', () => {
            const mockRoot = createMockLevelRootEntity(SHOWROOM_ENVIRONMENT_CONFIG);
            const mockFloor = { name: 'studio-floor', visible: true };
            const mockWorld = {
                activeLevel: { value: mockRoot },
                getSceneObject(name) {
                    if (name === 'studio-floor') return mockFloor;
                    return null;
                },
            };

            const system = new CelestialEnvironmentSystem(mockWorld);
            system.init();
            assert.equal(mockFloor.visible, true);

            // Gameplay hides studio floor
            system.setMode('gameplay');
            assert.equal(mockFloor.visible, false, 'studio-floor must be hidden in gameplay mode');

            // Showroom restores studio floor
            system.setMode('showroom');
            assert.equal(mockFloor.visible, true, 'studio-floor must be visible in showroom mode');

            // Gameplay again
            system.setMode('gameplay');
            assert.equal(mockFloor.visible, false);

            // Destroy restores studio floor
            system.destroy();
            assert.equal(mockFloor.visible, true, 'studio-floor must be restored on destroy()');
        });

        it('restores studio floor to its original false visibility state when initially hidden', () => {
            const mockRoot = createMockLevelRootEntity(SHOWROOM_ENVIRONMENT_CONFIG);
            const mockFloor = { name: 'studio-floor', visible: false };
            const mockWorld = {
                activeLevel: { value: mockRoot },
                getSceneObject(name) {
                    if (name === 'studio-floor') return mockFloor;
                    return null;
                },
            };

            const system = new CelestialEnvironmentSystem(mockWorld);
            system.init();

            // First transition to gameplay
            system.setMode('gameplay');
            assert.equal(mockFloor.visible, false);

            // Switch back to showroom: must restore to original false state, not force true
            system.setMode('showroom');
            assert.equal(mockFloor.visible, false, 'studio-floor must restore to original false visibility in showroom mode');

            // Switch to gameplay then destroy: must restore to original false state
            system.setMode('gameplay');
            system.destroy();
            assert.equal(mockFloor.visible, false, 'studio-floor must restore to original false visibility on destroy()');
        });

        it('activates celestial landmarks group in gameplay mode, hides in showroom mode, and disposes on destroy()', () => {
            const mockRoot = createMockLevelRootEntity(SHOWROOM_ENVIRONMENT_CONFIG);
            const mockLandmarks = { name: 'celestial-landmarks', visible: false, isMesh: false, children: [] };
            const mockWorld = {
                activeLevel: { value: mockRoot },
                getSceneObject(name) {
                    if (name === 'celestial-landmarks') return mockLandmarks;
                    return null;
                },
            };

            const system = new CelestialEnvironmentSystem(mockWorld);
            system.init();
            assert.equal(system.getLandmarksGroup(), null);

            // Switch to gameplay -> landmarks become visible
            system.setMode('gameplay');
            assert.equal(system.getLandmarksGroup(), mockLandmarks);
            assert.equal(mockLandmarks.visible, true);

            // Switch to showroom -> landmarks become hidden
            system.setMode('showroom');
            assert.equal(mockLandmarks.visible, false);

            // Toggle landmarks visibility independently
            system.setLandmarksVisible(true);
            assert.equal(mockLandmarks.visible, true);
            system.setLandmarksVisible(false);
            assert.equal(mockLandmarks.visible, false);

            // Destroy -> landmarks cleaned up
            system.destroy();
            assert.equal(system.getLandmarksGroup(), null);
        });
    });

    describe('G. Single Ownership, Baseline Preservation, and Kendama Isolation', () => {
        it('ensures single ownership of all four celestial components without duplicates', () => {
            const mockRoot = createMockLevelRootEntity(SHOWROOM_ENVIRONMENT_CONFIG);
            const sceneGroup = new Group();
            const mockWorld = {
                activeLevel: { value: mockRoot },
                scene: sceneGroup,
            };

            const system = new CelestialEnvironmentSystem(mockWorld);
            system.init();

            // Repeated transitions to gameplay
            system.setMode('gameplay');
            system.setMode('gameplay');
            system.setMode('gameplay');

            // All four celestial components must be attached to sceneGroup exactly once
            const nebulae = sceneGroup.children.filter((c) => c.name === 'celestial-nebula-shell' || c.name === 'celestial-nebula');
            const starfields = sceneGroup.children.filter((c) => c.name === 'celestial-starfield');
            const stardusts = sceneGroup.children.filter((c) => c.name === 'celestial-stardust');
            const landmarks = sceneGroup.children.filter((c) => c.name === 'celestial-landmarks');

            assert.equal(nebulae.length, 1, 'Exactly one nebula mesh attached');
            assert.equal(starfields.length, 1, 'Exactly one starfield points attached');
            assert.equal(stardusts.length, 1, 'Exactly one stardust points attached');
            assert.equal(landmarks.length, 1, 'Exactly one landmarks group attached');

            system.destroy();
        });

        it('hides celestial objects without disposing them in showroom mode, and reuses them on return to gameplay', () => {
            const mockRoot = createMockLevelRootEntity(SHOWROOM_ENVIRONMENT_CONFIG);
            const sceneGroup = new Group();
            const mockWorld = {
                activeLevel: { value: mockRoot },
                scene: sceneGroup,
            };

            const system = new CelestialEnvironmentSystem(mockWorld);
            system.init();

            system.setMode('gameplay');
            const nebula = system.getNebulaMesh();
            const starfield = system.getStarfieldMesh();
            const stardust = system.getStardustMesh();
            const landmarks = system.getLandmarksGroup();

            assert.equal(nebula.visible, true);
            assert.equal(starfield.visible, true);
            assert.equal(stardust.visible, true);
            assert.equal(landmarks.visible, true);

            // Switch to showroom: must hide without disposing
            system.setMode('showroom');
            assert.equal(nebula.visible, false);
            assert.equal(starfield.visible, false);
            assert.equal(stardust.visible, false);
            assert.equal(landmarks.visible, false);
            assert.ok(nebula.geometry, 'nebula geometry must not be disposed or cleared');
            assert.ok(nebula.material, 'nebula material must not be disposed or cleared');

            // Return to gameplay: must reuse identical instances
            system.setMode('gameplay');
            assert.equal(system.getNebulaMesh(), nebula, 'Must reuse identical nebula instance');
            assert.equal(system.getStarfieldMesh(), starfield, 'Must reuse identical starfield instance');
            assert.equal(system.getStardustMesh(), stardust, 'Must reuse identical stardust instance');
            assert.equal(system.getLandmarksGroup(), landmarks, 'Must reuse identical landmarks instance');
            assert.equal(nebula.visible, true);
            assert.equal(starfield.visible, true);
            assert.equal(stardust.visible, true);
            assert.equal(landmarks.visible, true);

            system.destroy();
        });

        it('preserves authored visibility baseline across repeated mode transitions', () => {
            const mockRoot = createMockLevelRootEntity(SHOWROOM_ENVIRONMENT_CONFIG);
            const sceneGroup = new Group();

            // Showroom nodes
            const studioFloor = new Group(); studioFloor.name = 'studio-floor'; studioFloor.visible = true;
            const stage = new Group(); stage.name = 'stage'; stage.visible = true;
            const grabPlinth = new Group(); grabPlinth.name = 'grab-plinth'; grabPlinth.visible = true;
            const spinPlinth = new Group(); spinPlinth.name = 'spin-plinth'; spinPlinth.visible = false; // Authored as hidden!
            const welcomePanel = new Group(); welcomePanel.name = 'welcome-panel'; welcomePanel.visible = true;

            // Select plinth hierarchy
            const selectPlinth = new Group(); selectPlinth.name = 'select-plinth'; selectPlinth.visible = true;
            const pillar = new Mesh(); pillar.name = 'plinth-pillar'; pillar.visible = true;
            const plinthContact = new Group(); plinthContact.name = 'select-plinth-contact'; plinthContact.visible = true;
            const presetSelector = new Group(); presetSelector.name = 'preset-selector'; presetSelector.visible = true;

            // Kendama preview hierarchy
            const cupPreview = new Group(); cupPreview.name = 'cup-preview'; cupPreview.visible = true;
            const activeCenterKendama = new Group(); activeCenterKendama.name = 'big-cup-three-quarter'; activeCenterKendama.visible = true;
            const leftCavity = new Group(); leftCavity.name = 'big-cup-cavity-view'; leftCavity.visible = true;
            const rightProfile = new Group(); rightProfile.name = 'big-cup-profile-view'; rightProfile.visible = true;

            cupPreview.add(activeCenterKendama, leftCavity, rightProfile);
            selectPlinth.add(pillar, plinthContact, presetSelector, cupPreview);
            sceneGroup.add(studioFloor, stage, grabPlinth, spinPlinth, welcomePanel, selectPlinth);

            const mockWorld = {
                activeLevel: { value: mockRoot },
                scene: sceneGroup,
            };

            const system = new CelestialEnvironmentSystem(mockWorld);
            system.init();

            // Run alternating transitions: showroom -> gameplay -> showroom -> gameplay -> showroom
            for (let i = 0; i < 2; i++) {
                system.setMode('gameplay');

                // In gameplay:
                assert.equal(studioFloor.visible, false, 'studio-floor hidden');
                assert.equal(stage.visible, false, 'stage hidden');
                assert.equal(grabPlinth.visible, false, 'grab-plinth hidden');
                assert.equal(spinPlinth.visible, false, 'spin-plinth hidden');
                assert.equal(welcomePanel.visible, false, 'welcome-panel hidden');

                // Select plinth & Kendama:
                assert.equal(selectPlinth.visible, true, 'select-plinth must stay visible so cup-preview can render');
                assert.equal(pillar.visible, false, 'pedestal pillar hidden');
                assert.equal(plinthContact.visible, false, 'plinth contact hidden');
                assert.equal(presetSelector.visible, false, 'preset selector hidden');
                assert.equal(cupPreview.visible, true, 'cup-preview root visible');
                assert.equal(activeCenterKendama.visible, true, 'active kendama big-cup-three-quarter visible');
                assert.equal(leftCavity.visible, false, 'cavity view hidden');
                assert.equal(rightProfile.visible, false, 'profile view hidden');

                system.setMode('showroom');

                // In showroom:
                assert.equal(studioFloor.visible, true, 'studio-floor restored');
                assert.equal(stage.visible, true, 'stage restored');
                assert.equal(grabPlinth.visible, true, 'grab-plinth restored');
                assert.equal(spinPlinth.visible, false, 'spin-plinth restored to authored false, not true');
                assert.equal(welcomePanel.visible, true, 'welcome-panel restored');

                assert.equal(selectPlinth.visible, true, 'select-plinth restored');
                assert.equal(pillar.visible, true, 'pillar restored');
                assert.equal(plinthContact.visible, true, 'plinth contact restored');
                assert.equal(presetSelector.visible, true, 'preset selector restored');
                assert.equal(cupPreview.visible, true, 'cup-preview restored');
                assert.equal(activeCenterKendama.visible, true, 'active kendama restored');
                assert.equal(leftCavity.visible, true, 'cavity view restored');
                assert.equal(rightProfile.visible, true, 'profile view restored');
            }

            system.destroy();
        });

        it('handles late-loaded Kendama children during gameplay mode without corrupting baseline', () => {
            const mockRoot = createMockLevelRootEntity(SHOWROOM_ENVIRONMENT_CONFIG);
            const sceneGroup = new Group();
            const selectPlinth = new Group(); selectPlinth.name = 'select-plinth'; selectPlinth.visible = true;
            const cupPreview = new Group(); cupPreview.name = 'cup-preview'; cupPreview.visible = true;
            const activeCenter = new Group(); activeCenter.name = 'big-cup-three-quarter'; activeCenter.visible = true;
            cupPreview.add(activeCenter);
            selectPlinth.add(cupPreview);
            sceneGroup.add(selectPlinth);

            const mockWorld = {
                activeLevel: { value: mockRoot },
                scene: sceneGroup,
            };

            const system = new CelestialEnvironmentSystem(mockWorld);
            system.init();
            system.setMode('gameplay');

            // Simulate late-loaded inspection view attached after gameplay initialization
            const lateLoadedCavity = new Group();
            lateLoadedCavity.name = 'big-cup-cavity-view';
            lateLoadedCavity.visible = true; // Authored as visible in preview asset
            cupPreview.add(lateLoadedCavity);

            // Trigger childadded event on cupPreview
            cupPreview.dispatchEvent({ type: 'childadded', child: lateLoadedCavity });

            // Must be hidden for gameplay
            assert.equal(lateLoadedCavity.visible, false, 'Late loaded cavity view must be hidden in gameplay');

            // Switch to showroom: must be restored to its authored visible state
            system.setMode('showroom');
            assert.equal(lateLoadedCavity.visible, true, 'Late loaded cavity view must restore to authored true in showroom');

            system.destroy();
        });

        it('disposes only owned celestial resources and cleans up references on destroy()', () => {
            const mockRoot = createMockLevelRootEntity(SHOWROOM_ENVIRONMENT_CONFIG);
            const sceneGroup = new Group();
            const mockWorld = {
                activeLevel: { value: mockRoot },
                scene: sceneGroup,
            };

            const system = new CelestialEnvironmentSystem(mockWorld);
            system.init();
            system.setMode('gameplay');

            assert.equal(sceneGroup.children.length, 4, '4 celestial objects in scene');

            // Track disposal
            let nebulaGeomDisposed = false;
            let nebulaMatDisposed = false;
            const nebula = system.getNebulaMesh();
            const origGeomDispose = nebula.geometry.dispose.bind(nebula.geometry);
            const origMatDispose = nebula.material.dispose.bind(nebula.material);
            nebula.geometry.dispose = () => { nebulaGeomDisposed = true; origGeomDispose(); };
            nebula.material.dispose = () => { nebulaMatDisposed = true; origMatDispose(); };

            system.destroy();

            assert.equal(nebulaGeomDisposed, true, 'Nebula geometry disposed');
            assert.equal(nebulaMatDisposed, true, 'Nebula material disposed');
            assert.equal(system.getNebulaMesh(), null, 'Nebula reference nulled');
            assert.equal(system.getStarfieldMesh(), null, 'Starfield reference nulled');
            assert.equal(system.getStardustMesh(), null, 'Stardust reference nulled');
            assert.equal(system.getLandmarksGroup(), null, 'Landmarks reference nulled');
            assert.equal(sceneGroup.children.length, 0, 'All celestial objects detached from scene');
            assert.equal(system.visibilityBaseline.size, 0, 'Visibility baseline map cleared');
        });

        it('does not duplicate event listeners across repeated mode toggles', () => {
            const mockRoot = createMockLevelRootEntity(SHOWROOM_ENVIRONMENT_CONFIG);
            const sceneGroup = new Group();
            const selectPlinth = new Group(); selectPlinth.name = 'select-plinth'; selectPlinth.visible = true;
            const cupPreview = new Group(); cupPreview.name = 'cup-preview'; cupPreview.visible = true;
            selectPlinth.add(cupPreview);
            sceneGroup.add(selectPlinth);

            const mockWorld = {
                activeLevel: { value: mockRoot },
                scene: sceneGroup,
            };

            const system = new CelestialEnvironmentSystem(mockWorld);
            system.init();

            // Toggle 10 times
            for (let i = 0; i < 10; i++) {
                system.toggleMode();
            }

            // cleanupFuncs should have at most 2 callbacks (one for cupPreview, one for selectPlinth)
            assert.ok(system.cleanupFuncs.length <= 2, `cleanupFuncs has ${system.cleanupFuncs.length} entries, should not grow indefinitely`);

            system.destroy();
        });
    });
});
