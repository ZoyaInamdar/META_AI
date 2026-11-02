/**
 * Celestial Kendama - Unit Tests for TamaGeometry.js
 * Role: Person C (Visuals & Rendering)
 *
 * Verifies procedural 3D Tama (ball) geometry generation:
 * - Exact outer radius matching BALL_RADIUS (0.045 m)
 * - Centered geometric origin at (0, 0, 0)
 * - Genuine physical bore aligned with local -Y
 * - Clearances accommodating the Kendama spike
 * - Clean, outward-facing surface normals
 * - Watertight, 2-manifold closed surface topology
 * - Absence of NaN, infinite, or degenerate triangles
 */

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { Vector3, Box3 } from 'three';
import { BALL_RADIUS, kenGeometry, KEN_SCALE } from '../input/cupConfigs.js';
import {
    createTamaGeometry,
    DEFAULT_TAMA_RADIUS,
    DEFAULT_BORE_DEPTH,
    DEFAULT_BORE_MOUTH_RADIUS,
    DEFAULT_BORE_BEVEL_RADIUS,
    DEFAULT_BORE_APEX_RADIUS,
    DEFAULT_TAMA_RADIAL_SEGMENTS,
    DEFAULT_TAMA_SPHERE_STEPS,
    DEFAULT_BORE_TIP_CLEARANCE,
    DEFAULT_BORE_MOUTH_CLEARANCE,
    filterDegenerateTriangles,
} from './TamaGeometry.js';

