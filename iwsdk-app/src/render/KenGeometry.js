/**
 * Celestial Kendama - Procedural Cup & Ken Geometry Generator
 * Role: Person C (Visuals & Rendering)
 *
 * SINGLE SOURCE OF TRUTH:
 * Generates procedural Kendama geometry strictly adhering to Person A's
 * authoritative configurations in src/input/cupConfigs.js (kenGeometry, cupConfigs, KEN_SCALE, BALL_RADIUS).
 *
 * Coordinate Convention (World & Ken Assembly Space):
 * - Origin (0, 0, 0): Center of the crossbar junction (Sarado / Ken junction).
 * - +Y axis: Points upward along handle towards Spike tip (localNormal = 0, 1, 0).
 * - -Y axis: Points downward along stem towards Base Cup (localNormal = 0, -1, 0).
 * - +X axis: Points outward along crossbar towards Big Cup (localNormal = 1, 0, 0).
 * - -X axis: Points outward along crossbar towards Small Cup (localNormal = -1, 0, 0).
 * - +Z / -Z: Front / back facing axis.
 */

import {
    BufferGeometry,
    BufferAttribute,
    LatheGeometry,
    Vector2,
    Vector3,
} from 'three';
import {
    kenGeometry,
    cupConfigs,
    CUP_CONFIGS,
    KEN_SCALE,
    BALL_RADIUS,
    getCupConfig,
} from '../input/cupConfigs.js';

export { kenGeometry, cupConfigs, CUP_CONFIGS, KEN_SCALE, BALL_RADIUS, getCupConfig };

/** Default visual wall thickness in meters (3.0 mm) */
export const DEFAULT_WALL_THICKNESS = 0.003;

/** Default number of radial lathe segments */
export const DEFAULT_RADIAL_SEGMENTS = 36;

/** Default number of sample points along the inner and outer curve profiles */
export const DEFAULT_PROFILE_STEPS = 16;

/** Default ratio of inner floor radius relative to rim radius (~33%) */
export const DEFAULT_FLOOR_RADIUS_RATIO = 0.33;

// --- Crossbar (Sarado) Authoritative Constants ---
/** Crossbar half-width along X in meters (0.0405 * KEN_SCALE = 0.06075 m) */
export const DEFAULT_CROSSBAR_HALF_WIDTH = kenGeometry.crossbar.halfWidth;

/** Crossbar center junction radius in meters (0.011 * KEN_SCALE = 0.0165 m) */
export const DEFAULT_CROSSBAR_WAIST_RADIUS = kenGeometry.crossbar.waistRadius;
export const DEFAULT_CROSSBAR_CENTER_RADIUS = kenGeometry.crossbar.waistRadius;

/** Crossbar end radius in meters (0.022 * KEN_SCALE = 0.033 m) */
export const DEFAULT_CROSSBAR_END_RADIUS = kenGeometry.crossbar.endRadius;

/** Distance from junction center to Big Cup mounting face along +X (0.06075 m) */
export const DEFAULT_CROSSBAR_BIG_SPAN = kenGeometry.crossbar.halfWidth;

/** Distance from junction center to Small Cup mounting face along -X (0.06075 m) */
export const DEFAULT_CROSSBAR_SMALL_SPAN = kenGeometry.crossbar.halfWidth;

/** Total crossbar span in meters (0.1215 m) */
export const DEFAULT_CROSSBAR_SPAN = kenGeometry.crossbar.halfWidth * 2;
export const DEFAULT_CROSSBAR_LENGTH = DEFAULT_CROSSBAR_SPAN;

/** Crossbar Big Cup mounting face radius in meters (0.033 m, matching Big Cup rim) */
export const DEFAULT_CROSSBAR_BIG_END_RADIUS = cupConfigs.big.rimRadius;

/** Crossbar Small Cup mounting face radius in meters (0.0255 m, matching Small Cup rim) */
export const DEFAULT_CROSSBAR_SMALL_END_RADIUS = cupConfigs.small.rimRadius;

/** Default radial segments for crossbar geometry */
export const DEFAULT_CROSSBAR_RADIAL_SEGMENTS = 32;

/** Default wing sample steps for crossbar profile */
export const DEFAULT_CROSSBAR_WING_STEPS = 12;
export const DEFAULT_CROSSBAR_PROFILE_STEPS = 16;

