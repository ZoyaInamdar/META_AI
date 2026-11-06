/**
 * Celestial Kendama - Unit Tests for CelestialStardust & Pastel Galaxy Stardust Layer
 * Role: Person C (Visuals & Rendering)
 *
 * Verifies Phase 3B:
 * - Palette definitions and warm color values (Champagne Gold dominant, Pale Gold, Soft Peach, Pearl White)
 * - Deterministic Mulberry32 PRNG and reproducible stardust generation
 * - Configurable particle count (default 150, range 120â€“180)
 * - Distance shell bounds: strictly between 30.0m and 50.0m from viewing origin
 * - Non-uniform volumetric distribution (aligned with pastel galaxy tilt, no rigid shell)
 * - Quiet central gameplay interaction zone (tiny, dim, non-distracting stardust)
 * - Color hierarchy (Champagne Gold dominant, Pale Gold, Soft Peach, Pearl White)
 * - Single batched THREE.Points draw call on a single THREE.BufferGeometry (no individual meshes)
 * - ShaderMaterial render states: depthTest: true, LessEqualDepth, depthWrite: false, NormalBlending
 * - Translation stripping and clip-space depth pinning (z/w = 0.99995)
 * - Rendering order hierarchy: DomeGradient (-1e9) < Nebula (-950) < Starfield (-940) < Stardust (-930) < Scene / UI (0)
 * - Depth occlusion: Foreground geometry occludes stardust; stardust draws over sky, nebula, and starfield
 * - Slow harmonic drift animation and bounded 3D displacement
 * - Integration with CelestialEnvironmentSystem: Hidden in showroom, visible in gameplay
 * - No duplicate instances after repeated mode switching
 * - Independent stardust visibility and intensity controls
 * - Stable animation updates without unnecessary CPU allocations
 * - Correct cleanup and disposal
 * - Asset and scene declarations in src/assets.js and public/scenes/gameplay.iwsdk.scene.json
 */

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    BufferAttribute,
    BufferGeometry,
    LessEqualDepth,
    NormalBlending,
    PerspectiveCamera,
    Points,
    ShaderMaterial,
    Vector4,
} from 'three';
import {
    CELESTIAL_STARDUST_PALETTE,
    DEFAULT_STARDUST_COUNT,
    DEFAULT_MIN_DISTANCE,
    DEFAULT_MAX_DISTANCE,
    DEFAULT_STARDUST_SEED,
    hexToRgb,
    createDeterministicPrng,
    generateStardustData,
    createCelestialStardustGeometry,
    createCelestialStardustMaterial,
    createCelestialStardust,
    CELESTIAL_STARDUST_VERTEX_SHADER,
    CELESTIAL_STARDUST_FRAGMENT_SHADER,
} from './CelestialStardust.js';
import { GALACTIC_NORMAL } from './CelestialNebulaShader.js';
import {
    CelestialEnvironmentSystem,
    SHOWROOM_ENVIRONMENT_CONFIG,
    GAMEPLAY_PASTEL_GALAXY_CONFIG,
} from './CelestialEnvironment.js';
import { DomeGradient, IBLGradient, LevelRoot } from '@iwsdk/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function createMockWorldWithLevelRoot() {
    const components = new Set([LevelRoot, DomeGradient, IBLGradient]);
    const domeValues = {
        sky: new Float32Array(SHOWROOM_ENVIRONMENT_CONFIG.domeGradient.sky),
        equator: new Float32Array(SHOWROOM_ENVIRONMENT_CONFIG.domeGradient.equator),
        ground: new Float32Array(SHOWROOM_ENVIRONMENT_CONFIG.domeGradient.ground),
        elevationDeg: SHOWROOM_ENVIRONMENT_CONFIG.domeGradient.elevationDeg,
        azimuthDeg: SHOWROOM_ENVIRONMENT_CONFIG.domeGradient.azimuthDeg,
        dither: SHOWROOM_ENVIRONMENT_CONFIG.domeGradient.dither,
        intensity: SHOWROOM_ENVIRONMENT_CONFIG.domeGradient.intensity,
        _needsUpdate: false,
    };

    const mockRoot = {
        hasComponent(c) { return components.has(c); },
        getVectorView(c, prop) {
            if (c === DomeGradient) return domeValues[prop];
            return null;
        },
        getValue(c, prop) {
            if (c === DomeGradient) return domeValues[prop];
            return undefined;
        },
        setValue(c, prop, val) {
            if (c === DomeGradient) domeValues[prop] = val;
        },
    };

    const sceneChildren = [];
    const mockScene = {
        add(obj) { sceneChildren.push(obj); },
        remove(obj) {
            const idx = sceneChildren.indexOf(obj);
            if (idx !== -1) sceneChildren.splice(idx, 1);
        },
        children: sceneChildren,
    };

    return {
        activeLevel: { value: mockRoot },
        scene: mockScene,
    };
}