describe('TamaGeometry Module', () => {
    describe('Authoritative Dimensions & Constants', () => {
        it('exports default radius matching authoritative BALL_RADIUS (0.045 m)', () => {
            assert.equal(DEFAULT_TAMA_RADIUS, BALL_RADIUS);
            assert.equal(DEFAULT_TAMA_RADIUS, 0.03 * KEN_SCALE);
            assert.equal(DEFAULT_TAMA_RADIUS, 0.045);
        });

        it('derives bore depth providing positive clearance beyond Kendama spike length', () => {
            const spikeLength = kenGeometry.spike.tipY - kenGeometry.spike.baseY; // 0.0345 m
            assert.ok(
                DEFAULT_BORE_DEPTH > spikeLength,
                `Bore depth (${DEFAULT_BORE_DEPTH} m) must exceed spike length (${spikeLength} m)`
            );
            assert.ok(Math.abs(DEFAULT_BORE_DEPTH - (spikeLength + DEFAULT_BORE_TIP_CLEARANCE)) < 1e-6);
            assert.ok(Math.abs(DEFAULT_BORE_DEPTH - 0.038) < 1e-6, `Bore depth should be ~0.038 m`);
        });

        it('derives mouth radius providing positive clearance around spike root radius', () => {
            const spikeRootRadius = kenGeometry.stem.neckRadius; // 0.01125 m
            assert.ok(
                DEFAULT_BORE_MOUTH_RADIUS > spikeRootRadius,
                `Mouth radius (${DEFAULT_BORE_MOUTH_RADIUS}) must exceed spike root radius (${spikeRootRadius})`
            );
            assert.ok(Math.abs(DEFAULT_BORE_MOUTH_RADIUS - (spikeRootRadius + DEFAULT_BORE_MOUTH_CLEARANCE)) < 1e-6);
            assert.ok(Math.abs(DEFAULT_BORE_MOUTH_RADIUS - 0.013) < 1e-6, 'Mouth radius should be ~0.013 m');
        });

        it('derives apex radius providing positive clearance around spike tip radius', () => {
            const spikeTipRadius = 0.0015 * KEN_SCALE; // 0.00225 m
            assert.ok(
                DEFAULT_BORE_APEX_RADIUS > spikeTipRadius,
                `Apex radius (${DEFAULT_BORE_APEX_RADIUS}) must exceed spike tip radius (${spikeTipRadius})`
            );
            assert.ok(Math.abs(DEFAULT_BORE_APEX_RADIUS - 0.0045) < 1e-6, 'Apex radius should be ~0.0045 m');
        });
    });

    describe('Geometry Generation & Integrity', () => {
        it('generates a valid LatheGeometry with expected attributes', () => {
            const geometry = createTamaGeometry();
            assert.ok(geometry, 'createTamaGeometry must return a geometry');
            assert.ok(geometry.attributes.position, 'Geometry must have position attribute');
            assert.ok(geometry.attributes.normal, 'Geometry must have normal attribute');
            assert.ok(geometry.attributes.uv, 'Geometry must have uv attribute');
            assert.ok(geometry.index, 'Geometry must be indexed');
            assert.ok(geometry.attributes.position.count > 0, 'Geometry must contain vertices');
            assert.ok(geometry.index.count > 0, 'Geometry must contain index entries');
        });

        it('contains no NaN, undefined, or infinite vertex or normal data', () => {
            const geometry = createTamaGeometry();
            const pos = geometry.attributes.position;
            const norm = geometry.attributes.normal;
            const uv = geometry.attributes.uv;

            for (let i = 0; i < pos.count; i++) {
                assert.ok(Number.isFinite(pos.getX(i)), `pos.x at ${i} must be finite`);
                assert.ok(Number.isFinite(pos.getY(i)), `pos.y at ${i} must be finite`);
                assert.ok(Number.isFinite(pos.getZ(i)), `pos.z at ${i} must be finite`);

                assert.ok(Number.isFinite(norm.getX(i)), `norm.x at ${i} must be finite`);
                assert.ok(Number.isFinite(norm.getY(i)), `norm.y at ${i} must be finite`);
                assert.ok(Number.isFinite(norm.getZ(i)), `norm.z at ${i} must be finite`);

                assert.ok(Number.isFinite(uv.getX(i)), `uv.x at ${i} must be finite`);
                assert.ok(Number.isFinite(uv.getY(i)), `uv.y at ${i} must be finite`);
            }
        });

        it('contains zero degenerate (zero-area or identical index) triangles', () => {
            const geometry = createTamaGeometry();
            const pos = geometry.attributes.position;
            const index = geometry.index;

            for (let i = 0; i < index.count; i += 3) {
                const a = index.getX(i);
                const b = index.getX(i + 1);
                const c = index.getX(i + 2);

                assert.notEqual(a, b, `Triangle at ${i} has duplicate indices a == b`);
                assert.notEqual(b, c, `Triangle at ${i} has duplicate indices b == c`);
                assert.notEqual(a, c, `Triangle at ${i} has duplicate indices a == c`);

                const ax = pos.getX(a), ay = pos.getY(a), az = pos.getZ(a);
                const bx = pos.getX(b), by = pos.getY(b), bz = pos.getZ(b);
                const cx = pos.getX(c), cy = pos.getY(c), cz = pos.getZ(c);

                const abx = bx - ax, aby = by - ay, abz = bz - az;
                const acx = cx - ax, acy = cy - ay, acz = cz - az;

                const crossX = aby * acz - abz * acy;
                const crossY = abz * acx - abx * acz;
                const crossZ = abx * acy - aby * acx;

                const area2 = crossX * crossX + crossY * crossY + crossZ * crossZ;
                assert.ok(area2 > 1e-12, `Triangle at index ${i} has zero or near-zero area: ${area2}`);
            }
        });
    });

    describe('Bounding Box, Scale, & Origin Verification', () => {
        it('has bounding box conforming strictly to BALL_RADIUS bounds', () => {
            const geometry = createTamaGeometry();
            geometry.computeBoundingBox();
            const box = geometry.boundingBox;

            const tol = 1e-4;
            // X and Z extrema match outer ball radius
            assert.ok(
                Math.abs(box.max.x - BALL_RADIUS) < tol,
                `box.max.x (${box.max.x}) must equal BALL_RADIUS (${BALL_RADIUS})`
            );
            assert.ok(
                Math.abs(box.min.x - (-BALL_RADIUS)) < tol,
                `box.min.x (${box.min.x}) must equal -BALL_RADIUS (${-BALL_RADIUS})`
            );
            assert.ok(
                Math.abs(box.max.z - BALL_RADIUS) < tol,
                `box.max.z (${box.max.z}) must equal BALL_RADIUS (${BALL_RADIUS})`
            );
            assert.ok(
                Math.abs(box.min.z - (-BALL_RADIUS)) < tol,
                `box.min.z (${box.min.z}) must equal -BALL_RADIUS (${-BALL_RADIUS})`
            );

            // Y max reaches top pole (+BALL_RADIUS)
            assert.ok(
                Math.abs(box.max.y - BALL_RADIUS) < tol,
                `box.max.y (${box.max.y}) must equal +BALL_RADIUS (${BALL_RADIUS})`
            );

            // Y min is at the outer bevel opening rim on the lower sphere
            const expectedYRim = -Math.sqrt(BALL_RADIUS ** 2 - DEFAULT_BORE_BEVEL_RADIUS ** 2);
            assert.ok(
                Math.abs(box.min.y - expectedYRim) < tol,
                `box.min.y (${box.min.y}) must equal expected bevel rim elevation (${expectedYRim})`
            );

            // Bounding box must stay strictly within [-BALL_RADIUS, +BALL_RADIUS] in all 3 axes
            assert.ok(box.min.x >= -BALL_RADIUS - tol);
            assert.ok(box.max.x <= BALL_RADIUS + tol);
            assert.ok(box.min.y >= -BALL_RADIUS - tol);
            assert.ok(box.max.y <= BALL_RADIUS + tol);
            assert.ok(box.min.z >= -BALL_RADIUS - tol);
            assert.ok(box.max.z <= BALL_RADIUS + tol);
        });

        it('maintains geometric center at origin (0, 0, 0)', () => {
            const geometry = createTamaGeometry();
            const pos = geometry.attributes.position;

            // Top pole is exactly at (0, BALL_RADIUS, 0)
            let topPoleFound = false;
            for (let i = 0; i < pos.count; i++) {
                const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
                if (Math.hypot(x, z) < 1e-5 && Math.abs(y - BALL_RADIUS) < 1e-5) {
                    topPoleFound = true;
                    break;
                }
            }
            assert.ok(topPoleFound, 'Top pole at (0, BALL_RADIUS, 0) must exist');

            // Equatorial vertices have y ≈ 0 and radial distance ≈ BALL_RADIUS
            let equatorSamples = 0;
            for (let i = 0; i < pos.count; i++) {
                const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
                if (Math.abs(y) < 0.003) {
                    const r = Math.hypot(x, z);
                    assert.ok(
                        Math.abs(r - BALL_RADIUS) < 0.001,
                        `Equatorial vertex radius ${r} must match BALL_RADIUS ${BALL_RADIUS}`
                    );
                    equatorSamples++;
                }
            }
            assert.ok(equatorSamples >= DEFAULT_TAMA_RADIAL_SEGMENTS, 'Equatorial circle vertices must be verified');
        });
    });

    describe('Physical Bore & Hole Verification', () => {
        it('features a genuine open bore opening at local -Y', () => {
            const geometry = createTamaGeometry();
            const pos = geometry.attributes.position;

            // Verify that no vertex exists at the bottom pole (0, -BALL_RADIUS, 0)
            let bottomPoleExists = false;
            for (let i = 0; i < pos.count; i++) {
                const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
                if (Math.hypot(x, z) < 0.005 && y < -BALL_RADIUS + 0.002) {
                    bottomPoleExists = true;
                    break;
                }
            }
            assert.equal(bottomPoleExists, false, 'Bottom pole must be open (no solid surface at r = 0, y = -R)');
        });

        it('verifies the bore opening mouth radius and outer bevel rim', () => {
            const geometry = createTamaGeometry();
            const pos = geometry.attributes.position;

            // Find mouth vertices (where radial distance is approximately mouthRadius)
            let foundMouth = false;
            let foundBevel = false;

            for (let i = 0; i < pos.count; i++) {
                const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
                const r = Math.hypot(x, z);

                if (y < -0.038 && Math.abs(r - DEFAULT_BORE_MOUTH_RADIUS) < 0.0005) {
                    foundMouth = true;
                }
                if (y < -0.040 && Math.abs(r - DEFAULT_BORE_BEVEL_RADIUS) < 0.0005) {
                    foundBevel = true;
                }
            }

            assert.ok(foundMouth, `Bore mouth radius (${DEFAULT_BORE_MOUTH_RADIUS}) must exist in geometry`);
            assert.ok(foundBevel, `Bore bevel radius (${DEFAULT_BORE_BEVEL_RADIUS}) must exist in geometry`);
        });

        it('verifies bore extends inward along +Y to the configured bore depth', () => {
            const geometry = createTamaGeometry();
            const pos = geometry.attributes.position;

            const expectedYApex = -BALL_RADIUS + DEFAULT_BORE_DEPTH; // -0.045 + 0.038 = -0.007 m

            let apexFound = false;
            for (let i = 0; i < pos.count; i++) {
                const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
                if (Math.hypot(x, z) < 1e-4 && Math.abs(y - expectedYApex) < 1e-4) {
                    apexFound = true;
                    break;
                }
            }

            assert.ok(
                apexFound,
                `Bore ceiling center vertex must exist at expected Y elevation (${expectedYApex} m)`
            );
        });

        it('ensures bore provides mechanical clearance for full insertion of the Kendama spike', () => {
            const spikeLength = kenGeometry.spike.tipY - kenGeometry.spike.baseY; // 0.0345 m
            const spikeRootRadius = kenGeometry.stem.neckRadius; // 0.01125 m
            const spikeTipRadius = 0.0015 * KEN_SCALE; // 0.00225 m

            const geometry = createTamaGeometry();
            const pos = geometry.attributes.position;

            // When the spike is inserted into the ball along +Y:
            // Spike base is at y = -BALL_RADIUS, spike tip reaches y = -BALL_RADIUS + spikeLength.
            // Check clearance at sample heights along the spike:
            const sampleHeights = [0.0, 0.010, 0.020, spikeLength];

            for (const h of sampleHeights) {
                // Spike cone profile at height h from base:
                const t = Math.min(1.0, h / (spikeLength - spikeTipRadius));
                const spikeRadiusAtH = spikeRootRadius - (spikeRootRadius - spikeTipRadius) * t;

                // Corresponding Y inside the Tama bore:
                const boreY = -BALL_RADIUS + h;

                // Find the minimum radius of the bore geometry at this Y:
                let minBoreRadius = Infinity;
                for (let i = 0; i < pos.count; i++) {
                    const y = pos.getY(i);
                    if (Math.abs(y - boreY) < 0.003) {
                        const r = Math.hypot(pos.getX(i), pos.getZ(i));
                        // Ignore outer sphere vertices
                        if (r < BALL_RADIUS * 0.8) {
                            minBoreRadius = Math.min(minBoreRadius, r);
                        }
                    }
                }

                assert.ok(
                    minBoreRadius > spikeRadiusAtH,
                    `At spike height ${h} m, bore radius (${minBoreRadius}) must exceed spike radius (${spikeRadiusAtH})`
                );
            }
        });
    });

    describe('Surface Normals & Topology Direction', () => {
        it('orients surface normals outward on outer sphere surface', () => {
            const geometry = createTamaGeometry();
            const pos = geometry.attributes.position;
            const norm = geometry.attributes.normal;

            let outerCount = 0;
            let outwardCount = 0;

            for (let i = 0; i < pos.count; i++) {
                const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
                const r = Math.hypot(x, y, z);

                // Sample outer spherical shell: vertices lying on the sphere of radius BALL_RADIUS
                if (Math.abs(r - BALL_RADIUS) < 0.0008) {
                    outerCount++;
                    const dot = r > 1e-4 ? (x * norm.getX(i) + y * norm.getY(i) + z * norm.getZ(i)) / r : norm.getY(i);
                    if (dot > 0.8) {
                        outwardCount++;
                    }
                }
            }

            assert.ok(outerCount > 100, 'Must sample substantial outer sphere vertices');
            assert.equal(
                outwardCount,
                outerCount,
                'All outer sphere vertex normals must point outward from origin'
            );
        });

        it('orients surface normals into the cavity along the inner bore walls and ceiling', () => {
            const geometry = createTamaGeometry();
            const pos = geometry.attributes.position;
            const norm = geometry.attributes.normal;

            let boreWallCount = 0;
            let inwardRadialCount = 0;

            for (let i = 0; i < pos.count; i++) {
                const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
                const r = Math.hypot(x, z);

                // Inner bore wall vertices (inside the hole, below apex ceiling)
                if (r > 0.003 && r < DEFAULT_BORE_MOUTH_RADIUS + 0.001 && y > -BALL_RADIUS + 0.005 && y < -0.010) {
                    boreWallCount++;
                    // Normal pointing into cavity means pointing towards central Y-axis: radial dot < 0
                    const radialDot = (x * norm.getX(i) + z * norm.getZ(i)) / r;
                    if (radialDot < -0.3) {
                        inwardRadialCount++;
                    }
                }
            }

            assert.ok(boreWallCount > 30, 'Must sample inner bore wall vertices');
            assert.equal(
                inwardRadialCount,
                boreWallCount,
                'All inner bore wall vertex normals must point inward toward central axis into cavity'
            );
        });

        it('verifies bore ceiling normal points downward (-Y) into the cavity', () => {
            const geometry = createTamaGeometry();
            const pos = geometry.attributes.position;
            const norm = geometry.attributes.normal;

            const expectedYApex = -BALL_RADIUS + DEFAULT_BORE_DEPTH;

            let ceilingNormalY = null;
            for (let i = 0; i < pos.count; i++) {
                const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
                if (Math.hypot(x, z) < 1e-4 && Math.abs(y - expectedYApex) < 1e-4) {
                    ceilingNormalY = norm.getY(i);
                    break;
                }
            }

            assert.ok(ceilingNormalY !== null, 'Ceiling center vertex must exist');
            assert.ok(
                ceilingNormalY < -0.9,
                `Ceiling normal Y (${ceilingNormalY}) must point downward (-Y) into cavity`
            );
        });
    });

    describe('Watertight 2-Manifold Mesh Validation', () => {
        it('verifies geometry forms a closed watertight 2-manifold surface with zero boundary edges', () => {
            const geometry = createTamaGeometry();
            const pos = geometry.attributes.position;
            const idx = geometry.index;

            // Map unique spatial positions to unified vertex IDs
            const idMap = new Map();
            function getPosId(index) {
                const x = Math.abs(pos.getX(index)) < 1e-6 ? 0.0 : pos.getX(index);
                const y = Math.abs(pos.getY(index)) < 1e-6 ? 0.0 : pos.getY(index);
                const z = Math.abs(pos.getZ(index)) < 1e-6 ? 0.0 : pos.getZ(index);
                const k = `${x.toFixed(5)}_${y.toFixed(5)}_${z.toFixed(5)}`;
                if (!idMap.has(k)) idMap.set(k, idMap.size);
                return idMap.get(k);
            }

            const directedEdges = new Map();
            for (let i = 0; i < idx.count; i += 3) {
                const a = getPosId(idx.getX(i));
                const b = getPosId(idx.getX(i + 1));
                const c = getPosId(idx.getX(i + 2));

                if (a === b || b === c || a === c) continue;

                const tri = [[a, b], [b, c], [c, a]];
                for (const [u, v] of tri) {
                    const key = `${u}->${v}`;
                    directedEdges.set(key, (directedEdges.get(key) || 0) + 1);
                }
            }

            let nonManifold = 0;
            let boundaryEdges = 0;

            for (const [key, count] of directedEdges.entries()) {
                if (count > 1) nonManifold++;
                const [u, v] = key.split('->');
                const rev = `${v}->${u}`;
                if (!directedEdges.has(rev)) {
                    boundaryEdges++;
                }
            }

            assert.equal(
                boundaryEdges,
                0,
                `Watertight mesh must have 0 boundary edges (found: ${boundaryEdges})`
            );
            assert.equal(
                nonManifold,
                0,
                `Manifold mesh must have 0 duplicate directed edges (found: ${nonManifold})`
            );
        });
    });

    describe('Options & Error Handling', () => {
        it('allows customizing radius, boreDepth, and radialSegments', () => {
            const custom = createTamaGeometry({
                radius: 0.05,
                boreDepth: 0.040,
                mouthRadius: 0.015,
                bevelRadius: 0.018,
                apexRadius: 0.005,
                radialSegments: 24,
                sphereSteps: 20,
            });

            custom.computeBoundingBox();
            assert.ok(Math.abs(custom.boundingBox.max.x - 0.05) < 1e-3);
            assert.ok(Math.abs(custom.boundingBox.max.y - 0.05) < 1e-3);
        });

        it('throws TypeError on invalid options argument', () => {
            // @ts-ignore
            assert.throws(() => createTamaGeometry('invalid'), TypeError);
        });

        it('throws RangeError on non-positive or non-finite radius', () => {
            assert.throws(() => createTamaGeometry({ radius: 0 }), RangeError);
            assert.throws(() => createTamaGeometry({ radius: -0.05 }), RangeError);
            assert.throws(() => createTamaGeometry({ radius: Infinity }), RangeError);
            assert.throws(() => createTamaGeometry({ radius: NaN }), RangeError);
        });

        it('throws RangeError on invalid bore dimensions', () => {
            assert.throws(() => createTamaGeometry({ boreDepth: 0 }), RangeError);
            assert.throws(() => createTamaGeometry({ boreDepth: 0.10 }), RangeError);
            assert.throws(() => createTamaGeometry({ mouthRadius: 0 }), RangeError);
            assert.throws(() => createTamaGeometry({ mouthRadius: 0.05 }), RangeError);
            assert.throws(() => createTamaGeometry({ bevelRadius: 0.01 }), RangeError); // bevelRadius < mouthRadius
            assert.throws(() => createTamaGeometry({ apexRadius: 0.02 }), RangeError); // apexRadius > mouthRadius
        });

        it('throws RangeError on invalid segment counts', () => {
            assert.throws(() => createTamaGeometry({ radialSegments: 4 }), RangeError);
            assert.throws(() => createTamaGeometry({ sphereSteps: 2 }), RangeError);
        });
    });
});
