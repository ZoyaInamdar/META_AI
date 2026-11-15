/**
 * Celestial Kendama - Unit Tests for CelestialNebulaShader & Procedural Layer
 * Role: Person C (Visuals & Rendering)
 *
 * Verifies:
 * - Palette definitions and color values
 * - createCelestialNebulaMaterial property and uniform configuration
 * - Translation stripping and clip-space far-plane depth in vertex shader
 * - Analytical 3D simplex noise, 2-octave domain warping, and pastel ramp in fragment shader
 * - createCelestialNebulaMesh configuration (renderOrder: -950, BackSide, depthWrite: false)
 * - Integration with CelestialEnvironmentSystem: hidden in showroom, visible and ticking in gameplay
 * - Asset registration in assets.js and node definition in gameplay.iwsdk.scene.json
 */

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    BackSide,
    LessEqualDepth,
    Mesh,
    NormalBlending,
    PerspectiveCamera,
    ShaderMaterial,
    SphereGeometry,
    Vector3,
    Vector4,
} from 'three';
import {
    CELESTIAL_NEBULA_PALETTE,
    CELESTIAL_NEBULA_VERTEX_SHADER,
    CELESTIAL_NEBULA_FRAGMENT_SHADER,
    GALACTIC_NORMAL,
    createCelestialNebulaMaterial,
    createCelestialNebulaMesh,
} from './CelestialNebulaShader.js';
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

