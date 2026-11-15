/**
 * Celestial Kendama - Unit Tests for cup-preview.scene-asset.js (Tama Spike Placement)
 * Role: Person C (Visuals & Rendering)
 *
 * Verifies Spike Seating for Celestial Tama:
 * - Exactly one Tama mesh exists in the showroom asset (attached to centerModel)
 * - Inspection models (left and right) remain free of Tama instances
 * - Previous Big Cup seating position is no longer used
 * - Tama is centred on the Kendama spike axis (X = 0, Z = 0)
 * - Tama bore opening faces downward along -Y toward the spike
 * - The spike enters the bore by the calculated depth without passing through the ball
 * - Radial clearance is maintained throughout the entire inserted length (no wall collision)
 * - The Tama follows its parent assembly transforms rigidly
 * - Existing Kendama component geometry and material assignments remain unchanged
 */

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { Vector3, Mesh, Group } from 'three';
import {
    createKendamaAssemblyGroup,
    createBigCupPreviewAsset,
    applyPresetToPreviewRoot,
    PREVIEW_ASSEMBLY_NAMES,
    KEN_COMPONENT_MESH_NAMES,
} from './cup-preview.scene-asset.js';
import {
    cupConfigs,
    BALL_RADIUS,
    kenGeometry,
} from '../input/cupConfigs.js';
import {
    DEFAULT_SPIKE_BASE_Y,
    DEFAULT_SPIKE_TIP_Y,
    DEFAULT_SPIKE_LENGTH,
    DEFAULT_SPIKE_ROOT_RADIUS,
    DEFAULT_SPIKE_TIP_RADIUS,
} from '../render/KenGeometry.js';
import {
    DEFAULT_BORE_DEPTH,
    DEFAULT_BORE_MOUTH_RADIUS,
    DEFAULT_BORE_BEVEL_RADIUS,
    DEFAULT_BORE_APEX_RADIUS,
    DEFAULT_BORE_TIP_CLEARANCE,
} from '../render/TamaGeometry.js';
import {
    COMPONENT_MATERIAL_MAP,
    pearlWhiteMaterial,
    roseNebulaMaterial,
    lavenderMoonMaterial,
    moonPearlMaterial,
} from '../render/KenMaterials.js';
import {
    celestialTamaMaterial,
} from '../render/TamaMaterial.js';
import {
    KENDAMA_PRESET_IDS,
    KENDAMA_PRESETS,
    getKendamaPreset,
    CELESTIAL_PRESET,
    GALAXY_WOOD_PRESET,
    BUBBLEGUM_POP_PRESET,
    DARK_MATTER_PRESET,
    PORCELAIN_DREAMS_PRESET,
} from '../render/KendamaPresets.js';

