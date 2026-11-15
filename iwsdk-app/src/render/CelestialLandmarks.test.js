/**
 * Celestial Kendama - Unit Tests for Celestial Landmarks Layer
 * Role: Person C (Visuals & Rendering)
 *
 * Verifies:
 * - Palette constants and hexToRgb conversion
 * - Planet & Ring ShaderMaterial configuration (translation stripping, depth pinning, LessEqualDepth)
 * - Low-poly procedural geometry creation for Astraea, Selene, Chroma, and Astraea Ring
 * - Scene graph structure, naming, renderOrder hierarchy, and positioning
 * - Distances and placement outside the forward interaction cone
 * - Smoothstep edge ordering (edge0 < edge1) across all landmark shaders
 * - Disposal cleanup for all meshes, geometries, and materials
 */

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { LessEqualDepth, DoubleSide, ShaderMaterial, Group, Mesh } from 'three';
import {
    CELESTIAL_LANDMARKS_PALETTE,
    hexToRgb,
    CELESTIAL_PLANET_VERTEX_SHADER,
    CELESTIAL_PLANET_FRAGMENT_SHADER,
    CELESTIAL_RING_VERTEX_SHADER,
    CELESTIAL_RING_FRAGMENT_SHADER,
    createCelestialPlanetMaterial,
    createCelestialRingMaterial,
    createCelestialLandmarks,
    disposeCelestialLandmarks,
} from './CelestialLandmarks.js';

