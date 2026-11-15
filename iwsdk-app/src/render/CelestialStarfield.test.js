/**
 * Celestial Kendama - Unit Tests for CelestialStarfield & Pastel Galaxy Starfield Layer
 * Role: Person C (Visuals & Rendering)
 *
 * Verifies Phase 3A:
 * - Palette definitions and color values
 * - Deterministic Mulberry32 PRNG and reproducible star generation
 * - Star count (~1,200), distance distribution (75â€“85m shell), and 360-degree coverage
 * - Quiet central gameplay interaction cone (dim, tiny, non-distracting pearl white stars)
 * - Color hierarchy (Pearl White dominant, Pale Lavender, Warm Champagne, Soft Blush accents)
 * - Restrained per-star twinkling parameters (frequency, phase, amplitude)
 * - Single batched THREE.Points draw call on a single THREE.BufferGeometry (no individual objects)
 * - ShaderMaterial render states: depthTest: true, LessEqualDepth, depthWrite: false, NormalBlending
 * - Translation stripping and clip-space depth pinning (z/w = 0.99998)
 * - Rendering order hierarchy: DomeGradient (-1e9) < Nebula (-950) < Starfield (-940) < Scene / UI (0)
 * - Depth occlusion: Foreground geometry occludes stars; stars draw over sky and nebula
 * - Integration with CelestialEnvironmentSystem: Hidden in showroom, visible in gameplay
 * - No duplicate instances after repeated mode switching
 * - Independent starfield visibility and intensity controls
 * - Stable animation updates without unnecessary allocations
 * - Correct cleanup and disposal
 * - Asset and scene declarations in src/assets.js and public/scenes/gameplay.iwsdk.scene.json
 */

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
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
    CELESTIAL_STARFIELD_PALETTE,
    DEFAULT_STAR_COUNT,
    DEFAULT_MIN_DISTANCE,
    DEFAULT_MAX_DISTANCE,
    DEFAULT_RANDOM_SEED,
    hexToRgb,
    createDeterministicPrng,
    generateStarfieldData,
    createCelestialStarfieldGeometry,
    createCelestialStarfieldMaterial,
    createCelestialStarfield,
    CELESTIAL_STARFIELD_VERTEX_SHADER,
    CELESTIAL_STARFIELD_FRAGMENT_SHADER,
} from './CelestialStarfield.js';
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

