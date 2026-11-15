/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Celestial Kendama - Physics Profiler & Performance Telemetry
 * Role: Person B (The Physics Lead / PhysicsProfiler.js)
 * ============================================================================
 *
 * Zero-overhead rolling ring-buffer profiler for OrbitalEngine.
 * Monitors execution time against the strict < 1.0 ms budget at 72 Hz / 120 Hz.
 *
 * Features:
 * 1. Rolling 120-frame ring buffer (Float32Array) without runtime dynamic allocations.
 * 2. Guarded by an `enabled` flag for zero-overhead in production.
 * 3. Pre-allocated metrics cache returning { avgMs, p99Ms, maxMs, currentSubsteps }.
 * 4. Logs a console warning if any single step exceeds 1.0 ms budget.
 */

export class PhysicsProfiler {
  /**
   * @param {Object} [options={}]
   * @param {boolean} [options.enabled=true] - Whether profiling is enabled
   * @param {number} [options.bufferSize=120] - Number of samples in rolling window (120 frames = 1s at 120Hz)
   * @param {number} [options.budgetThresholdMs=1.0] - Warning budget threshold in ms
   * @param {boolean} [options.warnOnBudgetExceeded=true] - Whether to log console warnings
   */
  constructor(options = {}) {
    this.enabled = options.enabled !== undefined ? Boolean(options.enabled) : true;
    this.bufferSize = Number.isInteger(options.bufferSize) && options.bufferSize > 0 ? options.bufferSize : 120;
    this.budgetThresholdMs = Number.isFinite(options.budgetThresholdMs) ? options.budgetThresholdMs : 1.0;
    this.warnOnBudgetExceeded = options.warnOnBudgetExceeded !== undefined ? Boolean(options.warnOnBudgetExceeded) : true;

    // Pre-allocated static Float32Array ring buffers (Zero GC overhead)
    this.samples = new Float32Array(this.bufferSize);
    this._sortBuffer = new Float32Array(this.bufferSize);

    this.head = 0;
    this.sampleCount = 0;
    this.currentSubsteps = 1;
    this._startTime = 0.0;
    this._lastDeltaMs = 0.0;

    // Pre-allocated cached metrics object to prevent per-query heap allocations
    this._metricsCache = {
      avgMs: 0.0,
      p99Ms: 0.0,
      maxMs: 0.0,
      currentSubsteps: 1
    };
  }

  /**
   * Enables or disables the profiler.
   * When disabled, startFrame() and endFrame() early-return with zero work.
   * @param {boolean} flag
   */
  setEnabled(flag) {
    this.enabled = Boolean(flag);
  }

  /**
   * Marks the start timestamp of a physics frame slice.
   * @returns {number} Start timestamp in ms
   */
  startFrame() {
    if (!this.enabled) return 0.0;
    this._startTime = performance.now();
    return this._startTime;
  }

  /**
   * Records elapsed time since startFrame into the rolling ring buffer.
   *
   * @param {number} [substeps=1] - Number of substeps evaluated during frame
   * @returns {number} Elapsed duration in milliseconds
   */
  endFrame(substeps = 1) {
    if (!this.enabled) return 0.0;
    const now = performance.now();
    const deltaMs = now - this._startTime;
    this._lastDeltaMs = deltaMs;
    this.currentSubsteps = Number.isInteger(substeps) ? substeps : 1;

    // Store into rolling ring buffer
    this.samples[this.head] = deltaMs;
    this.head = (this.head + 1) % this.bufferSize;
    if (this.sampleCount < this.bufferSize) {
      this.sampleCount++;
    }

    // Budget check: warn if execution exceeds strict 1.0 ms budget
    if (deltaMs > this.budgetThresholdMs && this.warnOnBudgetExceeded) {
      console.warn(
        `[PhysicsProfiler] Execution budget exceeded: ${deltaMs.toFixed(3)} ms > ${this.budgetThresholdMs.toFixed(3)} ms (substeps: ${this.currentSubsteps})`
      );
    }

    return deltaMs;
  }

  /**
   * Computes and returns rolling performance metrics over the active sample window.
   * Completely allocation-free (updates and returns pre-allocated metrics cache).
   *
   * @returns {{ avgMs: number, p99Ms: number, maxMs: number, currentSubsteps: number }}
   */
  getMetrics() {
    const count = this.sampleCount;
    if (count === 0) {
      this._metricsCache.avgMs = 0.0;
      this._metricsCache.p99Ms = 0.0;
      this._metricsCache.maxMs = 0.0;
      this._metricsCache.currentSubsteps = this.currentSubsteps;
      return this._metricsCache;
    }

    let sum = 0.0;
    let max = 0.0;

    for (let i = 0; i < count; i++) {
      const val = this.samples[i];
      sum += val;
      if (val > max) {
        max = val;
      }
      this._sortBuffer[i] = val;
    }

    // In-place insertion sort of the active window in _sortBuffer (zero heap allocation)
    for (let i = 1; i < count; i++) {
      const key = this._sortBuffer[i];
      let j = i - 1;
      while (j >= 0 && this._sortBuffer[j] > key) {
        this._sortBuffer[j + 1] = this._sortBuffer[j];
        j--;
      }
      this._sortBuffer[j + 1] = key;
    }

    // p99 index: 99th percentile of sampled frames
    const p99Index = Math.min(count - 1, Math.floor(0.99 * count));
    const p99 = this._sortBuffer[p99Index];

    this._metricsCache.avgMs = sum / count;
    this._metricsCache.p99Ms = p99;
    this._metricsCache.maxMs = max;
    this._metricsCache.currentSubsteps = this.currentSubsteps;

    return this._metricsCache;
  }

  /**
   * Diagnostic contract alias matching getMetrics().
   * @returns {{ avgMs: number, p99Ms: number, maxMs: number, currentSubsteps: number }}
   */
  getPhysicsMetrics() {
    return this.getMetrics();
  }

  /**
   * Resets ring buffer and counters.
   */
  reset() {
    this.samples.fill(0.0);
    this._sortBuffer.fill(0.0);
    this.head = 0;
    this.sampleCount = 0;
    this.currentSubsteps = 1;
    this._startTime = 0.0;
    this._lastDeltaMs = 0.0;
    this._metricsCache.avgMs = 0.0;
    this._metricsCache.p99Ms = 0.0;
    this._metricsCache.maxMs = 0.0;
    this._metricsCache.currentSubsteps = 1;
  }
}

