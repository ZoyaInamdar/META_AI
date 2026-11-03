/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Unit Tests for TrickSequencer (Target State Machine - Step 1.6)
 * Role: Person B (The Mission & Physics Lead)
 * ============================================================================
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TrickSequencer } from '../src/mission/TrickSequencer.js';
import { CupKey, TrickType, TargetState, Events } from '../src/contracts/Interfaces.js';

describe('TrickSequencer: Target State Machine (Step 1.6)', () => {
  let sequencer;
  let mockEventBus;

  beforeEach(() => {
    mockEventBus = {
      emit: vi.fn(),
      on: vi.fn()
    };
    sequencer = new TrickSequencer(mockEventBus);
  });

  describe('Test 1: Default Initial State', () => {
    it('initializes to Chapter 1 with big cup, single trick, and sequenceIndex 0', () => {
      const target = sequencer.getCurrentTarget();
      expect(target).toBeInstanceOf(TargetState);
      expect(target.cupKey).toBe(CupKey.BIG);
      expect(target.trick).toBe(TrickType.SINGLE);
      expect(target.sequenceIndex).toBe(0);
      expect(sequencer.getChapter()).toBe(1);
    });
  });

  describe('Test 2: Chapter 1 Single Cup Progression', () => {
    it('increments sequenceIndex on successive matching catches while retaining big cup', () => {
      // First catch: big
      const state1 = sequencer.handleCatch({ cupKey: CupKey.BIG });
      expect(state1).not.toBeNull();
      expect(state1.cupKey).toBe(CupKey.BIG);
      expect(state1.trick).toBe(TrickType.SINGLE);
      expect(state1.sequenceIndex).toBe(1);

      // Second catch: big
      const state2 = sequencer.handleCatch({ cupKey: CupKey.BIG });
      expect(state2.cupKey).toBe(CupKey.BIG);
      expect(state2.sequenceIndex).toBe(2);

      // Third catch: string parameter overload ('big')
      const state3 = sequencer.handleCatch(CupKey.BIG);
      expect(state3.cupKey).toBe(CupKey.BIG);
      expect(state3.sequenceIndex).toBe(3);

      expect(mockEventBus.emit).toHaveBeenCalledWith(Events.TARGET, expect.any(TargetState));
    });
  });

  describe('Test 3: Chapter 2 Alternation', () => {
    it('alternates back and forth between big and small cups across sequenceIndex 0 -> 1 -> 2 -> 3', () => {
      const initCh2 = sequencer.setChapter(2);
      expect(initCh2.cupKey).toBe(CupKey.BIG);
      expect(initCh2.trick).toBe(TrickType.ALTERNATE);
      expect(initCh2.sequenceIndex).toBe(0);
      expect(sequencer.getChapter()).toBe(2);

      // 1. Catch big -> advances to small (idx 1)
      const step1 = sequencer.handleCatch({ cupKey: CupKey.BIG });
      expect(step1.cupKey).toBe(CupKey.SMALL);
      expect(step1.sequenceIndex).toBe(1);
      expect(step1.trick).toBe(TrickType.ALTERNATE);

      // 2. Catch small -> advances to big (idx 2)
      const step2 = sequencer.handleCatch({ cupKey: CupKey.SMALL });
      expect(step2.cupKey).toBe(CupKey.BIG);
      expect(step2.sequenceIndex).toBe(2);

      // 3. Catch big -> advances to small (idx 3)
      const step3 = sequencer.handleCatch({ cupKey: CupKey.BIG });
      expect(step3.cupKey).toBe(CupKey.SMALL);
      expect(step3.sequenceIndex).toBe(3);

      // 4. Catch small -> advances to big (idx 4)
      const step4 = sequencer.handleCatch({ cupKey: CupKey.SMALL });
      expect(step4.cupKey).toBe(CupKey.BIG);
      expect(step4.sequenceIndex).toBe(4);
    });
  });

  describe('Test 4: Chapter 3 Around the World', () => {
    it('cycles sequentially through big -> small -> base -> big across sequence indices', () => {
      const initCh3 = sequencer.setChapter(3);
      expect(initCh3.cupKey).toBe(CupKey.BIG);
      expect(initCh3.trick).toBe(TrickType.AROUND);
      expect(initCh3.sequenceIndex).toBe(0);
      expect(sequencer.getChapter()).toBe(3);

      // 1. Catch big (idx 0) -> advances to small (idx 1)
      const step1 = sequencer.handleCatch({ cupKey: CupKey.BIG });
      expect(step1.cupKey).toBe(CupKey.SMALL);
      expect(step1.sequenceIndex).toBe(1);
      expect(step1.trick).toBe(TrickType.AROUND);

      // 2. Catch small (idx 1) -> advances to base (idx 2)
      const step2 = sequencer.handleCatch({ cupKey: CupKey.SMALL });
      expect(step2.cupKey).toBe(CupKey.BASE);
      expect(step2.sequenceIndex).toBe(2);

      // 3. Catch base (idx 2) -> advances back to big (idx 3)
      const step3 = sequencer.handleCatch({ cupKey: CupKey.BASE });
      expect(step3.cupKey).toBe(CupKey.BIG);
      expect(step3.sequenceIndex).toBe(3);

      // 4. Catch big (idx 3) -> advances to small (idx 4)
      const step4 = sequencer.handleCatch({ cupKey: CupKey.BIG });
      expect(step4.cupKey).toBe(CupKey.SMALL);
      expect(step4.sequenceIndex).toBe(4);
    });
  });

  describe('Test 5: Chapter 4 Spike', () => {
    it('locks target to spike cup exclusively for all subsequent catches', () => {
      const initCh4 = sequencer.setChapter(4);
      expect(initCh4.cupKey).toBe(CupKey.SPIKE);
      expect(initCh4.trick).toBe(TrickType.SPIKE);
      expect(initCh4.sequenceIndex).toBe(0);

      // 1. Catch spike
      const step1 = sequencer.handleCatch({ cupKey: CupKey.SPIKE });
      expect(step1.cupKey).toBe(CupKey.SPIKE);
      expect(step1.sequenceIndex).toBe(1);

      // 2. Catch spike again
      const step2 = sequencer.handleCatch({ cupKey: CupKey.SPIKE });
      expect(step2.cupKey).toBe(CupKey.SPIKE);
      expect(step2.sequenceIndex).toBe(2);
    });
  });

  describe('Test 6: Mismatched Catch Guard', () => {
    it('returns null and leaves sequenceIndex and cupKey unmutated when an incorrect cup is hit', () => {
      // In Chapter 1, target is BIG
      expect(sequencer.getCurrentTarget().cupKey).toBe(CupKey.BIG);
      expect(sequencer.getCurrentTarget().sequenceIndex).toBe(0);

      // Mismatched catch attempt: SMALL
      const missResult1 = sequencer.handleCatch({ cupKey: CupKey.SMALL });
      expect(missResult1).toBeNull();
      expect(sequencer.getCurrentTarget().cupKey).toBe(CupKey.BIG);
      expect(sequencer.getCurrentTarget().sequenceIndex).toBe(0);

      // Mismatched catch attempt: BASE
      const missResult2 = sequencer.handleCatch({ cupKey: CupKey.BASE });
      expect(missResult2).toBeNull();
      expect(sequencer.getCurrentTarget().cupKey).toBe(CupKey.BIG);
      expect(sequencer.getCurrentTarget().sequenceIndex).toBe(0);

      // Mismatched catch attempt: SPIKE
      const missResult3 = sequencer.handleCatch({ cupKey: CupKey.SPIKE });
      expect(missResult3).toBeNull();
      expect(sequencer.getCurrentTarget().cupKey).toBe(CupKey.BIG);
      expect(sequencer.getCurrentTarget().sequenceIndex).toBe(0);

      // Now valid catch: BIG
      const validResult = sequencer.handleCatch({ cupKey: CupKey.BIG });
      expect(validResult).not.toBeNull();
      expect(validResult.sequenceIndex).toBe(1);
    });
  });

  describe('State Reset and Peek Utilities', () => {
    it('peekNextTargetCup previews subsequent target without advancing state', () => {
      sequencer.setChapter(2);
      expect(sequencer.getCurrentTarget().cupKey).toBe(CupKey.BIG);
      expect(sequencer.peekNextTargetCup()).toBe(CupKey.SMALL);
      expect(sequencer.getCurrentTarget().sequenceIndex).toBe(0);
    });

    it('reset returns sequencer to Chapter 1 initial conditions', () => {
      sequencer.setChapter(3);
      sequencer.handleCatch({ cupKey: CupKey.BIG });
      expect(sequencer.getCurrentTarget().sequenceIndex).toBe(1);

      sequencer.reset();
      const target = sequencer.getCurrentTarget();
      expect(target.cupKey).toBe(CupKey.BIG);
      expect(target.trick).toBe(TrickType.SINGLE);
      expect(target.sequenceIndex).toBe(0);
      expect(sequencer.getChapter()).toBe(1);
    });
  });
});