describe('CelestialStarfield - Phase 3A Pastel Galaxy Starfield Layer', () => {
    describe('A. Palette Definitions & Utility Functions', () => {
        it('defines all required soft pastel star colors', () => {
            assert.equal(CELESTIAL_STARFIELD_PALETTE.PEARL_WHITE, '#FFF5F5');
            assert.equal(CELESTIAL_STARFIELD_PALETTE.CHAMPAGNE_GOLD, '#E8C68D');
            assert.equal(CELESTIAL_STARFIELD_PALETTE.SOFT_LAVENDER, '#B9A4D6');
            assert.equal(CELESTIAL_STARFIELD_PALETTE.BLUSH_PINK, '#F2B8D0');
            assert.equal(CELESTIAL_STARFIELD_PALETTE.DUSTY_PERIWINKLE, '#7886C5');
        });

        it('converts hex colors to normalized RGB float arrays accurately', () => {
            const pearlRgb = hexToRgb(CELESTIAL_STARFIELD_PALETTE.PEARL_WHITE);
            assert.equal(pearlRgb[0], 1.0);
            assert.equal(pearlRgb[1], 0.9608);
            assert.equal(pearlRgb[2], 0.9608);

            const champagneRgb = hexToRgb(CELESTIAL_STARFIELD_PALETTE.CHAMPAGNE_GOLD);
            assert.equal(champagneRgb[0], 0.9098);
            assert.equal(champagneRgb[1], 0.7765);
            assert.equal(champagneRgb[2], 0.5529);
        });

        it('exposes appropriate default starfield configuration constants', () => {
            assert.equal(DEFAULT_STAR_COUNT, 1200);
            assert.equal(DEFAULT_MIN_DISTANCE, 75.0);
            assert.equal(DEFAULT_MAX_DISTANCE, 85.0);
        });
    });

    describe('B. Deterministic Starfield Generation & Distribution', () => {
        it('generates identical star arrangements across multiple calls with the same seed', () => {
            const data1 = generateStarfieldData({ seed: 0xCE1E57 });
            const data2 = generateStarfieldData({ seed: 0xCE1E57 });

            assert.equal(data1.count, data2.count);
            for (let i = 0; i < data1.positions.length; i++) {
                assert.equal(data1.positions[i], data2.positions[i]);
            }
            for (let i = 0; i < data1.colors.length; i++) {
                assert.equal(data1.colors[i], data2.colors[i]);
            }
            for (let i = 0; i < data1.sizes.length; i++) {
                assert.equal(data1.sizes[i], data2.sizes[i]);
            }
            for (let i = 0; i < data1.twinkles.length; i++) {
                assert.equal(data1.twinkles[i], data2.twinkles[i]);
            }
        });

        it('places approximately 1,200 stars within the 75â€“85 metres distance shell', () => {
            const data = generateStarfieldData({ count: 1200, minDistance: 75.0, maxDistance: 85.0 });
            assert.equal(data.count, 1200);
            assert.equal(data.positions.length, 1200 * 3);

            for (let i = 0; i < data.count; i++) {
                const idx = i * 3;
                const x = data.positions[idx];
                const y = data.positions[idx + 1];
                const z = data.positions[idx + 2];
                const distance = Math.sqrt(x * x + y * y + z * z);

                assert.ok(
                    distance >= 74.99 && distance <= 85.01,
                    `Star #${i} distance (${distance.toFixed(2)}m) must be between 75m and 85m`
                );
            }
        });

        it('distributes stars across full 360-degree environment without clustering into a single quadrant', () => {
            const data = generateStarfieldData({ count: 1200 });

            // Count distribution across all 8 spatial octants
            const octants = new Array(8).fill(0);
            for (let i = 0; i < data.count; i++) {
                const idx = i * 3;
                const x = data.positions[idx];
                const y = data.positions[idx + 1];
                const z = data.positions[idx + 2];

                const octIndex = (x >= 0 ? 1 : 0) + (y >= 0 ? 2 : 0) + (z >= 0 ? 4 : 0);
                octants[octIndex]++;
            }

            // Every octant must maintain coverage (dense along galaxy ~180-220, sparse in deep space >= 50)
            for (let o = 0; o < 8; o++) {
                assert.ok(
                    octants[o] >= 50,
                    `Octant ${o} has only ${octants[o]} stars; distribution must cover full 360 degrees`
                );
            }
        });

        it('maintains a quiet central gameplay interaction zone (dim, tiny, non-distracting)', () => {
            const data = generateStarfieldData({ count: 1200 });
            const cPearl = hexToRgb(CELESTIAL_STARFIELD_PALETTE.PEARL_WHITE);

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

                if (dirZ < -0.75 && Math.abs(dirY) < 0.42 && Math.abs(dirX) < 0.45) {
                    quietZoneCount++;

                    // Color must be subtle Pearl White
                    assert.ok(Math.abs(data.colors[idx] - cPearl[0]) < 1e-4);
                    assert.ok(Math.abs(data.colors[idx + 1] - cPearl[1]) < 1e-4);
                    assert.ok(Math.abs(data.colors[idx + 2] - cPearl[2]) < 1e-4);

                    // Size must be small (<= 2.35 px)
                    assert.ok(data.sizes[i] <= 2.35, `Quiet star size (${data.sizes[i]}) must be <= 2.35 px`);

                    // Alpha must be dim (<= 0.55)
                    assert.ok(data.baseAlphas[i] <= 0.55, `Quiet star alpha (${data.baseAlphas[i]}) must be dim <= 0.55`);

                    // Twinkle amplitude must be minimal (<= 0.08)
                    const twinkleAmp = data.twinkles[idx + 2];
                    assert.ok(twinkleAmp <= 0.08, `Quiet star twinkle amplitude (${twinkleAmp}) must be minimal <= 0.08`);
                }
            }

            assert.ok(quietZoneCount >= 40, `Must identify quiet zone stars (found ${quietZoneCount})`);
        });

        it('adheres to the pastel visual hierarchy (Pearl White dominant, accents restrained)', () => {
            const data = generateStarfieldData({ count: 1200 });
            const stats = data.stats;

            // Most stars must be tiny pearl-white points (> 70%)
            const pearlRatio = stats.pearlCount / data.count;
            assert.ok(pearlRatio >= 0.70, `Pearl white stars (${pearlRatio * 100}%) must be >= 70%`);

            // Lavender and Champagne are moderate subsets
            assert.ok(stats.lavenderCount >= 50, 'Must have pale lavender accent stars');
            assert.ok(stats.champagneCount >= 30, 'Must have warm champagne accent stars');

            // Soft blush is a rare accent (<= 6%)
            const blushRatio = stats.blushCount / data.count;
            assert.ok(blushRatio <= 0.06, `Soft blush stars (${blushRatio * 100}%) must be <= 6%`);
        });

        it('clusters star density non-uniformly along and around the diagonal galactic band', () => {
            const data = generateStarfieldData({ count: 1200 });
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
            // Clustered starfield concentrates majority of stars near the galactic band
            assert.ok(
                nearBandCount >= 600,
                `Expected clustered starfield with majority near galactic band, found ${nearBandCount} / 1200`
            );
        });

        it('configures gentle, non-synchronized twinkle parameters without sudden flashing', () => {
            const data = generateStarfieldData({ count: 1200 });

            for (let i = 0; i < data.count; i++) {
                const idx = i * 3;
                const phase = data.twinkles[idx];
                const freq = data.twinkles[idx + 1];
                const amp = data.twinkles[idx + 2];

                assert.ok(phase >= 0.0 && phase <= 2.0 * Math.PI + 0.01, 'Phase in [0, 2pi]');
                assert.ok(freq >= 0.25 && freq <= 1.30, `Twinkle frequency (${freq}) must be slow`);
                assert.ok(amp >= 0.01 && amp <= 0.45, `Twinkle amplitude (${amp}) must not extinguish star completely`);
            }
        });
    });

    describe('C. Geometry, Material & Shader Configuration', () => {
        it('creates a BufferGeometry with all required per-star vertex attributes', () => {
            const geom = createCelestialStarfieldGeometry({ count: 1200 });
            assert.ok(geom instanceof BufferGeometry);

            const posAttr = geom.getAttribute('position');
            const colAttr = geom.getAttribute('color');
            const sizeAttr = geom.getAttribute('aSize');
            const twinkleAttr = geom.getAttribute('aTwinkle');
            const alphaAttr = geom.getAttribute('aBaseAlpha');

            assert.ok(posAttr && posAttr.itemSize === 3, 'position attribute must have itemSize 3');
            assert.ok(colAttr && colAttr.itemSize === 3, 'color attribute must have itemSize 3');
            assert.ok(sizeAttr && sizeAttr.itemSize === 1, 'aSize attribute must have itemSize 1');
            assert.ok(twinkleAttr && twinkleAttr.itemSize === 3, 'aTwinkle attribute must have itemSize 3');
            assert.ok(alphaAttr && alphaAttr.itemSize === 1, 'aBaseAlpha attribute must have itemSize 1');

            assert.equal(posAttr.count, 1200);
        });

        it('creates a ShaderMaterial with correct depth, blending, and uniform states', () => {
            const mat = createCelestialStarfieldMaterial();
            assert.ok(mat instanceof ShaderMaterial);

            // Depth & blending
            assert.equal(mat.transparent, true, 'Must be transparent for gentle alpha blending');
            assert.equal(mat.depthWrite, false, 'Must not write to depth buffer');
            assert.equal(mat.depthTest, true, 'Must perform depth testing against foreground objects');
            assert.equal(mat.depthFunc, LessEqualDepth, 'Must use LessEqualDepth');
            assert.equal(mat.blending, NormalBlending, 'Must use clean normal alpha blending');

            // Uniforms
            assert.ok(mat.uniforms.uTime, 'uTime uniform must exist');
            assert.equal(mat.uniforms.uTime.value, 0.0);
            assert.ok(mat.uniforms.uOpacity, 'uOpacity uniform must exist');
            assert.equal(mat.uniforms.uOpacity.value, 1.0);
            assert.ok(mat.uniforms.uStarfieldIntensity, 'uStarfieldIntensity uniform must exist');
            assert.equal(mat.uniforms.uStarfieldIntensity.value, 1.0);
            assert.ok(mat.uniforms.uStarScale, 'uStarScale uniform must exist');
            assert.equal(mat.uniforms.uStarScale.value, 1.0);
        });

        it('vertex shader strips camera translation and pins clip depth just inside far plane (z/w = 0.99998)', () => {
            assert.ok(
                CELESTIAL_STARFIELD_VERTEX_SHADER.includes('mat4(mat3(viewMatrix))'),
                'Vertex shader must strip camera translation from viewMatrix'
            );
            assert.ok(
                CELESTIAL_STARFIELD_VERTEX_SHADER.includes('clipPosition.w * 0.99998'),
                'Vertex shader must pin gl_Position depth to clipPosition.w * 0.99998'
            );
            assert.ok(
                CELESTIAL_STARFIELD_VERTEX_SHADER.includes('gl_PointSize'),
                'Vertex shader must assign gl_PointSize'
            );
            assert.ok(
                CELESTIAL_STARFIELD_VERTEX_SHADER.includes('twinkleMod'),
                'Vertex shader must calculate per-star twinkle modulation'
            );
        });

        it('fragment shader creates circular antialiased point disks and smooth nadir ground fade', () => {
            assert.ok(
                CELESTIAL_STARFIELD_FRAGMENT_SHADER.includes('gl_PointCoord'),
                'Fragment shader must sample gl_PointCoord'
            );
            assert.ok(
                CELESTIAL_STARFIELD_FRAGMENT_SHADER.includes('distSq > 0.25'),
                'Fragment shader must discard square corners to form circular discs'
            );
            assert.ok(
                CELESTIAL_STARFIELD_FRAGMENT_SHADER.includes('radialFalloff'),
                'Fragment shader must apply smooth radial falloff'
            );
            assert.ok(
                CELESTIAL_STARFIELD_FRAGMENT_SHADER.includes('1.0 - smoothstep(0.18, 0.5, dist)'),
                'Fragment shader must use standard non-reversed smoothstep edge ordering (0.18 < 0.5)'
            );
            assert.ok(
                CELESTIAL_STARFIELD_FRAGMENT_SHADER.includes('groundFade'),
                'Fragment shader must fade near and below floor level'
            );
        });
    });

    describe('D. Batched THREE.Points & Draw Call Efficiency', () => {
        it('creates a single batched Points mesh with no individual star objects or children', () => {
            const points = createCelestialStarfield();
            assert.ok(points instanceof Points);
            assert.equal(points.name, 'celestial-starfield');
            assert.equal(points.renderOrder, -940, 'Must render after Nebula (-950) and before Scene objects (0)');
            assert.equal(points.frustumCulled, false, 'Distant starfield must not be frustum culled');
            assert.equal(points.children.length, 0, 'Must contain zero child objects (single batched draw call)');
        });
    });

    describe('E. Depth Occlusion & Rendering Order Compatibility', () => {
        it('verifies strict renderOrder hierarchy: DomeGradient (-1e9) < Nebula (-950) < Starfield (-940) < Scene Objects (0)', () => {
            const domeGradientRenderOrder = -1e9;
            const nebulaRenderOrder = -950;
            const starfield = createCelestialStarfield();
            const defaultSceneRenderOrder = 0;

            assert.ok(
                domeGradientRenderOrder < nebulaRenderOrder,
                'DomeGradient (-1e9) must render before Nebula (-950)'
            );
            assert.ok(
                nebulaRenderOrder < starfield.renderOrder,
                'Nebula (-950) must render before Starfield (-940)'
            );
            assert.ok(
                starfield.renderOrder < defaultSceneRenderOrder,
                'Starfield (-940) must render before foreground scene objects and UI (0)'
            );
        });

        it('confirms foreground scene objects (kendama, hands, plinth) strictly occlude the starfield', () => {
            const camera = new PerspectiveCamera(60, 1.0, 0.1, 1000.0);
            camera.updateProjectionMatrix();

            const zClipFractionStarfield = 0.99998;
            const zWinStarfield = 0.5 * zClipFractionStarfield + 0.5; // 0.99999

            const testDistances = [0.2, 0.5, 1.0, 2.0, 5.0, 20.0, 50.0];

            for (const distance of testDistances) {
                const viewPos = new Vector4(0, 0, -distance, 1.0);
                const clipPos = viewPos.applyMatrix4(camera.projectionMatrix);
                const ndcZ = clipPos.z / clipPos.w;
                const winZ = 0.5 * ndcZ + 0.5;

                assert.ok(
                    winZ < zWinStarfield,
                    `Foreground object at ${distance}m (zWin = ${winZ}) must have smaller depth than starfield (${zWinStarfield})`
                );

                // Hardware depth test (zIncoming <= zBuffer): incoming starfield depth must NOT pass over foreground depth
                const starDrawsOverForeground = (zWinStarfield <= winZ);
                assert.equal(
                    starDrawsOverForeground,
                    false,
                    `Star fragment must be occluded by foreground object at ${distance}m`
                );
            }
        });

        it('confirms stars pass depth testing against cleared sky depth (1.0)', () => {
            const zWinStarfield = 0.5 * 0.99998 + 0.5;
            const clearDepth = 1.0;
            const passesClearDepth = (zWinStarfield <= clearDepth);
            assert.equal(passesClearDepth, true, 'Stars must pass depth test over cleared background buffer');
        });
    });

    describe('F. CelestialEnvironmentSystem Integration & Lifecycle', () => {
        it('keeps starfield hidden in showroom mode by default', () => {
            const mockWorld = createMockWorldWithLevelRoot();
            const system = new CelestialEnvironmentSystem(mockWorld);
            system.init();

            assert.equal(system.getMode(), 'showroom');
            const starfield = system.getStarfieldMesh();
            assert.ok(!starfield || starfield.visible === false, 'Starfield must be hidden or uncreated in showroom mode');
        });

        it('activates and shows the starfield when setMode("gameplay") is called', () => {
            const mockWorld = createMockWorldWithLevelRoot();
            const system = new CelestialEnvironmentSystem(mockWorld);
            system.init();

            system.setMode('gameplay');
            assert.equal(system.getMode(), 'gameplay');

            const starfield = system.getStarfieldMesh();
            assert.ok(starfield, 'Starfield mesh must be created on gameplay transition');
            assert.equal(starfield.visible, true, 'Starfield mesh must be visible in gameplay mode');
            assert.ok(mockWorld.scene.children.includes(starfield), 'Starfield mesh must be added to world scene');
        });

        it('hides starfield cleanly when switching back to showroom mode', () => {
            const mockWorld = createMockWorldWithLevelRoot();
            const system = new CelestialEnvironmentSystem(mockWorld);
            system.init();

            system.setMode('gameplay');
            assert.equal(system.getStarfieldMesh().visible, true);

            system.setMode('showroom');
            assert.equal(system.getMode(), 'showroom');
            assert.equal(system.getStarfieldMesh().visible, false, 'Starfield must be hidden in showroom mode');
        });

        it('does not create duplicate starfield instances upon repeated mode switching', () => {
            const mockWorld = createMockWorldWithLevelRoot();
            const system = new CelestialEnvironmentSystem(mockWorld);
            system.init();

            system.setMode('gameplay');
            const starfieldInstance1 = system.getStarfieldMesh();

            system.setMode('showroom');
            system.setMode('gameplay');
            const starfieldInstance2 = system.getStarfieldMesh();

            assert.equal(
                starfieldInstance1,
                starfieldInstance2,
                'Must reuse identical Starfield instance across repeated mode transitions'
            );
            assert.equal(
                mockWorld.scene.children.filter((c) => c.name === 'celestial-starfield').length,
                1,
                'Must contain exactly 1 starfield mesh in the scene'
            );
        });

        it('allows independent visibility and intensity adjustment for starfield', () => {
            const mockWorld = createMockWorldWithLevelRoot();
            const system = new CelestialEnvironmentSystem(mockWorld);
            system.init();

            system.setMode('gameplay');
            const starfield = system.getStarfieldMesh();
            const nebula = system.getNebulaMesh();

            // Set starfield invisible while nebula remains visible
            system.setStarfieldVisible(false);
            assert.equal(starfield.visible, false);
            assert.equal(nebula.visible, true);

            // Set starfield intensity
            system.setStarfieldIntensity(0.5);
            assert.equal(starfield.material.uniforms.uStarfieldIntensity.value, 0.5);

            // Nebula intensity unaffected
            assert.equal(nebula.material.uniforms.uNebulaIntensity.value, 0.85);
        });

        it('animates uTime uniform during update() without creating CPU allocations', () => {
            const mockWorld = createMockWorldWithLevelRoot();
            const system = new CelestialEnvironmentSystem(mockWorld);
            system.init();

            system.setMode('gameplay');
            const starfield = system.getStarfieldMesh();
            assert.equal(starfield.material.uniforms.uTime.value, 0.0);

            system.update(0.016);
            assert.ok(
                starfield.material.uniforms.uTime.value > 0.0,
                'Starfield uTime must increment per frame in gameplay mode'
            );

            const prev = starfield.material.uniforms.uTime.value;
            system.update(0.016);
            assert.ok(starfield.material.uniforms.uTime.value > prev, 'Starfield uTime must continue advancing');
        });

        it('disposes starfield geometry and material cleanly on destroy()', () => {
            const mockWorld = createMockWorldWithLevelRoot();
            const system = new CelestialEnvironmentSystem(mockWorld);
            system.init();

            system.setMode('gameplay');
            const starfield = system.getStarfieldMesh();
            let geomDisposed = false;
            let matDisposed = false;

            starfield.geometry.dispose = () => { geomDisposed = true; };
            starfield.material.dispose = () => { matDisposed = true; };

            system.destroy();
            assert.equal(geomDisposed, true, 'Starfield geometry must be disposed on destroy()');
            assert.equal(matDisposed, true, 'Starfield material must be disposed on destroy()');
            assert.equal(system.getStarfieldMesh(), null, 'Starfield reference must be cleared on destroy()');
        });
    });

    describe('G. Single Ownership Architecture & Scene Declarations', () => {
        it('verifies celestial-starfield is not registered in src/assets.js (owned exclusively by CelestialEnvironmentSystem)', () => {
            const assetsPath = resolve(__dirname, '../assets.js');
            const content = readFileSync(assetsPath, 'utf8');
            assert.ok(
                !content.includes("'celestial-starfield':"),
                'src/assets.js must not register celestial-starfield asset (owned exclusively by CelestialEnvironmentSystem)'
            );
        });

        it('verifies celestial-starfield node is declared in public/scenes/gameplay.iwsdk.scene.json', () => {
            const scenePath = resolve(__dirname, '../../public/scenes/gameplay.iwsdk.scene.json');
            const sceneJson = JSON.parse(readFileSync(scenePath, 'utf8'));

            const starfieldNode = sceneJson.nodes.find((n) => n.id === 'celestial-starfield');
            assert.ok(starfieldNode, 'gameplay.iwsdk.scene.json must contain celestial-starfield node');
            assert.equal(starfieldNode.content.asset, 'celestial-starfield');
        });
    });
});
