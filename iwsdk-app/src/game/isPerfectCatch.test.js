/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Unit Tests for isPerfectCatch
 * ============================================================================
 */

import { describe, it, expect } from 'vitest';
import { isPerfectCatch } from './isPerfectCatch.js';
import { CatchType } from '../contracts/Interfaces.js';

describe('isPerfectCatch', () => {
  it('returns true for a CLEAN catch', () => {
    expect(isPerfectCatch({ catchType: 'CLEAN' })).toBe(true);
    expect(isPerfectCatch({ catchType: CatchType.CLEAN })).toBe(true);
  });

  it('returns false for an ASSISTED catch', () => {
    expect(isPerfectCatch({ catchType: 'ASSISTED' })).toBe(false);
    expect(isPerfectCatch({ catchType: CatchType.ASSISTED })).toBe(false);
  });

  it('returns false for null', () => {
    expect(isPerfectCatch(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isPerfectCatch(undefined)).toBe(false);
    expect(isPerfectCatch()).toBe(false);
  });

  it('returns false for an empty object {}', () => {
    expect(isPerfectCatch({})).toBe(false);
  });

  it('returns true for an object with catchType "CLEAN" and any multipliers (cadence does not matter)', () => {
    expect(isPerfectCatch({
      catchType: 'CLEAN',
      multipliers: { accuracy: 1.4, cadence: 0.5, streak: 1.0, total: 0.7 },
    })).toBe(true);

    expect(isPerfectCatch({
      catchType: 'CLEAN',
      multipliers: { accuracy: 1.0, cadence: 0.0, streak: 1.0, total: 0.0 },
    })).toBe(true);

    expect(isPerfectCatch({
      catchType: 'CLEAN',
      cadenceMultiplier: 0.1,
      multiplier: 3.0,
    })).toBe(true);

    expect(isPerfectCatch({
      catchType: 'CLEAN',
      cadenceMultiplier: 2.0,
      awardedEnergy: 50,
      totalEnergy: 100,
    })).toBe(true);
  });
});
