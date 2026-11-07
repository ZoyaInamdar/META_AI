/**
 * Celestial Kendama - Unit Tests for CupInspectionSystem (Runtime Preset Switching)
 * Role: Person C (Visuals & Rendering)
 *
 * Verifies runtime integration of Kendama preset selection into CupInspectionSystem:
 * - Canonical active preset tracking (currentPresetId defaults to 'porcelain-dreams')
 * - Safe delayed scene availability handling
 * - Successful preset switching across all five designs
 * - Repeated switching without creating new meshes or geometries
 * - Atomic error handling when preview root is unavailable or malformed
 * - Non-interference with inspection rotations, auto-rotation, and view controls
 */

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { Vector3, Mesh, Group } from 'three';
import {
    CupInspectionSystem,
    DEFAULT_PRESET_ID,
} from './CupInspectionSystem.js';
import {
    createPorcelainDreamsPreviewAsset,
    createBigCupPreviewAsset,
    KEN_COMPONENT_MESH_NAMES,
} from '../scene-assets/cup-preview.scene-asset.js';
import {
    KENDAMA_PRESET_IDS,
    getKendamaPreset,
    CELESTIAL_PRESET,
    GALAXY_WOOD_PRESET,
    BUBBLEGUM_POP_PRESET,
    DARK_MATTER_PRESET,
    PORCELAIN_DREAMS_PRESET,
} from './KendamaPresets.js';

/**
 * Creates a mock IWSDK World for unit testing CupInspectionSystem.
 */
function createMockWorld(initialPreviewNode = null) {
    let previewNode = initialPreviewNode;
    return {
        getSceneObject: (name) => (name === 'cup-preview' ? previewNode : null),
        setCupPreview: (node) => { previewNode = node; },
        scene: {
            children: [],
            getObjectByName: () => null,
        },
        player: null,
        playerEntity: null,
        playerHeadEntity: null,
        input: null,
        camera: null,
        renderer: {
            xr: { getFrame: () => null },
        },
        visibilityState: null,
        globals: {},
    };
}

