/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Celestial Kendama - High-Performance N-Body Gravitational Integrator
 * Role: Person B (The Physics Lead / OrbitalEngine.js)
 * ============================================================================
 *
 * ARCHITECTURAL SPECIFICATION & ZERO-ALLOCATION CONSTRAINTS:
 * Standalone Meta Quest headsets suffer from severe frame-rate degradation and
 * stutter if GC (Garbage Collection) pauses occur during active 72/90/120 Hz render ticks.
 *
 * All state variables and numerical integration calculations are implemented using
 * pre-allocated flat typed arrays (Float64Array / Uint8Array).
 *
 * ZERO heap allocations occur inside:
 * - `stepRK4(dt)`
 * - `step(dt)`
 * - `computeAccelerations()`
 * - `getPhysicsState()`
 * - `getTotalMomentum()`
 * - `getBodyPosition()` / `getBodyVelocity()` (when target is provided)
 *
 * MATHEMATICAL MODEL:
 * 1. Mutual Gravitational Acceleration with Plummer Softening:
 *    a_i = -G * sum_{j != i} m_j * (r_i - r_j) / (||r_i - r_j||^2 + eps^2)^(3/2)
 *
 * 2. Explicit 4th-Order Runge-Kutta (RK4) Scheme:
 *    k1_r = v_n,                          k1_v = a(r_n)
 *    k2_r = v_n + 0.5 * h * k1_v,         k2_v = a(r_n + 0.5 * h * k1_r)
 *    k3_r = v_n + 0.5 * h * k2_v,         k3_v = a(r_n + 0.5 * h * k2_r)
 *    k4_r = v_n + h * k3_v,               k4_v = a(r_n + h * k3_r)
 *
 *    r_{n+1} = r_n + (h / 6) * (k1_r + 2*k2_r + 2*k3_r + k4_r)
 *    v_{n+1} = v_n + (h / 6) * (k1_v + 2*k2_v + 2*k3_v + k4_v)
 */

import { PhysicsState } from '../contracts/Interfaces.js';

export class OrbitalEngine {
  /**
   * @param {Object} [options={}]
   * @param {number} [options.maxBodies=32] - Maximum bodies in the simulation pool
   * @param {number} [options.G=1.0] - Gravitational constant
   * @param {number} [options.softening=0.05] - Plummer softening parameter epsilon
   */
  constructor(options = {}) {
    this.maxBodies = Number.isInteger(options.maxBodies) && options.maxBodies > 0 ? options.maxBodies : 32;
    this.G = Number.isFinite(options.G) ? options.G : 1.0;
    this.softening = Number.isFinite(options.softening) ? Math.max(0.0, options.softening) : 0.05;
    this.softeningSq = this.softening * this.softening;

    const maxBodies = this.maxBodies;
    const maxCoords = maxBodies * 3;

    // 1. Primary Dynamic States (flat Float64Array buffers)
    this.positions = new Float64Array(maxCoords);     // [x0, y0, z0, x1, y1, z1, ...]
    this.velocities = new Float64Array(maxCoords);    // [vx0, vy0, vz0, vx1, vy1, vz1, ...]
    this.accelerations = new Float64Array(maxCoords); // [ax0, ay0, az0, ax1, ay1, az1, ...]
    this.masses = new Float64Array(maxBodies);        // [m0, m1, ...]
    this.fixed = new Uint8Array(maxBodies);           // 1 if body is immovable, 0 if dynamic
    this.active = new Uint8Array(maxBodies);          // 1 if active, 0 if empty
    this.ids = new Array(maxBodies).fill('');

    // 2. Pre-allocated RK4 Scratch Buffers (Zero allocation per step)
    this.k1_vel = new Float64Array(maxCoords);
    this.k1_acc = new Float64Array(maxCoords);

    this.k2_vel = new Float64Array(maxCoords);
    this.k2_acc = new Float64Array(maxCoords);

    this.k3_vel = new Float64Array(maxCoords);
    this.k3_acc = new Float64Array(maxCoords);

    this.k4_vel = new Float64Array(maxCoords);
    this.k4_acc = new Float64Array(maxCoords);

    this.tempPos = new Float64Array(maxCoords);
    this.tempVel = new Float64Array(maxCoords);

    // 3. Pre-allocated Reusable Diagnostic & Accessor Objects
    this._momentumBuffer = new Float64Array(3);
    this._cachedPos = { x: 0.0, y: 0.0, z: 0.0 };
    this._cachedVel = { x: 0.0, y: 0.0, z: 0.0 };

    // 4. Pre-allocated PhysicsState snapshot pool (Zero allocation on getPhysicsState)
    this._physicsBodiesPool = Array.from({ length: maxBodies }, () => ({
      id: '',
      mass: 0.0,
      pos: { x: 0.0, y: 0.0, z: 0.0 },
      vel: { x: 0.0, y: 0.0, z: 0.0 },
      fixed: false
    }));

    this._physicsState = new PhysicsState({
      simulationTime: 0.0,
      substepCount: 1,
      bodies: []
    });

    // Tracking & Adaptive Substepping
    this.bodyCount = 0;
    this.simulationTime = 0.0;
    this.substeps = 1;
    this.totalSteps = 0;
    this.adaptiveSubstepping = options.adaptiveSubstepping !== false;
    this._minSeparation = Infinity;
    this.profiler = options.profiler || null;
  }

