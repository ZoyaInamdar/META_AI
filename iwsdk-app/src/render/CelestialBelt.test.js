/**
 * Celestial Kendama - Unit Tests for Golden Celestial Orbital Belt
 * Role: Person C (Visuals & Rendering)
 *
 * Verifies:
 * - Palette definitions and Champagne Gold color hierarchy
 * - Normal vector and 3D orbital plane alignment with Astraea, Selene, and forward Kendama framing
 * - Fragmented Torus arc geometry generation (gaps, varied lengths, and secondary arcs)
 * - Energy nodes and distinctive 4-point cross-shaped sparkle bursts (✦)
 * - Ultra-lightweight performance: exactly 2 draw calls (1 Mesh for arcs, 1 Points for nodes/sparkles)
 * - ShaderMaterial configuration (translation stripping, clip depth pinning at 0.99988, LessEqualDepth)
 * - Animation and orbital drift updates
 * - Clean disposal and resource cleanup
 */

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
    BufferGeometry,
    Group,
    LessEqualDepth,
    Mesh,
    NormalBlending,
    Points,
    ShaderMaterial,
    Vector3,
} from 'three';
import {
    CELESTIAL_BELT_PALETTE,
    CELESTIAL_BELT_NORMAL,
    hexToRgb,
    CELESTIAL_BELT_VERTEX_SHADER,
    CELESTIAL_BELT_FRAGMENT_SHADER,
    CELESTIAL_NODE_VERTEX_SHADER,
    CELESTIAL_NODE_FRAGMENT_SHADER,
    createCelestialBeltMaterial,
    createCelestialBeltNodesMaterial,
    createCelestialBeltGeometry,
    createCelestialBeltNodesGeometry,
    createCelestialBelt,
    updateCelestialBelt,
    disposeCelestialBelt,
} from './CelestialBelt.js';