/** Vertical elevation of Sarado crossbar axis in Ken coordinates (0.0 m at origin) */
export const DEFAULT_SARADO_ELEVATION_Y = 0.0;

// --- Stem (Handle) Authoritative Constants ---
/** Stem top Y elevation in meters (-0.022 * KEN_SCALE = -0.033 m) */
export const DEFAULT_STEM_TOP_Y = kenGeometry.stem.topY;

/** Stem bottom Y elevation in meters (-0.120 * KEN_SCALE = -0.180 m) */
export const DEFAULT_STEM_BOTTOM_Y = kenGeometry.stem.bottomY;

/** Stem neck radius in meters (0.0075 * KEN_SCALE = 0.01125 m) */
export const DEFAULT_STEM_NECK_RADIUS = kenGeometry.stem.neckRadius;

/** Stem bulge Y elevation in meters (-0.079 * KEN_SCALE = -0.1185 m) */
export const DEFAULT_STEM_BULGE_Y = kenGeometry.stem.bulgeY;

/** Stem bulge radius in meters (0.013 * KEN_SCALE = 0.0195 m) */
export const DEFAULT_STEM_BULGE_RADIUS = kenGeometry.stem.bulgeRadius;

/** Stem base flare radius in meters (0.0175 * KEN_SCALE = 0.02625 m) */
export const DEFAULT_STEM_BASE_FLARE_RADIUS = kenGeometry.stem.baseFlareRadius;

/** Total handle / stem length in meters (-0.033 - (-0.180) = 0.147 m) */
export const DEFAULT_HANDLE_LENGTH = kenGeometry.stem.topY - kenGeometry.stem.bottomY;

/** Default handle top radius in meters (0.01125 m) */
export const DEFAULT_HANDLE_TOP_RADIUS = kenGeometry.stem.neckRadius;

/** Default handle bottom radius in meters (0.02625 m) */
export const DEFAULT_HANDLE_BOTTOM_RADIUS = kenGeometry.stem.baseFlareRadius;

/** Default handle waist / neck radius in meters (0.01125 m) */
export const DEFAULT_HANDLE_WAIST_RADIUS = kenGeometry.stem.neckRadius;

/** Default radial segments for handle geometry */
export const DEFAULT_HANDLE_RADIAL_SEGMENTS = 32;

/** Default profile sample steps for handle geometry */
export const DEFAULT_HANDLE_PROFILE_STEPS = 24;

// --- Spike (Kensaki) Authoritative Constants ---
/** Spike base Y elevation in meters (0.022 * KEN_SCALE = 0.033 m) */
export const DEFAULT_SPIKE_BASE_Y = kenGeometry.spike.baseY;

/** Spike tip Y elevation in meters (0.045 * KEN_SCALE = 0.0675 m) */
export const DEFAULT_SPIKE_TIP_Y = kenGeometry.spike.tipY;

/** Spike length in meters (0.0675 - 0.033 = 0.0345 m) */
export const DEFAULT_SPIKE_LENGTH = kenGeometry.spike.tipY - kenGeometry.spike.baseY;

/** Spike root radius in meters (0.01125 m) */
export const DEFAULT_SPIKE_ROOT_RADIUS = kenGeometry.stem.neckRadius;

/** Spike tip rounded radius in meters (0.0015 * KEN_SCALE = 0.00225 m) */
export const DEFAULT_SPIKE_TIP_RADIUS = 0.0015 * KEN_SCALE;

/** Default radial segments for spike geometry */
export const DEFAULT_SPIKE_RADIAL_SEGMENTS = 32;

/**
 * Creates a hollow cup bowl geometry from a cup configuration object.
 *
 * Traversed in CCW outward-normal order:
 * 1. Outer Bottom: Flat circular base extending from axis r = 0 out to outer floor corner.
 * 2. Outer Wall: Smooth curve ascending from outer corner to outer rim aperture at y = 0.
 * 3. Rim Lip: Smooth rounded lip bridging outer rim to inner rim (r = rimRadius, y = 0).
 * 4. Inner Wall: Smooth concave curve descending to inner floor corner at y = -depth.
 * 5. Inner Floor: Flat circular disc extending from inner floor edge back to central axis r = 0.
 *
 * Rim aperture center is at (0, 0, 0), with local +Y pointing out of the cup cavity.
 *
 * @param {object} cupConfig - Cup configuration (e.g. from cupConfigs)
 * @param {number} cupConfig.rimRadius - Visual rim opening radius in meters
 * @param {number} cupConfig.depth - Cavity depth from rim to inner floor in meters
 * @param {object} [options={}] - Optional visual parameters
 * @param {number} [options.wallThickness=0.003] - Cup wall thickness in meters
 * @param {number} [options.radialSegments=36] - Number of radial subdivisions around Y
 * @param {number} [options.profileSteps=16] - Number of curve sample steps along profile
 * @param {number} [options.innerFloorRadius] - Explicit inner floor radius
 * @param {number} [options.floorRadiusRatio=0.33] - Ratio to derive inner floor radius from rimRadius
 * @returns {LatheGeometry} The generated hollow cup geometry
 */
