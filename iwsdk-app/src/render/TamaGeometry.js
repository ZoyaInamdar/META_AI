/**
 * Celestial Kendama - Procedural Tama (Ball) Geometry with Physical Spike Hole
 * Role: Person C (Visuals & Rendering)
 *
 * Generates the procedural 3D geometry for the Celestial Kendama Tama (ball).
 *
 * Physical Bore Requirements:
 * - Authoritative ball radius: BALL_RADIUS = 0.045 m (0.03 m * KEN_SCALE 1.5).
 * - Origin (0, 0, 0) is at the exact geometric center of the ball.
 * - Genuine geometric bore (not a decal or decorative ring) centered on the Y-axis.
 * - Bore opens at the bottom of the ball (facing local -Y) and extends inward along local +Y.
 * - Dimensions calculated directly from authoritative Kendama spike geometry:
 *     Spike length: 0.0345 m (kenGeometry.spike.tipY - kenGeometry.spike.baseY)
 *     Spike root radius: 0.01125 m (kenGeometry.stem.neckRadius)
 *     Spike tip radius: 0.00225 m (DEFAULT_SPIKE_TIP_RADIUS)
 * - Clearances applied:
 *     Longitudinal tip clearance: 0.0035 m (3.5 mm) -> Bore Depth = 0.0380 m (38.0 mm)
 *     Radial mouth clearance: 0.00175 m (1.75 mm) -> Mouth Radius = 0.0130 m (26.0 mm diam)
 *     Entry bevel rim radius: 0.0145 m (29.0 mm diam) -> 45 deg lead-in chamfer
 *     Radial apex clearance: 0.00225 m (2.25 mm) -> Apex Radius = 0.0045 m (9.0 mm diam)
 * - Closed, watertight 2-manifold surface with zero boundary edges and zero non-manifold edges.
 * - Consistent outward-facing normals (pointing away from solid material on both outer sphere
 *   and inner cavity walls).
 */

import { LatheGeometry, Vector2 } from 'three';
import { BALL_RADIUS, kenGeometry, KEN_SCALE } from '../input/cupConfigs.js';

// --- Authoritative Spike Dimensional References ---
const SPIKE_LENGTH = kenGeometry.spike.tipY - kenGeometry.spike.baseY; // 0.0345 m
const SPIKE_ROOT_RADIUS = kenGeometry.stem.neckRadius; // 0.01125 m
const SPIKE_TIP_RADIUS = 0.0015 * KEN_SCALE; // 0.00225 m

// --- Authoritative Clearances & Margins ---
export const DEFAULT_BORE_TIP_CLEARANCE = 0.0035;   // 3.5 mm longitudinal clearance past spike tip
export const DEFAULT_BORE_MOUTH_CLEARANCE = 0.00175; // 1.75 mm radial clearance at spike shoulder
export const DEFAULT_BORE_BEVEL_MARGIN = 0.0015;    // 1.50 mm radial lead-in bevel chamfer
export const DEFAULT_BORE_APEX_CLEARANCE = 0.00225; // 2.25 mm radial clearance at bore ceiling

// --- Authoritative Tama Geometry Constants ---
/** Default outer radius of the Tama in meters (0.045 m) */
export const DEFAULT_TAMA_RADIUS = BALL_RADIUS;

/** Default depth of the spike bore in meters (0.0380 m = 38.0 mm) */
export const DEFAULT_BORE_DEPTH = SPIKE_LENGTH + DEFAULT_BORE_TIP_CLEARANCE;

/** Default mouth radius of the inner bore in meters (0.0130 m = 26.0 mm diameter) */
export const DEFAULT_BORE_MOUTH_RADIUS = SPIKE_ROOT_RADIUS + DEFAULT_BORE_MOUTH_CLEARANCE;

/** Default outer bevel rim radius in meters (0.0145 m = 29.0 mm diameter) */
export const DEFAULT_BORE_BEVEL_RADIUS = DEFAULT_BORE_MOUTH_RADIUS + DEFAULT_BORE_BEVEL_MARGIN;

/** Default apex radius of the inner bore in meters (0.0045 m = 9.0 mm diameter) */
export const DEFAULT_BORE_APEX_RADIUS = SPIKE_TIP_RADIUS + DEFAULT_BORE_APEX_CLEARANCE;

/** Default radial segments around the central Y axis */
export const DEFAULT_TAMA_RADIAL_SEGMENTS = 36;

