/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Celestial Kendama - Analytical Astrodynamics & Orbital Mechanics Library
 * Role: Person B (The Physics Lead / orbits.js)
 * ============================================================================
 *
 * Pure JavaScript / ES Modules implementing Keplerian orbital mechanics.
 * Designed for real-time WebXR simulation: zero runtime allocations when
 * target vectors are supplied to functions returning 3D vectors.
 *
 * Vector conventions:
 * Inputs can be Cartesian 3D objects ({ x, y, z }) or 3-element arrays ([x, y, z]).
 * Outputs are { x, y, z } or written in-place to provided outTarget objects.
 */

// Internal scratch arrays for zero-allocation coordinate extraction
const _rCoords = [0.0, 0.0, 0.0];
const _vCoords = [0.0, 0.0, 0.0];

/**
 * Extracts Cartesian 3D coordinates into a target array without heap allocation.
 * @private
 * @param {{ x: number, y: number, z: number } | number[] | Float64Array} vec
 * @param {number[]} out
 * @returns {number[]}
 */
function readVector(vec, out) {
  if (Array.isArray(vec) || ArrayBuffer.isView(vec)) {
    out[0] = vec[0] ?? 0.0;
    out[1] = vec[1] ?? 0.0;
    out[2] = vec[2] ?? 0.0;
  } else if (vec && typeof vec === 'object') {
    out[0] = vec.x ?? 0.0;
    out[1] = vec.y ?? 0.0;
    out[2] = vec.z ?? 0.0;
  } else {
    out[0] = 0.0;
    out[1] = 0.0;
    out[2] = 0.0;
  }
  return out;
}

/**
 * Calculates specific orbital energy (vis-viva energy per unit mass):
 *   epsilon = (v^2 / 2) - (mu / r)
 *
 * Classification:
 * - epsilon < 0: Elliptic / circular (bound)
 * - epsilon == 0: Parabolic (escape threshold)
 * - epsilon > 0: Hyperbolic (unbound)
 *
 * @param {{ x: number, y: number, z: number } | number[]} r - Relative position vector
 * @param {{ x: number, y: number, z: number } | number[]} v - Relative velocity vector
 * @param {number} [mu=1.0] - Standard gravitational parameter (G * M)
 * @returns {number} Specific orbital energy in energy per unit mass
 */
export function calculateSpecificEnergy(r, v, mu = 1.0) {
  readVector(r, _rCoords);
  readVector(v, _vCoords);

  const rx = _rCoords[0];
  const ry = _rCoords[1];
  const rz = _rCoords[2];
  const rMag = Math.sqrt(rx * rx + ry * ry + rz * rz);

  const vx = _vCoords[0];
  const vy = _vCoords[1];
  const vz = _vCoords[2];
  const vSq = vx * vx + vy * vy + vz * vz;

  if (rMag <= 1e-15) {
    return -Infinity;
  }

  return 0.5 * vSq - mu / rMag;
}

/**
 * Calculates specific relative angular momentum vector:
 *   h = r x v = (ry*vz - rz*vy, rz*vx - rx*vz, rx*vy - ry*vx)
 *
 * @param {{ x: number, y: number, z: number } | number[]} r - Relative position vector
 * @param {{ x: number, y: number, z: number } | number[]} v - Relative velocity vector
 * @param {{ x: number, y: number, z: number }} [outTarget=null] - Optional target object (zero allocation)
 * @returns {{ x: number, y: number, z: number }} Specific angular momentum vector
 */
export function calculateAngularMomentum(r, v, outTarget = null) {
  readVector(r, _rCoords);
  readVector(v, _vCoords);

  const rx = _rCoords[0];
  const ry = _rCoords[1];
  const rz = _rCoords[2];

  const vx = _vCoords[0];
  const vy = _vCoords[1];
  const vz = _vCoords[2];

  const hx = ry * vz - rz * vy;
  const hy = rz * vx - rx * vz;
  const hz = rx * vy - ry * vx;

  if (outTarget) {
    outTarget.x = hx;
    outTarget.y = hy;
    outTarget.z = hz;
    return outTarget;
  }

  return { x: hx, y: hy, z: hz };
}

/**
 * Calculates specific angular momentum magnitude:
 *   h = ||r x v||
 *
 * @param {{ x: number, y: number, z: number } | number[]} r
 * @param {{ x: number, y: number, z: number } | number[]} v
 * @returns {number} Magnitude of angular momentum
 */
export function calculateAngularMomentumMagnitude(r, v) {
  readVector(r, _rCoords);
  readVector(v, _vCoords);

  const rx = _rCoords[0];
  const ry = _rCoords[1];
  const rz = _rCoords[2];

  const vx = _vCoords[0];
  const vy = _vCoords[1];
  const vz = _vCoords[2];

  const hx = ry * vz - rz * vy;
  const hy = rz * vx - rx * vz;
  const hz = rx * vy - ry * vx;

  return Math.sqrt(hx * hx + hy * hy + hz * hz);
}

