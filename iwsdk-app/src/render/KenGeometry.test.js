/**
 * Celestial Kendama - Unit Tests for KenGeometry.js
 * Role: Person C (Visuals & Rendering)
 *
 * Verifies procedural geometry generation adhering strictly to Person A's
 * authoritative configurations in src/input/cupConfigs.js.
 */

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
    Vector3,
    Quaternion,
    Mesh,
    MeshBasicMaterial,
    DoubleSide,
    Raycaster,
    Box3,
} from 'three';
import {
    kenGeometry,
    cupConfigs,
    CUP_CONFIGS,
    KEN_SCALE,
    BALL_RADIUS,
    getCupConfig,
} from '../input/cupConfigs.js';
import {
    createCupGeometry,
    createHandleGeometry,
    createCrossbarGeometry,
    createSpikeGeometry,
    deriveSpikeLength,
    deriveHandleDimensions,
    DEFAULT_WALL_THICKNESS,
    DEFAULT_RADIAL_SEGMENTS,
    DEFAULT_PROFILE_STEPS,
    DEFAULT_FLOOR_RADIUS_RATIO,
    DEFAULT_HANDLE_LENGTH,
    DEFAULT_HANDLE_TOP_RADIUS,
    DEFAULT_HANDLE_BOTTOM_RADIUS,
    DEFAULT_HANDLE_WAIST_RADIUS,
    DEFAULT_CROSSBAR_HALF_WIDTH,
    DEFAULT_CROSSBAR_SPAN,
    DEFAULT_CROSSBAR_LENGTH,
    DEFAULT_CROSSBAR_CENTER_RADIUS,
    DEFAULT_CROSSBAR_END_RADIUS,
    DEFAULT_CROSSBAR_BIG_SPAN,
    DEFAULT_CROSSBAR_SMALL_SPAN,
    DEFAULT_CROSSBAR_BIG_END_RADIUS,
    DEFAULT_CROSSBAR_SMALL_END_RADIUS,
    DEFAULT_SARADO_ELEVATION_Y,
    DEFAULT_SPIKE_LENGTH,
    DEFAULT_SPIKE_ROOT_RADIUS,
    DEFAULT_SPIKE_TIP_RADIUS,
    DEFAULT_STEM_TOP_Y,
    DEFAULT_STEM_BOTTOM_Y,
    DEFAULT_STEM_NECK_RADIUS,
    DEFAULT_STEM_BULGE_Y,
    DEFAULT_STEM_BULGE_RADIUS,
    DEFAULT_STEM_BASE_FLARE_RADIUS,
    DEFAULT_SPIKE_BASE_Y,
    DEFAULT_SPIKE_TIP_Y,
} from './KenGeometry.js';
import { createKendamaAssemblyGroup } from '../scene-assets/cup-preview.scene-asset.js';
import { COMPONENT_MATERIAL_MAP } from './KenMaterials.js';

