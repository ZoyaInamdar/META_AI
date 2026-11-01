/**
 * Celestial Kendama - Procedural Cup Geometry Generator
 * Role: Person C (Visuals & Rendering)
 *
 * Generates hollow cup bowl geometries using Three.js LatheGeometry.
 *
 * Coordinate Convention (Local Cup Space):
 * - Origin (0, 0, 0): Center of the cup opening / rim aperture.
 * - +Y axis: Local opening normal pointing out of the cup cavity.
 * - -Y axis: Direction the hollow bowl body recedes backwards into the handle.
 * - Local X / Z: Circular cross-section symmetric around the Y axis.
 */

import {
    BufferGeometry,
    BufferAttribute,
    LatheGeometry,
    Vector2,
    Vector3,
} from 'three';

/** Default visual wall thickness in meters (3.0 mm) */
export const DEFAULT_WALL_THICKNESS = 0.003;

/** Default number of radial lathe segments (balance of smoothness and Quest VR budget) */
export const DEFAULT_RADIAL_SEGMENTS = 36;

/** Default number of sample points along the inner and outer curve profiles */
export const DEFAULT_PROFILE_STEPS = 16;

/** Default ratio of inner floor radius relative to rim radius (~33%) */
export const DEFAULT_FLOOR_RADIUS_RATIO = 0.33;

/** Default handle length in meters (11.0 cm) */
export const DEFAULT_HANDLE_LENGTH = 0.11;

/** Default handle top radius in meters (12.0 mm) */
export const DEFAULT_HANDLE_TOP_RADIUS = 0.012;

/** Default handle bottom radius in meters (13.0 mm) */
export const DEFAULT_HANDLE_BOTTOM_RADIUS = 0.013;

/** Default handle waist radius in meters (10.5 mm) */
export const DEFAULT_HANDLE_WAIST_RADIUS = 0.0105;

/** Default radial segments for handle geometry */
export const DEFAULT_HANDLE_RADIAL_SEGMENTS = 32;

/** Default profile sample steps for handle geometry */
export const DEFAULT_HANDLE_PROFILE_STEPS = 16;

/** Default fillet radius for handle end caps in meters (2.0 mm) */
export const DEFAULT_HANDLE_FILLET_RADIUS = 0.002;

/** Default crossbar center junction radius in meters (13.0 mm) */
export const DEFAULT_CROSSBAR_CENTER_RADIUS = 0.013;

/** Default distance from junction center to Big Cup mounting face along +X (44.11 mm) */
export const DEFAULT_CROSSBAR_BIG_SPAN = 0.04411;

/** Default distance from junction center to Small Cup mounting face along -X (39.11 mm) */
export const DEFAULT_CROSSBAR_SMALL_SPAN = 0.03911;

/** Default total crossbar span in meters (~83.22 mm) */
export const DEFAULT_CROSSBAR_SPAN = DEFAULT_CROSSBAR_BIG_SPAN + DEFAULT_CROSSBAR_SMALL_SPAN;

/** Default legacy crossbar span length in meters (10.0 cm) */
export const DEFAULT_CROSSBAR_LENGTH = 0.10;

/** Default crossbar Big Cup mounting face radius in meters (17.85 mm, matching Big Cup base) */
export const DEFAULT_CROSSBAR_BIG_END_RADIUS = 0.01785;

/** Default crossbar Small Cup mounting face radius in meters (16.20 mm, matching Small Cup base) */
export const DEFAULT_CROSSBAR_SMALL_END_RADIUS = 0.01620;

/** Default legacy crossbar wing end radius in meters (11.5 mm) */
export const DEFAULT_CROSSBAR_END_RADIUS = 0.0115;

/** Default Big Cup wing ergonomic waist radius (12.0 mm) */
export const DEFAULT_CROSSBAR_BIG_WING_WAIST = 0.0120;

/** Default Small Cup wing ergonomic waist radius (11.5 mm) */
export const DEFAULT_CROSSBAR_SMALL_WING_WAIST = 0.0115;

/** Default radial segments for crossbar geometry */
export const DEFAULT_CROSSBAR_RADIAL_SEGMENTS = 32;

/** Default wing sample steps for crossbar profile */
export const DEFAULT_CROSSBAR_WING_STEPS = 12;

/** Default profile sample steps for crossbar geometry (legacy) */
export const DEFAULT_CROSSBAR_PROFILE_STEPS = 16;

/** Default fillet radius for crossbar end caps in meters (2.5 mm, legacy) */
export const DEFAULT_CROSSBAR_FILLET_RADIUS = 0.0025;