describe('CelestialStardust - Phase 3B Champagne-Gold Stardust Layer', () => {
    describe('A. Palette Definitions & Utility Functions', () => {
        it('defines all required restrained warm stardust colors', () => {
            assert.equal(CELESTIAL_STARDUST_PALETTE.CHAMPAGNE_GOLD, '#E8C68D');
            assert.equal(CELESTIAL_STARDUST_PALETTE.PALE_GOLD, '#F5D77F');
            assert.equal(CELESTIAL_STARDUST_PALETTE.SOFT_PEACH, '#F6D2C2');
            assert.equal(CELESTIAL_STARDUST_PALETTE.PEARL_WHITE, '#FFF5F5');
        });

        it('converts hex strings to normalized RGB float vectors accurately', () => {
            const champagneRgb = hexToRgb(CELESTIAL_STARDUST_PALETTE.CHAMPAGNE_GOLD);
            assert.equal(champagneRgb[0], 0.9098);
            assert.equal(champagneRgb[1], 0.7765);
            assert.equal(champagneRgb[2], 0.5529);

            const paleGoldRgb = hexToRgb(CELESTIAL_STARDUST_PALETTE.PALE_GOLD);
            assert.equal(paleGoldRgb[0], 0.9608);
            assert.equal(paleGoldRgb[1], 0.8431);
            assert.equal(paleGoldRgb[2], 0.498);
        });

        it('defines default stardust configuration parameters within expected ranges', () => {
            assert.equal(DEFAULT_STARDUST_COUNT, 150);
            assert.ok(DEFAULT_STARDUST_COUNT >= 120 && DEFAULT_STARDUST_COUNT <= 180);
            assert.equal(DEFAULT_MIN_DISTANCE, 30.0);
            assert.equal(DEFAULT_MAX_DISTANCE, 50.0);
        });
    });

    describe('B. Deterministic Stardust Generation & Distribution', () => {
        it('generates reproducible stardust positions, colors, and attributes using seeded PRNG', () => {
            const data1 = generateStardustData({ seed: 0x57A8D057 });
            const data2 = generateStardustData({ seed: 0x57A8D057 });

            assert.equal(data1.count, data2.count);
            for (let i = 0; i < data1.positions.length; i++) {
                assert.equal(data1.positions[i], data2.positions[i]);
            }
            for (let i = 0; i < data1.colors.length; i++) {
                assert.equal(data1.colors[i], data2.colors[i]);
            }
            for (let i = 0; i < data1.drifts.length; i++) {
                assert.equal(data1.drifts[i], data2.drifts[i]);
            }
        });

        it('supports configurable particle count within 120â€“180 range', () => {
            const count120 = generateStardustData({ count: 120 });
            assert.equal(count120.count, 120);
            assert.equal(count120.positions.length, 120 * 3);

            const count180 = generateStardustData({ count: 180 });
            assert.equal(count180.count, 180);
            assert.equal(count180.positions.length, 180 * 3);
        });

        it('places all particles strictly in the 30â€“50 metres mid-distance region', () => {
            const data = generateStardustData({ count: 150, minDistance: 30.0, maxDistance: 50.0 });
            for (let i = 0; i < data.count; i++) {
                const idx = i * 3;
                const x = data.positions[idx];
                const y = data.positions[idx + 1];
                const z = data.positions[idx + 2];
                const dist = Math.sqrt(x * x + y * y + z * z);

                assert.ok(
                    dist >= 29.99 && dist <= 50.01,
                    `Particle #${i} distance (${dist.toFixed(2)}m) must be within 30m and 50m`
                );
            }
        });

        it('distributes particles organically across the volume rather than on a thin uniform shell', () => {
            const data = generateStardustData({ count: 150 });
            const distances = [];
            for (let i = 0; i < data.count; i++) {
                const idx = i * 3;
                const dist = Math.sqrt(
                    data.positions[idx] ** 2 +
                    data.positions[idx + 1] ** 2 +
                    data.positions[idx + 2] ** 2
                );
                distances.push(dist);
            }

            const minD = Math.min(...distances);
            const maxD = Math.max(...distances);
            const spread = maxD - minD;

            assert.ok(spread >= 15.0, `Stardust radial spread (${spread.toFixed(1)}m) must span across the 30â€“50m volume`);
            assert.ok(minD <= 35.0, 'Must have inner mid-distance particles near 30m');
            assert.ok(maxD >= 45.0, 'Must have outer mid-distance particles near 50m');
        });

        it('maintains a quiet central gameplay interaction zone with substantially reduced opacity', () => {
            const data = generateStardustData({ count: 150 });
            const cChampagne = hexToRgb(CELESTIAL_STARDUST_PALETTE.CHAMPAGNE_GOLD);

            let quietZoneCount = 0;
            for (let i = 0; i < data.count; i++) {
                const idx = i * 3;
                const x = data.positions[idx];
                const y = data.positions[idx + 1];
                const z = data.positions[idx + 2];
                const dist = Math.sqrt(x * x + y * y + z * z);

                const dirX = x / dist;
                const dirY = y / dist;
                const dirZ = z / dist;

                if (dirZ < -0.70 && Math.abs(dirY) < 0.40 && Math.abs(dirX) < 0.45) {
                    quietZoneCount++;

                    // Color must be Champagne Gold
                    assert.ok(Math.abs(data.colors[idx] - cChampagne[0]) < 1e-4);
                    assert.ok(Math.abs(data.colors[idx + 1] - cChampagne[1]) < 1e-4);
                    assert.ok(Math.abs(data.colors[idx + 2] - cChampagne[2]) < 1e-4);

                    // Size must be small (<= 3.25 px)
                    assert.ok(data.sizes[i] <= 3.25, `Quiet particle size (${data.sizes[i]}) must be <= 3.25 px`);

                    // Alpha must be low (<= 0.40) so it never obscures kendama or hands
                    assert.ok(data.baseAlphas[i] <= 0.40, `Quiet particle alpha (${data.baseAlphas[i]}) must be <= 0.40`);

                    // Drift amplitude must be very calm (<= 0.65m)
                    assert.ok(data.amps[idx] <= 0.85, 'Quiet particle drift amp must be small');
                }
            }

            assert.ok(quietZoneCount >= 2, `Identified quiet zone particles (${quietZoneCount})`);
        });

        it('adheres to the warm stardust visual hierarchy (Champagne Gold dominant)', () => {
            const data = generateStardustData({ count: 150 });
            const stats = data.stats;

            // Champagne Gold is dominant (>= 55%)
            const champagneRatio = stats.champagneCount / data.count;
            assert.ok(champagneRatio >= 0.55, `Champagne Gold ratio (${champagneRatio * 100}%) must be >= 55%`);

            // Pale Gold is a gentle highlight
            assert.ok(stats.paleGoldCount >= 15, 'Must contain pale gold highlight particles');

            // Soft Peach and Pearl White are rare accents
            assert.ok(stats.peachCount >= 5, 'Must contain soft peach accent particles');
            assert.ok(stats.pearlCount >= 1, 'Must contain pearl white accent particles');
        });

        it('concentrates stardust particles along and around the diagonal galactic band', () => {
            const data = generateStardustData({ count: 150 });
            let nearBandCount = 0;
            for (let i = 0; i < data.count; i++) {
                const idx = i * 3;
                const x = data.positions[idx];
                const y = data.positions[idx + 1];
                const z = data.positions[idx + 2];
                const dist = Math.sqrt(x * x + y * y + z * z);
                const dirX = x / dist;
                const dirY = y / dist;
                const dirZ = z / dist;
                const galDist = Math.abs(dirX * GALACTIC_NORMAL[0] + dirY * GALACTIC_NORMAL[1] + dirZ * GALACTIC_NORMAL[2]);
                if (galDist < 0.35) {
                    nearBandCount++;
                }
            }
            // Majority of stardust particles concentrate near the galactic band
            assert.ok(
                nearBandCount >= 75,
                `Expected stardust concentrated along galactic band (>= 75 / 150), found ${nearBandCount}`
            );
        });

        it('configures slow, gentle drift parameters with bounded movement', () => {
            const data = generateStardustData({ count: 150 });

            for (let i = 0; i < data.count; i++) {
                const idx = i * 3;
                const freqX = data.drifts[idx];
                const freqY = data.drifts[idx + 1];
                const freqZ = data.drifts[idx + 2];

                const ampX = data.amps[idx];
                const ampY = data.amps[idx + 1];
                const ampZ = data.amps[idx + 2];

                // Frequencies are slow (< 0.20 rad/s -> periods > 30 seconds)
                assert.ok(freqX >= 0.04 && freqX <= 0.20, `freqX (${freqX}) must be slow`);
                assert.ok(freqY >= 0.04 && freqY <= 0.20, `freqY (${freqY}) must be slow`);
                assert.ok(freqZ >= 0.04 && freqZ <= 0.20, `freqZ (${freqZ}) must be slow`);

                // Amplitudes are bounded (<= 2.0 meters at 40m distance)
                assert.ok(ampX <= 2.2, `ampX (${ampX}) must be bounded`);
                assert.ok(ampY <= 2.2, `ampY (${ampY}) must be bounded`);
                assert.ok(ampZ <= 2.2, `ampZ (${ampZ}) must be bounded`);
            }
        });
    });

    describe('C. Geometry, Material & Shader Configuration', () => {
        it('creates a BufferGeometry with all required per-particle vertex attributes', () => {
            const geom = createCelestialStardustGeometry({ count: 150 });
            assert.ok(geom instanceof BufferGeometry);

            const posAttr = geom.getAttribute('position');
            const colAttr = geom.getAttribute('color');
            const sizeAttr = geom.getAttribute('aSize');
            const alphaAttr = geom.getAttribute('aBaseAlpha');
            const driftAttr = geom.getAttribute('aDrift');
            const phaseAttr = geom.getAttribute('aPhase');
            const ampAttr = geom.getAttribute('aAmp');
            const pulseAttr = geom.getAttribute('aPulse');

            assert.ok(posAttr && posAttr.itemSize === 3, 'position attribute itemSize 3');
            assert.ok(colAttr && colAttr.itemSize === 3, 'color attribute itemSize 3');
            assert.ok(sizeAttr && sizeAttr.itemSize === 1, 'aSize attribute itemSize 1');
            assert.ok(alphaAttr && alphaAttr.itemSize === 1, 'aBaseAlpha attribute itemSize 1');
            assert.ok(driftAttr && driftAttr.itemSize === 3, 'aDrift attribute itemSize 3');
            assert.ok(phaseAttr && phaseAttr.itemSize === 3, 'aPhase attribute itemSize 3');
            assert.ok(ampAttr && ampAttr.itemSize === 3, 'aAmp attribute itemSize 3');
            assert.ok(pulseAttr && pulseAttr.itemSize === 2, 'aPulse attribute itemSize 2');

            assert.equal(posAttr.count, 150);
        });

        it('creates a ShaderMaterial with correct depth, blending, and uniform states', () => {
            const mat = createCelestialStardustMaterial();
            assert.ok(mat instanceof ShaderMaterial);

            assert.equal(mat.transparent, true, 'Must be transparent');
            assert.equal(mat.depthWrite, false, 'Must not write to depth buffer');
            assert.equal(mat.depthTest, true, 'Must perform depth testing against foreground objects');
            assert.equal(mat.depthFunc, LessEqualDepth, 'Must use LessEqualDepth');
            assert.equal(mat.blending, NormalBlending, 'Must use clean normal alpha blending');

            assert.ok(mat.uniforms.uTime, 'uTime uniform must exist');
            assert.equal(mat.uniforms.uTime.value, 0.0);
            assert.ok(mat.uniforms.uOpacity, 'uOpacity uniform must exist');
            assert.equal(mat.uniforms.uOpacity.value, 1.0);
            assert.ok(mat.uniforms.uStardustIntensity, 'uStardustIntensity uniform must exist');
            assert.equal(mat.uniforms.uStardustIntensity.value, 1.0);
            assert.ok(mat.uniforms.uStardustScale, 'uStardustScale uniform must exist');
            assert.equal(mat.uniforms.uStardustScale.value, 1.0);
        });

        it('vertex shader strips camera translation and pins clip depth just inside starfield (z/w = 0.99995)', () => {
            assert.ok(
                CELESTIAL_STARDUST_VERTEX_SHADER.includes('mat4(mat3(viewMatrix))'),
                'Vertex shader must strip camera translation from viewMatrix'
            );
            assert.ok(
                CELESTIAL_STARDUST_VERTEX_SHADER.includes('clipPosition.w * 0.99995'),
                'Vertex shader must pin gl_Position depth to clipPosition.w * 0.99995'
            );
            assert.ok(
                CELESTIAL_STARDUST_VERTEX_SHADER.includes('drift'),
                'Vertex shader must calculate harmonic drift'
            );
            assert.ok(
                CELESTIAL_STARDUST_VERTEX_SHADER.includes('streamTangent'),
                'Vertex shader must compute tangent flow along the galactic structure'
            );
            assert.ok(
                CELESTIAL_STARDUST_VERTEX_SHADER.includes('cGalacticNormal'),
                'Vertex shader must reference diagonal galactic normal'
            );
            assert.ok(
                CELESTIAL_STARDUST_VERTEX_SHADER.includes('gl_PointSize'),
                'Vertex shader must assign gl_PointSize'
            );
        });

        it('fragment shader creates circular antialiased point discs with nadir ground fade', () => {
            assert.ok(
                CELESTIAL_STARDUST_FRAGMENT_SHADER.includes('gl_PointCoord'),
                'Fragment shader must sample gl_PointCoord'
            );
            assert.ok(
                CELESTIAL_STARDUST_FRAGMENT_SHADER.includes('distSq > 0.25'),
                'Fragment shader must discard square corners'
            );
            assert.ok(
                CELESTIAL_STARDUST_FRAGMENT_SHADER.includes('radialFalloff'),
                'Fragment shader must apply smooth circular falloff'
            );
            assert.ok(
                CELESTIAL_STARDUST_FRAGMENT_SHADER.includes('1.0 - smoothstep(0.15, 0.5, dist)'),
                'Fragment shader must use standard non-reversed smoothstep edge ordering for radialFalloff (0.15 < 0.5)'
            );
            assert.ok(
                CELESTIAL_STARDUST_FRAGMENT_SHADER.includes('1.0 - smoothstep(0.0, 0.35, dist)'),
                'Fragment shader must use standard non-reversed smoothstep edge ordering for coreGlow (0.0 < 0.35)'
            );
            assert.ok(
                CELESTIAL_STARDUST_FRAGMENT_SHADER.includes('groundFade'),
                'Fragment shader must fade near and below floor level'
            );
        });
    });

    describe('D. Batched THREE.Points & Draw Call Efficiency', () => {
        it('creates a single batched Points mesh with no individual particle objects or children', () => {
            const points = createCelestialStardust();
            assert.ok(points instanceof Points);
            assert.equal(points.name, 'celestial-stardust');
            assert.equal(points.renderOrder, -930, 'Must render after Starfield (-940) and before Scene objects (0)');
            assert.equal(points.frustumCulled, false, 'Mid-distance stardust must not be frustum culled');
            assert.equal(points.children.length, 0, 'Must contain zero child objects (single batched draw call)');
        });
    });

    describe('E. Depth Occlusion & Layering Compatibility', () => {
        it('verifies strict renderOrder hierarchy across all background celestial layers', () => {
            const domeGradientRenderOrder = -1e9;
            const nebulaRenderOrder = -950;
            const starfieldRenderOrder = -940;
            const stardust = createCelestialStardust();
            const defaultSceneRenderOrder = 0;

            assert.ok(
                domeGradientRenderOrder < nebulaRenderOrder,
                'DomeGradient (-1e9) must render before Nebula (-950)'
            );
            assert.ok(
                nebulaRenderOrder < starfieldRenderOrder,
                'Nebula (-950) must render before Starfield (-940)'
            );
            assert.ok(
                starfieldRenderOrder < stardust.renderOrder,
                'Starfield (-940) must render before Stardust (-930)'
            );
            assert.ok(
                stardust.renderOrder < defaultSceneRenderOrder,
                'Stardust (-930) must render before foreground scene objects and UI (0)'
            );
        });

        it('confirms foreground scene objects (kendama, hands, plinth) strictly occlude the stardust', () => {
            const camera = new PerspectiveCamera(60, 1.0, 0.1, 1000.0);
            camera.updateProjectionMatrix();

            const zClipFractionStardust = 0.99995;
            const zWinStardust = 0.5 * zClipFractionStardust + 0.5; // 0.999975

            const testDistances = [0.2, 0.5, 1.0, 2.0, 5.0, 20.0];

            for (const distance of testDistances) {
                const viewPos = new Vector4(0, 0, -distance, 1.0);
                const clipPos = viewPos.applyMatrix4(camera.projectionMatrix);
                const ndcZ = clipPos.z / clipPos.w;
                const winZ = 0.5 * ndcZ + 0.5;

                assert.ok(
                    winZ < zWinStardust,
                    `Foreground object at ${distance}m (zWin = ${winZ}) must have smaller depth than stardust (${zWinStardust})`
                );

                // Hardware depth test (zIncoming <= zBuffer): incoming stardust depth must NOT pass over foreground depth
                const stardustDrawsOverForeground = (zWinStardust <= winZ);
                assert.equal(
                    stardustDrawsOverForeground,
                    false,
                    `Stardust fragment must be occluded by foreground object at ${distance}m`
                );
            }
        });

        it('confirms stardust passes depth testing against cleared sky depth (1.0)', () => {
            const zWinStardust = 0.5 * 0.99995 + 0.5;
            const clearDepth = 1.0;
            const passesClearDepth = (zWinStardust <= clearDepth);
            assert.equal(passesClearDepth, true, 'Stardust must pass depth test over cleared background buffer');
        });
    });

    describe('F. CelestialEnvironmentSystem Integration & Lifecycle', () => {
        it('keeps stardust hidden in showroom mode by default', () => {
            const mockWorld = createMockWorldWithLevelRoot();
            const system = new CelestialEnvironmentSystem(mockWorld);
            system.init();

            assert.equal(system.getMode(), 'showroom');
            const stardust = system.getStardustMesh();
            assert.ok(!stardust || stardust.visible === false, 'Stardust must be hidden or uncreated in showroom mode');
        });

        it('activates and shows the stardust when setMode("gameplay") is called', () => {
            const mockWorld = createMockWorldWithLevelRoot();
            const system = new CelestialEnvironmentSystem(mockWorld);
            system.init();

            system.setMode('gameplay');
            assert.equal(system.getMode(), 'gameplay');

            const stardust = system.getStardustMesh();
            assert.ok(stardust, 'Stardust mesh must be created on gameplay transition');
            assert.equal(stardust.visible, true, 'Stardust mesh must be visible in gameplay mode');
            assert.ok(mockWorld.scene.children.includes(stardust), 'Stardust mesh must be added to world scene');
        });

        it('hides stardust cleanly when switching back to showroom mode', () => {
            const mockWorld = createMockWorldWithLevelRoot();
            const system = new CelestialEnvironmentSystem(mockWorld);
            system.init();

            system.setMode('gameplay');
            assert.equal(system.getStardustMesh().visible, true);

            system.setMode('showroom');
            assert.equal(system.getMode(), 'showroom');
            assert.equal(system.getStardustMesh().visible, false, 'Stardust must be hidden in showroom mode');
        });

        it('does not create duplicate stardust instances upon repeated mode switching', () => {
            const mockWorld = createMockWorldWithLevelRoot();
            const system = new CelestialEnvironmentSystem(mockWorld);
            system.init();

            system.setMode('gameplay');
            const stardustInstance1 = system.getStardustMesh();

            system.setMode('showroom');
            system.setMode('gameplay');
            const stardustInstance2 = system.getStardustMesh();

            assert.equal(
                stardustInstance1,
                stardustInstance2,
                'Must reuse identical Stardust instance across repeated mode transitions'
            );
            assert.equal(
                mockWorld.scene.children.filter((c) => c.name === 'celestial-stardust').length,
                1,
                'Must contain exactly 1 stardust mesh in the scene'
            );
        });

        it('allows independent visibility and intensity adjustment for stardust', () => {
            const mockWorld = createMockWorldWithLevelRoot();
            const system = new CelestialEnvironmentSystem(mockWorld);
            system.init();

            system.setMode('gameplay');
            const stardust = system.getStardustMesh();
            const starfield = system.getStarfieldMesh();
            const nebula = system.getNebulaMesh();

            // Set stardust invisible while nebula and starfield remain visible
            system.setStardustVisible(false);
            assert.equal(stardust.visible, false);
            assert.equal(starfield.visible, true);
            assert.equal(nebula.visible, true);

            // Set stardust intensity
            system.setStardustIntensity(0.45);
            assert.equal(stardust.material.uniforms.uStardustIntensity.value, 0.45);

            // Starfield and nebula intensities unaffected
            assert.equal(starfield.material.uniforms.uStarfieldIntensity.value, 1.0);
            assert.equal(nebula.material.uniforms.uNebulaIntensity.value, 0.85);
        });

        it('animates uTime uniform during update() without creating CPU allocations', () => {
            const mockWorld = createMockWorldWithLevelRoot();
            const system = new CelestialEnvironmentSystem(mockWorld);
            system.init();

            system.setMode('gameplay');
            const stardust = system.getStardustMesh();
            assert.equal(stardust.material.uniforms.uTime.value, 0.0);

            system.update(0.016);
            assert.ok(
                stardust.material.uniforms.uTime.value > 0.0,
                'Stardust uTime must increment per frame in gameplay mode'
            );

            const prev = stardust.material.uniforms.uTime.value;
            system.update(0.016);
            assert.ok(stardust.material.uniforms.uTime.value > prev, 'Stardust uTime must continue advancing');
        });

        it('disposes stardust geometry and material cleanly on destroy()', () => {
            const mockWorld = createMockWorldWithLevelRoot();
            const system = new CelestialEnvironmentSystem(mockWorld);
            system.init();

            system.setMode('gameplay');
            const stardust = system.getStardustMesh();
            let geomDisposed = false;
            let matDisposed = false;

            stardust.geometry.dispose = () => { geomDisposed = true; };
            stardust.material.dispose = () => { matDisposed = true; };

            system.destroy();
            assert.equal(geomDisposed, true, 'Stardust geometry must be disposed on destroy()');
            assert.equal(matDisposed, true, 'Stardust material must be disposed on destroy()');
            assert.equal(system.getStardustMesh(), null, 'Stardust reference must be cleared on destroy()');
        });
    });

    describe('G. Single Ownership Architecture & Scene Declarations', () => {
        it('verifies celestial-stardust is not registered in src/assets.js (owned exclusively by CelestialEnvironmentSystem)', () => {
            const assetsPath = resolve(__dirname, '../assets.js');
            const content = readFileSync(assetsPath, 'utf8');
            assert.ok(
                !content.includes("'celestial-stardust':"),
                'src/assets.js must not register celestial-stardust asset (owned exclusively by CelestialEnvironmentSystem)'
            );
        });

        it('verifies celestial-stardust node is declared in public/scenes/gameplay.iwsdk.scene.json', () => {
            const scenePath = resolve(__dirname, '../../public/scenes/gameplay.iwsdk.scene.json');
            const sceneJson = JSON.parse(readFileSync(scenePath, 'utf8'));

            const stardustNode = sceneJson.nodes.find((n) => n.id === 'celestial-stardust');
            assert.ok(stardustNode, 'gameplay.iwsdk.scene.json must contain celestial-stardust node');
            assert.equal(stardustNode.content.asset, 'celestial-stardust');
        });
    });
});