  // ==========================================================================
  // BODY MANAGEMENT & CONFIGURATION
  // ==========================================================================

  /**
   * Resets all bodies and timers.
   */
  reset() {
    this.positions.fill(0.0);
    this.velocities.fill(0.0);
    this.accelerations.fill(0.0);
    this.masses.fill(0.0);
    this.fixed.fill(0);
    this.active.fill(0);
    for (let i = 0; i < this.maxBodies; i++) {
      this.ids[i] = '';
    }
    this.bodyCount = 0;
    this.simulationTime = 0.0;
    this.substeps = 1;
    this.totalSteps = 0;
    this._minSeparation = Infinity;
  }

  /**
   * Registers or updates a celestial body in the flat state buffers.
   *
   * @param {number} index - Body slot index (0 <= index < maxBodies)
   * @param {string} id - Unique identifier (e.g. 'star_gold', 'planet')
   * @param {number} mass - Gravitational mass
   * @param {number} x - Initial X position
   * @param {number} y - Initial Y position
   * @param {number} z - Initial Z position
   * @param {number} [vx=0.0] - Initial X velocity
   * @param {number} [vy=0.0] - Initial Y velocity
   * @param {number} [vz=0.0] - Initial Z velocity
   * @param {boolean} [fixed=false] - Whether body has fixed coordinates
   */
  setBody(index, id, mass, x, y, z, vx = 0.0, vy = 0.0, vz = 0.0, fixed = false) {
    if (index < 0 || index >= this.maxBodies) {
      throw new RangeError(`Body index ${index} out of bounds (0 <= index < ${this.maxBodies})`);
    }

    const i3 = index * 3;
    this.positions[i3] = x;
    this.positions[i3 + 1] = y;
    this.positions[i3 + 2] = z;

    this.velocities[i3] = vx;
    this.velocities[i3 + 1] = vy;
    this.velocities[i3 + 2] = vz;

    this.accelerations[i3] = 0.0;
    this.accelerations[i3 + 1] = 0.0;
    this.accelerations[i3 + 2] = 0.0;

    this.masses[index] = mass;
    this.fixed[index] = fixed ? 1 : 0;
    this.ids[index] = id || `body_${index}`;
    this.active[index] = 1;

    if (index >= this.bodyCount) {
      this.bodyCount = index + 1;
    }
  }

  /**
   * Deactivates a body slot.
   * @param {number} index
   */
  removeBody(index) {
    if (index >= 0 && index < this.maxBodies) {
      this.active[index] = 0;
      this.masses[index] = 0.0;
      this.ids[index] = '';
      if (index === this.bodyCount - 1) {
        while (this.bodyCount > 0 && !this.active[this.bodyCount - 1]) {
          this.bodyCount--;
        }
      }
    }
  }

  /**
   * Sets softening parameter epsilon.
   * @param {number} eps
   */
  setSoftening(eps) {
    this.softening = Number.isFinite(eps) ? Math.max(0.0, eps) : 0.0;
    this.softeningSq = this.softening * this.softening;
  }