/** Vertical elevation of Sarado crossbar axis in Ken coordinates (meters) */
export const DEFAULT_SARADO_ELEVATION_Y = 0.08885;

/** Default spike length along Y from Sarado elevation in meters (96.15 mm) */
export const DEFAULT_SPIKE_LENGTH = 0.09615;

/** Default spike root radius at Sarado intersection in meters (7.0 mm = 14 mm dia) */
export const DEFAULT_SPIKE_ROOT_RADIUS = 0.0070;

/** Default spike tip rounded radius in meters (1.5 mm = 3 mm dia) */
export const DEFAULT_SPIKE_TIP_RADIUS = 0.0015;

/** Default radial segments for spike geometry */
export const DEFAULT_SPIKE_RADIAL_SEGMENTS = 32;

/**
 * Creates a hollow cup bowl geometry from a cup configuration object.
 *
 * The geometry is generated using a 5-stage profile curve revolved 360 degrees.
 * The profile is traversed in counter-clockwise (CCW) outward-normal order:
 * 1. Outer Bottom: Flat circular base extending from axis r = 0 out to outer floor corner.
 * 2. Outer Wall: Smooth curve ascending from outer corner to outer rim at y = 0.
 * 3. Rim Lip: Smooth rounded lip bridging outer rim to inner rim (r = rimRadius, y = 0).
 * 4. Inner Wall: Smooth concave curve descending to inner floor corner at y = -depth.
 * 5. Inner Floor: Flat circular disc extending from inner floor edge back to central axis r = 0.
 *
 * Following this traversal order ensures that surface normals on all faces point outward
 * into free space (away from solid material):
 * - Outer surfaces (bottom & sidewall) point outward into the room.
 * - Rim crest points upward into the room.
 * - Cavity surfaces (inner wall & floor) point inward into the cup cavity.
 *
 * Degenerate zero-area triangles generated at the central axis (r = 0) by LatheGeometry
 * are filtered out of the index buffer, yielding a 100% watertight, 2-manifold mesh.
 *
 * @param {object} cupConfig - Cup configuration (e.g. from CUP_CONFIGS in cupConfigs.js)
 * @param {number} cupConfig.rimRadius - Visual rim opening radius in meters
 * @param {number} cupConfig.depth - Cavity depth from rim to inner floor in meters
 * @param {object} [options={}] - Optional visual parameters
 * @param {number} [options.wallThickness=0.003] - Cup wall thickness in meters
 * @param {number} [options.radialSegments=36] - Number of radial subdivisions around Y
 * @param {number} [options.profileSteps=16] - Number of curve sample steps along profile
 * @param {number} [options.innerFloorRadius] - Explicit inner floor radius (defaults to rimRadius * 0.33)
 * @param {number} [options.floorRadiusRatio=0.33] - Ratio to derive inner floor radius from rimRadius
 * @returns {LatheGeometry} The generated hollow cup geometry
 */
