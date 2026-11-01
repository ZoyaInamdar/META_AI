/**
 * Celestial Kendama - Unit Tests for KenMaterials.js
 * Role: Person C (Visuals & Rendering)
 */

import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MeshPhysicalMaterial, ShaderLib, Color } from 'three';
import {
    KEN_PALETTE,
    KEN_MATERIALS,
    COMPONENT_MATERIAL_MAP,
    moonPearlMaterial,
    roseNebulaMaterial,
    lavenderMoonMaterial,
    roseGoldMaterial,
    pearlWhiteMaterial,
    applyGalaxyShader,
    getKenMaterial,
} from './KenMaterials.js';
import {
    createKendamaAssemblyGroup,
    createBigCupPreviewAsset,
} from '../scene-assets/cup-preview.scene-asset.js';

describe('KenMaterials Module', () => {
    describe('Palette Definitions', () => {
        it('exports the authoritative five-color pastel galaxy palette', () => {
            assert.equal(KEN_PALETTE.MOON_PEARL.toUpperCase(), '#F7F0F5');
            assert.equal(KEN_PALETTE.ROSE_NEBULA.toUpperCase(), '#EFB9D5');
            assert.equal(KEN_PALETTE.LAVENDER_MOON.toUpperCase(), '#CDBBEA');
            assert.equal(KEN_PALETTE.ROSE_GOLD.toUpperCase(), '#DDAE9D');
            assert.equal(KEN_PALETTE.PEARL_WHITE.toUpperCase(), '#FFF9FC');
            assert.ok(Object.isFrozen(KEN_PALETTE), 'KEN_PALETTE must be frozen');
        });

        it('exports the Deep Galactic Blue palette entries for cosmic depth', () => {
            assert.equal(KEN_PALETTE.MIDNIGHT_COSMIC_BLUE.toUpperCase(), '#18264F');
            assert.equal(KEN_PALETTE.DEEP_NEBULA_BLUE.toUpperCase(), '#344B83');
            assert.equal(KEN_PALETTE.DUSTY_PERIWINKLE.toUpperCase(), '#7886C5');
        });
    });

    describe('Material Instance Integrity', () => {
        const materials = [
            { name: 'Moon Pearl', mat: moonPearlMaterial, expectedHex: 'f7f0f5', isMetal: false },
            { name: 'Rose Nebula', mat: roseNebulaMaterial, expectedHex: 'efb9d5', isMetal: false },
            { name: 'Lavender Moon', mat: lavenderMoonMaterial, expectedHex: 'cdbbea', isMetal: false },
            { name: 'Rose Gold', mat: roseGoldMaterial, expectedHex: 'ddae9d', isMetal: true },
            { name: 'Pearl White', mat: pearlWhiteMaterial, expectedHex: 'fff9fc', isMetal: false },
        ];

        for (const { name, mat, expectedHex, isMetal } of materials) {
            it(`verifies ${name} is a valid MeshPhysicalMaterial with correct color and PBR properties`, () => {
                assert.ok(mat instanceof MeshPhysicalMaterial, `${name} must be an instance of MeshPhysicalMaterial`);
                assert.equal(mat.color.getHexString().toLowerCase(), expectedHex);

                // Controlled roughness (satin-to-gloss, physically plausible)
                assert.ok(mat.roughness >= 0.15 && mat.roughness <= 0.45, `${name} roughness must be in satin/gloss range [0.15, 0.45]`);

                if (isMetal) {
                    assert.ok(mat.metalness >= 0.70 && mat.metalness <= 0.90, `${name} must have metallic metalness [0.70, 0.90]`);
                } else {
                    assert.ok(mat.metalness >= 0.0 && mat.metalness <= 0.10, `${name} must have dielectric metalness <= 0.10`);
                    // Pearlescent materials must have clearcoat glaze
                    assert.ok(mat.clearcoat >= 0.50 && mat.clearcoat <= 0.90, `${name} clearcoat must be in range [0.50, 0.90]`);
                    assert.ok(mat.clearcoatRoughness <= 0.25, `${name} clearcoatRoughness must be <= 0.25 for smooth glaze`);
                    // Sheen and iridescence for pearlescent reflection
                    assert.ok(mat.sheen >= 0.30, `${name} must feature sheen >= 0.30`);
                    assert.ok(mat.iridescence >= 0.25, `${name} must feature iridescence >= 0.25`);
                    assert.ok(mat.iridescenceIOR >= 1.25 && mat.iridescenceIOR <= 1.50, `${name} iridescenceIOR must resemble nacre [1.25, 1.50]`);
                }
            });
        }
    });

    describe('Galaxy Finish Shader Enhancement', () => {
        it('exports applyGalaxyShader function', () => {
            assert.equal(typeof applyGalaxyShader, 'function');
        });

        it('assigns unique customProgramCacheKey to each material', () => {
            const keys = new Set();
            for (const key of Object.keys(KEN_MATERIALS)) {
                const mat = KEN_MATERIALS[key];
                assert.equal(typeof mat.customProgramCacheKey, 'function');
                const cacheKey = mat.customProgramCacheKey();
                assert.ok(cacheKey.startsWith('ken-galaxy-'), `${mat.name} cacheKey must start with ken-galaxy-`);
                assert.ok(!keys.has(cacheKey), `Duplicate cache key found: ${cacheKey}`);
                keys.add(cacheKey);
            }
        });

        it('executes onBeforeCompile injecting procedural galaxy shader chunks without error', () => {
            const materials = [
                moonPearlMaterial,
                roseNebulaMaterial,
                lavenderMoonMaterial,
                roseGoldMaterial,
                pearlWhiteMaterial,
            ];

            for (const mat of materials) {
                assert.equal(typeof mat.onBeforeCompile, 'function', `${mat.name} must define onBeforeCompile`);

                const mockShader = {
                    vertexShader: ShaderLib.physical.vertexShader,
                    fragmentShader: ShaderLib.physical.fragmentShader,
                    uniforms: { ...ShaderLib.physical.uniforms },
                };

                // Compile mock shader
                assert.doesNotThrow(() => mat.onBeforeCompile(mockShader));

                // Verify vertex shader injects object-space position
                assert.ok(mockShader.vertexShader.includes('varying vec3 vGalaxyPos;'), `${mat.name} vertexShader must declare vGalaxyPos`);
                assert.ok(mockShader.vertexShader.includes('vGalaxyPos = position;'), `${mat.name} vertexShader must assign position to vGalaxyPos`);

                // Verify fragment shader injects domain-warping, harmonic FBM, and continuous 6-stop color ramp
                assert.ok(mockShader.fragmentShader.includes('kenWarp3D_A'), `${mat.name} fragmentShader must include kenWarp3D_A`);
                assert.ok(mockShader.fragmentShader.includes('kenWarp3D_B'), `${mat.name} fragmentShader must include kenWarp3D_B`);
                assert.ok(mockShader.fragmentShader.includes('kenDomainWarpFbm'), `${mat.name} fragmentShader must include kenDomainWarpFbm`);
                assert.ok(mockShader.fragmentShader.includes('kenGalaxyRamp'), `${mat.name} fragmentShader must include kenGalaxyRamp`);
                assert.ok(mockShader.fragmentShader.includes('kenGalaxyFbm'), `${mat.name} fragmentShader must include kenGalaxyFbm`);
                assert.ok(mockShader.fragmentShader.includes('kenCosmicBlue'), `${mat.name} fragmentShader must include kenCosmicBlue`);
            }
        });

        it('verifies domain-warped continuous 6-stop flow and component-specific balancing', () => {
            const roseShader = {
                vertexShader: ShaderLib.physical.vertexShader,
                fragmentShader: ShaderLib.physical.fragmentShader,
                uniforms: { ...ShaderLib.physical.uniforms },
            };
            roseNebulaMaterial.onBeforeCompile(roseShader);
            assert.ok(roseShader.fragmentShader.includes('kenDomainWarpFbm'), 'Rose Nebula must include kenDomainWarpFbm logic');
            assert.ok(roseShader.fragmentShader.includes('kenGalaxyRamp'), 'Rose Nebula must include kenGalaxyRamp 6-stop continuous flow');
            assert.ok(roseShader.fragmentShader.includes('galaxyFlowColor'), 'Rose Nebula must blend continuous galaxy flow');
            assert.ok(roseShader.fragmentShader.includes('0.48'), 'Rose Nebula must use configured nebulaWeight');

            const lavenderShader = {
                vertexShader: ShaderLib.physical.vertexShader,
                fragmentShader: ShaderLib.physical.fragmentShader,
                uniforms: { ...ShaderLib.physical.uniforms },
            };
            lavenderMoonMaterial.onBeforeCompile(lavenderShader);
            assert.ok(lavenderShader.fragmentShader.includes('kenDomainWarpFbm'), 'Lavender Moon must include kenDomainWarpFbm logic');
            assert.ok(lavenderShader.fragmentShader.includes('kenGalaxyRamp'), 'Lavender Moon must include kenGalaxyRamp logic');
            assert.ok(lavenderShader.fragmentShader.includes('0.12'), 'Lavender Moon must use configured tShift to restrain deep blues');
            assert.ok(lavenderShader.fragmentShader.includes('0.46'), 'Lavender Moon must use configured nebulaWeight');
        });

        it('gracefully handles invalid inputs in applyGalaxyShader without throwing', () => {
            // @ts-ignore
            assert.equal(applyGalaxyShader(null), null);
            // @ts-ignore
            assert.equal(applyGalaxyShader(undefined), undefined);
            const dummy = {};
            // @ts-ignore
            assert.equal(applyGalaxyShader(dummy), dummy);
        });
    });

    describe('KEN_MATERIALS Registry', () => {
        it('exports a frozen registry containing all 5 materials', () => {
            assert.ok(Object.isFrozen(KEN_MATERIALS), 'KEN_MATERIALS must be frozen');
            assert.equal(KEN_MATERIALS.MOON_PEARL, moonPearlMaterial);
            assert.equal(KEN_MATERIALS.ROSE_NEBULA, roseNebulaMaterial);
            assert.equal(KEN_MATERIALS.LAVENDER_MOON, lavenderMoonMaterial);
            assert.equal(KEN_MATERIALS.ROSE_GOLD, roseGoldMaterial);
            assert.equal(KEN_MATERIALS.PEARL_WHITE, pearlWhiteMaterial);
        });
    });

    describe('COMPONENT_MATERIAL_MAP Registry', () => {
        it('maps all 6 physical Kendama components to their intended materials', () => {
            assert.ok(Object.isFrozen(COMPONENT_MATERIAL_MAP), 'COMPONENT_MATERIAL_MAP must be frozen');
            assert.equal(COMPONENT_MATERIAL_MAP['sarado-crossbar'], pearlWhiteMaterial);
            assert.equal(COMPONENT_MATERIAL_MAP['big-cup-oozara'], roseNebulaMaterial);
            assert.equal(COMPONENT_MATERIAL_MAP['small-cup-kozara'], lavenderMoonMaterial);
            assert.equal(COMPONENT_MATERIAL_MAP['base-cup-chuzara'], roseNebulaMaterial);
            assert.equal(COMPONENT_MATERIAL_MAP['spike-kensaki'], moonPearlMaterial);
            assert.equal(COMPONENT_MATERIAL_MAP['handle-ken'], moonPearlMaterial);
        });
    });

    describe('getKenMaterial Function', () => {
        it('retrieves materials by palette key', () => {
            assert.equal(getKenMaterial('MOON_PEARL'), moonPearlMaterial);
            assert.equal(getKenMaterial('ROSE_NEBULA'), roseNebulaMaterial);
            assert.equal(getKenMaterial('LAVENDER_MOON'), lavenderMoonMaterial);
            assert.equal(getKenMaterial('ROSE_GOLD'), roseGoldMaterial);
            assert.equal(getKenMaterial('PEARL_WHITE'), pearlWhiteMaterial);
        });

        it('retrieves materials by component mesh name', () => {
            assert.equal(getKenMaterial('sarado-crossbar'), pearlWhiteMaterial);
            assert.equal(getKenMaterial('big-cup-oozara'), roseNebulaMaterial);
            assert.equal(getKenMaterial('small-cup-kozara'), lavenderMoonMaterial);
            assert.equal(getKenMaterial('base-cup-chuzara'), roseNebulaMaterial);
            assert.equal(getKenMaterial('spike-kensaki'), moonPearlMaterial);
            assert.equal(getKenMaterial('handle-ken'), moonPearlMaterial);
        });

        it('safely returns undefined for unknown keys or invalid inputs', () => {
            assert.equal(getKenMaterial('unknown-mesh'), undefined);
            // @ts-ignore
            assert.equal(getKenMaterial(null), undefined);
            // @ts-ignore
            assert.equal(getKenMaterial(123), undefined);
        });
    });

    describe('Assembly Material Application', () => {
        it('applies the softcore pastel galaxy materials to createKendamaAssemblyGroup() by default', () => {
            const assembly = createKendamaAssemblyGroup();
            assert.equal(assembly.children.length, 6);

            const crossbar = assembly.getObjectByName('sarado-crossbar');
            const bigCup = assembly.getObjectByName('big-cup-oozara');
            const smallCup = assembly.getObjectByName('small-cup-kozara');
            const baseCup = assembly.getObjectByName('base-cup-chuzara');
            const spike = assembly.getObjectByName('spike-kensaki');
            const handle = assembly.getObjectByName('handle-ken');

            assert.equal(crossbar.material, pearlWhiteMaterial, 'Crossbar must have Pearl White material');
            assert.equal(bigCup.material, roseNebulaMaterial, 'Big Cup must have Rose Nebula material');
            assert.equal(smallCup.material, lavenderMoonMaterial, 'Small Cup must have Lavender Moon material');
            assert.equal(baseCup.material, roseNebulaMaterial, 'Base Cup must have Rose Nebula material');
            assert.equal(spike.material, moonPearlMaterial, 'Spike must have Moon Pearl material');
            assert.equal(handle.material, moonPearlMaterial, 'Handle must have Moon Pearl material');
        });

        it('equips all 3 preview models in createBigCupPreviewAsset() with shared galaxy materials without duplicates', () => {
            const root = createBigCupPreviewAsset();
            const center = root.getObjectByName('big-cup-three-quarter');
            const left = root.getObjectByName('big-cup-cavity-view');
            const right = root.getObjectByName('big-cup-profile-view');

            assert.ok(center && left && right, 'All three preview models must exist');

            // Verify Big Cups share the same Rose Nebula instance
            assert.equal(center.getObjectByName('big-cup-oozara').material, roseNebulaMaterial);
            assert.equal(left.getObjectByName('big-cup-oozara').material, roseNebulaMaterial);
            assert.equal(right.getObjectByName('big-cup-oozara').material, roseNebulaMaterial);

            // Verify Small Cups share the same Lavender Moon instance
            assert.equal(center.getObjectByName('small-cup-kozara').material, lavenderMoonMaterial);
            assert.equal(left.getObjectByName('small-cup-kozara').material, lavenderMoonMaterial);
            assert.equal(right.getObjectByName('small-cup-kozara').material, lavenderMoonMaterial);

            // Verify Base Cups share the same Rose Nebula instance
            assert.equal(center.getObjectByName('base-cup-chuzara').material, roseNebulaMaterial);
            assert.equal(left.getObjectByName('base-cup-chuzara').material, roseNebulaMaterial);
            assert.equal(right.getObjectByName('base-cup-chuzara').material, roseNebulaMaterial);

            // Verify Crossbars share the same Pearl White instance
            assert.equal(center.getObjectByName('sarado-crossbar').material, pearlWhiteMaterial);
            assert.equal(left.getObjectByName('sarado-crossbar').material, pearlWhiteMaterial);
            assert.equal(right.getObjectByName('sarado-crossbar').material, pearlWhiteMaterial);

            // Verify Handles and Spikes share the same Moon Pearl instance
            assert.equal(center.getObjectByName('handle-ken').material, moonPearlMaterial);
            assert.equal(left.getObjectByName('handle-ken').material, moonPearlMaterial);
            assert.equal(right.getObjectByName('handle-ken').material, moonPearlMaterial);
            assert.equal(center.getObjectByName('spike-kensaki').material, moonPearlMaterial);
            assert.equal(left.getObjectByName('spike-kensaki').material, moonPearlMaterial);
            assert.equal(right.getObjectByName('spike-kensaki').material, moonPearlMaterial);
        });
    });
});