/** Default latitude steps for the outer spherical profile */
export const DEFAULT_TAMA_SPHERE_STEPS = 32;

/**
 * Removes degenerate zero-area triangles generated at the central axis (r = 0)
 * by Three.js LatheGeometry.
 *
 * @param {LatheGeometry} geometry - Revolved lathe geometry to filter in place
 */
export function filterDegenerateTriangles(geometry) {
    const pos = geometry.attributes.position;
    const index = geometry.index;
    if (!index) return;

    const cleanIndices = [];
    for (let i = 0; i < index.count; i += 3) {
        const a = index.getX(i);
        const b = index.getX(i + 1);
        const c = index.getX(i + 2);

        // Degenerate index check
        if (a === b || b === c || a === c) continue;

        // Zero-area triangle cross product check
        const ax = pos.getX(a), ay = pos.getY(a), az = pos.getZ(a);
        const bx = pos.getX(b), by = pos.getY(b), bz = pos.getZ(b);
        const cx = pos.getX(c), cy = pos.getY(c), cz = pos.getZ(c);

        const abx = bx - ax, aby = by - ay, abz = bz - az;
        const acx = cx - ax, acy = cy - ay, acz = cz - az;

        const crossX = aby * acz - abz * acy;
        const crossY = abz * acx - abx * acz;
        const crossZ = abx * acy - aby * acx;

        const area2 = crossX * crossX + crossY * crossY + crossZ * crossZ;
        if (area2 > 1e-14) {
            cleanIndices.push(a, b, c);
        }
    }
    geometry.setIndex(cleanIndices);
}

/**
 * Creates the procedural 3D geometry for the Celestial Kendama Tama (ball),
 * featuring an exact outer radius and an authentic physical bore opening at local -Y.
 *
 * Profile Traversal (CCW outward-normal order):
 * 1. Bore ceiling center on central axis (r = 0, y = yApex)
 * 2. Bore ceiling outer edge (r = apexRadius, y = yApex)
 * 3. Tapered bore inner wall descending to mouth (r = mouthRadius, y = yMouth)
 * 4. Lead-in bevel chamfer to outer sphere surface (r = bevelRadius, y = yRim)
 * 5. Outer spherical arc ascending to top pole (r = R * sin(theta), y = R * cos(theta))
 * 6. Top pole on central axis (r = 0, y = +radius)
 *
 * @param {object} [options={}] - Customization options
 * @param {number} [options.radius=DEFAULT_TAMA_RADIUS] - Outer ball radius in meters (0.045 m)
 * @param {number} [options.boreDepth=DEFAULT_BORE_DEPTH] - Total bore depth in meters (0.038 m)
 * @param {number} [options.mouthRadius=DEFAULT_BORE_MOUTH_RADIUS] - Inner mouth radius in meters (0.013 m)
 * @param {number} [options.bevelRadius=DEFAULT_BORE_BEVEL_RADIUS] - Outer bevel rim radius in meters (0.0145 m)
 * @param {number} [options.apexRadius=DEFAULT_BORE_APEX_RADIUS] - Bore apex ceiling radius in meters (0.0045 m)
 * @param {number} [options.radialSegments=DEFAULT_TAMA_RADIAL_SEGMENTS] - Radial subdivisions around Y (36)
 * @param {number} [options.sphereSteps=DEFAULT_TAMA_SPHERE_STEPS] - Latitude sample steps on sphere (32)
 * @returns {LatheGeometry} Watertight procedural Tama geometry with physical bore
 */
