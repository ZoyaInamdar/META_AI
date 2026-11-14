/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Celestial Kendama - Target Sequence State Machine
 * Role: Person B (The Mission & Physics Lead / TrickSequencer.js)
 * ============================================================================
 *
 * Manages active Kendama target cups and trick patterns across the 5 cosmic epochs.
 * Strictly adheres to agreed contracts in ../contracts/Interfaces.js:
 * - Emits Events.TARGET to notify Person A (Catch/Score) and Person C (Visual Halo)
 * - Canonical cup keys: 'big', 'small', 'base', 'spike'
 * - Target schema: { cupKey, trick, sequenceIndex }
 */

import { CupKey, TrickType, TargetState, Events } from '../contracts/Interfaces.js';

/**
 * Chapter-to-trick definition mapping and canonical cycling patterns.
 * @private
 */
const CHAPTER_DEFINITIONS = Object.freeze({
  1: Object.freeze({
    trick: TrickType.SINGLE,
    cycle: Object.freeze([CupKey.BIG])
  }),
  2: Object.freeze({
    trick: TrickType.ALTERNATE,
    cycle: Object.freeze([CupKey.BIG, CupKey.SMALL])
  }),
  3: Object.freeze({
    trick: TrickType.AROUND,
    cycle: Object.freeze([CupKey.BIG, CupKey.SMALL, CupKey.BASE])
  }),
  4: Object.freeze({
    trick: TrickType.SPIKE,
    cycle: Object.freeze([CupKey.SPIKE])
  })
});

export class TrickSequencer {
  /**
   * @param {Object} [eventBus=null] - Optional EventBus instance for publishing Events.TARGET
   */
  constructor(eventBus = null) {
    this.eventBus = eventBus;
    this.chapterIndex = 1;
    this.currentTrick = TrickType.SINGLE;
    this.cycle = CHAPTER_DEFINITIONS[1].cycle;
    this.cycleStep = 0;
    this.sequenceIndex = 0;

    this.currentTarget = new TargetState(CupKey.BIG, TrickType.SINGLE, 0);
  }

  /**
   * Transitions the sequencer to the designated chapter (1 to 4/finale).
   * Resets cycle position and resets sequenceIndex to 0.
   * Emits Events.TARGET if an EventBus was provided.
   *
   * @param {number} [chapterIndex=1] - Epoch index (1: SINGLE, 2: ALTERNATE, 3: AROUND, 4+: SPIKE)
   * @returns {TargetState} Updated TargetState
   */
  setChapter(chapterIndex = 1) {
    const ch = Math.max(1, Math.min(4, Math.floor(chapterIndex)));
    this.chapterIndex = ch;

    const def = CHAPTER_DEFINITIONS[ch] || CHAPTER_DEFINITIONS[1];
    this.currentTrick = def.trick;
    this.cycle = def.cycle;
    this.cycleStep = 0;
    this.sequenceIndex = 0;

    this.currentTarget.cupKey = this.cycle[0];
    this.currentTarget.trick = this.currentTrick;
    this.currentTarget.sequenceIndex = 0;

    const snapshot = this.getCurrentTarget();
    if (this.eventBus && typeof this.eventBus.emit === 'function') {
      this.eventBus.emit(Events.TARGET, snapshot);
    }
    return snapshot;
  }

  /**
   * Evaluates a catch against the currently active target cup.
   * If matching, increments sequenceIndex, advances cycle position, and updates target.
   * If mismatched, returns null and leaves sequence state unmutated.
   *
   * @param {{ cupKey?: string } | string} catchEvent - Catch event containing cupKey or string cupKey
   * @returns {TargetState | null} Updated TargetState if matching, or null on mismatch
   */
  handleCatch(catchEvent) {
    const cupKey = typeof catchEvent === 'string' ? catchEvent : catchEvent?.cupKey;

    if (!cupKey || cupKey !== this.currentTarget.cupKey) {
      return null;
    }

    this.sequenceIndex++;
    this.cycleStep = (this.cycleStep + 1) % this.cycle.length;

    this.currentTarget.cupKey = this.cycle[this.cycleStep];
    this.currentTarget.sequenceIndex = this.sequenceIndex;

    const snapshot = this.getCurrentTarget();
    if (this.eventBus && typeof this.eventBus.emit === 'function') {
      this.eventBus.emit(Events.TARGET, snapshot);
    }
    return snapshot;
  }

  /**
   * Returns a clean snapshot of the active TargetState.
   * @returns {TargetState}
   */
  getCurrentTarget() {
    return new TargetState(
      this.currentTarget.cupKey,
      this.currentTarget.trick,
      this.currentTarget.sequenceIndex
    );
  }

  /**
   * Emits current TargetState snapshot onto the EventBus if configured.
   * @returns {TargetState}
   */
  emitCurrentTarget() {
    const snapshot = this.getCurrentTarget();
    if (this.eventBus && typeof this.eventBus.emit === 'function') {
      this.eventBus.emit(Events.TARGET, snapshot);
    }
    return snapshot;
  }

  /**
   * Returns the next target cup that will follow if the current cup is caught.
   * @returns {string}
   */
  peekNextTargetCup() {
    const nextStep = (this.cycleStep + 1) % this.cycle.length;
    return this.cycle[nextStep];
  }

  /**
   * Returns the current chapter index (1-4).
   * @returns {number}
   */
  getChapter() {
    return this.chapterIndex;
  }

  /**
   * Resets the sequencer back to Chapter 1 defaults.
   */
  reset() {
    this.setChapter(1);
  }
}