export function createCupGeometry(cupConfig, options = {}) {
    // 1. Validate cupConfig
    if (!cupConfig || typeof cupConfig !== 'object') {
        throw new TypeError(
            'createCupGeometry: cupConfig must be a valid configuration object.'
        );
    }

    const { rimRadius, depth } = cupConfig;

    if (!Number.isFinite(rimRadius) || rimRadius <= 0) {
        throw new RangeError(
            `createCupGeometry: cupConfig.rimRadius must be a positive finite number (received: ${rimRadius}).`
        );
    }

    if (!Number.isFinite(depth) || depth <= 0) {
        throw new RangeError(
            `createCupGeometry: cupConfig.depth must be a positive finite number (received: ${depth}).`
        );
    }

    // 2. Validate visual options
    const wallThickness = options.wallThickness ?? DEFAULT_WALL_THICKNESS;
    if (!Number.isFinite(wallThickness) || wallThickness <= 0) {
        throw new RangeError(
            `createCupGeometry: wallThickness must be a positive finite number (received: ${wallThickness}).`
        );
    }

    if (wallThickness >= rimRadius) {
        throw new RangeError(
            `createCupGeometry: wallThickness (${wallThickness}) cannot exceed or equal rimRadius (${rimRadius}).`
        );
    }

    const radialSegments = options.radialSegments ?? DEFAULT_RADIAL_SEGMENTS;
    if (!Number.isInteger(radialSegments) || radialSegments < 8) {
        throw new RangeError(
            `createCupGeometry: radialSegments must be an integer >= 8 (received: ${radialSegments}).`
        );
    }

    const profileSteps = options.profileSteps ?? DEFAULT_PROFILE_STEPS;
    if (!Number.isInteger(profileSteps) || profileSteps < 4) {
        throw new RangeError(
            `createCupGeometry: profileSteps must be an integer >= 4 (received: ${profileSteps}).`
        );
    }

    // 3. Determine inner and outer floor radii
    const floorRatio = options.floorRadiusRatio ?? DEFAULT_FLOOR_RADIUS_RATIO;
    const innerFloorRadius = options.innerFloorRadius ?? (rimRadius * floorRatio);

    if (!Number.isFinite(innerFloorRadius) || innerFloorRadius <= 0 || innerFloorRadius >= rimRadius) {
        throw new RangeError(
            `createCupGeometry: innerFloorRadius (${innerFloorRadius}) must be a positive finite number less than rimRadius (${rimRadius}).`
        );
    }

    const outerFloorRadius = innerFloorRadius + wallThickness;
    const outerDepth = depth + wallThickness;
    const rimOuterRadius = rimRadius + wallThickness;

    // 4. Construct 2D cross-section profile points (r, y)
    // Traversed in CCW outward-normal order: Outer Bottom -> Outer Wall -> Rim Lip -> Inner Wall -> Inner Floor
    const points = [];

    // Stage 1: Outer Bottom
    // Flat horizontal base from central axis r = 0 out to outer bottom corner at y = -outerDepth.
    // Outward surface normal points downward (-Y) into the environment.
    points.push(new Vector2(0.0, -outerDepth));
    points.push(new Vector2(outerFloorRadius, -outerDepth));

    // Stage 2: Outer Wall
    // Smooth convex curve ascending from outer corner to outer rim aperture (rimOuterRadius, 0).
    // Outward surface normal points radially outward (+r) into the room.
    for (let i = 1; i <= profileSteps; i++) {
        const t = i / profileSteps;
        const r = outerFloorRadius + (rimOuterRadius - outerFloorRadius) * Math.sin(t * Math.PI * 0.5);
        const y = -outerDepth + outerDepth * Math.pow(t, 1.2);
        points.push(new Vector2(r, y));
    }

    // Stage 3: Beveled / Rounded Rim Lip
    // Smooth rounded crest bridging outer rim edge (rimOuterRadius, 0) to inner rim edge (rimRadius, 0).
    // Outward surface normal points upward (+Y).
    const lipCrestHeight = wallThickness * 0.15;
    points.push(new Vector2(rimRadius + wallThickness * 0.5, lipCrestHeight));
    points.push(new Vector2(rimRadius, 0.0));

    // Stage 4: Inner Wall
    // Smooth concave curve descending from inner rim edge to inner floor corner (innerFloorRadius, -depth).
    // Outward surface normal points radially inward (-r) into the cup cavity.
    for (let i = profileSteps - 1; i >= 1; i--) {
        const t = i / profileSteps;
        const r = innerFloorRadius + (rimRadius - innerFloorRadius) * Math.sin(t * Math.PI * 0.5);
        const y = -depth + depth * Math.pow(t, 1.25);
        points.push(new Vector2(r, y));
    }

    // Stage 5: Inner Floor
    // Flat horizontal disc from inner floor corner back to central axis r = 0 at y = -depth.
    // Outward surface normal points upward (+Y) into the cup cavity where the ball seats.
    points.push(new Vector2(innerFloorRadius, -depth));
    points.push(new Vector2(0.0, -depth));

    // 5. Generate the 3D LatheGeometry by spinning the profile 360 degrees around Y axis
    const geometry = new LatheGeometry(points, radialSegments);

    // 6. Clean degenerate zero-area triangles generated at axis endpoints (r = 0)
    filterDegenerateTriangles(geometry);

    // 7. Compute vertex normals for correct lighting and shading
    geometry.computeVertexNormals();

    // Ensure coincident center vertices at r = 0 have clean, consistent surface normals
    const norm = geometry.attributes.normal;
    if (norm) {
        // Outer base center vertices point down into the environment (-Y)
        norm.setXYZ(0, 0, -1, 0);
    }

    return geometry;
}

/**
 * Removes degenerate zero-area triangles generated at the central axis (r = 0)
 * by Three.js LatheGeometry.
 *
 * @param {LatheGeometry} geometry - Revolved lathe geometry to filter in place
 */