describe('KenGeometry Module (Authoritative Integration)', () => {
    describe('Authoritative Configuration Invariants', () => {
        it('verifies Person A single source of truth dimensions and scaling', () => {
            assert.equal(KEN_SCALE, 1.5, 'KEN_SCALE must equal 1.5');
            assert.equal(BALL_RADIUS, 0.045, 'BALL_RADIUS must equal 0.045 (0.03 * 1.5)');

            // Crossbar
            assert.equal(kenGeometry.crossbar.halfWidth, 0.06075, 'halfWidth = 0.0405 * 1.5');
            assert.equal(kenGeometry.crossbar.waistRadius, 0.0165, 'waistRadius = 0.011 * 1.5');
            assert.equal(kenGeometry.crossbar.endRadius, 0.033, 'endRadius = 0.022 * 1.5');

            // Stem
            assert.ok(Math.abs(kenGeometry.stem.topY - (-0.033)) < 1e-6, 'topY = -0.022 * 1.5');
            assert.ok(Math.abs(kenGeometry.stem.bottomY - (-0.180)) < 1e-6, 'bottomY = -0.120 * 1.5');
            assert.ok(Math.abs(kenGeometry.stem.neckRadius - 0.01125) < 1e-6, 'neckRadius = 0.0075 * 1.5');
            assert.ok(Math.abs(kenGeometry.stem.bulgeY - (-0.1185)) < 1e-6, 'bulgeY = -0.079 * 1.5');
            assert.ok(Math.abs(kenGeometry.stem.bulgeRadius - 0.0195) < 1e-6, 'bulgeRadius = 0.013 * 1.5');
            assert.ok(Math.abs(kenGeometry.stem.baseFlareRadius - 0.02625) < 1e-6, 'baseFlareRadius = 0.0175 * 1.5');

            // Spike
            assert.ok(Math.abs(kenGeometry.spike.baseY - 0.033) < 1e-6, 'baseY = 0.022 * 1.5');
            assert.ok(Math.abs(kenGeometry.spike.tipY - 0.0675) < 1e-6, 'tipY = 0.045 * 1.5');

            // Cups
            const big = cupConfigs.big ?? CUP_CONFIGS.big;
            assert.ok(Math.abs(big.rimRadius - 0.033) < 1e-6);
            assert.ok(Math.abs(big.depth - 0.018) < 1e-6);
            assert.ok(Math.abs(big.localPos.x - 0.06075) < 1e-6);
            assert.equal(big.localPos.y, 0.0);
            assert.equal(big.localPos.z, 0.0);
            assert.equal(big.localNormal.x, 1.0);
            assert.equal(big.localNormal.y, 0.0);
            assert.equal(big.localNormal.z, 0.0);

            const small = cupConfigs.small ?? CUP_CONFIGS.small;
            assert.ok(Math.abs(small.rimRadius - 0.0255) < 1e-6);
            assert.ok(Math.abs(small.depth - 0.015) < 1e-6);
            assert.ok(Math.abs(small.localPos.x - (-0.06075)) < 1e-6);
            assert.equal(small.localPos.y, 0.0);
            assert.equal(small.localPos.z, 0.0);
            assert.equal(small.localNormal.x, -1.0);
            assert.equal(small.localNormal.y, 0.0);
            assert.equal(small.localNormal.z, 0.0);

            const base = cupConfigs.base ?? CUP_CONFIGS.base;
            assert.ok(Math.abs(base.rimRadius - 0.02625) < 1e-6);
            assert.ok(Math.abs(base.depth - 0.012) < 1e-6);
            assert.equal(base.localPos.x, 0.0);
            assert.ok(Math.abs(base.localPos.y - (-0.180)) < 1e-6);
            assert.equal(base.localPos.z, 0.0);
            assert.equal(base.localNormal.x, 0.0);
            assert.equal(base.localNormal.y, -1.0);
            assert.equal(base.localNormal.z, 0.0);

            const spike = cupConfigs.spike ?? CUP_CONFIGS.spike;
            assert.equal(spike.localPos.x, 0.0);
            assert.ok(Math.abs(spike.localPos.y - 0.0675) < 1e-6);
            assert.equal(spike.localPos.z, 0.0);
            assert.equal(spike.localNormal.x, 0.0);
            assert.equal(spike.localNormal.y, 1.0);
            assert.equal(spike.localNormal.z, 0.0);
        });

        it('verifies ball seating offset formula for all cups', () => {
            for (const cup of [cupConfigs.big, cupConfigs.small, cupConfigs.base]) {
                const expectedOffset = Math.sqrt(BALL_RADIUS ** 2 - cup.rimRadius ** 2);
                assert.ok(Math.abs(cup.seatOffset - expectedOffset) < 1e-6);
            }
            assert.equal(cupConfigs.spike.seatOffset, 0.0);
        });
    });

    describe('Big Cup Geometry Generation', () => {
        it('generates a valid LatheGeometry using Person A Big Cup config', () => {
            const bigCupConfig = cupConfigs.big ?? CUP_CONFIGS.big;
            assert.ok(bigCupConfig, 'Big Cup configuration must exist');
            assert.ok(Math.abs(bigCupConfig.rimRadius - 0.033) < 1e-6);
            assert.ok(Math.abs(bigCupConfig.depth - 0.018) < 1e-6);

            const geometry = createCupGeometry(bigCupConfig);
            assert.ok(geometry, 'createCupGeometry must return a geometry instance');
            assert.equal(geometry.type, 'LatheGeometry');

            const posAttr = geometry.attributes.position;
            assert.ok(posAttr, 'Geometry must have position attributes');
            assert.ok(posAttr.count > 0, 'Geometry must have vertices');

            const normAttr = geometry.attributes.normal;
            assert.ok(normAttr, 'Geometry must have normal attributes');
            assert.equal(normAttr.count, posAttr.count);
        });

        it('creates a hollow cup with correct bounding box dimensions', () => {
            const bigCupConfig = cupConfigs.big ?? CUP_CONFIGS.big;
            const wallThickness = 0.003;
            const geometry = createCupGeometry(bigCupConfig, { wallThickness });

            geometry.computeBoundingBox();
            const bbox = geometry.boundingBox;
            assert.ok(bbox, 'Bounding box must be computed');

            const expectedOuterRadius = bigCupConfig.rimRadius + wallThickness; // 0.036 m
            const expectedTotalDepth = bigCupConfig.depth + wallThickness;       // 0.021 m

            assert.ok(
                Math.abs(bbox.min.x - (-expectedOuterRadius)) < 1e-4,
                `bbox.min.x (${bbox.min.x}) should match -expectedOuterRadius (${-expectedOuterRadius})`
            );
            assert.ok(
                Math.abs(bbox.max.x - expectedOuterRadius) < 1e-4,
                `bbox.max.x (${bbox.max.x}) should match expectedOuterRadius (${expectedOuterRadius})`
            );
            assert.ok(
                Math.abs(bbox.min.z - (-expectedOuterRadius)) < 1e-4,
                `bbox.min.z (${bbox.min.z}) should match -expectedOuterRadius (${-expectedOuterRadius})`
            );
            assert.ok(
                Math.abs(bbox.max.z - expectedOuterRadius) < 1e-4,
                `bbox.max.z (${bbox.max.z}) should match expectedOuterRadius (${expectedOuterRadius})`
            );

            // Along Y: Rim opening is at y=0, bowl extends backwards to -expectedTotalDepth
            assert.ok(
                Math.abs(bbox.min.y - (-expectedTotalDepth)) < 1e-4,
                `bbox.min.y (${bbox.min.y}) should reach bottom base depth (${-expectedTotalDepth})`
            );
            assert.ok(
                bbox.max.y >= 0.0 && bbox.max.y <= 0.001,
                `bbox.max.y (${bbox.max.y}) should be at the opening rim near y = 0`
            );
        });

        it('does not modify the supplied cupConfig object', () => {
            const bigCupConfig = cupConfigs.big ?? CUP_CONFIGS.big;
            const originalKeys = Object.keys(bigCupConfig);
            const originalDepth = bigCupConfig.depth;
            const originalRimRadius = bigCupConfig.rimRadius;

            createCupGeometry(bigCupConfig, { wallThickness: 0.004 });

            assert.deepEqual(Object.keys(bigCupConfig), originalKeys);
            assert.equal(bigCupConfig.depth, originalDepth);
            assert.equal(bigCupConfig.rimRadius, originalRimRadius);
        });
    });

    describe('Bottom-Wall Construction & Thickness Verification', () => {
        it('constructs a proper flat inner floor at y = -depth', () => {
            const bigCupConfig = cupConfigs.big ?? CUP_CONFIGS.big;
            const depth = bigCupConfig.depth; // 0.018 m
            const geometry = createCupGeometry(bigCupConfig);
            const pos = geometry.attributes.position;

            let foundInnerFloorCenter = false;
            for (let i = 0; i < pos.count; i++) {
                const x = pos.getX(i);
                const y = pos.getY(i);
                const z = pos.getZ(i);
                const r = Math.hypot(x, z);

                if (r < 1e-5 && Math.abs(y - (-depth)) < 1e-5) {
                    foundInnerFloorCenter = true;
                    break;
                }
            }
            assert.ok(foundInnerFloorCenter, 'Inner floor must have a center vertex at (0, -depth, 0)');
        });

        it('constructs a proper flat outer bottom at y = -(depth + wallThickness)', () => {
            const bigCupConfig = cupConfigs.big ?? CUP_CONFIGS.big;
            const depth = bigCupConfig.depth; // 0.018 m
            const wallThickness = 0.003;
            const outerDepth = depth + wallThickness; // 0.021 m
            const geometry = createCupGeometry(bigCupConfig, { wallThickness });
            const pos = geometry.attributes.position;

            let foundOuterBaseCenter = false;
            for (let i = 0; i < pos.count; i++) {
                const x = pos.getX(i);
                const y = pos.getY(i);
                const z = pos.getZ(i);
                const r = Math.hypot(x, z);

                if (r < 1e-5 && Math.abs(y - (-outerDepth)) < 1e-5) {
                    foundOuterBaseCenter = true;
                    break;
                }
            }
            assert.ok(
                foundOuterBaseCenter,
                'Outer bottom must have a center vertex at (0, -outerDepth, 0)'
            );
        });

        it('verifies bottom wall thickness via raycasting through the center', () => {
            const bigCupConfig = cupConfigs.big ?? CUP_CONFIGS.big;
            const wallThickness = 0.003;
            const depth = bigCupConfig.depth; // 0.018 m
            const geometry = createCupGeometry(bigCupConfig, { wallThickness });
            const mesh = new Mesh(geometry, new MeshBasicMaterial({ side: DoubleSide }));

            // Cast vertical ray straight down through the center from above
            const ray = new Raycaster(new Vector3(0.002, 0.05, 0.002), new Vector3(0, -1, 0));
            const hits = ray.intersectObject(mesh);

            assert.ok(hits.length >= 2, 'Ray through bottom must penetrate inner floor and outer base');

            const innerFloorHit = hits[0];
            const outerBaseHit = hits[1];

            assert.ok(
                Math.abs(innerFloorHit.point.y - (-depth)) < 1e-4,
                `Inner floor hit y (${innerFloorHit.point.y}) must be at -depth (${-depth})`
            );

            const expectedOuterY = -(depth + wallThickness);
            assert.ok(
                Math.abs(outerBaseHit.point.y - expectedOuterY) < 1e-4,
                `Outer base hit y (${outerBaseHit.point.y}) must be at -outerDepth (${expectedOuterY})`
            );

            const measuredThickness = innerFloorHit.point.y - outerBaseHit.point.y;
            assert.ok(
                Math.abs(measuredThickness - wallThickness) < 1e-4,
                `Measured bottom thickness (${measuredThickness}) must match wallThickness (${wallThickness})`
            );
        });

        it('verifies that the cup opening at y >= 0 is completely unobstructed', () => {
            const bigCupConfig = cupConfigs.big ?? CUP_CONFIGS.big;
            const geometry = createCupGeometry(bigCupConfig);
            const mesh = new Mesh(geometry, new MeshBasicMaterial({ side: DoubleSide }));

            // Ray crossing horizontally above the rim aperture (y = +0.005 m)
            const rayAbove = new Raycaster(new Vector3(-0.1, 0.005, 0), new Vector3(1, 0, 0));
            const hitsAbove = rayAbove.intersectObject(mesh);
            assert.equal(hitsAbove.length, 0, 'Ray above rim must encounter no obstruction');

            // Ray passing through the inner cavity (y = -0.010 m)
            const rayCavity = new Raycaster(new Vector3(-0.1, -0.010, 0), new Vector3(1, 0, 0));
            const hitsCavity = rayCavity.intersectObject(mesh);
            assert.equal(
                hitsCavity.length,
                4,
                'Ray through cup body must hit outer and inner walls on both sides'
            );
        });
    });

    describe('Mesh Quality, Watertightness & Surface Normal Audit', () => {
        it('contains zero degenerate (zero-area) triangles after index filtering', () => {
            const bigCupConfig = cupConfigs.big ?? CUP_CONFIGS.big;
            const geometry = createCupGeometry(bigCupConfig);
            const pos = geometry.attributes.position;
            const index = geometry.index;
            assert.ok(index, 'Geometry must be indexed');

            let degenerateCount = 0;
            for (let i = 0; i < index.count; i += 3) {
                const a = index.getX(i);
                const b = index.getX(i + 1);
                const c = index.getX(i + 2);

                const pa = new Vector3(pos.getX(a), pos.getY(a), pos.getZ(a));
                const pb = new Vector3(pos.getX(b), pos.getY(b), pos.getZ(b));
                const pc = new Vector3(pos.getX(c), pos.getY(c), pos.getZ(c));

                const area = pb.clone().sub(pa).cross(pc.clone().sub(pa)).length() * 0.5;
                if (area < 1e-9) {
                    degenerateCount++;
                }
            }

            assert.equal(
                degenerateCount,
                0,
                'Geometry must not contain degenerate zero-area triangles'
            );
        });

        it('forms a 100% closed, watertight, 2-manifold surface with 0 boundary edges', () => {
            const bigCupConfig = cupConfigs.big ?? CUP_CONFIGS.big;
            const geometry = createCupGeometry(bigCupConfig);
            const pos = geometry.attributes.position;
            const index = geometry.index;

            const TOL = 1e-5;
            function pKey(x, y, z) {
                const rx = Math.round(x / TOL) * TOL;
                const ry = Math.round(y / TOL) * TOL;
                const rz = Math.round(z / TOL) * TOL;
                return `${rx.toFixed(5)},${ry.toFixed(5)},${rz.toFixed(5)}`;
            }

            const spatialMap = new Map();
            let nextId = 0;
            for (let i = 0; i < pos.count; i++) {
                const k = pKey(pos.getX(i), pos.getY(i), pos.getZ(i));
                if (!spatialMap.has(k)) {
                    spatialMap.set(k, nextId++);
                }
            }

            const edgeFaceCount = new Map();
            const directedEdges = new Map();

            for (let i = 0; i < index.count; i += 3) {
                const u0 = spatialMap.get(pKey(pos.getX(index.getX(i)), pos.getY(index.getX(i)), pos.getZ(index.getX(i))));
                const u1 = spatialMap.get(pKey(pos.getX(index.getX(i + 1)), pos.getY(index.getX(i + 1)), pos.getZ(index.getX(i + 1))));
                const u2 = spatialMap.get(pKey(pos.getX(index.getX(i + 2)), pos.getY(index.getX(i + 2)), pos.getZ(index.getX(i + 2))));

                const triEdges = [[u0, u1], [u1, u2], [u2, u0]];
                for (const [a, b] of triEdges) {
                    const ek = a < b ? `${a}-${b}` : `${b}-${a}`;
                    edgeFaceCount.set(ek, (edgeFaceCount.get(ek) || 0) + 1);

                    const dk = `${a}->${b}`;
                    directedEdges.set(dk, (directedEdges.get(dk) || 0) + 1);
                }
            }

            let boundaryEdges = 0;
            let nonManifoldEdges = 0;
            for (const count of edgeFaceCount.values()) {
                if (count === 1) boundaryEdges++;
                else if (count > 2) nonManifoldEdges++;
            }

            assert.equal(boundaryEdges, 0, 'Mesh must have zero boundary edges (no holes/gaps)');
            assert.equal(nonManifoldEdges, 0, 'Mesh must have zero non-manifold edges');

            let windingMismatches = 0;
            for (const [ek, count] of edgeFaceCount.entries()) {
                if (count === 2) {
                    const [a, b] = ek.split('-').map(Number);
                    const dFwd = directedEdges.get(`${a}->${b}`) || 0;
                    const dRev = directedEdges.get(`${b}->${a}`) || 0;
                    if (dFwd !== 1 || dRev !== 1) {
                        windingMismatches++;
                    }
                }
            }
            assert.equal(windingMismatches, 0, 'All face winding orientations must be consistent');
        });

        it('orients surface normals outward from solid material on all 5 surface regions', () => {
            const bigCupConfig = cupConfigs.big ?? CUP_CONFIGS.big;
            const geometry = createCupGeometry(bigCupConfig);
            const pos = geometry.attributes.position;
            const norm = geometry.attributes.normal;

            // 1. Inner Floor center: normal should point UPWARD (+Y) into cavity
            let innerFloorNormalY = null;
            for (let i = 0; i < pos.count; i++) {
                const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
                if (Math.abs(y - (-bigCupConfig.depth)) < 1e-4 && Math.hypot(x, z) < 1e-4) {
                    innerFloorNormalY = norm.getY(i);
                    break;
                }
            }
            assert.ok(innerFloorNormalY !== null, 'Inner floor center vertex must exist');
            assert.ok(innerFloorNormalY > 0.9, `Inner floor normal Y (${innerFloorNormalY}) must point upward (+Y)`);

            // 2. Outer Base center: normal should point DOWNWARD (-Y) into room
            let outerBaseNormalY = null;
            const expectedOuterDepth = bigCupConfig.depth + DEFAULT_WALL_THICKNESS;
            for (let i = 0; i < pos.count; i++) {
                const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
                if (Math.abs(y - (-expectedOuterDepth)) < 1e-4 && Math.hypot(x, z) < 1e-4) {
                    outerBaseNormalY = norm.getY(i);
                    break;
                }
            }
            assert.ok(outerBaseNormalY !== null, 'Outer base center vertex must exist');
            assert.ok(outerBaseNormalY < -0.9, `Outer base normal Y (${outerBaseNormalY}) must point downward (-Y)`);

            // 3. Inner Wall: radial normal should point INWARD (-r) into cavity
            let foundInnerWall = false;
            for (let i = 0; i < pos.count; i++) {
                const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
                const r = Math.hypot(x, z);
                if (y < -0.002 && y > -bigCupConfig.depth + 0.002 && r > 0.012 && r < bigCupConfig.rimRadius) {
                    const nx = norm.getX(i), nz = norm.getZ(i);
                    const radialNorm = (nx * x + nz * z) / r;
                    if (radialNorm < -0.5) {
                        foundInnerWall = true;
                        break;
                    }
                }
            }
            assert.ok(foundInnerWall, 'Inner wall sample vertex with inward normal must exist');

            // 4. Outer Wall: radial normal should point OUTWARD (+r) into room
            let foundOuterWall = false;
            for (let i = 0; i < pos.count; i++) {
                const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
                const r = Math.hypot(x, z);
                if (y < -0.002 && y > -bigCupConfig.depth + 0.002 && r > 0.020) {
                    const nx = norm.getX(i), nz = norm.getZ(i);
                    const radialNorm = (nx * x + nz * z) / r;
                    if (radialNorm > 0.5) {
                        foundOuterWall = true;
                        break;
                    }
                }
            }
            assert.ok(foundOuterWall, 'Outer wall sample vertex with outward normal must exist');

            // 5. Rim Lip crest: normal should point UPWARD (+Y) into room
            let foundRimLip = false;
            for (let i = 0; i < pos.count; i++) {
                const y = pos.getY(i);
                if (y > 0.0001) {
                    const ny = norm.getY(i);
                    assert.ok(ny > 0.9, `Rim lip crest normal Y (${ny}) must point upward (+Y)`);
                    foundRimLip = true;
                    break;
                }
            }
            assert.ok(foundRimLip, 'Rim lip crest sample vertex must exist');
        });
    });

    describe('Transform & Normal Orientation Validation', () => {
        it('positions and aligns the Big Cup mesh using Person A position and normal', () => {
            const bigCupConfig = cupConfigs.big ?? CUP_CONFIGS.big;
            assert.ok(bigCupConfig);

            const geometry = createCupGeometry(bigCupConfig);
            const material = new MeshBasicMaterial();
            const cupMesh = new Mesh(geometry, material);

            // 1. Position rim center at configured catch point
            cupMesh.position.set(
                bigCupConfig.localPos.x,
                bigCupConfig.localPos.y,
                bigCupConfig.localPos.z
            );
            assert.equal(cupMesh.position.x, 0.06075);
            assert.equal(cupMesh.position.y, 0.0);
            assert.equal(cupMesh.position.z, 0.0);

            // 2. Align local +Y (opening normal) with Person A outward normal (+X)
            const localNormal = new Vector3(0, 1, 0);
            const targetNormal = new Vector3(
                bigCupConfig.localNormal.x,
                bigCupConfig.localNormal.y,
                bigCupConfig.localNormal.z
            ).normalize();

            cupMesh.quaternion.setFromUnitVectors(localNormal, targetNormal);

            const orientedNormal = localNormal.clone().applyQuaternion(cupMesh.quaternion);
            const dot = orientedNormal.dot(targetNormal);
            assert.ok(
                Math.abs(dot - 1.0) < 1e-5,
                `Oriented normal dot product (${dot}) must equal 1.0 (perfect alignment)`
            );
            assert.ok(Math.abs(orientedNormal.x - 1.0) < 1e-5, 'Oriented normal.x should point along +X');
            assert.ok(Math.abs(orientedNormal.y - 0.0) < 1e-5, 'Oriented normal.y should be 0');
            assert.ok(Math.abs(orientedNormal.z - 0.0) < 1e-5, 'Oriented normal.z should be 0');
        });
    });

    describe('Input Validation & Error Handling', () => {
        it('throws TypeError when cupConfig is null, undefined, or invalid', () => {
            // @ts-ignore
            assert.throws(() => createCupGeometry(null), TypeError);
            // @ts-ignore
            assert.throws(() => createCupGeometry(undefined), TypeError);
            // @ts-ignore
            assert.throws(() => createCupGeometry('invalid'), TypeError);
        });

        it('throws RangeError when rimRadius is invalid or non-positive', () => {
            assert.throws(() => createCupGeometry({ rimRadius: 0, depth: 0.03 }), RangeError);
            assert.throws(() => createCupGeometry({ rimRadius: -0.05, depth: 0.03 }), RangeError);
            assert.throws(() => createCupGeometry({ rimRadius: NaN, depth: 0.03 }), RangeError);
            // @ts-ignore
            assert.throws(() => createCupGeometry({ depth: 0.03 }), RangeError);
        });

        it('throws RangeError when depth is invalid or non-positive', () => {
            assert.throws(() => createCupGeometry({ rimRadius: 0.045, depth: 0 }), RangeError);
            assert.throws(() => createCupGeometry({ rimRadius: 0.045, depth: -0.01 }), RangeError);
            assert.throws(() => createCupGeometry({ rimRadius: 0.045, depth: Infinity }), RangeError);
            // @ts-ignore
            assert.throws(() => createCupGeometry({ rimRadius: 0.045 }), RangeError);
        });

        it('throws RangeError when wallThickness is non-positive or exceeds rimRadius', () => {
            assert.throws(
                () => createCupGeometry({ rimRadius: 0.045, depth: 0.03 }, { wallThickness: 0 }),
                RangeError
            );
            assert.throws(
                () => createCupGeometry({ rimRadius: 0.045, depth: 0.03 }, { wallThickness: -0.001 }),
                RangeError
            );
            assert.throws(
                () => createCupGeometry({ rimRadius: 0.045, depth: 0.03 }, { wallThickness: 0.05 }),
                RangeError
            );
        });

        it('throws RangeError when innerFloorRadius is invalid', () => {
            assert.throws(
                () => createCupGeometry({ rimRadius: 0.045, depth: 0.03 }, { innerFloorRadius: 0 }),
                RangeError
            );
            assert.throws(
                () => createCupGeometry({ rimRadius: 0.045, depth: 0.03 }, { innerFloorRadius: 0.05 }),
                RangeError
            );
        });

        it('throws RangeError when radialSegments or profileSteps are invalid', () => {
            assert.throws(
                () => createCupGeometry({ rimRadius: 0.045, depth: 0.03 }, { radialSegments: 4 }),
                RangeError
            );
            assert.throws(
                () => createCupGeometry({ rimRadius: 0.045, depth: 0.03 }, { profileSteps: 2 }),
                RangeError
            );
        });
    });

    describe('Handle Geometry Generation', () => {
        it('generates a valid LatheGeometry with default options matching kenGeometry.stem', () => {
            const handle = createHandleGeometry();
            assert.ok(handle, 'Handle geometry must be created');
            assert.equal(handle.type, 'LatheGeometry');
            assert.ok(handle.attributes.position.count > 0, 'Handle must contain vertices');
            assert.ok(handle.attributes.normal.count > 0, 'Handle must contain normals');
            assert.ok(handle.index, 'Handle must be indexed');
        });

        it('has expected bounding box dimensions and is oriented along the Y-axis', () => {
            const handle = createHandleGeometry();
            handle.computeBoundingBox();
            const box = handle.boundingBox;

            const sizeX = box.max.x - box.min.x;
            const sizeY = box.max.y - box.min.y;
            const sizeZ = box.max.z - box.min.z;

            // Height along Y spans from DEFAULT_STEM_BOTTOM_Y (-0.180) to DEFAULT_STEM_TOP_Y (-0.033)
            assert.ok(Math.abs(sizeY - DEFAULT_HANDLE_LENGTH) < 1e-4, `Height must be ~${DEFAULT_HANDLE_LENGTH}`);
            assert.ok(Math.abs(box.min.y - DEFAULT_STEM_BOTTOM_Y) < 1e-4);
            assert.ok(Math.abs(box.max.y - DEFAULT_STEM_TOP_Y) < 1e-4);

            // Maximum diameter in X and Z reflects the bottom flare (2 * DEFAULT_HANDLE_BOTTOM_RADIUS = 0.0525 m)
            const expectedMaxDiameter = DEFAULT_HANDLE_BOTTOM_RADIUS * 2;
            assert.ok(Math.abs(sizeX - expectedMaxDiameter) < 1e-4, 'X diameter must match bottom radius * 2');
            assert.ok(Math.abs(sizeZ - expectedMaxDiameter) < 1e-4, 'Z diameter must match bottom radius * 2');

            // Must be clearly elongated along Y
            assert.ok(sizeY > sizeX * 2.5, 'Handle must be elongated along Y');
            assert.ok(sizeY > sizeZ * 2.5, 'Handle must be elongated along Y');

            // Centered around origin in X and Z
            assert.ok(Math.abs((box.min.x + box.max.x) * 0.5) < 1e-6, 'Handle must be centered on X');
            assert.ok(Math.abs((box.min.z + box.max.z) * 0.5) < 1e-6, 'Handle must be centered on Z');
        });

        it('ensures all vertex positions and normals are finite numbers', () => {
            const handle = createHandleGeometry();
            const pos = handle.attributes.position;
            const norm = handle.attributes.normal;

            for (let i = 0; i < pos.count; i++) {
                assert.ok(Number.isFinite(pos.getX(i)), `Position X at ${i} must be finite`);
                assert.ok(Number.isFinite(pos.getY(i)), `Position Y at ${i} must be finite`);
                assert.ok(Number.isFinite(pos.getZ(i)), `Position Z at ${i} must be finite`);

                assert.ok(Number.isFinite(norm.getX(i)), `Normal X at ${i} must be finite`);
                assert.ok(Number.isFinite(norm.getY(i)), `Normal Y at ${i} must be finite`);
                assert.ok(Number.isFinite(norm.getZ(i)), `Normal Z at ${i} must be finite`);
            }
        });

        it('contains zero degenerate zero-area triangles', () => {
            const handle = createHandleGeometry();
            const pos = handle.attributes.position;
            const index = handle.index;

            let degenerateCount = 0;
            for (let i = 0; i < index.count; i += 3) {
                const a = index.getX(i);
                const b = index.getX(i + 1);
                const c = index.getX(i + 2);

                const pa = new Vector3(pos.getX(a), pos.getY(a), pos.getZ(a));
                const pb = new Vector3(pos.getX(b), pos.getY(b), pos.getZ(b));
                const pc = new Vector3(pos.getX(c), pos.getY(c), pos.getZ(c));

                const area = pb.clone().sub(pa).cross(pc.clone().sub(pa)).length() * 0.5;
                if (area < 1e-9) {
                    degenerateCount++;
                }
            }

            assert.equal(degenerateCount, 0, 'Handle must contain zero degenerate triangles');
        });

        it('forms a 100% closed, watertight, 2-manifold surface with 0 boundary edges', () => {
            const handle = createHandleGeometry();
            const pos = handle.attributes.position;
            const index = handle.index;

            const TOL = 1e-5;
            function pKey(x, y, z) {
                const rx = Math.round(x / TOL) * TOL;
                const ry = Math.round(y / TOL) * TOL;
                const rz = Math.round(z / TOL) * TOL;
                return `${rx.toFixed(5)},${ry.toFixed(5)},${rz.toFixed(5)}`;
            }

            const spatialMap = new Map();
            let nextId = 0;
            for (let i = 0; i < pos.count; i++) {
                const k = pKey(pos.getX(i), pos.getY(i), pos.getZ(i));
                if (!spatialMap.has(k)) {
                    spatialMap.set(k, nextId++);
                }
            }

            const edgeFaceCount = new Map();
            const directedEdges = new Map();

            for (let i = 0; i < index.count; i += 3) {
                const u0 = spatialMap.get(pKey(pos.getX(index.getX(i)), pos.getY(index.getX(i)), pos.getZ(index.getX(i))));
                const u1 = spatialMap.get(pKey(pos.getX(index.getX(i + 1)), pos.getY(index.getX(i + 1)), pos.getZ(index.getX(i + 1))));
                const u2 = spatialMap.get(pKey(pos.getX(index.getX(i + 2)), pos.getY(index.getX(i + 2)), pos.getZ(index.getX(i + 2))));

                const triEdges = [[u0, u1], [u1, u2], [u2, u0]];
                for (const [a, b] of triEdges) {
                    const ek = a < b ? `${a}-${b}` : `${b}-${a}`;
                    edgeFaceCount.set(ek, (edgeFaceCount.get(ek) || 0) + 1);

                    const dk = `${a}->${b}`;
                    directedEdges.set(dk, (directedEdges.get(dk) || 0) + 1);
                }
            }

            let boundaryEdges = 0;
            let nonManifoldEdges = 0;
            for (const count of edgeFaceCount.values()) {
                if (count === 1) boundaryEdges++;
                else if (count > 2) nonManifoldEdges++;
            }

            assert.equal(boundaryEdges, 0, 'Handle must have 0 boundary edges (watertight)');
            assert.equal(nonManifoldEdges, 0, 'Handle must have 0 non-manifold edges');

            let windingMismatches = 0;
            for (const [ek, count] of edgeFaceCount.entries()) {
                if (count === 2) {
                    const [a, b] = ek.split('-').map(Number);
                    const dFwd = directedEdges.get(`${a}->${b}`) || 0;
                    const dRev = directedEdges.get(`${b}->${a}`) || 0;
                    if (dFwd !== 1 || dRev !== 1) {
                        windingMismatches++;
                    }
                }
            }
            assert.equal(windingMismatches, 0, 'Handle edges must have consistent face winding');
        });

        it('does not mutate caller-supplied options and respects custom dimensions', () => {
            const customOptions = Object.freeze({
                length: 0.14,
                topY: -0.04,
                bottomY: -0.18,
                topRadius: 0.015,
                bottomRadius: 0.016,
                waistRadius: 0.012,
                radialSegments: 24,
                profileSteps: 12,
            });

            const handle = createHandleGeometry(customOptions);
            handle.computeBoundingBox();
            const box = handle.boundingBox;

            assert.ok(Math.abs((box.max.y - box.min.y) - 0.14) < 1e-4, 'Custom height must equal 0.14');
            assert.ok(Math.abs((box.max.x - box.min.x) - 0.032) < 1e-4, 'Custom width must equal 0.032');
        });

        it('validates input options and throws appropriate errors', () => {
            // @ts-ignore
            assert.throws(() => createHandleGeometry('invalid'), TypeError);
            assert.throws(() => createHandleGeometry({ length: -0.1 }), RangeError);
            assert.throws(() => createHandleGeometry({ length: 0 }), RangeError);
            assert.throws(() => createHandleGeometry({ topRadius: 0 }), RangeError);
            assert.throws(() => createHandleGeometry({ bottomRadius: -0.01 }), RangeError);
            assert.throws(() => createHandleGeometry({ waistRadius: 0 }), RangeError);
            assert.throws(() => createHandleGeometry({ radialSegments: 4 }), RangeError);
            assert.throws(() => createHandleGeometry({ profileSteps: 2 }), RangeError);
            assert.throws(() => createHandleGeometry({ filletRadius: 0.05 }), RangeError);
        });
    });

    describe('Crossbar Geometry Generation', () => {
        it('generates a valid geometry with default options matching kenGeometry.crossbar', () => {
            const crossbar = createCrossbarGeometry();
            assert.ok(crossbar, 'Crossbar geometry must be created');
            assert.ok(crossbar.attributes.position.count > 0, 'Crossbar must contain vertices');
            assert.ok(crossbar.attributes.normal.count > 0, 'Crossbar must contain normals');
            assert.ok(crossbar.index, 'Crossbar must be indexed');
        });

        it('has expected bounding box dimensions and is oriented along the X-axis', () => {
            const crossbar = createCrossbarGeometry();
            crossbar.computeBoundingBox();
            const box = crossbar.boundingBox;

            const sizeX = box.max.x - box.min.x;
            const sizeY = box.max.y - box.min.y;
            const sizeZ = box.max.z - box.min.z;

            // X span must extend symmetrically from -halfWidth (-0.06075 m) to +halfWidth (+0.06075 m)
            assert.ok(Math.abs(box.min.x - (-DEFAULT_CROSSBAR_HALF_WIDTH)) < 1e-4);
            assert.ok(Math.abs(box.max.x - DEFAULT_CROSSBAR_HALF_WIDTH) < 1e-4);
            assert.ok(Math.abs(sizeX - DEFAULT_CROSSBAR_SPAN) < 1e-4);

            // Maximum diameter in Y and Z reflects Big Cup end radius (0.033 * 2 = 0.066 m)
            const expectedMaxDiameter = DEFAULT_CROSSBAR_BIG_END_RADIUS * 2;
            assert.ok(Math.abs(sizeY - expectedMaxDiameter) < 1e-4);
            assert.ok(Math.abs(sizeZ - expectedMaxDiameter) < 1e-4);

            // Must be elongated along X
            assert.ok(sizeX > sizeY * 1.5, 'Crossbar must be elongated along X');
            assert.ok(sizeX > sizeZ * 1.5, 'Crossbar must be elongated along X');

            // Centered on Y and Z
            assert.ok(Math.abs((box.min.y + box.max.y) * 0.5) < 1e-4, 'Crossbar must be centered on Y');
            assert.ok(Math.abs((box.min.z + box.max.z) * 0.5) < 1e-6, 'Crossbar must be centered on Z');
        });

        it('reaches the authoritative cup mounting positions', () => {
            const crossbar = createCrossbarGeometry();
            crossbar.computeBoundingBox();
            const box = crossbar.boundingBox;

            const bigCupPos = cupConfigs.big.localPos;
            const smallCupPos = cupConfigs.small.localPos;

            assert.ok(Math.abs(bigCupPos.x - DEFAULT_CROSSBAR_HALF_WIDTH) < 1e-6);
            assert.ok(Math.abs(smallCupPos.x - (-DEFAULT_CROSSBAR_HALF_WIDTH)) < 1e-6);

            assert.ok(Math.abs(box.max.x - bigCupPos.x) < 1e-4);
            assert.ok(Math.abs(box.min.x - smallCupPos.x) < 1e-4);
        });

        it('orients end mounting faces outward matching Person A cup normals', () => {
            const crossbar = createCrossbarGeometry();
            const pos = crossbar.attributes.position;
            const norm = crossbar.attributes.normal;

            // Small cap center is at index pos.count - 2, Big cap center is at pos.count - 1
            const smallCapCenterIdx = pos.count - 2;
            const bigCapCenterIdx = pos.count - 1;

            const bigCapNorm = new Vector3(
                norm.getX(bigCapCenterIdx),
                norm.getY(bigCapCenterIdx),
                norm.getZ(bigCapCenterIdx)
            );
            const smallCapNorm = new Vector3(
                norm.getX(smallCapCenterIdx),
                norm.getY(smallCapCenterIdx),
                norm.getZ(smallCapCenterIdx)
            );

            const expectedBigNorm = cupConfigs.big.localNormal;
            const expectedSmallNorm = cupConfigs.small.localNormal;

            const bigDot = bigCapNorm.dot(expectedBigNorm);
            assert.ok(Math.abs(bigDot - 1.0) < 1e-4, `Big mount normal dot (${bigDot}) must equal 1.0`);

            const smallDot = smallCapNorm.dot(expectedSmallNorm);
            assert.ok(Math.abs(smallDot - 1.0) < 1e-4, `Small mount normal dot (${smallDot}) must equal 1.0`);
        });

        it('ensures all vertex positions and normals are finite numbers', () => {
            const crossbar = createCrossbarGeometry();
            const pos = crossbar.attributes.position;
            const norm = crossbar.attributes.normal;

            for (let i = 0; i < pos.count; i++) {
                assert.ok(Number.isFinite(pos.getX(i)), `Position X at ${i} must be finite`);
                assert.ok(Number.isFinite(pos.getY(i)), `Position Y at ${i} must be finite`);
                assert.ok(Number.isFinite(pos.getZ(i)), `Position Z at ${i} must be finite`);

                assert.ok(Number.isFinite(norm.getX(i)), `Normal X at ${i} must be finite`);
                assert.ok(Number.isFinite(norm.getY(i)), `Normal Y at ${i} must be finite`);
                assert.ok(Number.isFinite(norm.getZ(i)), `Normal Z at ${i} must be finite`);
            }
        });

        it('contains zero degenerate zero-area triangles', () => {
            const crossbar = createCrossbarGeometry();
            const pos = crossbar.attributes.position;
            const index = crossbar.index;

            let degenerateCount = 0;
            for (let i = 0; i < index.count; i += 3) {
                const a = index.getX(i);
                const b = index.getX(i + 1);
                const c = index.getX(i + 2);

                const pa = new Vector3(pos.getX(a), pos.getY(a), pos.getZ(a));
                const pb = new Vector3(pos.getX(b), pos.getY(b), pos.getZ(b));
                const pc = new Vector3(pos.getX(c), pos.getY(c), pos.getZ(c));

                const area = pb.clone().sub(pa).cross(pc.clone().sub(pa)).length() * 0.5;
                if (area < 1e-9) {
                    degenerateCount++;
                }
            }

            assert.equal(degenerateCount, 0, 'Crossbar must contain zero degenerate triangles');
        });

        it('forms a 100% closed, watertight, 2-manifold surface with 0 boundary edges', () => {
            const crossbar = createCrossbarGeometry();
            const pos = crossbar.attributes.position;
            const index = crossbar.index;

            const TOL = 1e-5;
            function pKey(x, y, z) {
                const rx = Math.round(x / TOL) * TOL;
                const ry = Math.round(y / TOL) * TOL;
                const rz = Math.round(z / TOL) * TOL;
                return `${rx.toFixed(5)},${ry.toFixed(5)},${rz.toFixed(5)}`;
            }

            const spatialMap = new Map();
            let nextId = 0;
            for (let i = 0; i < pos.count; i++) {
                const k = pKey(pos.getX(i), pos.getY(i), pos.getZ(i));
                if (!spatialMap.has(k)) {
                    spatialMap.set(k, nextId++);
                }
            }

            const edgeFaceCount = new Map();
            const directedEdges = new Map();

            for (let i = 0; i < index.count; i += 3) {
                const u0 = spatialMap.get(pKey(pos.getX(index.getX(i)), pos.getY(index.getX(i)), pos.getZ(index.getX(i))));
                const u1 = spatialMap.get(pKey(pos.getX(index.getX(i + 1)), pos.getY(index.getX(i + 1)), pos.getZ(index.getX(i + 1))));
                const u2 = spatialMap.get(pKey(pos.getX(index.getX(i + 2)), pos.getY(index.getX(i + 2)), pos.getZ(index.getX(i + 2))));

                const triEdges = [[u0, u1], [u1, u2], [u2, u0]];
                for (const [a, b] of triEdges) {
                    const ek = a < b ? `${a}-${b}` : `${b}-${a}`;
                    edgeFaceCount.set(ek, (edgeFaceCount.get(ek) || 0) + 1);

                    const dk = `${a}->${b}`;
                    directedEdges.set(dk, (directedEdges.get(dk) || 0) + 1);
                }
            }

            let boundaryEdges = 0;
            let nonManifoldEdges = 0;
            for (const count of edgeFaceCount.values()) {
                if (count === 1) boundaryEdges++;
                else if (count > 2) nonManifoldEdges++;
            }

            assert.equal(boundaryEdges, 0, 'Crossbar must have 0 boundary edges (watertight)');
            assert.equal(nonManifoldEdges, 0, 'Crossbar must have 0 non-manifold edges');

            let windingMismatches = 0;
            for (const [ek, count] of edgeFaceCount.entries()) {
                if (count === 2) {
                    const [a, b] = ek.split('-').map(Number);
                    const dFwd = directedEdges.get(`${a}->${b}`) || 0;
                    const dRev = directedEdges.get(`${b}->${a}`) || 0;
                    if (dFwd !== 1 || dRev !== 1) {
                        windingMismatches++;
                    }
                }
            }
            assert.equal(windingMismatches, 0, 'Crossbar edges must have consistent face winding');
        });

        it('does not mutate caller-supplied options and respects custom dimensions', () => {
            const customOptions = Object.freeze({
                length: 0.12,
                centerRadius: 0.016,
                endRadius: 0.013,
                radialSegments: 24,
                profileSteps: 12,
            });

            const crossbar = createCrossbarGeometry(customOptions);
            crossbar.computeBoundingBox();
            const box = crossbar.boundingBox;

            assert.ok(box.max.x > 0.05, 'Custom length must scale positive wing');
            assert.ok(box.min.x < -0.05, 'Custom length must scale negative wing');
        });

        it('validates input options and throws appropriate errors', () => {
            // @ts-ignore
            assert.throws(() => createCrossbarGeometry('invalid'), TypeError);
            assert.throws(() => createCrossbarGeometry({ length: -0.1 }), RangeError);
            assert.throws(() => createCrossbarGeometry({ length: 0 }), RangeError);
            assert.throws(() => createCrossbarGeometry({ centerRadius: 0 }), RangeError);
            assert.throws(() => createCrossbarGeometry({ endRadius: -0.01 }), RangeError);
            assert.throws(() => createCrossbarGeometry({ radialSegments: 4 }), RangeError);
            assert.throws(() => createCrossbarGeometry({ profileSteps: 2 }), RangeError);
            assert.throws(() => createCrossbarGeometry({ filletRadius: 0.05 }), RangeError);
        });
    });

    describe('Spike Geometry Generation', () => {
        it('generates a valid LatheGeometry with default options matching kenGeometry.spike', () => {
            const spike = createSpikeGeometry();
            assert.ok(spike, 'Spike geometry must be created');
            assert.equal(spike.type, 'LatheGeometry');
            assert.ok(spike.attributes.position.count > 0, 'Spike must contain vertices');
            assert.ok(spike.attributes.normal.count > 0, 'Spike must contain normals');
            assert.ok(spike.index, 'Spike must be indexed');
        });

        it('has expected dimensions and is oriented vertically along the Y-axis', () => {
            const spike = createSpikeGeometry();
            spike.computeBoundingBox();
            const box = spike.boundingBox;

            // Height along Y must equal DEFAULT_SPIKE_LENGTH (0.0345 m)
            assert.ok(Math.abs(box.max.y - DEFAULT_SPIKE_LENGTH) < 1e-4, 'Spike height must match DEFAULT_SPIKE_LENGTH');
            assert.ok(Math.abs(box.min.y - 0.0) < 1e-4, 'Spike base must start at y = 0');

            // Maximum radius at base reflects DEFAULT_SPIKE_ROOT_RADIUS (0.01125 m)
            const sizeX = box.max.x - box.min.x;
            const sizeZ = box.max.z - box.min.z;
            assert.ok(Math.abs(sizeX - DEFAULT_SPIKE_ROOT_RADIUS * 2) < 1e-4, 'Base diameter X must match 2 * rootRadius');
            assert.ok(Math.abs(sizeZ - DEFAULT_SPIKE_ROOT_RADIUS * 2) < 1e-4, 'Base diameter Z must match 2 * rootRadius');
        });

        it('contains zero degenerate zero-area triangles', () => {
            const spike = createSpikeGeometry();
            const pos = spike.attributes.position;
            const index = spike.index;

            let degenerateCount = 0;
            for (let i = 0; i < index.count; i += 3) {
                const a = index.getX(i);
                const b = index.getX(i + 1);
                const c = index.getX(i + 2);

                const pa = new Vector3(pos.getX(a), pos.getY(a), pos.getZ(a));
                const pb = new Vector3(pos.getX(b), pos.getY(b), pos.getZ(b));
                const pc = new Vector3(pos.getX(c), pos.getY(c), pos.getZ(c));

                const area = pb.clone().sub(pa).cross(pc.clone().sub(pa)).length() * 0.5;
                if (area < 1e-9) {
                    degenerateCount++;
                }
            }

            assert.equal(degenerateCount, 0, 'Spike must contain zero degenerate triangles');
        });

        it('forms a 100% closed, watertight, 2-manifold surface with 0 boundary edges', () => {
            const spike = createSpikeGeometry();
            const pos = spike.attributes.position;
            const index = spike.index;

            const TOL = 1e-5;
            function pKey(x, y, z) {
                const rx = Math.round(x / TOL) * TOL;
                const ry = Math.round(y / TOL) * TOL;
                const rz = Math.round(z / TOL) * TOL;
                return `${rx.toFixed(5)},${ry.toFixed(5)},${rz.toFixed(5)}`;
            }

            const spatialMap = new Map();
            let nextId = 0;
            for (let i = 0; i < pos.count; i++) {
                const k = pKey(pos.getX(i), pos.getY(i), pos.getZ(i));
                if (!spatialMap.has(k)) {
                    spatialMap.set(k, nextId++);
                }
            }

            const edgeFaceCount = new Map();
            for (let i = 0; i < index.count; i += 3) {
                const u0 = spatialMap.get(pKey(pos.getX(index.getX(i)), pos.getY(index.getX(i)), pos.getZ(index.getX(i))));
                const u1 = spatialMap.get(pKey(pos.getX(index.getX(i + 1)), pos.getY(index.getX(i + 1)), pos.getZ(index.getX(i + 1))));
                const u2 = spatialMap.get(pKey(pos.getX(index.getX(i + 2)), pos.getY(index.getX(i + 2)), pos.getZ(index.getX(i + 2))));

                const triEdges = [[u0, u1], [u1, u2], [u2, u0]];
                for (const [a, b] of triEdges) {
                    const ek = a < b ? `${a}-${b}` : `${b}-${a}`;
                    edgeFaceCount.set(ek, (edgeFaceCount.get(ek) || 0) + 1);
                }
            }

            let boundaryEdges = 0;
            let nonManifoldEdges = 0;
            for (const count of edgeFaceCount.values()) {
                if (count === 1) boundaryEdges++;
                else if (count > 2) nonManifoldEdges++;
            }

            assert.equal(boundaryEdges, 0, 'Spike must have 0 boundary edges (watertight)');
            assert.equal(nonManifoldEdges, 0, 'Spike must have 0 non-manifold edges');
        });

        it('validates input options and throws appropriate errors', () => {
            // @ts-ignore
            assert.throws(() => createSpikeGeometry('invalid'), TypeError);
            assert.throws(() => createSpikeGeometry({ length: -0.1 }), RangeError);
            assert.throws(() => createSpikeGeometry({ length: 0 }), RangeError);
            assert.throws(() => createSpikeGeometry({ rootRadius: 0 }), RangeError);
            assert.throws(() => createSpikeGeometry({ tipRadius: -0.01 }), RangeError);
            assert.throws(() => createSpikeGeometry({ tipRadius: 0.01, rootRadius: 0.005 }), RangeError);
            assert.throws(() => createSpikeGeometry({ radialSegments: 4 }), RangeError);
        });
    });

    describe('Base Cup Geometry Generation', () => {
        it('generates a valid LatheGeometry using Person A Base Cup config', () => {
            const baseCupConfig = cupConfigs.base ?? CUP_CONFIGS.base;
            assert.ok(baseCupConfig, 'Base Cup configuration must exist');
            assert.ok(Math.abs(baseCupConfig.rimRadius - 0.02625) < 1e-6);
            assert.ok(Math.abs(baseCupConfig.depth - 0.012) < 1e-6);

            const geometry = createCupGeometry(baseCupConfig);
            assert.ok(geometry, 'createCupGeometry must return a geometry');
            assert.equal(geometry.type, 'LatheGeometry');
            assert.ok(geometry.attributes.position.count > 0);
            assert.ok(geometry.attributes.normal.count > 0);
            assert.ok(geometry.index);
        });

        it('creates a hollow base cup with correct bounding box dimensions', () => {
            const baseCupConfig = cupConfigs.base ?? CUP_CONFIGS.base;
            const geometry = createCupGeometry(baseCupConfig);
            geometry.computeBoundingBox();
            const box = geometry.boundingBox;

            const outerRadius = baseCupConfig.rimRadius + DEFAULT_WALL_THICKNESS;
            assert.ok(Math.abs(box.max.x - outerRadius) < 1e-4, 'Max X must equal outer radius');
            assert.ok(Math.abs(box.min.x - (-outerRadius)) < 1e-4, 'Min X must equal -outer radius');
            assert.ok(Math.abs(box.max.z - outerRadius) < 1e-4, 'Max Z must equal outer radius');
            assert.ok(Math.abs(box.min.z - (-outerRadius)) < 1e-4, 'Min Z must equal -outer radius');

            const outerDepth = baseCupConfig.depth + DEFAULT_WALL_THICKNESS;
            assert.ok(Math.abs(box.min.y - (-outerDepth)) < 1e-4, 'Min Y must equal -outerDepth');
        });

        it('forms a 100% closed, watertight, 2-manifold surface with 0 boundary edges', () => {
            const geometry = createCupGeometry(cupConfigs.base);
            const pos = geometry.attributes.position;
            const index = geometry.index;

            const TOL = 1e-5;
            function pKey(x, y, z) {
                const rx = Math.round(x / TOL) * TOL;
                const ry = Math.round(y / TOL) * TOL;
                const rz = Math.round(z / TOL) * TOL;
                return `${rx.toFixed(5)},${ry.toFixed(5)},${rz.toFixed(5)}`;
            }

            const spatialMap = new Map();
            let nextId = 0;
            for (let i = 0; i < pos.count; i++) {
                const k = pKey(pos.getX(i), pos.getY(i), pos.getZ(i));
                if (!spatialMap.has(k)) {
                    spatialMap.set(k, nextId++);
                }
            }

            const edgeFaceCount = new Map();
            for (let i = 0; i < index.count; i += 3) {
                const u0 = spatialMap.get(pKey(pos.getX(index.getX(i)), pos.getY(index.getX(i)), pos.getZ(index.getX(i))));
                const u1 = spatialMap.get(pKey(pos.getX(index.getX(i + 1)), pos.getY(index.getX(i + 1)), pos.getZ(index.getX(i + 1))));
                const u2 = spatialMap.get(pKey(pos.getX(index.getX(i + 2)), pos.getY(index.getX(i + 2)), pos.getZ(index.getX(i + 2))));

                const triEdges = [[u0, u1], [u1, u2], [u2, u0]];
                for (const [a, b] of triEdges) {
                    const ek = a < b ? `${a}-${b}` : `${b}-${a}`;
                    edgeFaceCount.set(ek, (edgeFaceCount.get(ek) || 0) + 1);
                }
            }

            let boundaryEdges = 0;
            let nonManifoldEdges = 0;
            for (const count of edgeFaceCount.values()) {
                if (count === 1) boundaryEdges++;
                else if (count > 2) nonManifoldEdges++;
            }

            assert.equal(boundaryEdges, 0, 'Base Cup must have 0 boundary edges (watertight)');
            assert.equal(nonManifoldEdges, 0, 'Base Cup must have 0 non-manifold edges');
        });

        it('correctly positions and orients Base Cup mesh pointing downward along -Y', () => {
            const config = cupConfigs.base ?? CUP_CONFIGS.base;
            const geom = createCupGeometry(config);
            const mat = new MeshBasicMaterial();
            const mesh = new Mesh(geom, mat);
            mesh.position.set(config.localPos.x, config.localPos.y, config.localPos.z);
            mesh.quaternion.setFromUnitVectors(
                new Vector3(0, 1, 0),
                new Vector3(config.localNormal.x, config.localNormal.y, config.localNormal.z).normalize()
            );
            mesh.updateMatrixWorld(true);

            // Aperture rim center is at configured position (0, -0.180, 0)
            const box = new Box3().setFromObject(mesh);
            const outerDepth = config.depth + DEFAULT_WALL_THICKNESS;
            assert.ok(Math.abs(box.max.y - (config.localPos.y + outerDepth)) < 1e-4, 'Outer bottom must be at y = -0.165');
            assert.ok(box.min.y <= config.localPos.y, 'Rim lip extends to or slightly past configured localPos.y');

            // Opening normal points along -Y
            const normalInWorld = new Vector3(0, 1, 0).applyQuaternion(mesh.quaternion);
            assert.ok(Math.abs(normalInWorld.x - 0.0) < 1e-6);
            assert.ok(Math.abs(normalInWorld.y - (-1.0)) < 1e-6);
            assert.ok(Math.abs(normalInWorld.z - 0.0) < 1e-6);
        });
    });

    describe('Spike & Handle Dynamic Derivation', () => {
        it('deriveSpikeLength computes exact length to reach Person A spike tip', () => {
            const spikeConfig = cupConfigs.spike ?? CUP_CONFIGS.spike;
            const length = deriveSpikeLength(spikeConfig, DEFAULT_SPIKE_BASE_Y);
            assert.ok(Math.abs(length - (0.0675 - 0.033)) < 1e-6);
            assert.ok(Math.abs(length - DEFAULT_SPIKE_LENGTH) < 1e-6);

            // Tip elevation matches configured position
            const reachedTipY = DEFAULT_SPIKE_BASE_Y + length;
            assert.ok(Math.abs(reachedTipY - spikeConfig.localPos.y) < 1e-6);
        });

        it('deriveSpikeLength validates input correctly', () => {
            // @ts-ignore
            assert.throws(() => deriveSpikeLength(null), TypeError);
            // @ts-ignore
            assert.throws(() => deriveSpikeLength({}), TypeError);
            assert.throws(() => deriveSpikeLength({ localPos: { y: 0.02 } }, 0.033), RangeError);
        });

        it('deriveHandleDimensions derives length and placement connecting Base Cup to Sarado', () => {
            const dims = deriveHandleDimensions(cupConfigs.base, {
                saradoElevationY: DEFAULT_STEM_TOP_Y,
            });

            assert.equal(dims.topY, DEFAULT_STEM_TOP_Y);
            assert.equal(dims.bottomY, DEFAULT_STEM_BOTTOM_Y);
            assert.equal(dims.length, DEFAULT_HANDLE_LENGTH);
            assert.equal(dims.centerY, (DEFAULT_STEM_TOP_Y + DEFAULT_STEM_BOTTOM_Y) * 0.5);
        });
    });

    describe('Complete Kendama Assembly Verification', () => {
        const assembly = createKendamaAssemblyGroup();
        assembly.updateMatrixWorld(true);

        it('contains all 6 required components including all 4 functional catch targets', () => {
            const children = assembly.children;
            assert.equal(children.length, 6, 'Assembly must contain exactly 6 direct child meshes');

            const childNames = children.map(c => c.name);
            assert.ok(childNames.includes('sarado-crossbar'), 'Must contain sarado-crossbar');
            assert.ok(childNames.includes('big-cup-oozara'), 'Must contain big-cup-oozara');
            assert.ok(childNames.includes('small-cup-kozara'), 'Must contain small-cup-kozara');
            assert.ok(childNames.includes('base-cup-chuzara'), 'Must contain base-cup-chuzara');
            assert.ok(childNames.includes('spike-kensaki'), 'Must contain spike-kensaki');
            assert.ok(childNames.includes('handle-ken'), 'Must contain handle-ken');
        });

        it('preserves all component material assignments from COMPONENT_MATERIAL_MAP', () => {
            for (const child of assembly.children) {
                const expectedMat = COMPONENT_MATERIAL_MAP[child.name];
                assert.ok(expectedMat, `Expected material must exist for ${child.name}`);
                assert.equal(child.material, expectedMat, `Material for ${child.name} must match COMPONENT_MATERIAL_MAP`);
            }
        });

        it('places Big Cup at Person A configured position and orientation', () => {
            const mesh = assembly.getObjectByName('big-cup-oozara');
            assert.ok(mesh);
            const big = cupConfigs.big ?? CUP_CONFIGS.big;
            assert.ok(Math.abs(mesh.position.x - big.localPos.x) < 1e-6);
            assert.ok(Math.abs(mesh.position.y - big.localPos.y) < 1e-6);
            assert.ok(Math.abs(mesh.position.z - big.localPos.z) < 1e-6);

            const normal = new Vector3(0, 1, 0).applyQuaternion(mesh.quaternion);
            const expectedNorm = big.localNormal;
            assert.ok(normal.distanceTo(expectedNorm) < 1e-5, 'Big Cup normal must match configured normal (1, 0, 0)');
        });

        it('places Small Cup at Person A configured position and orientation', () => {
            const mesh = assembly.getObjectByName('small-cup-kozara');
            assert.ok(mesh);
            const small = cupConfigs.small ?? CUP_CONFIGS.small;
            assert.ok(Math.abs(mesh.position.x - small.localPos.x) < 1e-6);
            assert.ok(Math.abs(mesh.position.y - small.localPos.y) < 1e-6);
            assert.ok(Math.abs(mesh.position.z - small.localPos.z) < 1e-6);

            const normal = new Vector3(0, 1, 0).applyQuaternion(mesh.quaternion);
            const expectedNorm = small.localNormal;
            assert.ok(normal.distanceTo(expectedNorm) < 1e-5, 'Small Cup normal must match configured normal (-1, 0, 0)');
        });

        it('places Base Cup at Person A configured position and orientation', () => {
            const mesh = assembly.getObjectByName('base-cup-chuzara');
            assert.ok(mesh);
            const base = cupConfigs.base ?? CUP_CONFIGS.base;
            assert.ok(Math.abs(mesh.position.x - base.localPos.x) < 1e-6);
            assert.ok(Math.abs(mesh.position.y - base.localPos.y) < 1e-6);
            assert.ok(Math.abs(mesh.position.z - base.localPos.z) < 1e-6);

            const normal = new Vector3(0, 1, 0).applyQuaternion(mesh.quaternion);
            const expectedNorm = base.localNormal;
            assert.ok(normal.distanceTo(expectedNorm) < 1e-5, 'Base Cup normal must point straight down (0, -1, 0)');
        });

        it('ensures Spike tip reaches Person A configured position (0, 0.0675, 0)', () => {
            const mesh = assembly.getObjectByName('spike-kensaki');
            assert.ok(mesh);

            mesh.geometry.computeBoundingBox();
            const spikeBox = mesh.geometry.boundingBox;
            const worldTipY = mesh.position.y + spikeBox.max.y;

            const spike = cupConfigs.spike ?? CUP_CONFIGS.spike;
            assert.ok(Math.abs(worldTipY - spike.localPos.y) < 1e-4, 'Spike tip must reach y = 0.0675 m');
            assert.ok(Math.abs(mesh.position.x - spike.localPos.x) < 1e-6);
            assert.ok(Math.abs(mesh.position.z - spike.localPos.z) < 1e-6);
        });

        it('ensures handle meets Base Cup outer bottom with flush zero-gap contact', () => {
            const handle = assembly.getObjectByName('handle-ken');
            const baseCup = assembly.getObjectByName('base-cup-chuzara');
            assert.ok(handle && baseCup);

            const handleBox = new Box3().setFromObject(handle);
            const base = cupConfigs.base ?? CUP_CONFIGS.base;

            // Handle bottom is at -0.180 m, matching Base Cup rim localPos.y
            assert.ok(Math.abs(handleBox.min.y - base.localPos.y) < 1e-4, 'Handle bottom must reach Base Cup localPos.y (-0.180)');
        });

        it('ensures Sarado crossbar ends seat flush against side cups', () => {
            const crossbar = assembly.getObjectByName('sarado-crossbar');
            const bigMesh = assembly.getObjectByName('big-cup-oozara');
            const smallMesh = assembly.getObjectByName('small-cup-kozara');
            assert.ok(crossbar && bigMesh && smallMesh);

            const crossbarBox = new Box3().setFromObject(crossbar);
            const big = cupConfigs.big ?? CUP_CONFIGS.big;
            const small = cupConfigs.small ?? CUP_CONFIGS.small;

            assert.ok(Math.abs(crossbarBox.max.x - big.localPos.x) < 1e-4, 'Crossbar +X end must align with Big Cup position');
            assert.ok(Math.abs(crossbarBox.min.x - small.localPos.x) < 1e-4, 'Crossbar -X end must align with Small Cup position');
        });
    });

    describe('Multi-View Assembly Inspection (7 Viewing Angles)', () => {
        const assembly = createKendamaAssemblyGroup();
        assembly.updateMatrixWorld(true);

        const views = [
            { name: 'Front View (+Z to -Z)', rayOrigin: new Vector3(0, 0.0, 1.0), rayDir: new Vector3(0, 0, -1) },
            { name: 'Back View (-Z to +Z)', rayOrigin: new Vector3(0, 0.0, -1.0), rayDir: new Vector3(0, 0, 1) },
            { name: 'Left View (-X to +X)', rayOrigin: new Vector3(-1.0, 0.0, 0), rayDir: new Vector3(1, 0, 0) },
            { name: 'Right View (+X to -X)', rayOrigin: new Vector3(1.0, 0.0, 0), rayDir: new Vector3(-1, 0, 0) },
            { name: 'Top View (+Y to -Y)', rayOrigin: new Vector3(0, 1.0, 0), rayDir: new Vector3(0, -1, 0) },
            { name: 'Bottom View (-Y to +Y)', rayOrigin: new Vector3(0, -1.0, 0), rayDir: new Vector3(0, 1, 0) },
            { name: 'Three-Quarter View', rayOrigin: new Vector3(0.5, 0.5, 0.5), rayDir: new Vector3(-0.5, -0.5, -0.5).normalize() },
        ];

        for (const view of views) {
            it(`inspects assembly from ${view.name}`, () => {
                const raycaster = new Raycaster(view.rayOrigin, view.rayDir);
                const hits = raycaster.intersectObjects(assembly.children, true);
                assert.ok(hits.length > 0, `${view.name} must intersect the kendama assembly`);
                const firstHitMesh = hits[0].object;
                assert.ok(firstHitMesh, `${view.name} must hit a valid mesh`);
                assert.ok(hits[0].distance > 0, 'Hit distance must be positive');
            });
        }
    });
});
