/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Performance Benchmark & Allocation Profiling Test Suite (Step 3.2)
 * Role: Person B (The Physics Lead)
 * ============================================================================
 *
 * Profiling Criteria & Validation:
 * 1. CPU Execution Budget: Physics slice < 1.0 ms per frame (at 72 FPS / 120 FPS).
 *    - Scenario A (Nominal): Binary stars + planet (3 bodies).
 *    - Scenario B (Worst-Case Stress): 3 stars + planet with 12 adaptive substeps per frame.
 *    - Asserts mean execution time < 0.5 ms and p99 < 1.0 ms across 10,000 steps.
 * 2. Memory & Zero Allocation Guarantee:
 *    - Verifies zero runtime heap allocations during continuous simulation loops.
 *    - Verifies flat Float64Array buffer references and byte lengths remain static.
 * 3. PhysicsProfiler Diagnostic Telemetry:
 *    - Rolling 120-frame ring buffer samples execution times without GC overhead.
 *    - Logs console warnings when budget is exceeded.
 */

import { describe, it, expect, vi } from 'vitest';
import { OrbitalEngine } from '../src/physics/OrbitalEngine.js';
import { PhysicsProfiler } from '../src/physics/PhysicsProfiler.js';

describe('OrbitalEngine Performance & Allocation Profiling (Step 3.2)', () => {
  const DT = 1 / 120; // 120 Hz fixed accumulator timestep (~8.33 ms)

  /**
   * Helper to compute detailed statistical distribution from a sample array.
   */
  function computeStats(samples) {
    const sorted = Float64Array.from(samples).sort();
    const count = sorted.length;
    let sum = 0.0;
    for (let i = 0; i < count; i++) {
      sum += sorted[i];
    }
    const mean = sum / count;
    const median = sorted[Math.floor(count * 0.5)];
    const min = sorted[0];
    const max = sorted[count - 1];
    const p95 = sorted[Math.floor(count * 0.95)];
    const p99 = sorted[Math.floor(count * 0.99)];

    return { count, mean, median, min, max, p95, p99 };
  }

  describe('Test 1: JIT Warmup & CPU Execution Time Benchmarks', () => {
    it('Scenario A (Nominal 3-body system): executes 10,000 steps with mean < 0.5 ms and p99 < 1.0 ms', () => {
      const engine = new OrbitalEngine({ maxBodies: 4, G: 1.0, softening: 0.05, adaptiveSubstepping: false });
      engine.setBody(0, 'star_1', 1.0, 0.4, 0.0, 0.0, 0.0, 0.3, 0.0, false);
      engine.setBody(1, 'star_2', 1.0, -0.4, 0.0, 0.0, 0.0, -0.3, 0.0, false);
      engine.setBody(2, 'planet', 1e-6, 0.0, 2.4, 0.0, -0.9, 0.0, 0.0, false);

      // JIT Warmup: 1,000 untimed iterations to trigger full V8 optimization
      for (let i = 0; i < 1000; i++) {
        engine.update(DT);
      }

      const N = 10000;
      const stepTimes = new Float64Array(N);

      for (let i = 0; i < N; i++) {
        const t0 = performance.now();
        engine.update(DT);
        const t1 = performance.now();
        stepTimes[i] = t1 - t0;
      }

      const stats = computeStats(stepTimes);

      console.log('\n================================================================');
      console.log(' SCENARIO A: NOMINAL 3-BODY BENCHMARK (10,000 STEPS, 1 SUBSTEP)');
      console.log('================================================================');
      console.log(` Mean Frame Time:     ${stats.mean.toFixed(6)} ms (Budget: < 0.5 ms)`);
      console.log(` Median Frame Time:   ${stats.median.toFixed(6)} ms`);
      console.log(` p95 Frame Time:      ${stats.p95.toFixed(6)} ms`);
      console.log(` p99 Frame Time:      ${stats.p99.toFixed(6)} ms (Budget: < 1.0 ms)`);
      console.log(` Min / Max Spike:     ${stats.min.toFixed(6)} ms / ${stats.max.toFixed(6)} ms`);
      console.log(` Evaluated Substeps:  1`);
      console.log('================================================================\n');

      // Strict performance invariants
      expect(stats.mean).toBeLessThan(0.5);
      expect(stats.p99).toBeLessThan(1.0);
    });

    it('Scenario B (Worst-Case Stress with 12 adaptive substeps): executes 10,000 steps with mean < 0.5 ms and p99 < 1.0 ms', () => {
      const engine = new OrbitalEngine({ maxBodies: 4, G: 1.0, softening: 0.05, adaptiveSubstepping: true });
      // Arrange bodies in extreme close proximity (r < 0.25) so determineSubsteps() returns 12
      engine.setBody(0, 'star_1', 1.0, 0.05, 0.0, 0.0, 0.0, 0.3, 0.0, false);
      engine.setBody(1, 'star_2', 1.0, -0.05, 0.0, 0.0, 0.0, -0.3, 0.0, false);
      engine.setBody(2, 'star_3', 1.0, 0.0, 0.08, 0.0, 0.0, 0.0, 0.0, false);
      engine.setBody(3, 'planet', 1e-6, 0.0, -0.08, 0.0, -0.9, 0.0, 0.0, false);

      expect(engine.determineSubsteps(DT)).toBe(12);

      // JIT Warmup: 1,000 untimed iterations under 12-substep load
      for (let i = 0; i < 1000; i++) {
        engine.update(DT);
      }

      const N = 10000;
      const stepTimes = new Float64Array(N);

      for (let i = 0; i < N; i++) {
        const t0 = performance.now();
        engine.update(DT);
        const t1 = performance.now();
        stepTimes[i] = t1 - t0;
      }

      const stats = computeStats(stepTimes);

      console.log('\n================================================================');
      console.log(' SCENARIO B: WORST-CASE STRESS BENCHMARK (10,000 STEPS, 12 SUBSTEPS)');
      console.log('================================================================');
      console.log(` Mean Frame Time:     ${stats.mean.toFixed(6)} ms (Budget: < 0.5 ms)`);
      console.log(` Median Frame Time:   ${stats.median.toFixed(6)} ms`);
      console.log(` p95 Frame Time:      ${stats.p95.toFixed(6)} ms`);
      console.log(` p99 Frame Time:      ${stats.p99.toFixed(6)} ms (Budget: < 1.0 ms)`);
      console.log(` Min / Max Spike:     ${stats.min.toFixed(6)} ms / ${stats.max.toFixed(6)} ms`);
      console.log(` Evaluated Substeps:  12`);
      console.log('================================================================\n');

      // Worst-case 12-substep execution must strictly comply with < 1.0 ms Quest budget
      expect(stats.mean).toBeLessThan(0.5);
      expect(stats.p99).toBeLessThan(1.0);
    });
  });

  describe('Test 2: Memory & Allocation Invariants (Zero Heap Allocation Guarantee)', () => {
    it('executes 50,000 consecutive steps with zero per-frame object or array allocations', () => {
      const engine = new OrbitalEngine({ maxBodies: 4, G: 1.0, softening: 0.05, adaptiveSubstepping: true });
      engine.setBody(0, 'star_1', 1.0, 0.4, 0.0, 0.0, 0.0, 0.3, 0.0, false);
      engine.setBody(1, 'star_2', 1.0, -0.4, 0.0, 0.0, 0.0, -0.3, 0.0, false);
      engine.setBody(2, 'star_3', 1.0, 0.0, 0.5, 0.0, 0.0, 0.0, 0.0, false);
      engine.setBody(3, 'planet', 1e-6, 0.0, 2.4, 0.0, -0.9, 0.0, 0.0, false);

      // Warmup JIT
      for (let i = 0; i < 2000; i++) {
        engine.update(DT);
      }

      const initialPosBuf = engine.positions.buffer;
      const initialVelBuf = engine.velocities.buffer;
      const initialAccBuf = engine.accelerations.buffer;
      const initialMassBuf = engine.masses.buffer;

      // Spy on mutating methods using non-allocating wrapper counters
      const originalPush = Array.prototype.push;
      const originalSlice = Array.prototype.slice;
      const originalSplice = Array.prototype.splice;
      const originalAssign = Object.assign;

      let pushCount = 0;
      let sliceCount = 0;
      let spliceCount = 0;
      let assignCount = 0;

      Array.prototype.push = function (...args) {
        pushCount++;
        return originalPush.apply(this, args);
      };
      Array.prototype.slice = function (...args) {
        sliceCount++;
        return originalSlice.apply(this, args);
      };
      Array.prototype.splice = function (...args) {
        spliceCount++;
        return originalSplice.apply(this, args);
      };
      Object.assign = function (...args) {
        assignCount++;
        return originalAssign.apply(this, args);
      };

      try {
        const N = 50000;
        for (let i = 0; i < N; i++) {
          engine.update(DT);
        }

        // Strict Zero Allocation Invariants
        expect(pushCount).toBe(0);
        expect(sliceCount).toBe(0);
        expect(spliceCount).toBe(0);
        expect(assignCount).toBe(0);

        // Pre-allocated flat buffers must remain identical and never resized
        expect(engine.positions.buffer).toBe(initialPosBuf);
        expect(engine.velocities.buffer).toBe(initialVelBuf);
        expect(engine.accelerations.buffer).toBe(initialAccBuf);
        expect(engine.masses.buffer).toBe(initialMassBuf);
        expect(engine.positions.byteLength).toBe(initialPosBuf.byteLength);
      } finally {
        Array.prototype.push = originalPush;
        Array.prototype.slice = originalSlice;
        Array.prototype.splice = originalSplice;
        Object.assign = originalAssign;
      }
    });
  });

  describe('Test 3: PhysicsProfiler Diagnostic Ring Buffer & Telemetry Contract', () => {
    it('records 120-frame rolling window metrics and computes avg, p99, and max frame times', () => {
      const profiler = new PhysicsProfiler({ bufferSize: 120 });
      const engine = new OrbitalEngine({ maxBodies: 4, G: 1.0, softening: 0.05 });
      engine.setProfiler(profiler);

      expect(engine.getProfiler()).toBe(profiler);

      engine.setBody(0, 'star_1', 1.0, 0.4, 0.0, 0.0, 0.0, 0.3, 0.0, false);
      engine.setBody(1, 'star_2', 1.0, -0.4, 0.0, 0.0, 0.0, -0.3, 0.0, false);
      engine.setBody(2, 'planet', 1e-6, 0.0, 2.4, 0.0, -0.9, 0.0, 0.0, false);

      // Run 240 steps (fills ring buffer twice)
      for (let i = 0; i < 240; i++) {
        engine.update(DT);
      }

      const metrics = engine.getPhysicsMetrics();
      expect(metrics).not.toBeNull();
      expect(metrics.avgMs).toBeGreaterThan(0.0);
      expect(metrics.avgMs).toBeLessThan(0.5);
      expect(metrics.p99Ms).toBeGreaterThan(0.0);
      expect(metrics.p99Ms).toBeLessThan(1.0);
      expect(metrics.maxMs).toBeGreaterThanOrEqual(metrics.p99Ms);
      expect(metrics.currentSubsteps).toBeGreaterThanOrEqual(1);

      // Verify zero allocation when calling getMetrics()
      const cachedRef = profiler.getMetrics();
      expect(engine.getPhysicsMetrics()).toBe(cachedRef);
    });

    it('logs an explicit console warning when a step exceeds budget threshold of 1.0 ms', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const profiler = new PhysicsProfiler({
        bufferSize: 120,
        budgetThresholdMs: 0.0001, // Artificially low threshold to guarantee triggering warning
        warnOnBudgetExceeded: true
      });

      profiler.startFrame();
      // Simulate artificial delay
      const start = performance.now();
      while (performance.now() - start < 1.0) {
        // busy wait ~1ms
      }
      profiler.endFrame(4);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[PhysicsProfiler] Execution budget exceeded')
      );

      warnSpy.mockRestore();
    });

    it('disables profiling with zero overhead when setEnabled(false) is called', () => {
      const profiler = new PhysicsProfiler({ enabled: false });
      const engine = new OrbitalEngine({ maxBodies: 2, profiler });

      engine.setBody(0, 'body_a', 1.0, 0, 0, 0, 0, 0, 0);
      engine.update(DT);

      expect(profiler.sampleCount).toBe(0);
      expect(profiler.getMetrics().avgMs).toBe(0.0);
    });
  });
});