export function createTamaGeometry(options = {}) {
    if (options !== null && typeof options !== 'object') {
        throw new TypeError('createTamaGeometry: options must be an object.');
    }

    const radius = options.radius ?? DEFAULT_TAMA_RADIUS;
    if (!Number.isFinite(radius) || radius <= 0) {
        throw new RangeError(
            `createTamaGeometry: radius must be a positive finite number (received: ${radius}).`
        );
    }

    const boreDepth = options.boreDepth ?? DEFAULT_BORE_DEPTH;
    if (!Number.isFinite(boreDepth) || boreDepth <= 0 || boreDepth >= radius * 1.8) {
        throw new RangeError(
            `createTamaGeometry: boreDepth must be a positive finite number less than 1.8 * radius (received: ${boreDepth}).`
        );
    }

    const mouthRadius = options.mouthRadius ?? DEFAULT_BORE_MOUTH_RADIUS;
    if (!Number.isFinite(mouthRadius) || mouthRadius <= 0 || mouthRadius >= radius) {
        throw new RangeError(
            `createTamaGeometry: mouthRadius must be a positive finite number less than radius (received: ${mouthRadius}).`
        );
    }

    const bevelRadius = options.bevelRadius ?? DEFAULT_BORE_BEVEL_RADIUS;
    if (!Number.isFinite(bevelRadius) || bevelRadius < mouthRadius || bevelRadius >= radius) {
        throw new RangeError(
            `createTamaGeometry: bevelRadius must be >= mouthRadius and < radius (received: ${bevelRadius}).`
        );
    }

    const apexRadius = options.apexRadius ?? DEFAULT_BORE_APEX_RADIUS;
    if (!Number.isFinite(apexRadius) || apexRadius <= 0 || apexRadius >= mouthRadius) {
        throw new RangeError(
            `createTamaGeometry: apexRadius must be a positive finite number less than mouthRadius (received: ${apexRadius}).`
        );
    }

    const radialSegments = options.radialSegments ?? DEFAULT_TAMA_RADIAL_SEGMENTS;
    if (!Number.isInteger(radialSegments) || radialSegments < 8) {
        throw new RangeError(
            `createTamaGeometry: radialSegments must be an integer >= 8 (received: ${radialSegments}).`
        );
    }

    const sphereSteps = options.sphereSteps ?? DEFAULT_TAMA_SPHERE_STEPS;
    if (!Number.isInteger(sphereSteps) || sphereSteps < 4) {
        throw new RangeError(
            `createTamaGeometry: sphereSteps must be an integer >= 4 (received: ${sphereSteps}).`
        );
    }

    // Key elevation coordinates
    const yApex = -radius + boreDepth;
    const yRim = -Math.sqrt(Math.max(0, radius * radius - bevelRadius * bevelRadius));
    const bevelDepth = (bevelRadius - mouthRadius); // ~45 deg entry chamfer
    const yMouth = yRim + bevelDepth;

    const points = [];

    // Stage 1: Bore ceiling center on axis (r = 0, normal points down -Y into cavity)
    points.push(new Vector2(0.0, yApex));

    // Stage 2: Bore ceiling edge
    points.push(new Vector2(apexRadius, yApex));

    // Stage 3: Tapered bore wall intermediate samples for smooth triangulation
    points.push(new Vector2(apexRadius * 0.67 + mouthRadius * 0.33, yApex * 0.67 + yMouth * 0.33));
    points.push(new Vector2(apexRadius * 0.33 + mouthRadius * 0.67, yApex * 0.33 + yMouth * 0.67));

    // Stage 4: Bore mouth interior corner
    points.push(new Vector2(mouthRadius, yMouth));

    // Stage 5: Outer bevel rim on spherical surface
    points.push(new Vector2(bevelRadius, yRim));

    // Stage 6: Outer spherical arc ascending to top pole
    // At mouth opening: r = bevelRadius -> theta = pi - asin(bevelRadius / radius)
    const thetaMouth = Math.PI - Math.asin(bevelRadius / radius);
    for (let i = sphereSteps; i >= 1; i--) {
        const theta = (i / (sphereSteps + 1)) * thetaMouth;
        const r = radius * Math.sin(theta);
        const y = radius * Math.cos(theta);
        points.push(new Vector2(r, y));
    }

    // Stage 7: Top pole on central axis (r = 0, y = +radius)
    points.push(new Vector2(0.0, radius));

    // Construct 360 deg revolved lathe geometry
    const geometry = new LatheGeometry(points, radialSegments);

    // Clean degenerate axis triangles and compute smooth vertex normals
    filterDegenerateTriangles(geometry);
    geometry.computeVertexNormals();

    // Set clean vertical normals for the central axis poles (top pole and bore apex ceiling)
    const norm = geometry.attributes.normal;
    const pos = geometry.attributes.position;
    if (norm && pos) {
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
            if (Math.hypot(x, z) < 1e-4) {
                if (y > 0) {
                    norm.setXYZ(i, 0, 1, 0);
                } else {
                    norm.setXYZ(i, 0, -1, 0);
                }
            }
        }
    }

    return geometry;
}

export default createTamaGeometry;