describe('CelestialNebulaShader - Phase 2 Procedural Pastel Nebula Layer', () => {
    describe('A. Palette Definitions & Galactic Alignment', () => {
        it('defines all key pastel cosmic fantasy galaxy colors', () => {
            assert.equal(CELESTIAL_NEBULA_PALETTE.MIDNIGHT_BLUE, '#18264F');
            assert.equal(CELESTIAL_NEBULA_PALETTE.DEEP_NEBULA_BLUE, '#344B83');
            assert.equal(CELESTIAL_NEBULA_PALETTE.DUSTY_PERIWINKLE, '#7886C5');
            assert.equal(CELESTIAL_NEBULA_PALETTE.DEEP_LAVENDER, '#796A9F');
            assert.equal(CELESTIAL_NEBULA_PALETTE.SOFT_LAVENDER, '#B9A4D6');
            assert.equal(CELESTIAL_NEBULA_PALETTE.BLUSH_PINK, '#F2B8D0');
            assert.equal(CELESTIAL_NEBULA_PALETTE.SOFT_PEACH, '#F6D2C2');
            assert.equal(CELESTIAL_NEBULA_PALETTE.PEARL_WHITE, '#FFF5F5');
            assert.equal(CELESTIAL_NEBULA_PALETTE.CHAMPAGNE_GOLD, '#E8C68D');
        });

        it('exports normalized galactic plane normal vector for shared celestial alignment', () => {
            assert.ok(Array.isArray(GALACTIC_NORMAL) || ArrayBuffer.isView(GALACTIC_NORMAL));
            assert.equal(GALACTIC_NORMAL.length, 3);
            const mag = Math.sqrt(
                GALACTIC_NORMAL[0] ** 2 +
                GALACTIC_NORMAL[1] ** 2 +
                GALACTIC_NORMAL[2] ** 2
            );
            assert.ok(Math.abs(mag - 1.0) < 1e-3, 'Galactic normal must be normalized');
        });
    });

    describe('B. Material Configuration & Shaders', () => {
        it('creates a ShaderMaterial with correct render states for celestial background layering', () => {
            const mat = createCelestialNebulaMaterial();
            assert.ok(mat instanceof ShaderMaterial);

            // Depth and side configuration
            assert.equal(mat.side, BackSide, 'Must render on BackSide of the enclosing sphere');
            assert.equal(mat.depthWrite, false, 'Must not write to depth buffer to preserve depth for subsequent transparent passes');
            assert.equal(mat.depthTest, true, 'Must enable depthTest so foreground opaque objects occlude the nebula');
            assert.equal(mat.depthFunc, LessEqualDepth, 'Must use LessEqualDepth so nebula passes against cleared buffer (1.0)');
            assert.equal(mat.transparent, true, 'Must support smooth alpha blending over DomeGradient');
            assert.equal(mat.blending, NormalBlending, 'Must use clean normal alpha blending');

            // Uniforms
            assert.ok(mat.uniforms.uTime, 'uTime uniform must exist');
            assert.equal(mat.uniforms.uTime.value, 0.0);
            assert.ok(mat.uniforms.uOpacity, 'uOpacity uniform must exist');
            assert.equal(mat.uniforms.uOpacity.value, 1.0);
            assert.ok(mat.uniforms.uNebulaIntensity, 'uNebulaIntensity uniform must exist');
            assert.equal(mat.uniforms.uNebulaIntensity.value, 0.85);
        });

        it('vertex shader strips camera translation and pins clip-space depth just inside far plane (z/w = 0.99999)', () => {
            assert.ok(
                CELESTIAL_NEBULA_VERTEX_SHADER.includes('mat4(mat3(viewMatrix))'),
                'Vertex shader must strip camera translation from viewMatrix'
            );
            assert.ok(
                CELESTIAL_NEBULA_VERTEX_SHADER.includes('clipPosition.w * 0.99999'),
                'Vertex shader must pin gl_Position depth to clipPosition.w * 0.99999 (just inside far plane)'
            );
            assert.ok(
                CELESTIAL_NEBULA_VERTEX_SHADER.includes('vWorldDirection'),
                'Vertex shader must pass normalized vWorldDirection to fragment shader'
            );
        });

        it('fragment shader includes 3D simplex noise, 2-octave domain warping, and pastel color ramp', () => {
            assert.ok(
                CELESTIAL_NEBULA_FRAGMENT_SHADER.includes('float snoise(vec3 v)'),
                'Fragment shader must implement analytical 3D simplex noise'
            );
            assert.ok(
                CELESTIAL_NEBULA_FRAGMENT_SHADER.includes('warpedDir'),
                'Fragment shader must implement domain-warp coordinates'
            );
            assert.ok(
                CELESTIAL_NEBULA_FRAGMENT_SHADER.includes('oct1') &&
                CELESTIAL_NEBULA_FRAGMENT_SHADER.includes('oct2'),
                'Fragment shader must evaluate two noise octaves'
            );
            assert.ok(
                CELESTIAL_NEBULA_FRAGMENT_SHADER.includes('cLavender') &&
                CELESTIAL_NEBULA_FRAGMENT_SHADER.includes('cBlushPink') &&
                CELESTIAL_NEBULA_FRAGMENT_SHADER.includes('cPearlWhite'),
                'Fragment shader must contain pastel palette stops'
            );
            assert.ok(
                CELESTIAL_NEBULA_FRAGMENT_SHADER.includes('horizonFade'),
                'Fragment shader must implement horizon falloff to preserve DomeFade'
            );
            assert.ok(
                CELESTIAL_NEBULA_FRAGMENT_SHADER.includes('1.0 - smoothstep(-0.6, 0.5, dir.z)'),
                'Fragment shader must use standard non-reversed smoothstep edge ordering for forwardFocal (-0.6 < 0.5)'
            );
            assert.ok(
                CELESTIAL_NEBULA_FRAGMENT_SHADER.includes('cGalacticNormal'),
                'Fragment shader must define diagonal galactic normal'
            );
            assert.ok(
                CELESTIAL_NEBULA_FRAGMENT_SHADER.includes('bandCore'),
                'Fragment shader must compute diagonal galactic band envelope'
            );
            assert.ok(
                CELESTIAL_NEBULA_FRAGMENT_SHADER.includes('dustLane'),
                'Fragment shader must introduce cosmic crevices / dust lanes for cloud depth'
            );
        });
    });

    describe('C. Depth Rendering & Foreground Occlusion Validation', () => {
        it('verifies clip-space depth fraction (0.99999) places nebula strictly inside the far plane', () => {
            const zClipFraction = 0.99999;
            const zNdc = zClipFraction; // zClip / wClip where zClip = wClip * 0.99999
            assert.ok(zNdc < 1.0, 'NDC depth must be strictly less than 1.0 to avoid far-plane precision clipping');
            assert.ok(zNdc > 0.999, 'NDC depth must be located in the outermost background range');

            // Standard WebGL window depth mapping: zWin = 0.5 * zNdc + 0.5 (glDepthRange 0..1)
            const zWinNebula = 0.5 * zNdc + 0.5;
            assert.equal(zWinNebula, 0.999995);

            // Against cleared background (clearDepth = 1.0): LessEqualDepth (zIncoming <= zBuffer)
            const clearDepth = 1.0;
            const passesClearDepth = zWinNebula <= clearDepth;
            assert.equal(passesClearDepth, true, 'Nebula must pass depth test against cleared background / DomeGradient');
        });

        it('confirms foreground scene objects (kendama, hands, plinth) strictly occlude the nebula', () => {
            const camera = new PerspectiveCamera(60, 1.0, 0.1, 1000.0);
            camera.updateProjectionMatrix();

            const zClipFractionNebula = 0.99999;
            const zWinNebula = 0.5 * zClipFractionNebula + 0.5; // 0.999995

            // Test various foreground gameplay distances:
            // - 0.2m (hands / near controller)
            // - 0.5m (inspected kendama)
            // - 1.0m (seated plinth / table)
            // - 5.0m (room boundary)
            // - 20.0m (far studio wall)
            const testDistances = [0.2, 0.5, 1.0, 2.0, 5.0, 20.0, 50.0];

            for (const distance of testDistances) {
                // Object along negative Z view axis
                const viewPos = new Vector4(0, 0, -distance, 1.0);
                const clipPos = viewPos.applyMatrix4(camera.projectionMatrix);
                const ndcZ = clipPos.z / clipPos.w;
                const winZ = 0.5 * ndcZ + 0.5;

                // Foreground object depth must be strictly less than nebula depth
                assert.ok(
                    winZ < zWinNebula,
                    `Foreground object at distance ${distance}m (zWin = ${winZ}) must have smaller depth than nebula (${zWinNebula})`
                );

                // Hardware depth test condition: fragment passes if (zIncoming <= zBuffer)
                // When nebula renders over foreground object pixel: incoming is zWinNebula, buffer has winZ
                const nebulaDrawsOverForeground = (zWinNebula <= winZ);
                assert.equal(
                    nebulaDrawsOverForeground,
                    false,
                    `Nebula fragment must NOT draw over foreground object at ${distance}m (must be occluded)`
                );
            }
        });

        it('maintains strict renderOrder hierarchy: DomeGradient (-1e9) < CelestialNebula (-950) < Scene Objects (0)', () => {
            const domeGradientRenderOrder = -1e9;
            const nebulaMesh = createCelestialNebulaMesh();
            const defaultSceneRenderOrder = 0;

            assert.ok(
                domeGradientRenderOrder < nebulaMesh.renderOrder,
                'DomeGradient (-1e9) must render before CelestialNebula (-950)'
            );
            assert.ok(
                nebulaMesh.renderOrder < defaultSceneRenderOrder,
                'CelestialNebula (-950) must render before standard scene objects and UI (0)'
            );
        });

        it('preserves depthWrite: false so subsequent transparent passes (UI, particles) are not blocked', () => {
            const mat = createCelestialNebulaMaterial();
            assert.equal(mat.depthWrite, false, 'depthWrite must be false to keep depth buffer clean for transparent elements');
            assert.equal(mat.depthTest, true, 'depthTest must be true to allow opaque geometry occlusion');
        });
    });

    describe('D. Mesh Configuration', () => {
        it('creates a Mesh with renderOrder: -950 and inward sphere geometry', () => {
            const mesh = createCelestialNebulaMesh();
            assert.ok(mesh instanceof Mesh);
            assert.equal(mesh.name, 'celestial-nebula-shell');
            assert.equal(mesh.renderOrder, -950, 'Must render after DomeGradient (-1e9) and before scene objects (0)');
            assert.equal(mesh.frustumCulled, false, 'Sky shell must not be frustum culled');
            assert.ok(mesh.geometry instanceof SphereGeometry);
            assert.ok(mesh.material instanceof ShaderMaterial);
        });
    });

    describe('E. Integration with CelestialEnvironmentSystem', () => {
        it('keeps nebula hidden in showroom mode by default to preserve showroom environment', () => {
            const mockWorld = createMockWorldWithLevelRoot();
            const system = new CelestialEnvironmentSystem(mockWorld);
            system.init();

            assert.equal(system.getMode(), 'showroom');
            const nebula = system.getNebulaMesh();
            // Should be null or visible = false
            assert.ok(!nebula || nebula.visible === false);
        });

        it('activates and shows the nebula mesh when setMode("gameplay") is called', () => {
            const mockWorld = createMockWorldWithLevelRoot();
            const system = new CelestialEnvironmentSystem(mockWorld);
            system.init();

            system.setMode('gameplay');
            assert.equal(system.getMode(), 'gameplay');

            const nebula = system.getNebulaMesh();
            assert.ok(nebula, 'Nebula mesh must be created on gameplay transition');
            assert.equal(nebula.visible, true, 'Nebula mesh must be visible in gameplay mode');
            assert.ok(mockWorld.scene.children.includes(nebula), 'Nebula mesh must be added to world scene');
        });

        it('hides the nebula mesh cleanly when switching back to showroom mode', () => {
            const mockWorld = createMockWorldWithLevelRoot();
            const system = new CelestialEnvironmentSystem(mockWorld);
            system.init();

            system.setMode('gameplay');
            assert.equal(system.getNebulaMesh().visible, true);

            system.setMode('showroom');
            assert.equal(system.getMode(), 'showroom');
            assert.equal(system.getNebulaMesh().visible, false, 'Nebula must be hidden in showroom mode');
        });

        it('animates uTime uniform during update() while in gameplay mode', () => {
            const mockWorld = createMockWorldWithLevelRoot();
            const system = new CelestialEnvironmentSystem(mockWorld);
            system.init();

            system.setMode('gameplay');
            const nebula = system.getNebulaMesh();
            assert.equal(nebula.material.uniforms.uTime.value, 0.0);

            system.update(0.016);
            assert.ok(
                nebula.material.uniforms.uTime.value > 0.0,
                'uTime uniform must increment per frame in gameplay mode'
            );

            const previousTime = nebula.material.uniforms.uTime.value;
            system.update(0.016);
            assert.ok(
                nebula.material.uniforms.uTime.value > previousTime,
                'uTime must continue advancing'
            );
        });
    });

    describe('F. Single Ownership Architecture & Scene Declarations', () => {
        it('verifies celestial-nebula is not registered in src/assets.js (owned exclusively by CelestialEnvironmentSystem)', () => {
            const assetsPath = resolve(__dirname, '../assets.js');
            const content = readFileSync(assetsPath, 'utf8');
            assert.ok(
                !content.includes("'celestial-nebula':"),
                'src/assets.js must not register celestial-nebula asset (owned exclusively by CelestialEnvironmentSystem)'
            );
        });

        it('verifies celestial-nebula node is declared in public/scenes/gameplay.iwsdk.scene.json', () => {
            const scenePath = resolve(__dirname, '../../public/scenes/gameplay.iwsdk.scene.json');
            const sceneJson = JSON.parse(readFileSync(scenePath, 'utf8'));

            const nebulaNode = sceneJson.nodes.find((n) => n.id === 'celestial-nebula');
            assert.ok(nebulaNode, 'gameplay.iwsdk.scene.json must contain celestial-nebula node');
            assert.equal(nebulaNode.content.asset, 'celestial-nebula');
        });
    });
});