function filterDegenerateTriangles(geometry) {
    const pos = geometry.attributes.position;
    const index = geometry.index;
    if (!index) return;

    const cleanIndices = [];
    for (let i = 0; i < index.count; i += 3) {
        const a = index.getX(i);
        const b = index.getX(i + 1);
        const c = index.getX(i + 2);

        const dxAB = pos.getX(a) - pos.getX(b);
        const dyAB = pos.getY(a) - pos.getY(b);
        const dzAB = pos.getZ(a) - pos.getZ(b);
        const dAB2 = dxAB * dxAB + dyAB * dyAB + dzAB * dzAB;

        const dxBC = pos.getX(b) - pos.getX(c);
        const dyBC = pos.getY(b) - pos.getY(c);
        const dzBC = pos.getZ(b) - pos.getZ(c);
        const dBC2 = dxBC * dxBC + dyBC * dyBC + dzBC * dzBC;

        const dxCA = pos.getX(c) - pos.getX(a);
        const dyCA = pos.getY(c) - pos.getY(a);
        const dzCA = pos.getZ(c) - pos.getZ(a);
        const dCA2 = dxCA * dxCA + dyCA * dyCA + dzCA * dzCA;

        // Retain only triangles whose 3 vertices have distinct 3D positions
        if (dAB2 > 1e-12 && dBC2 > 1e-12 && dCA2 > 1e-12) {
            cleanIndices.push(a, b, c);
        }
    }
    geometry.setIndex(cleanIndices);
}

/**
 * Creates the procedural kendama handle (Ken) geometry.
 *
 * The handle is generated along the Y-axis with a subtle ergonomic waist,
 * flared transitions at the top and bottom, and smoothly rounded end caps.
 *
 * Coordinate Convention (Local Handle Space):
 * - Origin (0, 0, 0): Center of the handle body along the Y axis.
 * - +Y axis: Ascends towards the crossbar junction and top spike.
 * - -Y axis: Descends towards the base cup.
 * - Local X / Z: Circular cross-section symmetric around the Y axis.
 *
 * @param {object} [options={}] - Optional dimensional and visual parameters
 * @param {number} [options.length=0.11] - Total handle length along Y in meters
 * @param {number} [options.topRadius=0.012] - Radius at the top (+Y) junction end in meters
 * @param {number} [options.bottomRadius=0.013] - Radius at the bottom (-Y) base cup end in meters
 * @param {number} [options.waistRadius=0.0105] - Radius at the narrowest grip waist in meters
 * @param {number} [options.radialSegments=32] - Number of radial subdivisions around Y
 * @param {number} [options.profileSteps=16] - Number of subdivisions along the ergonomic profile
 * @param {number} [options.filletRadius=0.002] - Radius of rounded end transitions in meters
 * @returns {LatheGeometry} The generated handle geometry
 */