/**
 * Calculates eccentricity vector:
 *   e = (v x h) / mu - (r / r)
 * Points towards periapsis with magnitude equal to scalar eccentricity.
 *
 * @param {{ x: number, y: number, z: number } | number[]} r - Relative position vector
 * @param {{ x: number, y: number, z: number } | number[]} v - Relative velocity vector
 * @param {number} [mu=1.0] - Standard gravitational parameter
 * @param {{ x: number, y: number, z: number }} [outTarget=null] - Optional target object
 * @returns {{ x: number, y: number, z: number }} Eccentricity vector
 */
export function calculateEccentricityVector(r, v, mu = 1.0, outTarget = null) {
  readVector(r, _rCoords);
  readVector(v, _vCoords);

  const rx = _rCoords[0];
  const ry = _rCoords[1];
  const rz = _rCoords[2];
  const rMag = Math.sqrt(rx * rx + ry * ry + rz * rz);

  const vx = _vCoords[0];
  const vy = _vCoords[1];
  const vz = _vCoords[2];

  // h = r x v
  const hx = ry * vz - rz * vy;
  const hy = rz * vx - rx * vz;
  const hz = rx * vy - ry * vx;

  // w = v x h
  const wx = vy * hz - vz * hy;
  const wy = vz * hx - vx * hz;
  const wz = vx * hy - vy * hx;

  if (rMag <= 1e-15 || mu <= 0.0) {
    if (outTarget) {
      outTarget.x = 0.0;
      outTarget.y = 0.0;
      outTarget.z = 0.0;
      return outTarget;
    }
    return { x: 0.0, y: 0.0, z: 0.0 };
  }

  const invMu = 1.0 / mu;
  const invR = 1.0 / rMag;

  const ex = wx * invMu - rx * invR;
  const ey = wy * invMu - ry * invR;
  const ez = wz * invMu - rz * invR;

  if (outTarget) {
    outTarget.x = ex;
    outTarget.y = ey;
    outTarget.z = ez;
    return outTarget;
  }

  return { x: ex, y: ey, z: ez };
}

/**
 * Calculates scalar orbital eccentricity (e = ||e||):
 * - e == 0: Circular
 * - 0 < e < 1: Elliptical
 * - e == 1: Parabolic
 * - e > 1: Hyperbolic
 *
 * @param {{ x: number, y: number, z: number } | number[]} r
 * @param {{ x: number, y: number, z: number } | number[]} v
 * @param {number} [mu=1.0]
 * @returns {number} Scalar eccentricity
 */
export function calculateEccentricity(r, v, mu = 1.0) {
  readVector(r, _rCoords);
  readVector(v, _vCoords);

  const rx = _rCoords[0];
  const ry = _rCoords[1];
  const rz = _rCoords[2];
  const rMag = Math.sqrt(rx * rx + ry * ry + rz * rz);

  const vx = _vCoords[0];
  const vy = _vCoords[1];
  const vz = _vCoords[2];

  const hx = ry * vz - rz * vy;
  const hy = rz * vx - rx * vz;
  const hz = rx * vy - ry * vx;

  const wx = vy * hz - vz * hy;
  const wy = vz * hx - vx * hz;
  const wz = vx * hy - vy * hx;

  if (rMag <= 1e-15 || mu <= 0.0) return 0.0;

  const invMu = 1.0 / mu;
  const invR = 1.0 / rMag;

  const ex = wx * invMu - rx * invR;
  const ey = wy * invMu - ry * invR;
  const ez = wz * invMu - rz * invR;

  return Math.sqrt(ex * ex + ey * ey + ez * ez);
}

/**
 * Calculates semi-major axis:
 *   a = -mu / (2 * epsilon)
 *
 * For parabolic orbits (|epsilon| < 1e-10), returns Infinity.
 * For hyperbolic trajectories (epsilon > 0), a is negative.
 *
 * @param {{ x: number, y: number, z: number } | number[] | number} r - Position vector or specific energy number
 * @param {{ x: number, y: number, z: number } | number[]} [v] - Velocity vector (if r is position)
 * @param {number} [mu=1.0] - Standard gravitational parameter
 * @returns {number} Semi-major axis
 */
export function calculateSemiMajorAxis(r, v, mu = 1.0) {
  let eps;
  let muParam = mu;

  if (typeof r === 'number') {
    eps = r;
    if (typeof v === 'number') {
      muParam = v;
    }
  } else {
    eps = calculateSpecificEnergy(r, v, muParam);
  }

  if (Math.abs(eps) < 1e-10) {
    return Infinity;
  }

  return -muParam / (2.0 * eps);
}