  /**
   * Sets gravitational constant G.
   * @param {number} g
   */
  setG(g) {
    this.G = Number.isFinite(g) ? g : 1.0;
  }

  // ==========================================================================
  // NUMERICAL INTEGRATION (ZERO ALLOCATIONS)
  // ==========================================================================

  /**
   * Evaluates mutual gravitational accelerations across all active bodies.
   * Uses Newton's third law pairwise symmetry to conserve momentum to machine precision.
   *
   * @param {Float64Array} posBuffer - Input positions buffer
   * @param {Float64Array} outAccBuffer - Output accelerations buffer (written in place)
   */
  computeAccelerations(posBuffer, outAccBuffer) {
    const N = this.bodyCount;
    const N3 = N * 3;

    // Zero out output buffer
    for (let k = 0; k < N3; k++) {
      outAccBuffer[k] = 0.0;
    }

    const G = this.G;
    const softeningSq = this.softeningSq;

    // Pairwise N-body calculation: O(N*(N-1)/2)
    for (let i = 0; i < N; i++) {
      if (!this.active[i]) continue;
      const i3 = i * 3;
      const xi = posBuffer[i3];
      const yi = posBuffer[i3 + 1];
      const zi = posBuffer[i3 + 2];
      const mi = this.masses[i];
      const iFixed = this.fixed[i];

      for (let j = i + 1; j < N; j++) {
        if (!this.active[j]) continue;
        const j3 = j * 3;
        const dx = posBuffer[j3] - xi;
        const dy = posBuffer[j3 + 1] - yi;
        const dz = posBuffer[j3 + 2] - zi;
        const mj = this.masses[j];
        const jFixed = this.fixed[j];

        // Softened distance: d = sqrt(dx^2 + dy^2 + dz^2 + eps^2)
        const distSq = dx * dx + dy * dy + dz * dz + softeningSq;
        const dist = Math.sqrt(distSq);
        const invDist3 = 1.0 / (distSq * dist);
        const factor = G * invDist3;

        // Force on body i towards j
        if (!iFixed) {
          const fmj = factor * mj;
          outAccBuffer[i3] += fmj * dx;
          outAccBuffer[i3 + 1] += fmj * dy;
          outAccBuffer[i3 + 2] += fmj * dz;
        }

        // Equal and opposite force on body j towards i
        if (!jFixed) {
          const fmi = factor * mi;
          outAccBuffer[j3] -= fmi * dx;
          outAccBuffer[j3 + 1] -= fmi * dy;
          outAccBuffer[j3 + 2] -= fmi * dz;
        }
      }
    }
  }

