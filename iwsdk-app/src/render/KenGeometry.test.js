/**
 * Celestial Kendama - Unit Tests for KenGeometry.js
 * Role: Person C (Visuals & Rendering)
 */

import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    Vector3,
    Quaternion,
    Mesh,
    MeshBasicMaterial,
    DoubleSide,
    Raycaster,
} from 'three';
import { CUP_CONFIGS, getCupConfig } from '../game/cupConfigs.js';
import {
    createCupGeometry,
    createHandleGeometry,
    createCrossbarGeometry,
    createSpikeGeometry,
    DEFAULT_WALL_THICKNESS,
    DEFAULT_RADIAL_SEGMENTS,
    DEFAULT_PROFILE_STEPS,
    DEFAULT_FLOOR_RADIUS_RATIO,
    DEFAULT_HANDLE_LENGTH,
    DEFAULT_HANDLE_TOP_RADIUS,
    DEFAULT_HANDLE_BOTTOM_RADIUS,
    DEFAULT_HANDLE_WAIST_RADIUS,
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
} from './KenGeometry.js';

describe('KenGeometry Module', () => {
    describe('Big Cup Geometry Generation', () => {
        it('generates a valid LatheGeometry using Person A Big Cup config', () => {
            const bigCupConfig = CUP_CONFIGS.bigCup;
            assert.ok(bigCupConfig, 'Big Cup configuration must exist');
            assert.equal(bigCupConfig.rimRadius, 0.045);
            assert.equal(bigCupConfig.depth, 0.03);

            const geometry = createCupGeometry(bigCupConfig);
            assert.ok(geometry, 'createCupGeometry must return a geometry instance');
            assert.equal(geometry.type, 'LatheGeometry');

            // Verify vertex position attributes exist and are populated
            const posAttr = geometry.attributes.position;
            assert.ok(posAttr, 'Geometry must have position attributes');
            assert.ok(posAttr.count > 0, 'Geometry must have vertices');

            // Verify normal attributes exist
            const normAttr = geometry.attributes.normal;
            assert.ok(normAttr, 'Geometry must have normal attributes');
            assert.equal(normAttr.count, posAttr.count);
        });

        it('creates a hollow cup with correct bounding box dimensions', () => {
            const bigCupConfig = CUP_CONFIGS.bigCup;
            const wallThickness = 0.003;
            const geometry = createCupGeometry(bigCupConfig, { wallThickness });

            geometry.computeBoundingBox();
            const bbox = geometry.boundingBox;
            assert.ok(bbox, 'Bounding box must be computed');

            const expectedOuterRadius = bigCupConfig.rimRadius + wallThickness; // 0.048 m
            const expectedTotalDepth = bigCupConfig.depth + wallThickness;       // 0.033 m

            // Geometry must be centered around (0, 0) in X and Z
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
            const bigCupConfig = CUP_CONFIGS.bigCup;
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
            const bigCupConfig = CUP_CONFIGS.bigCup;
            const depth = bigCupConfig.depth; // 0.03 m
            const geometry = createCupGeometry(bigCupConfig);
            const pos = geometry.attributes.position;

            // Find vertices near center axis (r < 0.005) at the inner floor
            let foundInnerFloorCenter = false;
            for (let i = 0; i < pos.count; i++) {
                const x = pos.getX(i);
                const y = pos.getY(i);
                const z = pos.getZ(i);
                const r = Math.hypot(x, z);

                // At center r = 0, y should be exactly -depth
                if (r < 1e-5 && Math.abs(y - (-depth)) < 1e-5) {
                    foundInnerFloorCenter = true;
                    break;
                }
            }
            assert.ok(foundInnerFloorCenter, 'Inner floor must have a center vertex at (0, -depth, 0)');
        });

        it('constructs a proper flat outer bottom at y = -(depth + wallThickness)', () => {
            const bigCupConfig = CUP_CONFIGS.bigCup;
            const depth = bigCupConfig.depth; // 0.03 m
            const wallThickness = 0.003;
            const outerDepth = depth + wallThickness; // 0.033 m
            const geometry = createCupGeometry(bigCupConfig, { wallThickness });
            const pos = geometry.attributes.position;

            let foundOuterBaseCenter = false;
            for (let i = 0; i < pos.count; i++) {
                const x = pos.getX(i);
                const y = pos.getY(i);
                const z = pos.getZ(i);
                const r = Math.hypot(x, z);

                // At center r = 0, y should be exactly -outerDepth
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
            const bigCupConfig = CUP_CONFIGS.bigCup;
            const wallThickness = 0.003;
            const depth = bigCupConfig.depth; // 0.03 m
            const geometry = createCupGeometry(bigCupConfig, { wallThickness });
            const mesh = new Mesh(geometry, new MeshBasicMaterial({ side: DoubleSide }));

            // Cast vertical ray straight down through the center from above
            const ray = new Raycaster(new Vector3(0.002, 0.05, 0.002), new Vector3(0, -1, 0));
            const hits = ray.intersectObject(mesh);

            assert.ok(hits.length >= 2, 'Ray through bottom must penetrate inner floor and outer base');

            const innerFloorHit = hits[0];
            const outerBaseHit = hits[1];

            // Inner floor should be at y = -depth
            assert.ok(
                Math.abs(innerFloorHit.point.y - (-depth)) < 1e-4,
                `Inner floor hit y (${innerFloorHit.point.y}) must be at -depth (${-depth})`
            );

            // Outer base should be at y = -(depth + wallThickness)
            const expectedOuterY = -(depth + wallThickness);
            assert.ok(
                Math.abs(outerBaseHit.point.y - expectedOuterY) < 1e-4,
                `Outer base hit y (${outerBaseHit.point.y}) must be at -outerDepth (${expectedOuterY})`
            );

            // Measured thickness between inner floor and outer base must equal wallThickness
            const measuredThickness = innerFloorHit.point.y - outerBaseHit.point.y;
            assert.ok(
                Math.abs(measuredThickness - wallThickness) < 1e-4,
                `Measured bottom thickness (${measuredThickness}) must match wallThickness (${wallThickness})`
            );
        });

        it('verifies that the cup opening at y >= 0 is completely unobstructed', () => {
            const bigCupConfig = CUP_CONFIGS.bigCup;
            const geometry = createCupGeometry(bigCupConfig);
            const mesh = new Mesh(geometry, new MeshBasicMaterial({ side: DoubleSide }));

            // Ray crossing horizontally above the rim aperture (y = +0.005 m)
            const rayAbove = new Raycaster(new Vector3(-0.1, 0.005, 0), new Vector3(1, 0, 0));
            const hitsAbove = rayAbove.intersectObject(mesh);
            assert.equal(hitsAbove.length, 0, 'Ray above rim must encounter no obstruction');

            // Ray passing through the inner cavity (y = -0.015 m)
            const rayCavity = new Raycaster(new Vector3(-0.1, -0.015, 0), new Vector3(1, 0, 0));
            const hitsCavity = rayCavity.intersectObject(mesh);
            // Must enter outer wall, enter cavity via inner wall, leave cavity via inner wall, exit outer wall
            assert.equal(
                hitsCavity.length,
                4,
                'Ray through cup body must hit outer and inner walls on both sides'
            );
        });
    });

    describe('Mesh Quality, Watertightness & Surface Normal Audit', () => {
        it('contains zero degenerate (zero-area) triangles after index filtering', () => {
            const bigCupConfig = CUP_CONFIGS.bigCup;
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
            const bigCupConfig = CUP_CONFIGS.bigCup;
            const geometry = createCupGeometry(bigCupConfig);
            const pos = geometry.attributes.position;
            const index = geometry.index;

            // Map spatial coordinates to unique vertex IDs using tolerance
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

            // Verify winding consistency: every manifold edge must be traversed once in each direction
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
            const bigCupConfig = CUP_CONFIGS.bigCup;
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
                if (Math.abs(y - (-0.015)) < 0.002 && r > 0.035 && r < 0.040 && r > 0.01) {
                    const nx = norm.getX(i), nz = norm.getZ(i);
                    const radialNorm = (nx * x + nz * z) / r;
                    assert.ok(radialNorm < -0.5, `Inner wall radial normal (${radialNorm}) must point inward (-r)`);
                    foundInnerWall = true;
                    break;
                }
            }
            assert.ok(foundInnerWall, 'Inner wall sample vertex must exist');

            // 4. Outer Wall: radial normal should point OUTWARD (+r) into room
            let foundOuterWall = false;
            for (let i = 0; i < pos.count; i++) {
                const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
                const r = Math.hypot(x, z);
                if (Math.abs(y - (-0.015)) < 0.002 && r > 0.040) {
                    const nx = norm.getX(i), nz = norm.getZ(i);
                    const radialNorm = (nx * x + nz * z) / r;
                    assert.ok(radialNorm > 0.5, `Outer wall radial normal (${radialNorm}) must point outward (+r)`);
                    foundOuterWall = true;
                    break;
                }
            }
            assert.ok(foundOuterWall, 'Outer wall sample vertex must exist');

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
            const bigCupConfig = getCupConfig('bigCup');
            assert.ok(bigCupConfig);

            const geometry = createCupGeometry(bigCupConfig);
            const material = new MeshBasicMaterial();
            const cupMesh = new Mesh(geometry, material);

            // 1. Position rim center at configured catch point
            cupMesh.position.set(
                bigCupConfig.position.x,
                bigCupConfig.position.y,
                bigCupConfig.position.z
            );
            assert.equal(cupMesh.position.x, 0.055);
            assert.equal(cupMesh.position.y, 0.12);
            assert.equal(cupMesh.position.z, 0.0);

            // 2. Align local +Y (opening normal) with Person A upright-tilted normal
            const localNormal = new Vector3(0, 1, 0);
            const targetNormal = new Vector3(
                bigCupConfig.normal.x,
                bigCupConfig.normal.y,
                bigCupConfig.normal.z
            ).normalize();

            cupMesh.quaternion.setFromUnitVectors(localNormal, targetNormal);

            // Check that the mesh's transformed normal vector matches target normal
            const orientedNormal = localNormal.clone().applyQuaternion(cupMesh.quaternion);
            const dot = orientedNormal.dot(targetNormal);
            assert.ok(
                Math.abs(dot - 1.0) < 1e-5,
                `Oriented normal dot product (${dot}) must equal 1.0 (perfect alignment)`
            );
            assert.ok(orientedNormal.x > 0.3, 'Oriented normal.x should point outward towards +X');
            assert.ok(orientedNormal.y > 0.9, 'Oriented normal.y should point upward towards +Y');
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
        it('generates a valid LatheGeometry with default options', () => {
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

            // Height along Y must equal DEFAULT_HANDLE_LENGTH (0.11 m)
            assert.ok(Math.abs(sizeY - DEFAULT_HANDLE_LENGTH) < 1e-4, `Height must be ~${DEFAULT_HANDLE_LENGTH}`);
            assert.ok(Math.abs(box.min.y - (-DEFAULT_HANDLE_LENGTH * 0.5)) < 1e-4);
            assert.ok(Math.abs(box.max.y - (DEFAULT_HANDLE_LENGTH * 0.5)) < 1e-4);

            // Maximum diameter in X and Z must reflect the bottom flare (~2 * DEFAULT_HANDLE_BOTTOM_RADIUS = 0.026 m)
            const expectedMaxDiameter = DEFAULT_HANDLE_BOTTOM_RADIUS * 2;
            assert.ok(Math.abs(sizeX - expectedMaxDiameter) < 1e-4, 'X diameter must match bottom radius * 2');
            assert.ok(Math.abs(sizeZ - expectedMaxDiameter) < 1e-4, 'Z diameter must match bottom radius * 2');

            // Must be clearly elongated along Y (elongation ratio > 4:1)
            assert.ok(sizeY > sizeX * 4, 'Handle must be elongated along Y');
            assert.ok(sizeY > sizeZ * 4, 'Handle must be elongated along Y');

            // Centered around origin
            assert.ok(Math.abs((box.min.x + box.max.x) * 0.5) < 1e-6, 'Handle must be centered on X');
            assert.ok(Math.abs((box.min.y + box.max.y) * 0.5) < 1e-6, 'Handle must be centered on Y');
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
                topRadius: 0.015,
                bottomRadius: 0.016,
                waistRadius: 0.012,
                radialSegments: 24,
                profileSteps: 12,
                filletRadius: 0.003,
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
        it('generates a valid geometry with default options', () => {
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

            // X span must extend from Small Cup end (< -0.05 m) to Big Cup end (> +0.055 m)
            assert.ok(box.min.x < -0.05, `box.min.x (${box.min.x}) must reach Small Cup mount`);
            assert.ok(box.max.x > 0.055, `box.max.x (${box.max.x}) must reach Big Cup mount`);
            assert.ok(sizeX > 0.10, `Total span (${sizeX}) must span full distance`);

            // Maximum diameter in Z reflects the Big Cup mounting face radius (~0.01785 * 2 = 0.0357 m)
            const expectedMaxDiameterZ = DEFAULT_CROSSBAR_BIG_END_RADIUS * 2;
            assert.ok(Math.abs(sizeZ - expectedMaxDiameterZ) < 1e-4, 'Z diameter must match big end radius * 2');

            // Must be clearly elongated along X
            assert.ok(sizeX > sizeY * 3, 'Crossbar must be elongated along X');
            assert.ok(sizeX > sizeZ * 2.5, 'Crossbar must be elongated along X');

            // Asymmetric X: Big Cup (+X) extends farther from junction than Small Cup (-X)
            const centerOffset = (box.min.x + box.max.x) * 0.5;
            assert.ok(centerOffset > 0.001, 'Center offset must be biased slightly toward +X Big Cup');
            assert.ok(Math.abs(box.min.y + box.max.y) * 0.5 < 1e-4, 'Crossbar must be centered on Y');
            assert.ok(Math.abs((box.min.z + box.max.z) * 0.5) < 1e-6, 'Crossbar must be centered on Z');
        });

        it('accounts for asymmetric cup positions and reaches the physical cup bases', () => {
            const crossbar = createCrossbarGeometry();
            crossbar.computeBoundingBox();
            const box = crossbar.boundingBox;

            const bigCupPos = CUP_CONFIGS.bigCup.position;
            const smallCupPos = CUP_CONFIGS.smallCup.position;

            // Big Cup is on positive X wing (+0.055 m)
            assert.ok(bigCupPos.x > 0, 'Big Cup must be in +X');
            // Small Cup is on negative X wing (-0.050 m)
            assert.ok(smallCupPos.x < 0, 'Small Cup must be in -X');

            // Crossbar span ends must meet the cup attachment regions
            assert.ok(box.max.x >= DEFAULT_CROSSBAR_BIG_SPAN, 'Crossbar +X wing must reach Big Cup base area');
            assert.ok(box.min.x <= -DEFAULT_CROSSBAR_SMALL_SPAN, 'Crossbar -X wing must reach Small Cup base area');
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

            const expectedBigNorm = new Vector3(
                CUP_CONFIGS.bigCup.normal.x,
                CUP_CONFIGS.bigCup.normal.y,
                0.0
            ).normalize();

            const expectedSmallNorm = new Vector3(
                CUP_CONFIGS.smallCup.normal.x,
                CUP_CONFIGS.smallCup.normal.y,
                0.0
            ).normalize();

            // Big cap mounting face normal must match configured Big Cup normal
            const bigDot = bigCapNorm.dot(expectedBigNorm);
            assert.ok(
                Math.abs(bigDot - 1.0) < 1e-4,
                `Big mount normal dot (${bigDot}) must match Person A normal`
            );

            // Small cap mounting face normal must match configured Small Cup normal
            const smallDot = smallCapNorm.dot(expectedSmallNorm);
            assert.ok(
                Math.abs(smallDot - 1.0) < 1e-4,
                `Small mount normal dot (${smallDot}) must match Person A normal`
            );
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
                filletRadius: 0.003,
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
        it('generates a valid LatheGeometry with default options', () => {
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

            // Height along Y must equal DEFAULT_SPIKE_LENGTH
            assert.ok(Math.abs(box.max.y - DEFAULT_SPIKE_LENGTH) < 1e-4, 'Spike height must match DEFAULT_SPIKE_LENGTH');
            assert.ok(Math.abs(box.min.y - 0.0) < 1e-4, 'Spike base must start at y = 0');

            // Maximum radius at base reflects DEFAULT_SPIKE_ROOT_RADIUS (0.007 m)
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
});