describe('CelestialBelt - Golden Celestial Orbital Belt Layer', () => {
    describe('A. Palette & Orbital Plane Geometry', () => {
        it('exports all required Champagne Gold hierarchy colors', () => {
            assert.equal(CELESTIAL_BELT_PALETTE.CHAMPAGNE_GOLD, '#E8C68D');
            assert.equal(CELESTIAL_BELT_PALETTE.SOFT_GOLD, '#DBB67D');
            assert.equal(CELESTIAL_BELT_PALETTE.WARM_PEARL_GOLD, '#F5E2BD');
            assert.equal(CELESTIAL_BELT_PALETTE.WHITE_GOLD, '#FDF7EA');
        });

        it('converts hex strings to normalized float RGB arrays accurately', () => {
            const champagneRgb = hexToRgb(CELESTIAL_BELT_PALETTE.CHAMPAGNE_GOLD);
            assert.equal(champagneRgb[0], 0.9098);
            assert.equal(champagneRgb[1], 0.7765);
            assert.equal(champagneRgb[2], 0.5529);

            const softGoldRgb = hexToRgb(CELESTIAL_BELT_PALETTE.SOFT_GOLD);
            assert.equal(softGoldRgb[0], 0.8588);
            assert.equal(softGoldRgb[1], 0.7137);
            assert.equal(softGoldRgb[2], 0.4902);
        });

        it('defines normal vector oriented to frame the Kendama without occluding the gameplay area', () => {
            const normal = new Vector3(...CELESTIAL_BELT_NORMAL).normalize();

            // Forward sky vector at +19.4° elevation: (0, sin(19.4°), -cos(19.4°))
            const elevatedForward = new Vector3(0, Math.sin(0.339), -Math.cos(0.339)).normalize();
            const dotForward = Math.abs(normal.dot(elevatedForward));
            assert.ok(dotForward < 0.05, 'Orbital belt plane must pass through forward sky at ~19° elevation');

            // Kendama viewing ray: (0, -0.45, -1.12) normalized
            const kendamaRay = new Vector3(0, -0.45, -1.12).normalize();
            const dotKendama = Math.abs(normal.dot(kendamaRay));
            assert.ok(dotKendama > 0.50, 'Belt plane must NOT intersect Kendama interaction area (dot product > 0.50)');

            // Astraea position: (-30, 21, -62)
            const astraeaPos = new Vector3(-30, 21, -62).normalize();
            const dotAstraea = Math.abs(normal.dot(astraeaPos));
            assert.ok(dotAstraea < 0.08, 'Orbital belt plane must pass near Astraea in upper-left sky');

            // Selene position: (30, 20, -64)
            const selenePos = new Vector3(30, 20, -64).normalize();
            const dotSelene = Math.abs(normal.dot(selenePos));
            assert.ok(dotSelene < 0.06, 'Orbital belt plane must pass near Selene in upper-right sky');
        });
    });

    describe('B. Arc Geometry Construction & Organic Fragmentation', () => {
        it('creates merged BufferGeometry with primary and secondary arc fragments', () => {
            const geom = createCelestialBeltGeometry({ primaryRadius: 56.0 });
            assert.ok(geom instanceof BufferGeometry);

            const posAttr = geom.getAttribute('position');
            const normAttr = geom.getAttribute('normal');
            const uvAttr = geom.getAttribute('uv');
            const weightAttr = geom.getAttribute('aArcWeight');

            assert.ok(posAttr && posAttr.itemSize === 3, 'Must have position attribute');
            assert.ok(normAttr && normAttr.itemSize === 3, 'Must have normal attribute');
            assert.ok(uvAttr && uvAttr.itemSize === 2, 'Must have uv attribute');
            assert.ok(weightAttr && weightAttr.itemSize === 1, 'Must have aArcWeight attribute');

            // Must have vertices from multiple merged arc segments
            assert.ok(posAttr.count > 500, `Merged arcs must have substantial geometry (found ${posAttr.count} vertices)`);
            assert.ok(geom.index, 'Must use indexed geometry for optimal GPU vertex reuse');
        });

        it('embeds varying weights for primary vs secondary arcs in aArcWeight attribute', () => {
            const geom = createCelestialBeltGeometry();
            const weights = geom.getAttribute('aArcWeight').array;

            let hasPrimaryWeight = false;
            let hasSecondaryWeight = false;

            for (let i = 0; i < weights.length; i++) {
                if (weights[i] >= 0.85) hasPrimaryWeight = true;
                if (weights[i] <= 0.40) hasSecondaryWeight = true;
            }

            assert.equal(hasPrimaryWeight, true, 'Must contain primary arc segments with weight >= 0.85');
            assert.equal(hasSecondaryWeight, true, 'Must contain secondary arc segments with weight <= 0.40');
        });
    });

    describe('C. Energy Nodes & Sparkle Bursts Points Geometry', () => {
        it('constructs batched Points geometry with distinctive sparkle bursts and energy nodes', () => {
            const geom = createCelestialBeltNodesGeometry({ primaryRadius: 56.0 });
            assert.ok(geom instanceof BufferGeometry);

            const posAttr = geom.getAttribute('position');
            const colAttr = geom.getAttribute('color');
            const sizeAttr = geom.getAttribute('aSize');
            const alphaAttr = geom.getAttribute('aBaseAlpha');
            const typeAttr = geom.getAttribute('aType');
            const pulseAttr = geom.getAttribute('aPulse');

            assert.ok(posAttr && posAttr.itemSize === 3);
            assert.ok(colAttr && colAttr.itemSize === 3);
            assert.ok(sizeAttr && sizeAttr.itemSize === 1);
            assert.ok(alphaAttr && alphaAttr.itemSize === 1);
            assert.ok(typeAttr && typeAttr.itemSize === 1);
            assert.ok(pulseAttr && pulseAttr.itemSize === 2);

            const count = posAttr.count;
            assert.ok(count >= 15 && count <= 40, `Node count (${count}) should be between 15 and 40`);

            // Verify presence of both circular nodes (type 0.0) and star sparkles (type 1.0)
            let nodeCount = 0;
            let sparkleCount = 0;
            for (let i = 0; i < count; i++) {
                if (typeAttr.getX(i) > 0.5) sparkleCount++;
                else nodeCount++;
            }

            assert.ok(sparkleCount >= 4, `Must include distinct star sparkle highlights (found ${sparkleCount})`);
            assert.ok(nodeCount >= 6, `Must include glowing energy nodes (found ${nodeCount})`);
        });
    });

    describe('D. ShaderMaterial Configuration & Depth Pinning', () => {
        it('creates arc ShaderMaterial with translation stripping and depth pinning at 0.99988', () => {
            const mat = createCelestialBeltMaterial();
            assert.ok(mat instanceof ShaderMaterial);
            assert.equal(mat.transparent, true);
            assert.equal(mat.depthTest, true);
            assert.equal(mat.depthWrite, false);
            assert.equal(mat.depthFunc, LessEqualDepth);
            assert.equal(mat.blending, NormalBlending);

            // Shaders contain translation stripping and depth pinning
            assert.ok(mat.vertexShader.includes('mat4(mat3(viewMatrix))'));
            assert.ok(mat.vertexShader.includes('clipPosition.w * 0.99988'));

            // Uniforms
            assert.ok(mat.uniforms.uTime);
            assert.ok(mat.uniforms.uOpacity);
            assert.ok(mat.uniforms.uBeltIntensity);
            assert.ok(mat.uniforms.uChampagneGold);
            assert.ok(mat.uniforms.uSoftGold);
            assert.ok(mat.uniforms.uWarmPearlGold);
            assert.ok(mat.uniforms.uWhiteGold);
        });

        it('creates nodes ShaderMaterial with translation stripping and depth pinning at 0.99987', () => {
            const mat = createCelestialBeltNodesMaterial();
            assert.ok(mat instanceof ShaderMaterial);
            assert.equal(mat.transparent, true);
            assert.equal(mat.depthTest, true);
            assert.equal(mat.depthWrite, false);
            assert.equal(mat.depthFunc, LessEqualDepth);

            assert.ok(mat.vertexShader.includes('mat4(mat3(viewMatrix))'));
            assert.ok(mat.vertexShader.includes('clipPosition.w * 0.99987'));
            assert.ok(mat.fragmentShader.includes('armH'));
            assert.ok(mat.fragmentShader.includes('armV'));
        });
    });

    describe('E. Group Assembly & Draw Call Efficiency', () => {
        it('creates complete Celestial Belt group with exactly 2 draw calls (1 Mesh, 1 Points)', () => {
            const belt = createCelestialBelt();
            assert.ok(belt instanceof Group);
            assert.equal(belt.name, 'celestial-belt');
            assert.equal(belt.renderOrder, -918);

            const arcMesh = belt.getObjectByName('celestial-belt-arcs');
            assert.ok(arcMesh instanceof Mesh, 'Must contain celestial-belt-arcs Mesh');
            assert.equal(arcMesh.renderOrder, -918);
            assert.equal(arcMesh.frustumCulled, false);

            const nodesPoints = belt.getObjectByName('celestial-belt-nodes');
            assert.ok(nodesPoints instanceof Points, 'Must contain celestial-belt-nodes Points');
            assert.equal(nodesPoints.renderOrder, -917);
            assert.equal(nodesPoints.frustumCulled, false);

            // Exactly 2 child draw calls in the group
            assert.equal(belt.children.length, 2, 'Must contain exactly 2 children (1 Mesh + 1 Points) for 2 draw calls');
        });

        it('applies slow orbital drift and time advancement in updateCelestialBelt', () => {
            const belt = createCelestialBelt();
            const arcMesh = belt.getObjectByName('celestial-belt-arcs');
            const initialTime = arcMesh.material.uniforms.uTime.value;

            updateCelestialBelt(belt, 0.1);

            const updatedTime = arcMesh.material.uniforms.uTime.value;
            assert.ok(updatedTime > initialTime, 'uTime uniform must advance with dt');
        });

        it('disposes all geometries and materials safely without throwing', () => {
            const belt = createCelestialBelt();
            let disposedCount = 0;

            belt.traverse((child) => {
                if (child.isMesh || child.isPoints) {
                    const origGeomDispose = child.geometry.dispose.bind(child.geometry);
                    child.geometry.dispose = () => {
                        disposedCount++;
                        origGeomDispose();
                    };
                }
            });

            disposeCelestialBelt(belt);
            // 2 geometries: arcGeometry and nodesGeometry
            assert.equal(disposedCount, 2, 'Must dispose both geometries');
        });
    });
});