  /**
   * Advances the simulation by timestep dt using Runge-Kutta 4th Order.
   * Completely allocation-free.
   *
   * @param {number} dt - Step duration in simulation time seconds
   */
  stepRK4(dt) {
    if (!Number.isFinite(dt) || dt <= 0.0) return;

    const N = this.bodyCount;
    const N3 = N * 3;
    const halfDt = 0.5 * dt;

    // ------------------------------------------------------------------------
    // Stage 1: k1_r = v_n, k1_v = a(r_n)
    // ------------------------------------------------------------------------
    for (let k = 0; k < N3; k++) {
      this.k1_vel[k] = this.velocities[k];
    }
    this.computeAccelerations(this.positions, this.k1_acc);

    // ------------------------------------------------------------------------
    // Stage 2: temp = r_n + 0.5*h*k1_r, k2_r = tempVel, k2_v = a(tempPos)
    // ------------------------------------------------------------------------
    for (let k = 0; k < N3; k++) {
      this.tempPos[k] = this.positions[k] + halfDt * this.k1_vel[k];
      this.tempVel[k] = this.velocities[k] + halfDt * this.k1_acc[k];
      this.k2_vel[k] = this.tempVel[k];
    }
    this.computeAccelerations(this.tempPos, this.k2_acc);

    // ------------------------------------------------------------------------
    // Stage 3: temp = r_n + 0.5*h*k2_r, k3_r = tempVel, k3_v = a(tempPos)
    // ------------------------------------------------------------------------
    for (let k = 0; k < N3; k++) {
      this.tempPos[k] = this.positions[k] + halfDt * this.k2_vel[k];
      this.tempVel[k] = this.velocities[k] + halfDt * this.k2_acc[k];
      this.k3_vel[k] = this.tempVel[k];
    }
    this.computeAccelerations(this.tempPos, this.k3_acc);

    // ------------------------------------------------------------------------
    // Stage 4: temp = r_n + h*k3_r, k4_r = tempVel, k4_v = a(tempPos)
    // ------------------------------------------------------------------------
    for (let k = 0; k < N3; k++) {
      this.tempPos[k] = this.positions[k] + dt * this.k3_vel[k];
      this.tempVel[k] = this.velocities[k] + dt * this.k3_acc[k];
      this.k4_vel[k] = this.tempVel[k];
    }
    this.computeAccelerations(this.tempPos, this.k4_acc);

    // ------------------------------------------------------------------------
    // Final State Update: r_{n+1} = r_n + (h/6) * (k1 + 2*k2 + 2*k3 + k4)
    // ------------------------------------------------------------------------
    const dtOver6 = dt / 6.0;
    for (let b = 0; b < N; b++) {
      if (!this.active[b] || this.fixed[b]) continue;
      const b3 = b * 3;
      for (let c = 0; c < 3; c++) {
        const idx = b3 + c;
        this.positions[idx] += dtOver6 * (
          this.k1_vel[idx] + 2.0 * this.k2_vel[idx] + 2.0 * this.k3_vel[idx] + this.k4_vel[idx]
        );
        this.velocities[idx] += dtOver6 * (
          this.k1_acc[idx] + 2.0 * this.k2_acc[idx] + 2.0 * this.k3_acc[idx] + this.k4_acc[idx]
        );
      }
    }

    // Keep acceleration buffer up to date with latest state
    this.computeAccelerations(this.positions, this.accelerations);

    this.simulationTime += dt;
    this.totalSteps++;
  }

  /**
   * Computes minimum Euclidean distance between all pairs of active bodies.
   * Completely zero-allocation: evaluates directly over flat typed arrays.
   *
   * @returns {number} Minimum pairwise distance, or Infinity if < 2 active bodies
   */
  computeMinSeparation() {
    let activeCount = 0;
    const N = this.bodyCount;
    let minDistSq = Infinity;

    for (let i = 0; i < N; i++) {
      if (!this.active[i]) continue;
      activeCount++;
      const i3 = i * 3;
      const xi = this.positions[i3];
      const yi = this.positions[i3 + 1];
      const zi = this.positions[i3 + 2];

      for (let j = i + 1; j < N; j++) {
        if (!this.active[j]) continue;
        const j3 = j * 3;
        const dx = this.positions[j3] - xi;
        const dy = this.positions[j3 + 1] - yi;
        const dz = this.positions[j3 + 2] - zi;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq < minDistSq) {
          minDistSq = distSq;
        }
      }
    }

    if (activeCount < 2 || !Number.isFinite(minDistSq)) {
      this._minSeparation = Infinity;
      return Infinity;
    }