export function createHandleGeometry(options = {}) {
    if (options !== null && typeof options !== 'object') {
        throw new TypeError('createHandleGeometry: options must be an object.');
    }

    const length = options.length ?? DEFAULT_HANDLE_LENGTH;
    if (!Number.isFinite(length) || length <= 0) {
        throw new RangeError(
            `createHandleGeometry: length must be a positive finite number (received: ${length}).`
        );
    }

    const topRadius = options.topRadius ?? DEFAULT_HANDLE_TOP_RADIUS;
    if (!Number.isFinite(topRadius) || topRadius <= 0) {
        throw new RangeError(
            `createHandleGeometry: topRadius must be a positive finite number (received: ${topRadius}).`
        );
    }

    const bottomRadius = options.bottomRadius ?? DEFAULT_HANDLE_BOTTOM_RADIUS;
    if (!Number.isFinite(bottomRadius) || bottomRadius <= 0) {
        throw new RangeError(
            `createHandleGeometry: bottomRadius must be a positive finite number (received: ${bottomRadius}).`
        );
    }

    const waistRadius = options.waistRadius ?? DEFAULT_HANDLE_WAIST_RADIUS;
    if (!Number.isFinite(waistRadius) || waistRadius <= 0) {
        throw new RangeError(
            `createHandleGeometry: waistRadius must be a positive finite number (received: ${waistRadius}).`
        );
    }

    const radialSegments = options.radialSegments ?? DEFAULT_HANDLE_RADIAL_SEGMENTS;
    if (!Number.isInteger(radialSegments) || radialSegments < 8) {
        throw new RangeError(
            `createHandleGeometry: radialSegments must be an integer >= 8 (received: ${radialSegments}).`
        );
    }

    const profileSteps = options.profileSteps ?? DEFAULT_HANDLE_PROFILE_STEPS;
    if (!Number.isInteger(profileSteps) || profileSteps < 4) {
        throw new RangeError(
            `createHandleGeometry: profileSteps must be an integer >= 4 (received: ${profileSteps}).`
        );
    }

    const filletRadius = options.filletRadius ?? DEFAULT_HANDLE_FILLET_RADIUS;
    if (!Number.isFinite(filletRadius) || filletRadius <= 0) {
        throw new RangeError(
            `createHandleGeometry: filletRadius must be a positive finite number (received: ${filletRadius}).`
        );
    }

    const maxFillet = Math.min(topRadius, bottomRadius, length * 0.25);
    if (filletRadius >= maxFillet) {
        throw new RangeError(
            `createHandleGeometry: filletRadius (${filletRadius}) must be less than min(topRadius, bottomRadius, length * 0.25) (${maxFillet}).`
        );
    }

    const halfLen = length * 0.5;
    const points = [];

    // 1. Bottom end center (r=0, y=-halfLen)
    points.push(new Vector2(0.0, -halfLen));

    // 2. Bottom rounded end transition (fillet)
    const filletSteps = 4;
    for (let i = 1; i <= filletSteps; i++) {
        const angle = (i / filletSteps) * (Math.PI * 0.5);
        const r = (bottomRadius - filletRadius) + filletRadius * Math.sin(angle);
        const y = -halfLen + filletRadius * (1.0 - Math.cos(angle));
        points.push(new Vector2(r, y));
    }

    // 3. Ergonomic body profile: bottom flare -> waist dip -> top flare
    const yStart = -halfLen + filletRadius;
    const yEnd = halfLen - filletRadius;
    const bodyHeight = yEnd - yStart;
    const waistT = 0.42; // slightly below midpoint where the grip naturally rests

    for (let i = 1; i < profileSteps; i++) {
        const t = i / profileSteps;
        const y = yStart + bodyHeight * t;
        let r;
        if (t <= waistT) {
            const u = t / waistT;
            r = bottomRadius - (bottomRadius - waistRadius) * (0.5 - 0.5 * Math.cos(u * Math.PI));
        } else {
            const u = (t - waistT) / (1.0 - waistT);
            r = waistRadius + (topRadius - waistRadius) * (0.5 - 0.5 * Math.cos(u * Math.PI));
        }
        points.push(new Vector2(r, y));
    }

    // 4. Top rounded end transition (fillet) into (r=0, y=+halfLen)
    for (let i = filletSteps; i >= 1; i--) {
        const angle = (i / filletSteps) * (Math.PI * 0.5);
        const r = (topRadius - filletRadius) + filletRadius * Math.sin(angle);
        const y = halfLen - filletRadius * (1.0 - Math.cos(angle));
        points.push(new Vector2(r, y));
    }
    points.push(new Vector2(0.0, halfLen));

    const geometry = new LatheGeometry(points, radialSegments);
    filterDegenerateTriangles(geometry);
    geometry.computeVertexNormals();

    return geometry;
}

/**
 * Creates the procedural kendama crossbar (Sarado) connecting geometry.
 *
 * The crossbar is generated centered at (0, 0, 0) in its local coordinate system
 * with its main axis running horizontally along the X-axis:
 * - Positive X wing extends toward the Big Cup mounting base at x = +0.04411 m.
 * - Negative X wing extends toward the Small Cup mounting base at x = -0.03911 m.
 * - Center junction (x = 0) aligns with the vertical Ken handle and spike axis.
 * - End mounting faces are angled to match Person A's configured cup normals:
 *   +X mounting face normal: normalized (+0.33, +0.944, 0)
 *   -X mounting face normal: normalized (-0.33, +0.944, 0)
 *
 * This provides 100% flush, gapless mounting surfaces that seat the Big Cup and
 * Small Cup without floating bowls, interpenetrations, or artificial stalks.
 *
 * Generates a 100% closed, watertight 2-manifold surface with 0 boundary edges.
 *
 * @param {object} [options={}] - Optional dimensional and visual parameters
 * @param {number} [options.length] - Optional total span along X (proportional scaling)
 * @param {number} [options.bigSpan=0.04411] - Distance from center to Big Cup mounting face in meters
 * @param {number} [options.smallSpan=0.03911] - Distance from center to Small Cup mounting face in meters
 * @param {number} [options.centerRadius=0.013] - Radius at central handle junction in meters
 * @param {number} [options.endRadius] - Common radius at both wing ends in meters (overrides big/small)
 * @param {number} [options.bigEndRadius=0.01785] - Radius of Big Cup mounting face in meters
 * @param {number} [options.smallEndRadius=0.01620] - Radius of Small Cup mounting face in meters
 * @param {number} [options.radialSegments=32] - Number of radial subdivisions around crossbar axis
 * @param {number} [options.wingSteps=12] - Number of subdivisions along each wing
 * @param {number} [options.profileSteps] - Legacy alias for wing steps
 * @param {number} [options.filletRadius] - Legacy fillet radius parameter (validated)
 * @returns {BufferGeometry} The generated crossbar geometry oriented along the X-axis
 */
