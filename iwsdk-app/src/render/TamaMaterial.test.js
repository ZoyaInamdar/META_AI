/**
 * Celestial Kendama - Unit Tests for TamaMaterial.js
 * Role: Person C (Visuals & Rendering)
 *
 * Verifies the dedicated Celestial Tama material and procedural galaxy shader:
 * - Valid MeshPhysicalMaterial factory and default instance
 * - Visual Direction: Slightly dark lavender galaxy with flowing white, black and blue nebula swirls
 * - Dominant dark lavender base (#786A9E)
 * - 4-color palette integration (Dark Lavender, Pearl White, Cosmic Black, Galaxy Blue)
 * - Correct PBR properties (pearly roughness, clearcoat, sheen, iridescence)
 * - Custom shader hooks compilation and injection (vTamaPos local coordinates)
 * - Domain-warped multi-octave FBM and 6-stop galaxy color ramp
 * - Bore interior handling (cavity occlusion shading and sparkle suppression)
 * - Complete independence from existing Kendama material presets
 * - Determinism and clean disposal
 */

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { MeshPhysicalMaterial, ShaderLib, Color, FrontSide, DoubleSide } from 'three';
import { KEN_PALETTE, KEN_MATERIALS } from './KenMaterials.js';
import {
    createCelestialTamaMaterial,
    celestialTamaMaterial,
    applyTamaGalaxyShader,
    TAMA_PALETTE,
    DEFAULT_TAMA_BASE_COLOR,
    DEFAULT_TAMA_ROUGHNESS,
    DEFAULT_TAMA_METALNESS,
    DEFAULT_TAMA_CLEARCOAT,
    DEFAULT_TAMA_CLEARCOAT_ROUGHNESS,
    DEFAULT_TAMA_SHEEN,
    DEFAULT_TAMA_SHEEN_ROUGHNESS,
    DEFAULT_TAMA_SHEEN_COLOR,
    DEFAULT_TAMA_IRIDESCENCE,
    DEFAULT_TAMA_IRIDESCENCE_IOR,
    DEFAULT_TAMA_IRIDESCENCE_THICKNESS,
    DEFAULT_TAMA_FREQ,
    DEFAULT_TAMA_WARP_STRENGTH,
    DEFAULT_TAMA_NEBULA_WEIGHT,
    DEFAULT_TAMA_SPARKLE_WEIGHT,
    DEFAULT_TAMA_BORE_CAVITY_DEPTH,
} from './TamaMaterial.js';