describe('Showroom Asset & Assembly Tama Integration (Spike Seating)', () => {
    describe('Showroom Asset Registration & Singleton Tama', () => {
        it('creates exactly one Tama mesh in the active showroom preview asset', () => {
            const root = createBigCupPreviewAsset();
            assert.ok(root, 'createBigCupPreviewAsset() must return an Object3D group');

            const tamaMeshes = [];
            root.traverse((child) => {
                if (child.isMesh && child.name === 'celestial-tama') {
                    tamaMeshes.push(child);
                }
            });

            assert.equal(
                tamaMeshes.length,
                1,
                `Showroom asset must contain exactly 1 Tama mesh (found: ${tamaMeshes.length})`
            );

            // Verify the single Tama mesh is attached to the center inspection model (upright Kendama)
            const centerModel = root.getObjectByName('big-cup-three-quarter');
            assert.ok(centerModel, 'Center model big-cup-three-quarter must exist');
            assert.equal(
                tamaMeshes[0].parent,
                centerModel,
                'The Tama mesh must be a direct child of the center Kendama assembly'
            );

            // Left and right inspection models must remain free of Tama instances
            const leftModel = root.getObjectByName('big-cup-cavity-view');
            const rightModel = root.getObjectByName('big-cup-profile-view');
            assert.equal(leftModel.getObjectByName('celestial-tama'), undefined);
            assert.equal(rightModel.getObjectByName('celestial-tama'), undefined);
        });

        it('assigns the approved Celestial Tama material to the seated ball', () => {
            const root = createBigCupPreviewAsset();
            const tama = root.getObjectByName('celestial-tama');
            assert.ok(tama instanceof Mesh, 'Tama must be an instance of Mesh');
            assert.equal(tama.material.name, 'mat-celestial-tama');
            assert.equal(typeof tama.material.onBeforeCompile, 'function');
        });
    });

    describe('Spike-Mounted Tama Seating & Geometric Alignment', () => {
        it('does not use the previous Big Cup seating position', () => {
            const assembly = createKendamaAssemblyGroup(COMPONENT_MATERIAL_MAP, { includeTama: true });
            const tama = assembly.getObjectByName('celestial-tama');
            assert.ok(tama, 'Assembly must contain celestial-tama when includeTama=true');

            // Previous Big Cup seated position: localPos + localNormal * seatOffset
            const bigCupConfig = cupConfigs.big;
            const seatOffset = Math.sqrt(BALL_RADIUS ** 2 - bigCupConfig.rimRadius ** 2);
            const bigCupSeatedPos = new Vector3()
                .copy(bigCupConfig.localPos)
                .addScaledVector(bigCupConfig.localNormal, seatOffset);

            const distanceToBigCup = tama.position.distanceTo(bigCupSeatedPos);
            assert.ok(
                distanceToBigCup > 0.05,
                `Tama must not be placed inside Big Cup (distance from old seat: ${(distanceToBigCup * 1000).toFixed(1)} mm)`
            );
        });

        it('centres the Tama on the spike central axis', () => {
            const assembly = createKendamaAssemblyGroup(COMPONENT_MATERIAL_MAP, { includeTama: true });
            const tama = assembly.getObjectByName('celestial-tama');
            const spikeConfig = cupConfigs.spike;

            assert.ok(
                Math.abs(tama.position.x - spikeConfig.localPos.x) < 1e-6,
                `Tama position.x (${tama.position.x}) must align with spike axis (${spikeConfig.localPos.x})`
            );
            assert.ok(
                Math.abs(tama.position.z - spikeConfig.localPos.z) < 1e-6,
                `Tama position.z (${tama.position.z}) must align with spike axis (${spikeConfig.localPos.z})`
            );
        });

        it('orients the Tama bore opening to face downward toward the spike', () => {
            const assembly = createKendamaAssemblyGroup(COMPONENT_MATERIAL_MAP, { includeTama: true });
            const tama = assembly.getObjectByName('celestial-tama');
            const spikeConfig = cupConfigs.spike;

            // In local Tama space, the bore opens along -Y: (0, -1, 0)
            const localBoreOpeningDir = new Vector3(0, -1, 0);

            // Transform bore opening direction into assembly space
            const assemblyBoreOpeningDir = localBoreOpeningDir.clone().applyQuaternion(tama.quaternion);

            // Desired direction: downward toward the spike along -spikeConfig.localNormal = (0, -1, 0)
            const expectedDir = new Vector3()
                .copy(spikeConfig.localNormal)
                .negate()
                .normalize();

            assert.ok(
                assemblyBoreOpeningDir.dot(expectedDir) > 0.999999,
                `Bore opening must point downward toward spike along -Y (dot product: ${assemblyBoreOpeningDir.dot(expectedDir)})`
            );
            assert.ok(
                Math.abs(assemblyBoreOpeningDir.x) < 1e-6,
                `Bore opening X (${assemblyBoreOpeningDir.x}) must be 0`
            );
            assert.ok(
                assemblyBoreOpeningDir.y < -0.999,
                `Bore opening Y (${assemblyBoreOpeningDir.y}) must be -1 (pointing down)`
            );
            assert.ok(
                Math.abs(assemblyBoreOpeningDir.z) < 1e-6,
                `Bore opening Z (${assemblyBoreOpeningDir.z}) must be 0`
            );
        });

        it('ensures the spike tip enters the bore by the calculated amount without piercing the ceiling', () => {
            const assembly = createKendamaAssemblyGroup(COMPONENT_MATERIAL_MAP, { includeTama: true });
            const tama = assembly.getObjectByName('celestial-tama');
            const spikeConfig = cupConfigs.spike;

            const spikeTipY = spikeConfig.localPos.y; // 0.0675 m
            const spikeBaseY = kenGeometry.spike.baseY; // 0.033 m
            const spikeLength = spikeTipY - spikeBaseY; // 0.0345 m

            // In local Tama space, bore apex ceiling is at y = -radius + boreDepth
            const localBoreApexY = -BALL_RADIUS + DEFAULT_BORE_DEPTH; // -0.045 + 0.038 = -0.007 m
            // In assembly space, bore ceiling elevation:
            const assemblyBoreApexY = tama.position.y + localBoreApexY;

            // Longitudinal clearance between spike tip and bore ceiling:
            const tipClearance = assemblyBoreApexY - spikeTipY;

            assert.ok(
                tipClearance > 0,
                `Spike tip must not pierce or pass through bore ceiling (clearance: ${(tipClearance * 1000).toFixed(2)} mm)`
            );
            assert.ok(
                Math.abs(tipClearance - DEFAULT_BORE_TIP_CLEARANCE) < 1e-4,
                `Tip clearance (${tipClearance} m) must match authoritative DEFAULT_BORE_TIP_CLEARANCE (${DEFAULT_BORE_TIP_CLEARANCE} m)`
            );

            // Calculate spike penetration into the bore past the outer bevel rim:
            const localBevelRimY = -Math.sqrt(Math.max(0, BALL_RADIUS ** 2 - DEFAULT_BORE_BEVEL_RADIUS ** 2));
            const assemblyBevelRimY = tama.position.y + localBevelRimY;
            const penetrationDepth = spikeTipY - assemblyBevelRimY;

            assert.ok(
                penetrationDepth > 0.030,
                `Spike must enter deeply into the bore (penetration: ${(penetrationDepth * 1000).toFixed(1)} mm)`
            );
            assert.ok(
                penetrationDepth < spikeLength,
                `Spike penetration must be less than total spike length (spike length: ${(spikeLength * 1000).toFixed(1)} mm)`
            );
        });

        it('guarantees radial clearance throughout the inserted portion of the spike', () => {
            const assembly = createKendamaAssemblyGroup(COMPONENT_MATERIAL_MAP, { includeTama: true });
            const tama = assembly.getObjectByName('celestial-tama');
            const spikeTipY = cupConfigs.spike.localPos.y; // 0.0675 m
            const spikeBaseY = kenGeometry.spike.baseY; // 0.033 m

            const localBoreApexY = -BALL_RADIUS + DEFAULT_BORE_DEPTH; // -0.0070 m
            const localBevelRimY = -Math.sqrt(Math.max(0, BALL_RADIUS ** 2 - DEFAULT_BORE_BEVEL_RADIUS ** 2)); // -0.0426 m
            const bevelDepth = DEFAULT_BORE_BEVEL_RADIUS - DEFAULT_BORE_MOUTH_RADIUS; // 0.0015 m
            const localMouthY = localBevelRimY + bevelDepth; // -0.0411 m

            const coneLength = (spikeTipY - spikeBaseY) - DEFAULT_SPIKE_TIP_RADIUS; // 0.03225 m

            // Helper to compute spike outer radius at assembly Y
            const getSpikeRadiusAtY = (y) => {
                const h = y - spikeBaseY;
                if (h <= 0) return DEFAULT_SPIKE_ROOT_RADIUS;
                if (h <= coneLength) {
                    const u = h / coneLength;
                    return DEFAULT_SPIKE_ROOT_RADIUS + (DEFAULT_SPIKE_TIP_RADIUS - DEFAULT_SPIKE_ROOT_RADIUS) * u;
                }
                const tipH = h - coneLength;
                if (tipH >= DEFAULT_SPIKE_TIP_RADIUS) return 0;
                return DEFAULT_SPIKE_TIP_RADIUS * Math.cos((tipH / DEFAULT_SPIKE_TIP_RADIUS) * (Math.PI * 0.5));
            };

            // Helper to compute bore inner radius at assembly Y
            const getBoreRadiusAtY = (y) => {
                const localY = y - tama.position.y;
                if (localY > localBoreApexY) return 0; // Solid material above apex
                if (localY >= localMouthY) {
                    const u = (localBoreApexY - localY) / (localBoreApexY - localMouthY);
                    return DEFAULT_BORE_APEX_RADIUS + (DEFAULT_BORE_MOUTH_RADIUS - DEFAULT_BORE_APEX_RADIUS) * u;
                }
                if (localY >= localBevelRimY) {
                    const u = (localMouthY - localY) / (localMouthY - localBevelRimY);
                    return DEFAULT_BORE_MOUTH_RADIUS + (DEFAULT_BORE_BEVEL_RADIUS - DEFAULT_BORE_MOUTH_RADIUS) * u;
                }
                return Math.sqrt(Math.max(0, BALL_RADIUS ** 2 - localY ** 2));
            };

            // Sample multiple points along the entire insertion depth
            const assemblyBevelRimY = tama.position.y + localBevelRimY;
            const sampleSteps = 20;
            for (let i = 0; i <= sampleSteps; i++) {
                const y = assemblyBevelRimY + (spikeTipY - assemblyBevelRimY) * (i / sampleSteps);
                const rBore = getBoreRadiusAtY(y);
                const rSpike = getSpikeRadiusAtY(y);
                const radialClearance = rBore - rSpike;

                assert.ok(
                    radialClearance > 0.002,
                    `Radial clearance at Y=${y.toFixed(4)} m must be positive and safe (clearance: ${(radialClearance * 1000).toFixed(2)} mm)`
                );
            }
        });
    });

    describe('Hierarchy & Transform Tracking', () => {
        it('follows the Kendama assembly root transforms rigidly', () => {
            const assembly = createKendamaAssemblyGroup(COMPONENT_MATERIAL_MAP, { includeTama: true });
            const tama = assembly.getObjectByName('celestial-tama');

            // Move and rotate the assembly root
            assembly.position.set(1.5, 2.0, -0.8);
            assembly.rotation.set(0.3, 0.5, 0.2);
            assembly.updateMatrixWorld(true);

            // Compute expected world position of Tama
            const localPos = tama.position.clone();
            const expectedWorldPos = localPos.applyMatrix4(assembly.matrixWorld);

            const actualWorldPos = new Vector3();
            tama.getWorldPosition(actualWorldPos);

            assert.ok(
                actualWorldPos.distanceTo(expectedWorldPos) < 1e-6,
                `Tama world position must follow assembly root matrix`
            );
        });
    });

    describe('Preservation of Kendama Geometry & Material Assignments', () => {
        it('preserves all 6 authoritative Kendama component materials and configurations', () => {
            const assembly = createKendamaAssemblyGroup(COMPONENT_MATERIAL_MAP, { includeTama: true });

            assert.equal(assembly.getObjectByName('sarado-crossbar').material, pearlWhiteMaterial);
            assert.equal(assembly.getObjectByName('big-cup-oozara').material, roseNebulaMaterial);
            assert.equal(assembly.getObjectByName('small-cup-kozara').material, lavenderMoonMaterial);
            assert.equal(assembly.getObjectByName('base-cup-chuzara').material, roseNebulaMaterial);
            assert.equal(assembly.getObjectByName('spike-kensaki').material, moonPearlMaterial);
            assert.equal(assembly.getObjectByName('handle-ken').material, moonPearlMaterial);
        });
    });

    describe('Runtime Kendama Preset Material Switching (applyPresetToPreviewRoot)', () => {
        const ALL_PRESET_IDS = [
            KENDAMA_PRESET_IDS.CELESTIAL,
            KENDAMA_PRESET_IDS.GALAXY_WOOD,
            KENDAMA_PRESET_IDS.BUBBLEGUM_POP,
            KENDAMA_PRESET_IDS.DARK_MATTER,
            KENDAMA_PRESET_IDS.PORCELAIN_DREAMS,
        ];

        describe('Preset Application Across All Five Presets', () => {
            for (const presetId of ALL_PRESET_IDS) {
                it(`applies preset "${presetId}" to an existing preview root by ID`, () => {
                    // Start with an opposite preset to ensure material references definitely change
                    const initialPresetId = presetId === KENDAMA_PRESET_IDS.CELESTIAL
                        ? KENDAMA_PRESET_IDS.GALAXY_WOOD
                        : KENDAMA_PRESET_IDS.CELESTIAL;
                    const previewRoot = createBigCupPreviewAsset({ preset: initialPresetId });
                    const targetPreset = getKendamaPreset(presetId);

                    const appliedPreset = applyPresetToPreviewRoot(previewRoot, presetId);

                    assert.equal(appliedPreset.id, targetPreset.id, 'Must return the resolved target preset');

                    // 1. Verify Center Model (big-cup-three-quarter)
                    const centerModel = previewRoot.getObjectByName('big-cup-three-quarter');
                    assert.ok(centerModel, 'Center model must exist');
                    for (const compName of KEN_COMPONENT_MESH_NAMES) {
                        const mesh = centerModel.getObjectByName(compName);
                        assert.ok(mesh instanceof Mesh, `${compName} must be a Mesh in center model`);
                        assert.equal(
                            mesh.material,
                            targetPreset.kenMaterials[compName],
                            `Center ${compName} material must match preset ${presetId}`
                        );
                    }
                    const centerTama = centerModel.getObjectByName('celestial-tama');
                    assert.ok(centerTama instanceof Mesh, 'Center model must have a seated Tama mesh');
                    assert.equal(
                        centerTama.material,
                        targetPreset.tamaMaterial,
                        `Center Tama material must match preset ${presetId}`
                    );

                    // 2. Verify Left Cavity Model (big-cup-cavity-view)
                    const leftModel = previewRoot.getObjectByName('big-cup-cavity-view');
                    assert.ok(leftModel, 'Left model must exist');
                    for (const compName of KEN_COMPONENT_MESH_NAMES) {
                        const mesh = leftModel.getObjectByName(compName);
                        assert.ok(mesh instanceof Mesh, `${compName} must be a Mesh in left model`);
                        assert.equal(
                            mesh.material,
                            targetPreset.kenMaterials[compName],
                            `Left ${compName} material must match preset ${presetId}`
                        );
                    }
                    assert.equal(leftModel.getObjectByName('celestial-tama'), undefined, 'Left model must not have a Tama');

                    // 3. Verify Right Profile Model (big-cup-profile-view)
                    const rightModel = previewRoot.getObjectByName('big-cup-profile-view');
                    assert.ok(rightModel, 'Right model must exist');
                    for (const compName of KEN_COMPONENT_MESH_NAMES) {
                        const mesh = rightModel.getObjectByName(compName);
                        assert.ok(mesh instanceof Mesh, `${compName} must be a Mesh in right model`);
                        assert.equal(
                            mesh.material,
                            targetPreset.kenMaterials[compName],
                            `Right ${compName} material must match preset ${presetId}`
                        );
                    }
                    assert.equal(rightModel.getObjectByName('celestial-tama'), undefined, 'Right model must not have a Tama');
                });
            }

            it('supports passing a valid preset object directly as input', () => {
                const previewRoot = createBigCupPreviewAsset({ preset: 'celestial' });
                const applied = applyPresetToPreviewRoot(previewRoot, GALAXY_WOOD_PRESET);

                assert.equal(applied, GALAXY_WOOD_PRESET);
                const centerModel = previewRoot.getObjectByName('big-cup-three-quarter');
                assert.equal(
                    centerModel.getObjectByName('big-cup-oozara').material,
                    GALAXY_WOOD_PRESET.kenMaterials['big-cup-oozara']
                );
                assert.equal(
                    centerModel.getObjectByName('celestial-tama').material,
                    GALAXY_WOOD_PRESET.tamaMaterial
                );
            });
        });

        describe('Repeated Sequential In-Place Switching Across All Five Presets', () => {
            it('switches through all five presets repeatedly without recreating meshes or leaking objects', () => {
                const previewRoot = createBigCupPreviewAsset({ preset: 'celestial' });

                // Snapshot original mesh objects and their geometries
                const originalMeshes = [];
                previewRoot.traverse((child) => {
                    if (child.isMesh) {
                        originalMeshes.push({
                            name: child.name,
                            mesh: child,
                            geometry: child.geometry,
                            parent: child.parent,
                            posX: child.position.x,
                            posY: child.position.y,
                            posZ: child.position.z,
                            rotX: child.rotation.x,
                            rotY: child.rotation.y,
                            rotZ: child.rotation.z,
                        });
                    }
                });

                // Exactly 19 meshes in showroom preview (6 Ken * 3 models + 1 Tama in center model)
                assert.equal(originalMeshes.length, 19, 'Must have exactly 19 meshes initially');

                const sequence = [
                    KENDAMA_PRESET_IDS.GALAXY_WOOD,
                    KENDAMA_PRESET_IDS.BUBBLEGUM_POP,
                    KENDAMA_PRESET_IDS.DARK_MATTER,
                    KENDAMA_PRESET_IDS.PORCELAIN_DREAMS,
                    KENDAMA_PRESET_IDS.CELESTIAL,
                    KENDAMA_PRESET_IDS.GALAXY_WOOD,
                    KENDAMA_PRESET_IDS.PORCELAIN_DREAMS,
                ];

                for (const presetId of sequence) {
                    const preset = getKendamaPreset(presetId);
                    const result = applyPresetToPreviewRoot(previewRoot, presetId);
                    assert.equal(result.id, presetId);

                    // Verify current mesh count is still exactly 19
                    const currentMeshes = [];
                    previewRoot.traverse((child) => {
                        if (child.isMesh) currentMeshes.push(child);
                    });
                    assert.equal(currentMeshes.length, 19, `Mesh count must remain 19 after switching to ${presetId}`);

                    // Verify exact mesh and geometry reference equality (zero allocations / zero recreation)
                    for (let i = 0; i < originalMeshes.length; i++) {
                        const orig = originalMeshes[i];
                        const curr = currentMeshes[i];

                        assert.equal(curr, orig.mesh, `Mesh reference for ${orig.name} must remain identical`);
                        assert.equal(curr.geometry, orig.geometry, `Geometry reference for ${orig.name} must remain identical`);
                        assert.equal(curr.parent, orig.parent, `Parent for ${orig.name} must remain identical`);
                        assert.equal(curr.position.x, orig.posX, `Position X for ${orig.name} must remain identical`);
                        assert.equal(curr.position.y, orig.posY, `Position Y for ${orig.name} must remain identical`);
                        assert.equal(curr.position.z, orig.posZ, `Position Z for ${orig.name} must remain identical`);

                        // Verify material assignment
                        if (curr.name === 'celestial-tama') {
                            assert.equal(curr.material, preset.tamaMaterial, `Tama must have ${presetId} material`);
                        } else {
                            assert.equal(curr.material, preset.kenMaterials[curr.name], `${curr.name} must have ${presetId} material`);
                        }
                    }

                    // Verify assembly group hierarchy and child counts
                    assert.equal(previewRoot.children.length, 3, 'Preview root must retain exactly 3 assembly children');
                    assert.equal(previewRoot.getObjectByName('big-cup-three-quarter').children.length, 7);
                    assert.equal(previewRoot.getObjectByName('big-cup-cavity-view').children.length, 6);
                    assert.equal(previewRoot.getObjectByName('big-cup-profile-view').children.length, 6);
                }
            });
        });

        describe('Invalid Input & Atomic Error Handling', () => {
            it('throws TypeError when previewRoot is null, undefined, or not a Three.js Object3D', () => {
                assert.throws(
                    () => applyPresetToPreviewRoot(null, 'galaxy-wood'),
                    { name: 'TypeError' }
                );
                assert.throws(
                    () => applyPresetToPreviewRoot(undefined, 'galaxy-wood'),
                    { name: 'TypeError' }
                );
                assert.throws(
                    () => applyPresetToPreviewRoot({}, 'galaxy-wood'),
                    { name: 'TypeError' }
                );
                assert.throws(
                    () => applyPresetToPreviewRoot('invalid-root', 'galaxy-wood'),
                    { name: 'TypeError' }
                );
            });

            it('falls back to Celestial preset when an unknown preset ID is supplied', () => {
                const previewRoot = createBigCupPreviewAsset({ preset: 'galaxy-wood' });
                const result = applyPresetToPreviewRoot(previewRoot, 'non-existent-neon-preset');

                assert.equal(result.id, CELESTIAL_PRESET.id, 'Must fall back to Celestial preset');
                const centerModel = previewRoot.getObjectByName('big-cup-three-quarter');
                assert.equal(
                    centerModel.getObjectByName('big-cup-oozara').material,
                    CELESTIAL_PRESET.kenMaterials['big-cup-oozara']
                );
                assert.equal(
                    centerModel.getObjectByName('celestial-tama').material,
                    CELESTIAL_PRESET.tamaMaterial
                );
            });

            it('fails atomically without modifying any materials if an expected assembly is missing', () => {
                const previewRoot = createBigCupPreviewAsset({ preset: 'celestial' });
                const leftModel = previewRoot.getObjectByName('big-cup-cavity-view');
                previewRoot.remove(leftModel);

                const centerCrossbar = previewRoot.getObjectByName('big-cup-three-quarter').getObjectByName('sarado-crossbar');
                const initialMaterial = centerCrossbar.material;

                assert.throws(
                    () => applyPresetToPreviewRoot(previewRoot, 'galaxy-wood'),
                    /Expected inspection assembly "big-cup-cavity-view" was not found in previewRoot/
                );

                // Material must NOT have changed (atomic validation)
                assert.equal(centerCrossbar.material, initialMaterial, 'Materials must not change when validation fails');
            });

            it('fails atomically without modifying any materials if a Ken component mesh is missing', () => {
                const previewRoot = createBigCupPreviewAsset({ preset: 'celestial' });
                const rightModel = previewRoot.getObjectByName('big-cup-profile-view');
                const handleMesh = rightModel.getObjectByName('handle-ken');
                rightModel.remove(handleMesh);

                const centerBigCup = previewRoot.getObjectByName('big-cup-three-quarter').getObjectByName('big-cup-oozara');
                const initialMaterial = centerBigCup.material;

                assert.throws(
                    () => applyPresetToPreviewRoot(previewRoot, 'galaxy-wood'),
                    /Required Ken component mesh "handle-ken" was not found in assembly "big-cup-profile-view"/
                );

                assert.equal(centerBigCup.material, initialMaterial, 'Materials must not change when validation fails');
            });

            it('fails atomically without modifying any materials if the Tama mesh is missing', () => {
                const previewRoot = createBigCupPreviewAsset({ preset: 'celestial' });
                const centerModel = previewRoot.getObjectByName('big-cup-three-quarter');
                const tamaMesh = centerModel.getObjectByName('celestial-tama');
                centerModel.remove(tamaMesh);

                const centerBigCup = centerModel.getObjectByName('big-cup-oozara');
                const initialMaterial = centerBigCup.material;

                assert.throws(
                    () => applyPresetToPreviewRoot(previewRoot, 'galaxy-wood'),
                    /Required Tama mesh \("celestial-tama"\) was not found in previewRoot/
                );

                assert.equal(centerBigCup.material, initialMaterial, 'Materials must not change when validation fails');
            });
        });
    });
});