    this._minSeparation = Math.sqrt(minDistSq);
    return this._minSeparation;
  }

  /**
   * Determines number of RK4 substeps (1, 4, or 12) based on minimum pairwise separation:
   * - r_min > 1.0: 1 substep
   * - 0.25 < r_min <= 1.0: 4 substeps
   * - r_min <= 0.25: 12 substeps
   *
   * @param {number} [dt] - Outer step dt
   * @returns {number} Substep count: 1, 4, or 12
   */
  determineSubsteps(dt = 0) {
    const rMin = this.computeMinSeparation();
    if (rMin > 1.0) {
      return 1;
    }
    if (rMin > 0.25) {
      return 4;
    }
    return 12;
  }

  /**
   * Advances the simulation by timestep dt using adaptive RK4 substepping.
   * Adjusts substep count (1, 4, or 12) dynamically based on minimum body separation.
   * Completely allocation-free.
   *
   * @param {number} dt - Outer frame delta time in seconds
   */
  stepAdaptive(dt) {
    if (!Number.isFinite(dt) || dt <= 0.0) return;
    const substeps = this.determineSubsteps(dt);
    this.substeps = substeps;
    const subDt = dt / substeps;
    for (let s = 0; s < substeps; s++) {
      this.stepRK4(subDt);
    }
  }

  /**
   * Main integration tick alias used by main.js pipeline.
   * Uses adaptive substepping when enabled (default); otherwise runs single RK4 step.
   * Instruments performance via attached PhysicsProfiler when enabled.
   *
   * @param {number} dt - Delta time in seconds
   */
  step(dt) {
    const hasProfiler = this.profiler && this.profiler.enabled;
    if (hasProfiler) {
      this.profiler.startFrame();
    }

    if (this.adaptiveSubstepping) {
      this.stepAdaptive(dt);
    } else {
      this.substeps = 1;
      this.stepRK4(dt);
    }

    if (hasProfiler) {
      this.profiler.endFrame(this.substeps);
    }
  }

  /**
   * Authoritative frame update tick alias for step(dt).
   * @param {number} dt - Timestep in seconds
   */
  update(dt) {
    this.step(dt);
  }

  /**
   * Attaches or updates a PhysicsProfiler.
   * @param {Object|null} profiler
   */
  setProfiler(profiler) {
    this.profiler = profiler;
  }

  /**
   * Returns currently attached PhysicsProfiler.
   * @returns {Object|null}
   */
  getProfiler() {
    return this.profiler;
  }

  /**
   * Diagnostic contract: returns current performance metrics from attached profiler.
   * @returns {{ avgMs: number, p99Ms: number, maxMs: number, currentSubsteps: number }|null}
   */
  getPhysicsMetrics() {
    return this.profiler && typeof this.profiler.getPhysicsMetrics === 'function'
      ? this.profiler.getPhysicsMetrics()
      : null;
  }

  /**
   * Returns the number of substeps evaluated in the last step.
   * @returns {number}
   */
  getLastSubstepCount() {
    return this.substeps;
  }

  /**
   * Returns the minimum pairwise distance between active bodies computed during integration.
   * @returns {number}
   */
  getMinSeparation() {
    return this._minSeparation;
  }

  /**
   * Enables or disables adaptive substepping.
   * @param {boolean} enabled
   */
  setAdaptiveSubstepping(enabled) {
    this.adaptiveSubstepping = Boolean(enabled);
  }

  /**
   * Applies an impulsive navigation delta-V burn to a specific body.
   *
   * @param {string|number} bodyIdOrIndex - Body identifier or index
   * @param {{x: number, y: number, z: number}|[number, number, number]} deltaV
   * @returns {boolean} True if successfully applied
   */
  applyInterventionImpulse(bodyIdOrIndex, deltaV) {
    let index = -1;
    if (typeof bodyIdOrIndex === 'number') {
      index = bodyIdOrIndex;
    } else if (typeof bodyIdOrIndex === 'string') {
      for (let i = 0; i < this.bodyCount; i++) {
        if (this.active[i] && this.ids[i] === bodyIdOrIndex) {
          index = i;
          break;
        }
      }
    }

    if (index < 0 || index >= this.maxBodies || !this.active[index]) {
      return false;
    }

    const i3 = index * 3;
    if (Array.isArray(deltaV)) {
      this.velocities[i3] += deltaV[0] ?? 0.0;
      this.velocities[i3 + 1] += deltaV[1] ?? 0.0;
      this.velocities[i3 + 2] += deltaV[2] ?? 0.0;
    } else if (deltaV && typeof deltaV === 'object') {
      this.velocities[i3] += deltaV.x ?? 0.0;
      this.velocities[i3 + 1] += deltaV.y ?? 0.0;
      this.velocities[i3 + 2] += deltaV.z ?? 0.0;
    }
    return true;
  }

  // ==========================================================================
  // ACCESSORS & SNAPSHOTS (ZERO ALLOCATION WHEN TARGET PROVIDED)
  // ==========================================================================

  /**
   * Reads body world position. Writes into targetVector3 if provided (zero allocation);
   * otherwise returns a new { x, y, z } object.
   *
   * @param {number} index
   * @param {{ x: number, y: number, z: number }} [targetVector3]
   * @returns {{ x: number, y: number, z: number } | null}
   */
  getBodyPosition(index, targetVector3 = null) {
    if (index < 0 || index >= this.maxBodies || !this.active[index]) {
      return null;
    }
    const i3 = index * 3;
    if (targetVector3) {
      targetVector3.x = this.positions[i3];
      targetVector3.y = this.positions[i3 + 1];
      targetVector3.z = this.positions[i3 + 2];
      return targetVector3;
    }
    return {
      x: this.positions[i3],
      y: this.positions[i3 + 1],
      z: this.positions[i3 + 2]
    };
  }

  /**
   * Reads body velocity. Writes into targetVector3 if provided (zero allocation);
   * otherwise returns a new { x, y, z } object.
   *
   * @param {number} index
   * @param {{ x: number, y: number, z: number }} [targetVector3]
   * @returns {{ x: number, y: number, z: number } | null}
   */
  getBodyVelocity(index, targetVector3 = null) {
    if (index < 0 || index >= this.maxBodies || !this.active[index]) {
      return null;
    }
    const i3 = index * 3;
    if (targetVector3) {
      targetVector3.x = this.velocities[i3];
      targetVector3.y = this.velocities[i3 + 1];
      targetVector3.z = this.velocities[i3 + 2];
      return targetVector3;
    }
    return {
      x: this.velocities[i3],
      y: this.velocities[i3 + 1],
      z: this.velocities[i3 + 2]
    };
  }

  /**
   * Reads body mass.
   * @param {number} index
   * @returns {number}
   */
  getBodyMass(index) {
    return (index >= 0 && index < this.maxBodies && this.active[index]) ? this.masses[index] : 0.0;
  }

  /**
   * Reads body ID.
   * @param {number} index
   * @returns {string}
   */
  getBodyId(index) {
    return (index >= 0 && index < this.maxBodies && this.active[index]) ? this.ids[index] : '';
  }

  /**
   * Checks if body is fixed.
   * @param {number} index
   * @returns {boolean}
   */
  isBodyFixed(index) {
    return (index >= 0 && index < this.maxBodies && this.active[index]) ? (this.fixed[index] === 1) : false;
  }

  /**
   * Checks if body slot is active.
   * @param {number} index
   * @returns {boolean}
   */
  isBodyActive(index) {
    return (index >= 0 && index < this.maxBodies) ? (this.active[index] === 1) : false;
  }

  /**
   * Returns active body count.
   * @returns {number}
   */
  getBodyCount() {
    let count = 0;
    for (let i = 0; i < this.bodyCount; i++) {
      if (this.active[i]) count++;
    }
    return count;
  }

  /**
   * Returns authoritative PhysicsState contract snapshot without allocating new heap objects.
   * @returns {PhysicsState}
   */
  getPhysicsState() {
    this._physicsState.simulationTime = this.simulationTime;
    this._physicsState.simTime = this.simulationTime;
    this._physicsState.substepCount = this.substeps;
    this._physicsState.substeps = this.substeps;

    let activeIdx = 0;
    for (let i = 0; i < this.bodyCount; i++) {
      if (!this.active[i]) continue;
      const b = this._physicsBodiesPool[activeIdx];
      const i3 = i * 3;
      b.id = this.ids[i];
      b.mass = this.masses[i];
      b.pos.x = this.positions[i3];
      b.pos.y = this.positions[i3 + 1];
      b.pos.z = this.positions[i3 + 2];
      b.vel.x = this.velocities[i3];
      b.vel.y = this.velocities[i3 + 1];
      b.vel.z = this.velocities[i3 + 2];
      b.fixed = this.fixed[i] === 1;
      activeIdx++;
    }
    this._physicsState.bodies = this._physicsBodiesPool.slice(0, activeIdx);
    return this._physicsState;
  }

  // ==========================================================================
  // DIAGNOSTIC INVARIANTS (Conservation Laws)
  // ==========================================================================

  /**
   * Kinetic Energy: T = 0.5 * sum_i (m_i * ||v_i||^2)
   * @returns {number}
   */
  getKineticEnergy() {
    let ke = 0.0;
    const N = this.bodyCount;
    for (let i = 0; i < N; i++) {
      if (!this.active[i]) continue;
      const m = this.masses[i];
      const i3 = i * 3;
      const vx = this.velocities[i3];
      const vy = this.velocities[i3 + 1];
      const vz = this.velocities[i3 + 2];
      ke += 0.5 * m * (vx * vx + vy * vy + vz * vz);
    }
    return ke;
  }

  /**
   * Potential Energy: V = -G * sum_{i < j} (m_i * m_j / sqrt(||r_i - r_j||^2 + eps^2))
   * @returns {number}
   */
  getPotentialEnergy() {
    let pe = 0.0;
    const N = this.bodyCount;
    const G = this.G;
    const softeningSq = this.softeningSq;

    for (let i = 0; i < N; i++) {
      if (!this.active[i]) continue;
      const mi = this.masses[i];
      const i3 = i * 3;
      const xi = this.positions[i3];
      const yi = this.positions[i3 + 1];
      const zi = this.positions[i3 + 2];

      for (let j = i + 1; j < N; j++) {
        if (!this.active[j]) continue;
        const mj = this.masses[j];
        const j3 = j * 3;
        const dx = this.positions[j3] - xi;
        const dy = this.positions[j3 + 1] - yi;
        const dz = this.positions[j3 + 2] - zi;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz + softeningSq);
        pe -= (G * mi * mj) / dist;
      }
    }
    return pe;
  }

  /**
   * Specific Orbital Energy of a body relative to a primary body:
   * epsilon = 0.5 * ||v_rel||^2 - (G * M_primary) / sqrt(||r_rel||^2 + eps^2)
   *
   * @param {number} bodyIndex - Body index (planet/satellite)
   * @param {number} [primaryIndex=0] - Primary attractor index (central star)
   * @returns {number} Specific orbital energy (energy per unit mass)
   */
  getSpecificOrbitalEnergy(bodyIndex, primaryIndex = 0) {
    if (
      bodyIndex < 0 || bodyIndex >= this.maxBodies || !this.active[bodyIndex] ||
      primaryIndex < 0 || primaryIndex >= this.maxBodies || !this.active[primaryIndex]
    ) {
      return 0.0;
    }

    const b3 = bodyIndex * 3;
    const p3 = primaryIndex * 3;

    const dx = this.positions[b3] - this.positions[p3];
    const dy = this.positions[b3 + 1] - this.positions[p3 + 1];
    const dz = this.positions[b3 + 2] - this.positions[p3 + 2];
    const distSq = dx * dx + dy * dy + dz * dz + this.softeningSq;
    const dist = Math.sqrt(distSq);

    const dvx = this.velocities[b3] - this.velocities[p3];
    const dvy = this.velocities[b3 + 1] - this.velocities[p3 + 1];
    const dvz = this.velocities[b3 + 2] - this.velocities[p3 + 2];
    const vSq = dvx * dvx + dvy * dvy + dvz * dvz;

    const M = this.masses[primaryIndex];
    return 0.5 * vSq - (this.G * M) / dist;
  }

  /**
   * Total Mechanical Energy: E = T + V
   * In a conservative gravitational system, dE/dt = 0.
   * @returns {number}
   */
  getTotalEnergy() {
    return this.getKineticEnergy() + this.getPotentialEnergy();
  }

  /**
   * Total Linear Momentum: P = sum_i (m_i * v_i)
   * In an isolated system without external forces, dP/dt = 0.
   *
   * @param {Float64Array} [out] - Optional 3-element target array
   * @returns {Float64Array} Total momentum vector [Px, Py, Pz]
   */
  getTotalMomentum(out = null) {
    const target = out || this._momentumBuffer;
    target[0] = 0.0;
    target[1] = 0.0;
    target[2] = 0.0;

    const N = this.bodyCount;
    for (let i = 0; i < N; i++) {
      if (!this.active[i]) continue;
      const m = this.masses[i];
      const i3 = i * 3;
      target[0] += m * this.velocities[i3];
      target[1] += m * this.velocities[i3 + 1];
      target[2] += m * this.velocities[i3 + 2];
    }
    return target;
  }
}