export function createCrossbarGeometry(options = {}) {
    if (options !== null && typeof options !== 'object') {
        throw new TypeError('createCrossbarGeometry: options must be an object.');
    }

    // Determine wing spans
    let bigSpan = options.bigSpan ?? DEFAULT_CROSSBAR_BIG_SPAN;
    let smallSpan = options.smallSpan ?? DEFAULT_CROSSBAR_SMALL_SPAN;

    if (options.length !== undefined) {
        if (!Number.isFinite(options.length) || options.length <= 0) {
            throw new RangeError(
                `createCrossbarGeometry: length must be a positive finite number (received: ${options.length}).`
            );
        }
        const scale = options.length / DEFAULT_CROSSBAR_SPAN;
        bigSpan = DEFAULT_CROSSBAR_BIG_SPAN * scale;
        smallSpan = DEFAULT_CROSSBAR_SMALL_SPAN * scale;
    }

    if (!Number.isFinite(bigSpan) || bigSpan <= 0) {
        throw new RangeError(
            `createCrossbarGeometry: bigSpan must be a positive finite number (received: ${bigSpan}).`
        );
    }
    if (!Number.isFinite(smallSpan) || smallSpan <= 0) {
        throw new RangeError(
            `createCrossbarGeometry: smallSpan must be a positive finite number (received: ${smallSpan}).`
        );
    }

    const centerRadius = options.centerRadius ?? DEFAULT_CROSSBAR_CENTER_RADIUS;
    if (!Number.isFinite(centerRadius) || centerRadius <= 0) {
        throw new RangeError(
            `createCrossbarGeometry: centerRadius must be a positive finite number (received: ${centerRadius}).`
        );
    }

    const bigEndRadius = options.bigEndRadius ?? (options.endRadius ?? DEFAULT_CROSSBAR_BIG_END_RADIUS);
    if (!Number.isFinite(bigEndRadius) || bigEndRadius <= 0) {
        throw new RangeError(
            `createCrossbarGeometry: bigEndRadius must be a positive finite number (received: ${bigEndRadius}).`
        );
    }

    const smallEndRadius = options.smallEndRadius ?? (options.endRadius ?? DEFAULT_CROSSBAR_SMALL_END_RADIUS);
    if (!Number.isFinite(smallEndRadius) || smallEndRadius <= 0) {
        throw new RangeError(
            `createCrossbarGeometry: smallEndRadius must be a positive finite number (received: ${smallEndRadius}).`
        );
    }

    const bigWaistRadius = options.bigWingWaist ?? Math.min(centerRadius, bigEndRadius) * 0.92;
    const smallWaistRadius = options.smallWingWaist ?? Math.min(centerRadius, smallEndRadius) * 0.90;

    const radialSegments = options.radialSegments ?? DEFAULT_CROSSBAR_RADIAL_SEGMENTS;
    if (!Number.isInteger(radialSegments) || radialSegments < 8) {
        throw new RangeError(
            `createCrossbarGeometry: radialSegments must be an integer >= 8 (received: ${radialSegments}).`
        );
    }

    if (options.profileSteps !== undefined) {
        if (!Number.isInteger(options.profileSteps) || options.profileSteps < 4) {
            throw new RangeError(
                `createCrossbarGeometry: profileSteps must be an integer >= 4 (received: ${options.profileSteps}).`
            );
        }
    }

    const wingSteps = options.wingSteps ?? (options.profileSteps ? Math.max(4, Math.floor(options.profileSteps * 0.75)) : DEFAULT_CROSSBAR_WING_STEPS);
    if (!Number.isInteger(wingSteps) || wingSteps < 4) {
        throw new RangeError(
            `createCrossbarGeometry: wingSteps must be an integer >= 4 (received: ${wingSteps}).`
        );
    }

    if (options.filletRadius !== undefined) {
        if (!Number.isFinite(options.filletRadius) || options.filletRadius <= 0) {
            throw new RangeError(
                `createCrossbarGeometry: filletRadius must be a positive finite number (received: ${options.filletRadius}).`
            );
        }
        const maxFillet = Math.min(bigEndRadius, smallEndRadius, (bigSpan + smallSpan) * 0.25);
        if (options.filletRadius >= maxFillet) {
            throw new RangeError(
                `createCrossbarGeometry: filletRadius (${options.filletRadius}) must be less than min(endRadius, span * 0.25) (${maxFillet}).`
            );
        }
    }

    // Configured cup normal orientations (tilted 19.27 deg outward from +Y)
    const normLen = Math.hypot(0.33, 0.944);
    const bigNormX = 0.33 / normLen;
    const bigNormY = 0.944 / normLen;
    const smallNormX = -0.33 / normLen;
    const smallNormY = 0.944 / normLen;

    const targetAngleSmall = Math.atan2(smallNormY, smallNormX); // ~ 109.27 deg
    const centerAngleSmall = Math.PI;                           // 180 deg
    const targetAngleBig = Math.atan2(bigNormY, bigNormX);       // ~ 70.73 deg
    const centerAngleBig = 0.0;                                 // 0 deg

    const xBig = bigSpan;
    const xSmall = -smallSpan;
    const rings = [];

    // 1. Small Wing: from mount (u = 0, x = xSmall) to center (u = 1, x = 0)
    for (let i = 0; i <= wingSteps; i++) {
        const u = i / wingSteps;
        const x = xSmall * (1.0 - u);

        const tMount = Math.max(0.0, 1.0 - u);
        const angleBlend = Math.pow(tMount, 1.5);
        const curAngle = centerAngleSmall + (targetAngleSmall - centerAngleSmall) * angleBlend;

        const nx = Math.cos(curAngle);
        const ny = Math.sin(curAngle);
        const ux = -ny;
        const uy = nx;

        let r;
        if (u <= 0.5) {
            const v = u / 0.5;
            r = smallEndRadius - (smallEndRadius - smallWaistRadius) * (0.5 - 0.5 * Math.cos(v * Math.PI));
        } else {
            const v = (u - 0.5) / 0.5;
            r = smallWaistRadius + (centerRadius - smallWaistRadius) * (0.5 - 0.5 * Math.cos(v * Math.PI));
        }

        rings.push({
            center: new Vector3(x, 0.0, 0.0),
            ux, uy,
            radius: r,
        });
    }

    // 2. Big Wing: from center (u = 0, x = 0) to mount (u = 1, x = xBig)
    for (let i = 1; i <= wingSteps; i++) {
        const u = i / wingSteps;
        const x = xBig * u;

        const angleBlend = Math.pow(u, 1.5);
        const curAngle = centerAngleBig + (targetAngleBig - centerAngleBig) * angleBlend;

        const nx = Math.cos(curAngle);
        const ny = Math.sin(curAngle);
        const ux = -ny;
        const uy = nx;

        let r;
        if (u <= 0.5) {
            const v = u / 0.5;
            r = centerRadius - (centerRadius - bigWaistRadius) * (0.5 - 0.5 * Math.cos(v * Math.PI));
        } else {
            const v = (u - 0.5) / 0.5;
            r = bigWaistRadius + (bigEndRadius - bigWaistRadius) * (0.5 - 0.5 * Math.cos(v * Math.PI));
        }

        rings.push({
            center: new Vector3(x, 0.0, 0.0),
            ux, uy,
            radius: r,
        });
    }

    const positions = [];
    const numRings = rings.length;

    for (let rIdx = 0; rIdx < numRings; rIdx++) {
        const ring = rings[rIdx];
        const ux = ring.ux;
        const uy = ring.uy;
        const radius = ring.radius;
        const zSign = rIdx <= wingSteps ? -1.0 : 1.0;

        for (let s = 0; s < radialSegments; s++) {
            const theta = (s / radialSegments) * Math.PI * 2;
            const cosT = Math.cos(theta);
            const sinT = Math.sin(theta);

            const px = ring.center.x + radius * (ux * cosT);
            const py = ring.center.y + radius * (uy * cosT);
            const pz = ring.center.z + radius * sinT * zSign;

            positions.push(px, py, pz);
        }
    }

    // Small cap center vertex
    const smallCapCenterIdx = positions.length / 3;
    positions.push(rings[0].center.x, rings[0].center.y, rings[0].center.z);

    // Big cap center vertex
    const bigCapCenterIdx = positions.length / 3;
    const lastRing = rings[rings.length - 1];
    positions.push(lastRing.center.x, lastRing.center.y, lastRing.center.z);

    const indices = [];

    // Cylinder quad strips: outward normal (a, b, d) and (b, c, d)
    for (let rIdx = 0; rIdx < numRings - 1; rIdx++) {
        const ring0Start = rIdx * radialSegments;
        const ring1Start = (rIdx + 1) * radialSegments;

        for (let s = 0; s < radialSegments; s++) {
            const nextS = (s + 1) % radialSegments;

            const a = ring0Start + s;
            const b = ring0Start + nextS;
            const c = ring1Start + nextS;
            const d = ring1Start + s;

            indices.push(a, b, d);
            indices.push(b, c, d);
        }
    }

    // Small cap fan: edge nextS -> s
    for (let s = 0; s < radialSegments; s++) {
        const nextS = (s + 1) % radialSegments;
        indices.push(smallCapCenterIdx, nextS, s);
    }

    // Big cap fan: edge s -> nextS
    const lastRingStart = (numRings - 1) * radialSegments;
    for (let s = 0; s < radialSegments; s++) {
        const nextS = (s + 1) % radialSegments;
        indices.push(bigCapCenterIdx, lastRingStart + s, lastRingStart + nextS);
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return geometry;
}

/**
 * Creates the procedural kendama spike (Kensaki) geometry.
 *
 * The spike is generated ascending vertically along the Y-axis:
 * - Base at y = 0 with radius rootRadius.
 * - Conical taper extending upward.
 * - Rounded hemispherical tip at y = length (matching Person A's spike target).
 *
 * Watertight 2-manifold mesh with zero degenerate triangles.
 *
 * @param {object} [options={}] - Optional dimensional parameters
 * @param {number} [options.length=0.09615] - Length of spike from base to tip in meters
 * @param {number} [options.rootRadius=0.0070] - Radius at the spike base shoulder in meters
 * @param {number} [options.tipRadius=0.0015] - Radius of rounded tip in meters
 * @param {number} [options.radialSegments=32] - Number of radial subdivisions around Y
 * @returns {LatheGeometry} The generated spike geometry
 */
export function createSpikeGeometry(options = {}) {
    if (options !== null && typeof options !== 'object') {
        throw new TypeError('createSpikeGeometry: options must be an object.');
    }

    const length = options.length ?? DEFAULT_SPIKE_LENGTH;
    if (!Number.isFinite(length) || length <= 0) {
        throw new RangeError(
            `createSpikeGeometry: length must be a positive finite number (received: ${length}).`
        );
    }

    const rootRadius = options.rootRadius ?? DEFAULT_SPIKE_ROOT_RADIUS;
    if (!Number.isFinite(rootRadius) || rootRadius <= 0) {
        throw new RangeError(
            `createSpikeGeometry: rootRadius must be a positive finite number (received: ${rootRadius}).`
        );
    }

    const tipRadius = options.tipRadius ?? DEFAULT_SPIKE_TIP_RADIUS;
    if (!Number.isFinite(tipRadius) || tipRadius <= 0 || tipRadius >= rootRadius) {
        throw new RangeError(
            `createSpikeGeometry: tipRadius must be a positive finite number less than rootRadius (received: ${tipRadius}).`
        );
    }

    const radialSegments = options.radialSegments ?? DEFAULT_SPIKE_RADIAL_SEGMENTS;
    if (!Number.isInteger(radialSegments) || radialSegments < 8) {
        throw new RangeError(
            `createSpikeGeometry: radialSegments must be an integer >= 8 (received: ${radialSegments}).`
        );
    }

    const points = [];
    // 1. Base flat center at r = 0, y = 0
    points.push(new Vector2(0.0, 0.0));
    // 2. Base shoulder corner
    points.push(new Vector2(rootRadius, 0.0));
    // 3. Conical body taper up to hemisphere equator
    const coneHeight = length - tipRadius;
    points.push(new Vector2(tipRadius, coneHeight));
    // 4. Rounded tip hemispherical cap
    const tipSteps = 4;
    for (let i = 1; i <= tipSteps; i++) {
        const angle = (i / tipSteps) * (Math.PI * 0.5);
        const r = tipRadius * Math.cos(angle);
        const y = coneHeight + tipRadius * Math.sin(angle);
        points.push(new Vector2(r, y));
    }

    const geometry = new LatheGeometry(points, radialSegments);
    filterDegenerateTriangles(geometry);
    geometry.computeVertexNormals();

    return geometry;
}

export default createCupGeometry;