describe('TamaMaterial Module', () => {
    describe('Tama Palette & Visual Direction Constants', () => {
        it('exports the authoritative 4-color TAMA_PALETTE', () => {
            assert.ok(Object.isFrozen(TAMA_PALETTE));
            assert.equal(TAMA_PALETTE.DARK_LAVENDER, '#786A9E');
            assert.equal(TAMA_PALETTE.PEARL_WHITE, '#F8F5FF');
            assert.equal(TAMA_PALETTE.COSMIC_BLACK, '#111321');
            assert.equal(TAMA_PALETTE.GALAXY_BLUE, '#344F91');
        });

        it('uses dark lavender as the dominant base color', () => {
            assert.equal(DEFAULT_TAMA_BASE_COLOR, TAMA_PALETTE.DARK_LAVENDER);
            assert.equal(DEFAULT_TAMA_BASE_COLOR, '#786A9E');
        });
    });

    describe('PBR Material Factory & Default Instance', () => {
        it('exports a valid default celestialTamaMaterial singleton instance', () => {
            assert.ok(celestialTamaMaterial instanceof MeshPhysicalMaterial);
            assert.equal(celestialTamaMaterial.name, 'mat-celestial-tama');
            assert.equal(celestialTamaMaterial.color.getHexString().toLowerCase(), '786a9e');
        });

        it('creates a fresh MeshPhysicalMaterial with expected default PBR properties', () => {
            const mat = createCelestialTamaMaterial();
            assert.ok(mat instanceof MeshPhysicalMaterial);
            assert.equal(mat.name, 'mat-celestial-tama');

            // Base Color: Dark Lavender (#786A9E)
            assert.equal(mat.color.getHexString().toLowerCase(), '786a9e');

            // Roughness & Metalness: Dielectric polished satin
            assert.equal(mat.roughness, DEFAULT_TAMA_ROUGHNESS);
            assert.equal(mat.metalness, DEFAULT_TAMA_METALNESS);

            // Clearcoat: Protective porcelain glaze
            assert.equal(mat.clearcoat, DEFAULT_TAMA_CLEARCOAT);
            assert.equal(mat.clearcoatRoughness, DEFAULT_TAMA_CLEARCOAT_ROUGHNESS);

            // Sheen: Soft velvet nacre reflection
            assert.equal(mat.sheen, DEFAULT_TAMA_SHEEN);
            assert.equal(mat.sheenRoughness, DEFAULT_TAMA_SHEEN_ROUGHNESS);
            assert.equal(mat.sheenColor.getHexString().toLowerCase(), 'd8cef2');

            // Iridescence: Thin-film nacre pearlescence
            assert.equal(mat.iridescence, DEFAULT_TAMA_IRIDESCENCE);
            assert.equal(mat.iridescenceIOR, DEFAULT_TAMA_IRIDESCENCE_IOR);
            assert.deepEqual(mat.iridescenceThicknessRange, DEFAULT_TAMA_IRIDESCENCE_THICKNESS);

            // Face side: Default FrontSide
            assert.equal(mat.side, FrontSide);
        });

        it('supports customizing PBR properties through options', () => {
            const custom = createCelestialTamaMaterial({
                color: KEN_PALETTE.ROSE_NEBULA,
                roughness: 0.30,
                clearcoat: 0.85,
                sheen: 0.60,
                side: DoubleSide,
            });

            assert.equal(custom.color.getHexString().toLowerCase(), 'efb9d5');
            assert.equal(custom.roughness, 0.30);
            assert.equal(custom.clearcoat, 0.85);
            assert.equal(custom.sheen, 0.60);
            assert.equal(custom.side, DoubleSide);
        });
    });

    describe('Procedural Galaxy Shader Enhancement', () => {
        it('assigns unique customProgramCacheKey starting with celestial-tama-', () => {
            const mat = createCelestialTamaMaterial();
            assert.equal(typeof mat.customProgramCacheKey, 'function');
            const key = mat.customProgramCacheKey();
            assert.ok(key.startsWith('celestial-tama-'), `Cache key "${key}" must start with celestial-tama-`);
        });

        it('compiles mock Three.js physical shader through onBeforeCompile without throwing', () => {
            const mat = createCelestialTamaMaterial();
            assert.equal(typeof mat.onBeforeCompile, 'function');

            const mockShader = {
                vertexShader: ShaderLib.physical.vertexShader,
                fragmentShader: ShaderLib.physical.fragmentShader,
                uniforms: { ...ShaderLib.physical.uniforms },
            };

            assert.doesNotThrow(() => mat.onBeforeCompile(mockShader));

            // Vertex Shader: local coordinates (vTamaPos = transformed)
            assert.ok(mockShader.vertexShader.includes('varying vec3 vTamaPos;'), 'vertexShader must declare vTamaPos');
            assert.ok(mockShader.vertexShader.includes('vTamaPos = transformed;'), 'vertexShader must assign local transformed coordinates to vTamaPos');

            // Fragment Shader: domain-warping functions
            assert.ok(mockShader.fragmentShader.includes('tamaWarp3D_A'), 'fragmentShader must include tamaWarp3D_A');
            assert.ok(mockShader.fragmentShader.includes('tamaWarp3D_B'), 'fragmentShader must include tamaWarp3D_B');
            assert.ok(mockShader.fragmentShader.includes('tamaNebulaFbm'), 'fragmentShader must include tamaNebulaFbm');
            assert.ok(mockShader.fragmentShader.includes('tamaGalaxyRamp'), 'fragmentShader must include tamaGalaxyRamp 6-stop ramp');
        });

        it('embeds the 4-color palette in the procedural shader color ramp', () => {
            const mat = createCelestialTamaMaterial();
            const mockShader = {
                vertexShader: ShaderLib.physical.vertexShader,
                fragmentShader: ShaderLib.physical.fragmentShader,
                uniforms: { ...ShaderLib.physical.uniforms },
            };
            mat.onBeforeCompile(mockShader);

            const frag = mockShader.fragmentShader;

            // Convert palette hexes to linear values to ensure exact inclusion
            const cBlack = new Color(TAMA_PALETTE.COSMIC_BLACK);
            const cBlue = new Color(TAMA_PALETTE.GALAXY_BLUE);
            const cLavender = new Color(TAMA_PALETTE.DARK_LAVENDER);
            const cWhite = new Color(TAMA_PALETTE.PEARL_WHITE);

            assert.ok(frag.includes(cBlack.r.toFixed(4)), 'Fragment shader must contain Cosmic Black red channel');
            assert.ok(frag.includes(cBlue.b.toFixed(4)), 'Fragment shader must contain Galaxy Blue blue channel');
            assert.ok(frag.includes(cLavender.r.toFixed(4)), 'Fragment shader must contain Dark Lavender red channel');
            assert.ok(frag.includes(cWhite.r.toFixed(4)), 'Fragment shader must contain Pearl White red channel');
        });

        it('injects bore cavity detection, occlusion, and sparkle suppression', () => {
            const mat = createCelestialTamaMaterial();
            const mockShader = {
                vertexShader: ShaderLib.physical.vertexShader,
                fragmentShader: ShaderLib.physical.fragmentShader,
                uniforms: { ...ShaderLib.physical.uniforms },
            };

            mat.onBeforeCompile(mockShader);

            // Bore cavity detection
            assert.ok(mockShader.fragmentShader.includes('boreDepthFactor'), 'fragmentShader must calculate boreDepthFactor');
            assert.ok(mockShader.fragmentShader.includes('boreRadiusFactor'), 'fragmentShader must calculate boreRadiusFactor');
            assert.ok(mockShader.fragmentShader.includes('boreCavity'), 'fragmentShader must calculate boreCavity');
            assert.ok(mockShader.fragmentShader.includes('boreInteriorTone'), 'fragmentShader must blend boreInteriorTone');

            // Sparkle suppression inside bore cavity
            assert.ok(mockShader.fragmentShader.includes('(1.0 - boreCavity)'), 'Sparkles must be suppressed by boreCavity factor');
        });

        it('gracefully handles invalid inputs in applyTamaGalaxyShader', () => {
            // @ts-ignore
            assert.equal(applyTamaGalaxyShader(null), null);
            // @ts-ignore
            assert.equal(applyTamaGalaxyShader(undefined), undefined);
            const dummy = {};
            // @ts-ignore
            assert.equal(applyTamaGalaxyShader(dummy), dummy);
        });
    });

    describe('Independence & Isolation from Kendama Presets', () => {
        it('does not mutate or alter any existing KEN_MATERIALS presets', () => {
            const mat = createCelestialTamaMaterial();

            // None of the existing Kendama material instances should equal the Tama material
            assert.notEqual(mat, KEN_MATERIALS.MOON_PEARL);
            assert.notEqual(mat, KEN_MATERIALS.ROSE_NEBULA);
            assert.notEqual(mat, KEN_MATERIALS.LAVENDER_MOON);
            assert.notEqual(mat, KEN_MATERIALS.ROSE_GOLD);
            assert.notEqual(mat, KEN_MATERIALS.PEARL_WHITE);

            // Verify original Kendama presets retain their original properties
            assert.equal(KEN_MATERIALS.MOON_PEARL.name, 'mat-moon-pearl');
            assert.equal(KEN_MATERIALS.ROSE_NEBULA.name, 'mat-rose-nebula');
            assert.equal(KEN_MATERIALS.LAVENDER_MOON.name, 'mat-lavender-moon');
            assert.equal(KEN_MATERIALS.ROSE_GOLD.name, 'mat-rose-gold');
            assert.equal(KEN_MATERIALS.PEARL_WHITE.name, 'mat-pearl-white');
        });

        it('does not mutate KEN_PALETTE', () => {
            assert.ok(Object.isFrozen(KEN_PALETTE));
            assert.equal(KEN_PALETTE.PEARL_WHITE, '#FFF9FC');
            assert.equal(KEN_PALETTE.ROSE_NEBULA, '#EFB9D5');
        });

        it('does not require or share kenAssemblyInv uniforms from Kendama materials', () => {
            const mat = createCelestialTamaMaterial();
            const mockShader = {
                vertexShader: ShaderLib.physical.vertexShader,
                fragmentShader: ShaderLib.physical.fragmentShader,
                uniforms: { ...ShaderLib.physical.uniforms },
            };
            mat.onBeforeCompile(mockShader);

            // Tama shader uses local object space, eliminating kenAssemblyInv dependency
            assert.equal(mockShader.uniforms.kenAssemblyInv, undefined);
            assert.ok(!mockShader.vertexShader.includes('kenAssemblyInv'));
        });
    });

    describe('Determinism & Clean Disposal', () => {
        it('produces deterministic material instances on repeated calls', () => {
            const mat1 = createCelestialTamaMaterial();
            const mat2 = createCelestialTamaMaterial();

            assert.notEqual(mat1, mat2, 'Factory must return distinct material instances');
            assert.equal(mat1.name, mat2.name);
            assert.equal(mat1.roughness, mat2.roughness);
            assert.equal(mat1.metalness, mat2.metalness);
            assert.equal(mat1.clearcoat, mat2.clearcoat);
            assert.equal(mat1.sheen, mat2.sheen);
            assert.equal(mat1.iridescence, mat2.iridescence);
            assert.equal(mat1.color.getHex(), mat2.color.getHex());
        });

        it('allows modifying one instance without affecting another', () => {
            const mat1 = createCelestialTamaMaterial();
            const mat2 = createCelestialTamaMaterial();

            mat1.roughness = 0.50;
            assert.equal(mat1.roughness, 0.50);
            assert.equal(mat2.roughness, DEFAULT_TAMA_ROUGHNESS);
        });

        it('disposes cleanly without throwing', () => {
            const mat = createCelestialTamaMaterial();
            assert.doesNotThrow(() => mat.dispose());
        });
    });
});