export function createCupGeometry(cupConfig, options = {}) {
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

    const points = [];

    // Stage 1: Outer Bottom (normal -Y)
    points.push(new Vector2(0.0, -outerDepth));
    points.push(new Vector2(outerFloorRadius, -outerDepth));

    // Stage 2: Outer Wall (normal +r)
    for (let i = 1; i <= profileSteps; i++) {
        const t = i / profileSteps;
        const r = outerFloorRadius + (rimOuterRadius - outerFloorRadius) * Math.sin(t * Math.PI * 0.5);
        const y = -outerDepth + outerDepth * Math.pow(t, 1.2);
        points.push(new Vector2(r, y));
    }

    // Stage 3: Beveled / Rounded Rim Lip (normal +Y)
    const lipCrestHeight = wallThickness * 0.15;
    points.push(new Vector2(rimRadius + wallThickness * 0.5, lipCrestHeight));
    points.push(new Vector2(rimRadius, 0.0));

    // Stage 4: Inner Wall (normal -r)
    for (let i = profileSteps - 1; i >= 1; i--) {
        const t = i / profileSteps;
        const r = innerFloorRadius + (rimRadius - innerFloorRadius) * Math.sin(t * Math.PI * 0.5);
        const y = -depth + depth * Math.pow(t, 1.25);
        points.push(new Vector2(r, y));
    }

    // Stage 5: Inner Floor (normal +Y)
    points.push(new Vector2(innerFloorRadius, -depth));
    points.push(new Vector2(0.0, -depth));

    const geometry = new LatheGeometry(points, radialSegments);
    filterDegenerateTriangles(geometry);
    geometry.computeVertexNormals();

    const norm = geometry.attributes.normal;
    if (norm) {
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

        if (dAB2 > 1e-12 && dBC2 > 1e-12 && dCA2 > 1e-12) {
            cleanIndices.push(a, b, c);
        }
    }
    geometry.setIndex(cleanIndices);
}

/**
 * Creates the procedural kendama handle (stem) geometry matching kenGeometry.stem.
 *
 * The stem profile runs vertically along the Y axis:
 * - Top end at stem.topY (-0.033 m) with radius stem.neckRadius (0.01125 m)
 * - Ergonomic grip bulge at stem.bulgeY (-0.1185 m) with radius stem.bulgeRadius (0.0195 m)
 * - Base flare at stem.bottomY (-0.180 m) with radius stem.baseFlareRadius (0.02625 m)
 *
 * @param {object} [options={}] - Optional parameters
 * @param {number} [options.topY] - Top elevation along Y
 * @param {number} [options.bottomY] - Bottom elevation along Y
 * @param {number} [options.neckRadius] - Neck radius at top
 * @param {number} [options.bulgeY] - Bulge elevation
 * @param {number} [options.bulgeRadius] - Bulge radius
 * @param {number} [options.baseFlareRadius] - Base flare radius at bottom
 * @param {number} [options.length] - Custom length override
 * @param {number} [options.radialSegments=32] - Number of radial subdivisions
 * @param {number} [options.profileSteps=24] - Number of subdivisions along profile
 * @returns {LatheGeometry} The generated handle geometry
 */