describe('CelestialLandmarks - Distant Celestial Landmarks Layer', () => {
    describe('A. Palette & Conversion', () => {
        it('exports all 8 required landmark palette colors', () => {
            assert.equal(CELESTIAL_LANDMARKS_PALETTE.ASTRAEA_BASE, '#7886C5');
            assert.equal(CELESTIAL_LANDMARKS_PALETTE.ASTRAEA_CRESCENT, '#F2B8D0');
            assert.equal(CELESTIAL_LANDMARKS_PALETTE.ASTRAEA_RIM, '#B9A4D6');
            assert.equal(CELESTIAL_LANDMARKS_PALETTE.RING_CHAMPAGNE, '#E8C68D');
            assert.equal(CELESTIAL_LANDMARKS_PALETTE.SELENE_BASE, '#B9A4D6');
            assert.equal(CELESTIAL_LANDMARKS_PALETTE.SELENE_CRESCENT, '#FFF5F5');
            assert.equal(CELESTIAL_LANDMARKS_PALETTE.CHROMA_BASE, '#18264F');
            assert.equal(CELESTIAL_LANDMARKS_PALETTE.CHROMA_RIM, '#7886C5');
        });

        it('converts hex strings to normalized float RGB arrays accurately', () => {
            const rgb = hexToRgb('#7886C5');
            assert.ok(Math.abs(rgb[0] - 0.4706) < 1e-4);
            assert.ok(Math.abs(rgb[1] - 0.5255) < 1e-4);
            assert.ok(Math.abs(rgb[2] - 0.7725) < 1e-4);
        });
    });

    describe('B. Shader Configuration & Depth Pinning', () => {
        it('creates planet ShaderMaterial with translation stripping and clip depth pinning at 0.99990', () => {
            const mat = createCelestialPlanetMaterial();
            assert.ok(mat instanceof ShaderMaterial);
            assert.equal(mat.transparent, true);
            assert.equal(mat.depthTest, true);
            assert.equal(mat.depthWrite, false);
            assert.equal(mat.depthFunc, LessEqualDepth);

            // Shaders contain translation stripping and depth pinning
            assert.ok(mat.vertexShader.includes('mat4(mat3(viewMatrix))'));
            assert.ok(mat.vertexShader.includes('clipPosition.w * 0.99990'));

            // Uniforms are set
            assert.ok(mat.uniforms.uBaseColor.value);
            assert.ok(mat.uniforms.uCrescentColor.value);
            assert.ok(mat.uniforms.uRimColor.value);
            assert.ok(mat.uniforms.uLightDir.value);
            assert.equal(mat.uniforms.uOpacity.value, 1.0);
        });

        it('creates ring ShaderMaterial with double-sided rendering and clip depth pinning at 0.99989', () => {
            const mat = createCelestialRingMaterial();
            assert.ok(mat instanceof ShaderMaterial);
            assert.equal(mat.side, DoubleSide);
            assert.equal(mat.transparent, true);
            assert.equal(mat.depthTest, true);
            assert.equal(mat.depthWrite, false);
            assert.equal(mat.depthFunc, LessEqualDepth);

            assert.ok(mat.vertexShader.includes('mat4(mat3(viewMatrix))'));
            assert.ok(mat.vertexShader.includes('clipPosition.w * 0.99989'));
            assert.ok(mat.uniforms.uRingColor.value);
            assert.equal(mat.uniforms.uOpacity.value, 0.85);
        });

        it('strictly maintains ascending edges in all smoothstep calls (edge0 < edge1)', () => {
            const shaders = [
                CELESTIAL_PLANET_FRAGMENT_SHADER,
                CELESTIAL_RING_FRAGMENT_SHADER,
            ];

            const smoothstepRegex = /smoothstep\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,/gu;
            for (const shader of shaders) {
                let match;
                while ((match = smoothstepRegex.exec(shader)) !== null) {
                    const e0 = parseFloat(match[1]);
                    const e1 = parseFloat(match[2]);
                    if (!Number.isNaN(e0) && !Number.isNaN(e1)) {
                        assert.ok(
                            e0 < e1,
                            `smoothstep edge0 (${e0}) must be strictly less than edge1 (${e1}) in shader: ${match[0]}`
                        );
                    }
                }
            }
        });
    });

    describe('C. Group Composition & Spatial Placement', () => {
        it('constructs complete landmarks group with Astraea, Selene, and Chroma', () => {
            const group = createCelestialLandmarks();
            assert.ok(group instanceof Group);
            assert.equal(group.name, 'celestial-landmarks');
            assert.equal(group.renderOrder, -920);

            const astraea = group.getObjectByName('landmark-astraea');
            assert.ok(astraea instanceof Mesh, 'Astraea must be in landmarks group');
            assert.equal(astraea.renderOrder, -920);
            assert.equal(astraea.frustumCulled, false);

            const astraeaRing = astraea.getObjectByName('landmark-astraea-ring');
            assert.ok(astraeaRing instanceof Mesh, 'Astraea Ring must be a child of Astraea');
            assert.equal(astraeaRing.renderOrder, -919);

            const selene = group.getObjectByName('landmark-selene');
            assert.ok(selene instanceof Mesh, 'Selene must be in landmarks group');
            assert.equal(selene.renderOrder, -920);

            const chroma = group.getObjectByName('landmark-chroma');
            assert.ok(chroma instanceof Mesh, 'Chroma must be in landmarks group');
            assert.equal(chroma.renderOrder, -920);
        });

        it('places landmarks at distant cosmic scales (> 70m) and outside central interaction zone', () => {
            const group = createCelestialLandmarks();
            const astraea = group.getObjectByName('landmark-astraea');
            const selene = group.getObjectByName('landmark-selene');
            const chroma = group.getObjectByName('landmark-chroma');

            const distAstraea = astraea.position.length();
            const distSelene = selene.position.length();
            const distChroma = chroma.position.length();

            assert.ok(distAstraea > 70 && distAstraea < 80, `Astraea dist ${distAstraea} should be ~71.6m`);
            assert.ok(distSelene > 70 && distSelene < 85, `Selene dist ${distSelene} should be ~78.8m`);
            assert.ok(distChroma > 75 && distChroma < 90, `Chroma dist ${distChroma} should be ~80.2m`);

            // All landmarks must be well outside the forward kendama play volume (|X| <= 0.6m, Z in [-0.2, -1.2])
            for (const lm of [astraea, selene, chroma]) {
                const isInsidePlayVolume = Math.abs(lm.position.x) < 2.0
                    && lm.position.z > -3.0
                    && lm.position.z < 0.0;
                assert.equal(isInsidePlayVolume, false, `${lm.name} must not intersect kendama play volume`);
            }
        });
    });

    describe('D. Disposal Lifecycle', () => {
        it('safely disposes all geometries and materials without throwing', () => {
            const group = createCelestialLandmarks();
            let disposedGeoms = 0;
            let disposedMats = 0;

            group.traverse((child) => {
                if (child.isMesh) {
                    const origGeomDispose = child.geometry.dispose.bind(child.geometry);
                    child.geometry.dispose = () => {
                        disposedGeoms++;
                        origGeomDispose();
                    };
                    const origMatDispose = child.material.dispose.bind(child.material);
                    child.material.dispose = () => {
                        disposedMats++;
                        origMatDispose();
                    };
                }
            });

            disposeCelestialLandmarks(group);
            // 4 meshes total: Astraea, Ring, Selene, Chroma
            assert.equal(disposedGeoms, 4);
            assert.equal(disposedMats, 4);
        });

        it('handles null or undefined group in dispose gracefully', () => {
            assert.doesNotThrow(() => disposeCelestialLandmarks(null));
            assert.doesNotThrow(() => disposeCelestialLandmarks(undefined));
        });
    });
});