describe('CupInspectionSystem (Runtime Preset Selection)', () => {
    describe('A. Initial State & Delayed Scene Availability', () => {
        it('initializes currentPresetId to porcelain-dreams matching active scene', () => {
            const previewRoot = createPorcelainDreamsPreviewAsset();
            const world = createMockWorld(previewRoot);
            const system = new CupInspectionSystem(world);

            assert.equal(
                system.currentPresetId,
                DEFAULT_PRESET_ID,
                'Initial property value must be porcelain-dreams'
            );

            system.init();

            assert.equal(
                system.currentPresetId,
                'porcelain-dreams',
                'currentPresetId after init() must be porcelain-dreams'
            );
            assert.equal(system.cupPreviewNode, previewRoot);
        });

        it('handles delayed scene availability without throwing or crashing', () => {
            const world = createMockWorld(null); // Preview node not yet loaded
            const system = new CupInspectionSystem(world);

            // init() should not throw when cup-preview is missing
            assert.doesNotThrow(() => system.init());
            assert.equal(system.cupPreviewNode, null);
            assert.equal(system.currentPresetId, 'porcelain-dreams');

            // Scene loads later
            const previewRoot = createPorcelainDreamsPreviewAsset();
            world.setCupPreview(previewRoot);

            // update() lazily acquires the preview node
            system.update(0.016);
            assert.equal(system.cupPreviewNode, previewRoot);
            assert.equal(system.currentPresetId, 'porcelain-dreams');
        });
    });

    describe('B. Successful Selection Across All Five Presets', () => {
        const ALL_PRESET_IDS = [
            KENDAMA_PRESET_IDS.CELESTIAL,
            KENDAMA_PRESET_IDS.GALAXY_WOOD,
            KENDAMA_PRESET_IDS.BUBBLEGUM_POP,
            KENDAMA_PRESET_IDS.DARK_MATTER,
            KENDAMA_PRESET_IDS.PORCELAIN_DREAMS,
        ];

        for (const presetId of ALL_PRESET_IDS) {
            it(`selects and applies preset "${presetId}" updating currentPresetId`, () => {
                const previewRoot = createPorcelainDreamsPreviewAsset();
                const world = createMockWorld(previewRoot);
                const system = new CupInspectionSystem(world);
                system.init();

                const targetPreset = getKendamaPreset(presetId);
                const applied = system.selectPreset(presetId);

                assert.equal(applied.id, presetId, 'selectPreset must return the applied preset');
                assert.equal(system.currentPresetId, presetId, 'currentPresetId must update to target preset ID');

                // Verify preview root instance was preserved
                assert.equal(system.cupPreviewNode, previewRoot, 'Preview root must be preserved in place');

                // Verify Ken component materials across center assembly
                const centerModel = previewRoot.getObjectByName('big-cup-three-quarter');
                assert.ok(centerModel, 'Center model must exist');
                for (const compName of KEN_COMPONENT_MESH_NAMES) {
                    const mesh = centerModel.getObjectByName(compName);
                    assert.equal(
                        mesh.material,
                        targetPreset.kenMaterials[compName],
                        `Center ${compName} material must match ${presetId}`
                    );
                }

                // Verify Tama material
                const centerTama = centerModel.getObjectByName('celestial-tama');
                assert.equal(
                    centerTama.material,
                    targetPreset.tamaMaterial,
                    `Center Tama material must match ${presetId}`
                );
            });
        }

        it('supports passing a preset object directly to selectPreset', () => {
            const previewRoot = createPorcelainDreamsPreviewAsset();
            const world = createMockWorld(previewRoot);
            const system = new CupInspectionSystem(world);
            system.init();

            const applied = system.selectPreset(GALAXY_WOOD_PRESET);

            assert.equal(applied, GALAXY_WOOD_PRESET);
            assert.equal(system.currentPresetId, 'galaxy-wood');

            const centerModel = previewRoot.getObjectByName('big-cup-three-quarter');
            assert.equal(
                centerModel.getObjectByName('big-cup-oozara').material,
                GALAXY_WOOD_PRESET.kenMaterials['big-cup-oozara']
            );
        });
    });

    describe('C. Repeated In-Place Switching & Resource Conservation', () => {
        it('switches repeatedly without creating new meshes or leaking objects', () => {
            const previewRoot = createPorcelainDreamsPreviewAsset();
            const world = createMockWorld(previewRoot);
            const system = new CupInspectionSystem(world);
            system.init();

            // Snapshot all meshes and geometries
            const initialMeshes = [];
            previewRoot.traverse((child) => {
                if (child.isMesh) {
                    initialMeshes.push({
                        mesh: child,
                        geometry: child.geometry,
                        name: child.name,
                    });
                }
            });
            assert.equal(initialMeshes.length, 19, 'Must start with exactly 19 meshes');

            const sequence = [
                KENDAMA_PRESET_IDS.GALAXY_WOOD,
                KENDAMA_PRESET_IDS.BUBBLEGUM_POP,
                KENDAMA_PRESET_IDS.DARK_MATTER,
                KENDAMA_PRESET_IDS.PORCELAIN_DREAMS,
                KENDAMA_PRESET_IDS.CELESTIAL,
                KENDAMA_PRESET_IDS.GALAXY_WOOD,
            ];

            for (const presetId of sequence) {
                system.selectPreset(presetId);
                assert.equal(system.currentPresetId, presetId);

                // Verify mesh count remains strictly 19
                const currentMeshes = [];
                previewRoot.traverse((child) => {
                    if (child.isMesh) currentMeshes.push(child);
                });
                assert.equal(currentMeshes.length, 19, 'Mesh count must remain 19');

                // Verify exact mesh and geometry reference equality
                for (let i = 0; i < initialMeshes.length; i++) {
                    assert.equal(
                        currentMeshes[i],
                        initialMeshes[i].mesh,
                        `Mesh reference ${initialMeshes[i].name} must be identical`
                    );
                    assert.equal(
                        currentMeshes[i].geometry,
                        initialMeshes[i].geometry,
                        `Geometry reference ${initialMeshes[i].name} must be identical`
                    );
                }

                // Verify assembly child counts
                assert.equal(previewRoot.children.length, 3, 'Preview root must retain 3 assemblies');
            }
        });
    });

    describe('D. Error Handling & Safety', () => {
        it('handles safely when preview root is unavailable and preserves currentPresetId', () => {
            const world = createMockWorld(null);
            const system = new CupInspectionSystem(world);
            system.init();

            assert.equal(system.currentPresetId, 'porcelain-dreams');

            const result = system.selectPreset('galaxy-wood');

            assert.equal(result, null, 'Must return null when preview node is unavailable');
            assert.equal(system.currentPresetId, 'porcelain-dreams', 'currentPresetId must remain unchanged');
        });

        it('falls back to Celestial when an unknown preset ID is supplied', () => {
            const previewRoot = createPorcelainDreamsPreviewAsset();
            const world = createMockWorld(previewRoot);
            const system = new CupInspectionSystem(world);
            system.init();

            const result = system.selectPreset('unknown-neon-kendama');

            assert.equal(result.id, 'celestial', 'Must fall back to Celestial');
            assert.equal(system.currentPresetId, 'celestial', 'currentPresetId must update to celestial');

            const centerModel = previewRoot.getObjectByName('big-cup-three-quarter');
            assert.equal(
                centerModel.getObjectByName('big-cup-oozara').material,
                CELESTIAL_PRESET.kenMaterials['big-cup-oozara']
            );
        });

        it('preserves currentPresetId when applicator throws on malformed preview root', () => {
            const previewRoot = createPorcelainDreamsPreviewAsset();
            // Corrupt the preview by removing an expected assembly
            const cavityView = previewRoot.getObjectByName('big-cup-cavity-view');
            previewRoot.remove(cavityView);

            const world = createMockWorld(previewRoot);
            const system = new CupInspectionSystem(world);
            system.init();

            assert.equal(system.currentPresetId, 'porcelain-dreams');

            assert.throws(
                () => system.selectPreset('galaxy-wood'),
                /Expected inspection assembly "big-cup-cavity-view" was not found/
            );

            // Must NOT have changed currentPresetId since application failed
            assert.equal(
                system.currentPresetId,
                'porcelain-dreams',
                'currentPresetId must remain porcelain-dreams after failed application'
            );
        });
    });

    describe('E. Preservation of Inspection Views & Turntable Rotation', () => {
        it('preserves existing turntable auto-rotation logic', () => {
            const previewRoot = createPorcelainDreamsPreviewAsset();
            const world = createMockWorld(previewRoot);
            const system = new CupInspectionSystem(world);
            system.init();

            assert.equal(system.autoRotate, true);
            previewRoot.rotation.y = 0;

            // update with delta increments rotation
            system.update(1.0);
            assert.ok(previewRoot.rotation.y > 0, 'Turntable must rotate during update');
        });

        it('preserves numeric keyboard inspection angle presets', () => {
            const previewRoot = createPorcelainDreamsPreviewAsset();
            const world = createMockWorld(previewRoot);
            const system = new CupInspectionSystem(world);
            system.init();

            // Simulate pressing '2' for 90 degree side view
            system.handleKeyDown({ code: 'Digit2' });
            assert.equal(system.autoRotate, false, 'Numeric preset must stop auto-rotate');
            assert.equal(previewRoot.rotation.y, Math.PI * 0.5, 'Must rotate to 90 degrees');

            // Simulate pressing 'Space' to re-enable auto-rotate
            system.handleKeyDown({ code: 'Space' });
            assert.equal(system.autoRotate, true, 'Space must toggle auto-rotate');
        });

        it('does not reset preview rotation or auto-rotation when switching presets', () => {
            const previewRoot = createPorcelainDreamsPreviewAsset();
            const world = createMockWorld(previewRoot);
            const system = new CupInspectionSystem(world);
            system.init();

            // Set a custom inspection angle and pause auto-rotate
            system.handleKeyDown({ code: 'Digit3' });
            assert.equal(previewRoot.rotation.y, Math.PI);
            assert.equal(system.autoRotate, false);

            // Switch preset
            system.selectPreset('dark-matter');

            // Verify rotation and auto-rotation state are 100% preserved
            assert.equal(previewRoot.rotation.y, Math.PI, 'Rotation must not reset upon preset selection');
            assert.equal(system.autoRotate, false, 'autoRotate state must not reset upon preset selection');
            assert.equal(system.currentPresetId, 'dark-matter');
        });
    });
});