export function createHandleGeometry(options = {}) {
    if (options !== null && typeof options !== 'object') {
        throw new TypeError('createHandleGeometry: options must be an object.');
    }

    let topY = options.topY ?? kenGeometry.stem.topY;
    let bottomY = options.bottomY ?? kenGeometry.stem.bottomY;

    if (options.length !== undefined) {
        if (!Number.isFinite(options.length) || options.length <= 0) {
            throw new RangeError(
                `createHandleGeometry: length must be a positive finite number (received: ${options.length}).`
            );
        }
        const halfLen = options.length * 0.5;
        bottomY = -halfLen;
        topY = halfLen;
    }

    const neckRadius = options.neckRadius ?? (options.topRadius ?? kenGeometry.stem.neckRadius);
    if (!Number.isFinite(neckRadius) || neckRadius <= 0) {
        throw new RangeError(
            `createHandleGeometry: neckRadius must be a positive finite number (received: ${neckRadius}).`
        );
    }

    const baseFlareRadius = options.baseFlareRadius ?? (options.bottomRadius ?? kenGeometry.stem.baseFlareRadius);
    if (!Number.isFinite(baseFlareRadius) || baseFlareRadius <= 0) {
        throw new RangeError(
            `createHandleGeometry: baseFlareRadius must be a positive finite number (received: ${baseFlareRadius}).`
        );
    }

    const bulgeRadius = options.bulgeRadius ?? (options.waistRadius ?? kenGeometry.stem.bulgeRadius);
    if (!Number.isFinite(bulgeRadius) || bulgeRadius <= 0) {
        throw new RangeError(
            `createHandleGeometry: bulgeRadius must be a positive finite number (received: ${bulgeRadius}).`
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

    if (options.filletRadius !== undefined) {
        if (!Number.isFinite(options.filletRadius) || options.filletRadius <= 0) {
            throw new RangeError(
                `createHandleGeometry: filletRadius must be a positive finite number (received: ${options.filletRadius}).`
            );
        }
        const maxFillet = Math.min(neckRadius, baseFlareRadius, Math.abs(topY - bottomY) * 0.25);
        if (options.filletRadius >= maxFillet) {
            throw new RangeError(
                `createHandleGeometry: filletRadius (${options.filletRadius}) must be less than min(neckRadius, baseFlareRadius, length * 0.25) (${maxFillet}).`
            );
        }
    }

    const bulgeY = options.bulgeY ?? (
        options.length !== undefined
            ? bottomY + (topY - bottomY) * 0.42
            : kenGeometry.stem.bulgeY
    );

    const points = [];

    // 1. Bottom end center (r=0, y=bottomY)
    points.push(new Vector2(0.0, bottomY));

    // 2. Bottom outer edge
    points.push(new Vector2(baseFlareRadius, bottomY));

    // 3. Lower segment: from bottomY to bulgeY
    const steps1 = Math.max(2, Math.floor(profileSteps * 0.5));
    for (let i = 1; i <= steps1; i++) {
        const t = i / steps1;
        const y = bottomY + (bulgeY - bottomY) * t;
        const blend = 0.5 - 0.5 * Math.cos(t * Math.PI);
        const r = baseFlareRadius + (bulgeRadius - baseFlareRadius) * blend;
        points.push(new Vector2(r, y));
    }

    // 4. Upper segment: from bulgeY to topY
    const steps2 = Math.max(2, Math.floor(profileSteps * 0.5));
    for (let i = 1; i < steps2; i++) {
        const t = i / steps2;
        const y = bulgeY + (topY - bulgeY) * t;
        const blend = 0.5 - 0.5 * Math.cos(t * Math.PI);
        const r = bulgeRadius + (neckRadius - bulgeRadius) * blend;
        points.push(new Vector2(r, y));
    }

    // 5. Top outer edge
    points.push(new Vector2(neckRadius, topY));

    // 6. Top end center (r=0, y=topY)
    points.push(new Vector2(0.0, topY));

    const geometry = new LatheGeometry(points, radialSegments);
    filterDegenerateTriangles(geometry);
    geometry.computeVertexNormals();

    return geometry;
}

/**
 * Creates the procedural kendama crossbar (Sarado) connecting geometry matching kenGeometry.crossbar.
 *
 * Origin (0, 0, 0) is the center of the crossbar junction:
 * - Extends along +X towards Big Cup at +halfWidth (+0.06075 m)
 * - Extends along -X towards Small Cup at -halfWidth (-0.06075 m)
 * - Waist radius at center x = 0 is waistRadius (0.0165 m)
 * - Outward mounting face at +X points along +X (1, 0, 0)
 * - Outward mounting face at -X points along -X (-1, 0, 0)
 *
 * @param {object} [options={}] - Optional dimensional parameters
 * @param {number} [options.halfWidth] - Half-width along X
 * @param {number} [options.bigSpan] - Distance to +X mounting face
 * @param {number} [options.smallSpan] - Distance to -X mounting face
 * @param {number} [options.centerRadius] - Waist radius at center
 * @param {number} [options.waistRadius] - Alias for centerRadius
 * @param {number} [options.bigEndRadius] - Mounting radius for Big Cup
 * @param {number} [options.smallEndRadius] - Mounting radius for Small Cup
 * @param {number} [options.endRadius] - Common end radius
 * @param {number} [options.radialSegments=32] - Radial subdivisions
 * @param {number} [options.wingSteps=12] - Subdivisions along each wing
 * @returns {BufferGeometry} The generated crossbar geometry oriented along X
 */
export function createCrossbarGeometry(options = {}) {
    if (options !== null && typeof options !== 'object') {
        throw new TypeError('createCrossbarGeometry: options must be an object.');
    }

    let bigSpan = options.bigSpan ?? (options.halfWidth ?? kenGeometry.crossbar.halfWidth);
    let smallSpan = options.smallSpan ?? (options.halfWidth ?? kenGeometry.crossbar.halfWidth);

    if (options.length !== undefined) {
        if (!Number.isFinite(options.length) || options.length <= 0) {
            throw new RangeError(
                `createCrossbarGeometry: length must be a positive finite number (received: ${options.length}).`
            );
        }
        bigSpan = options.length * 0.5;
        smallSpan = options.length * 0.5;
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

    const centerRadius = options.centerRadius ?? (options.waistRadius ?? kenGeometry.crossbar.waistRadius);
    if (!Number.isFinite(centerRadius) || centerRadius <= 0) {
        throw new RangeError(
            `createCrossbarGeometry: centerRadius must be a positive finite number (received: ${centerRadius}).`
        );
    }

    const bigEndRadius = options.bigEndRadius ?? (options.endRadius ?? kenGeometry.crossbar.endRadius);
    if (!Number.isFinite(bigEndRadius) || bigEndRadius <= 0) {
        throw new RangeError(
            `createCrossbarGeometry: bigEndRadius must be a positive finite number (received: ${bigEndRadius}).`
        );
    }

    const smallEndRadius = options.smallEndRadius ?? (options.endRadius ?? cupConfigs.small.rimRadius);
    if (!Number.isFinite(smallEndRadius) || smallEndRadius <= 0) {
        throw new RangeError(
            `createCrossbarGeometry: smallEndRadius must be a positive finite number (received: ${smallEndRadius}).`
        );
    }

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

    const wingSteps = options.wingSteps ?? (options.profileSteps ? Math.floor(options.profileSteps * 0.75) : DEFAULT_CROSSBAR_WING_STEPS);
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

    const xBig = bigSpan;
    const xSmall = -smallSpan;
    const rings = [];

    // 1. Small Wing: from mount (u = 0, x = xSmall) to center (u = 1, x = 0)
    for (let i = 0; i <= wingSteps; i++) {
        const u = i / wingSteps;
        const x = xSmall * (1.0 - u);
        const blend = 0.5 - 0.5 * Math.cos(u * Math.PI);
        const r = smallEndRadius + (centerRadius - smallEndRadius) * blend;

        rings.push({
            center: new Vector3(x, 0.0, 0.0),
            radius: r,
        });
    }

    // 2. Big Wing: from center (u = 0, x = 0) to mount (u = 1, x = xBig)
    for (let i = 1; i <= wingSteps; i++) {
        const u = i / wingSteps;
        const x = xBig * u;
        const blend = 0.5 - 0.5 * Math.cos(u * Math.PI);
        const r = centerRadius + (bigEndRadius - centerRadius) * blend;

        rings.push({
            center: new Vector3(x, 0.0, 0.0),
            radius: r,
        });
    }

    const positions = [];
    const numRings = rings.length;

    for (let rIdx = 0; rIdx < numRings; rIdx++) {
        const ring = rings[rIdx];
        const radius = ring.radius;

        for (let s = 0; s < radialSegments; s++) {
            const theta = (s / radialSegments) * Math.PI * 2;
            const cosT = Math.cos(theta);
            const sinT = Math.sin(theta);

            const px = ring.center.x;
            const py = ring.center.y + radius * cosT;
            const pz = ring.center.z + radius * sinT;

            positions.push(px, py, pz);
        }
    }

    // Small cap center vertex at xSmall (-X normal: -1, 0, 0)
    const smallCapCenterIdx = positions.length / 3;
    positions.push(rings[0].center.x, rings[0].center.y, rings[0].center.z);

    // Big cap center vertex at xBig (+X normal: +1, 0, 0)
    const bigCapCenterIdx = positions.length / 3;
    const lastRing = rings[rings.length - 1];
    positions.push(lastRing.center.x, lastRing.center.y, lastRing.center.z);

    const indices = [];

    // Cylinder quad strips: outward normal
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

    // Small cap fan facing -X: edge nextS -> s
    for (let s = 0; s < radialSegments; s++) {
        const nextS = (s + 1) % radialSegments;
        indices.push(smallCapCenterIdx, nextS, s);
    }

    // Big cap fan facing +X: edge s -> nextS
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
 * Creates the procedural kendama spike (Kensaki) geometry matching kenGeometry.spike.
 *
 * The spike ascends vertically along the Y-axis:
 * - Base at y = 0 with radius rootRadius
 * - Conical taper extending upward
 * - Rounded hemispherical tip at y = length
 *
 * @param {object} [options={}] - Optional dimensional parameters
 * @param {number} [options.length] - Length of spike from base to tip (0.0345 m)
 * @param {number} [options.rootRadius] - Root radius at spike shoulder (0.01125 m)
 * @param {number} [options.tipRadius] - Radius of rounded tip (0.00225 m)
 * @param {number} [options.radialSegments=32] - Number of radial subdivisions
 * @returns {LatheGeometry} The generated spike geometry
 */
export function createSpikeGeometry(options = {}) {
    if (options !== null && typeof options !== 'object') {
        throw new TypeError('createSpikeGeometry: options must be an object.');
    }

    const length = options.length ?? (kenGeometry.spike.tipY - kenGeometry.spike.baseY);
    if (!Number.isFinite(length) || length <= 0) {
        throw new RangeError(
            `createSpikeGeometry: length must be a positive finite number (received: ${length}).`
        );
    }

    const rootRadius = options.rootRadius ?? kenGeometry.stem.neckRadius;
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
    points.push(new Vector2(0.0, 0.0));
    points.push(new Vector2(rootRadius, 0.0));

    const coneHeight = length - tipRadius;
    points.push(new Vector2(tipRadius, coneHeight));

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

/**
 * Derives the spike length required to reach the configured spike tip position.
 *
 * @param {object} spikeConfig - Spike configuration from cupConfigs.js
 * @param {number} [baseY=DEFAULT_SPIKE_BASE_Y] - Vertical elevation of spike base
 * @returns {number} Length of spike from base to tip in meters
 */
export function deriveSpikeLength(spikeConfig = cupConfigs.spike, baseY = DEFAULT_SPIKE_BASE_Y) {
    if (!spikeConfig) {
        throw new TypeError('deriveSpikeLength: spikeConfig must be provided');
    }
    const tipY = spikeConfig.localPos?.y ?? spikeConfig.position?.y;
    if (typeof tipY !== 'number') {
        throw new TypeError('deriveSpikeLength: spikeConfig must have a numeric position.y or localPos.y');
    }
    const length = tipY - baseY;
    if (length <= 0) {
        throw new RangeError(
            `deriveSpikeLength: spike tip (${tipY}) must be higher than base (${baseY})`
        );
    }
    return length;
}

/**
 * Derives the handle length, center Y position, and end elevations needed to
 * cleanly connect between the Base Cup and the Sarado crossbar junction.
 *
 * @param {object} [baseCupConfig=cupConfigs.base] - Base cup configuration
 * @param {object} [options={}] - Geometry options
 * @param {number} [options.topY=DEFAULT_STEM_TOP_Y] - Top elevation of stem
 * @param {number} [options.bottomY=DEFAULT_STEM_BOTTOM_Y] - Bottom elevation of stem
 * @returns {{ length: number, centerY: number, bottomY: number, topY: number }}
 */
export function deriveHandleDimensions(baseCupConfig = cupConfigs.base, options = {}) {
    const topY = options.topY ?? kenGeometry.stem.topY;
    const bottomY = options.bottomY ?? (baseCupConfig?.localPos?.y ?? (baseCupConfig?.position?.y ?? kenGeometry.stem.bottomY));
    const length = topY - bottomY;
    const centerY = (topY + bottomY) * 0.5;

    return { length, centerY, bottomY, topY };
}

export default createCupGeometry;