/**
 * Calculates Keplerian orbital period:
 *   T = 2 * pi * sqrt(a^3 / mu)
 *
 * Valid only for closed/elliptic orbits (a > 0). Returns Infinity for open/hyperbolic orbits.
 *
 * @param {number} semiMajorAxis - Semi-major axis a (must be > 0)
 * @param {number} [mu=1.0] - Standard gravitational parameter
 * @returns {number} Orbital period in simulation seconds
 */
export function calculateOrbitalPeriod(semiMajorAxis, mu = 1.0) {
  if (!Number.isFinite(semiMajorAxis) || semiMajorAxis <= 0.0 || mu <= 0.0) {
    return Infinity;
  }
  return 2.0 * Math.PI * Math.sqrt((semiMajorAxis * semiMajorAxis * semiMajorAxis) / mu);
}

/**
 * Calculates orbital apsides (periapsis rp and apoapsis ra):
 *   rp = a * (1 - e)
 *   ra = a * (1 + e)
 *
 * For parabolic and hyperbolic trajectories (e >= 1), apoapsis is Infinity.
 *
 * @param {{ x: number, y: number, z: number } | number[] | number} r - Position vector or semi-major axis
 * @param {{ x: number, y: number, z: number } | number[]} [v] - Velocity vector or eccentricity
 * @param {number} [mu=1.0] - Standard gravitational parameter
 * @param {{ periapsis: number, apoapsis: number }} [outTarget=null] - Optional target object
 * @returns {{ periapsis: number, apoapsis: number }}
 */
export function calculateApsides(r, v, mu = 1.0, outTarget = null) {
  let a, e;

  if (typeof r === 'number' && typeof v === 'number') {
    a = r;
    e = v;
  } else {
    a = calculateSemiMajorAxis(r, v, mu);
    e = calculateEccentricity(r, v, mu);
  }

  const target = outTarget || { periapsis: 0.0, apoapsis: 0.0 };

  if (e >= 1.0) {
    if (Math.abs(e - 1.0) < 1e-10) {
      // Parabolic: rp = h^2 / (2*mu)
      if (typeof r !== 'number') {
        const hMag = calculateAngularMomentumMagnitude(r, v);
        target.periapsis = (hMag * hMag) / (2.0 * mu);
      } else {
        target.periapsis = 0.0;
      }
      target.apoapsis = Infinity;
    } else {
      // Hyperbolic: rp = |a| * (e - 1)
      target.periapsis = Math.abs(a) * (e - 1.0);
      target.apoapsis = Infinity;
    }
  } else {
    // Elliptic / Circular
    target.periapsis = a * (1.0 - e);
    target.apoapsis = a * (1.0 + e);
  }

  return target;
}

/**
 * Calculates escape velocity from radial distance r:
 *   v_esc = sqrt(2 * mu / r)
 *
 * @param {number} r - Distance from central body
 * @param {number} [mu=1.0]
 * @returns {number}
 */
export function calculateEscapeVelocity(r, mu = 1.0) {
  if (r <= 0.0 || mu <= 0.0) return 0.0;
  return Math.sqrt((2.0 * mu) / r);
}

/**
 * Calculates circular orbit velocity at radial distance r:
 *   v_circ = sqrt(mu / r)
 *
 * @param {number} r - Distance from central body
 * @param {number} [mu=1.0]
 * @returns {number}
 */
export function calculateCircularVelocity(r, mu = 1.0) {
  if (r <= 0.0 || mu <= 0.0) return 0.0;
  return Math.sqrt(mu / r);
}

/**
 * Calculates orbital speed at distance r on an orbit with semi-major axis a (vis-viva equation):
 *   v = sqrt(mu * (2/r - 1/a))
 *
 * @param {number} r - Current radial distance
 * @param {number} a - Semi-major axis
 * @param {number} [mu=1.0]
 * @returns {number}
 */
export function calculateOrbitalSpeed(r, a, mu = 1.0) {
  if (r <= 0.0 || mu <= 0.0) return 0.0;
  const term = 2.0 / r - 1.0 / a;
  if (term <= 0.0) return 0.0;
  return Math.sqrt(mu * term);
}

/**
 * Classifies the orbit type based on eccentricity:
 * - 'circular' (e < 1e-6)
 * - 'elliptic' (1e-6 <= e < 1.0 - 1e-6)
 * - 'parabolic' (|e - 1.0| <= 1e-6)
 * - 'hyperbolic' (e > 1.0 + 1e-6)
 *
 * @param {{ x: number, y: number, z: number } | number[]} r
 * @param {{ x: number, y: number, z: number } | number[]} v
 * @param {number} [mu=1.0]
 * @returns {'circular' | 'elliptic' | 'parabolic' | 'hyperbolic'}
 */
export function classifyOrbit(r, v, mu = 1.0) {
  const e = calculateEccentricity(r, v, mu);
  if (e < 1e-6) return 'circular';
  if (Math.abs(e - 1.0) <= 1e-6) return 'parabolic';
  if (e < 1.0) return 'elliptic';
  return 'hyperbolic';
}

