/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Celestial Kendama - Real Gameplay-to-Evolution Pipeline Integration Tests
 * ============================================================================
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Group, Vector3, Euler } from 'three';
import { EventBus } from '../src/contracts/EventBus.js';
import { Events, CatchType, ScoreEvent } from '../src/contracts/Interfaces.js';
import { ScoreManager } from '../src/game/ScoreManager.js';
import { PlanetEvolutionController, EvolutionState } from '../src/gameplay/PlanetEvolutionController.js';
import {
  PlanetTransformationController,
  TransformationState,
  TransformationPhase,
} from '../src/game/PlanetTransformationController.js';
import {
  PlanetUnlockCelebration,
  CelebrationState,
  CelebrationPhase,
} from '../src/ui/PlanetUnlockCelebration.js';

describe('Gameplay-to-Evolution Full Pipeline Audit & Verification', () => {
  let eventBus;
  let scoreManager;
  let mockRenderer;
  let mockUnlockUI;
  let evolutionController;
  let transformationController;
  let unlockCelebration;
  let parentGroup;

  beforeEach(() => {
    eventBus = new EventBus();
    scoreManager = new ScoreManager();
    parentGroup = new Group();

    mockRenderer = {
      visualStage: 1.0,
      awakeningProgress: 0.0,
      transformationProgress: 0.0,
      isTransformationActive: false,
      coreMesh: {
        rotation: new Euler(0, 0, 0),
      },
      getAnchorPosition: () => new Vector3(0, 1.48, -1.80),
      getScale: () => 17.0,
      scaleFactor: 17.0,
      radius: 0.035,
      startTransformation: vi.fn(function () {
        this.isTransformationActive = true;
        this.transformationProgress = 0.0;
        return this;
      }),
      updateTransformation: vi.fn(function (progress, _phase, params) {
        this.transformationProgress = progress;
        if (params && typeof params.visualStage === 'number') {
          this.visualStage = params.visualStage;
        }
        return this;
      }),
      finishTransformation: vi.fn(function (stage = 2.0) {
        this.isTransformationActive = false;
        this.transformationProgress = 0.0;
        this.visualStage = stage;
        return this;
      }),
      cancelTransformation: vi.fn(function () {
        this.isTransformationActive = false;
        this.transformationProgress = 0.0;
        return this;
      }),
      setVisualStage: vi.fn(function (s) {
        this.visualStage = s;
      }),
      getVisualStage: vi.fn(function () {
        return this.visualStage;
      }),
    };

    mockUnlockUI = {
      showStage: vi.fn(),
      hide: vi.fn(),
      isVisible: vi.fn(() => false),
    };

    evolutionController = new PlanetEvolutionController({
      initialStage: 1,
      energyRequired: 100,
      eventBus,
      planetoidRenderer: mockRenderer,
      exposeGlobal: false,
    });

    transformationController = new PlanetTransformationController({
      evolutionController,
      planetoidRenderer: mockRenderer,
      eventBus,
      autoTransform: true,
      exposeGlobal: false,
    });

    unlockCelebration = new PlanetUnlockCelebration({
      eventBus,
      planetoidRenderer: mockRenderer,
      unlockUI: mockUnlockUI,
      parentGroup,
      exposeGlobal: false,
    });
  });

  afterEach(() => {
    if (unlockCelebration) {
      unlockCelebration.destroy();
      unlockCelebration = null;
    }
    if (transformationController) {
      transformationController.destroy();
      transformationController = null;
    }
    if (evolutionController) {
      evolutionController.destroy();
      evolutionController = null;
    }
  });

  // Helper to simulate a real scored Kendama catch flowing through ScoreManager and EventBus
  let flightCounter = 1;
  function simulateScoredCatch(catchType = CatchType.CLEAN, options = {}) {
    const flightId = options.flightId ?? `flight_${flightCounter++}`;
    const catchResult = {
      type: catchType,
      alignmentAngle: options.alignmentAngle ?? 0.1,
      targetCup: options.targetCup ?? 'big',
      impactVelocity: options.impactVelocity ?? 0.8,
    };
    const scoreObj = scoreManager.processCatchEvent(catchResult, Date.now(), flightId);
    const scoreEvent = new ScoreEvent(scoreObj);
    const eventPayload = {
      payload: scoreEvent,
      awardedEnergy: scoreEvent.awardedEnergy,
    };
    eventBus.emit(Events.SCORE, eventPayload);
    return scoreEvent;
  }

  // ==========================================================================
  // 1. SCORE -> ENERGY
  // ==========================================================================
  describe('1. Real Gameplay Score -> Evolution Energy Ingestion', () => {
    it('awards energy from a real scored catch and accumulates exactly once', () => {
      expect(evolutionController.getEvolutionEnergy()).toBe(0);
      expect(evolutionController.getEvolutionProgress()).toBe(0.0);

      const scoreEvt = simulateScoredCatch(CatchType.CLEAN);
      const expectedAward = scoreEvt.awardedEnergy;
      expect(expectedAward).toBeGreaterThan(0);

      // Verify energy accumulated exactly once (no double counting)
      expect(evolutionController.getEvolutionEnergy()).toBe(expectedAward);
      expect(evolutionController.getEvolutionProgress()).toBeCloseTo(expectedAward / 100, 4);
    });

    it('supports backward compatible score event shapes ({ awardedEnergy, payload: { awardedEnergy }, raw number })', () => {
      // Shape A: GameLoop canonical wrapped payload
      eventBus.emit(Events.SCORE, { payload: { awardedEnergy: 15 }, awardedEnergy: 15 });
      expect(evolutionController.getEvolutionEnergy()).toBe(15);

      // Shape B: Object with payload only
      eventBus.emit(Events.SCORE, { payload: { awardedEnergy: 10 } });
      expect(evolutionController.getEvolutionEnergy()).toBe(25);

      // Shape C: Raw number
      eventBus.emit(Events.SCORE, 20);
      expect(evolutionController.getEvolutionEnergy()).toBe(45);
    });
  });

  // ==========================================================================
  // 2. MULTIPLE SCORES ACCUMULATION
  // ==========================================================================
  describe('2. Multiple Gameplay Catches & Energy Accumulation', () => {
    it('accumulates energy progressively across multiple successful catches', () => {
      simulateScoredCatch(CatchType.CLEAN); // catch 1 (~32 energy)
      const firstEnergy = evolutionController.getEvolutionEnergy();
      expect(firstEnergy).toBeGreaterThan(0);
      expect(evolutionController.getState()).toBe(EvolutionState.PLAYING);

      simulateScoredCatch(CatchType.CLEAN); // catch 2 (total ~70 energy < 100)
      const secondEnergy = evolutionController.getEvolutionEnergy();
      expect(secondEnergy).toBeGreaterThan(firstEnergy);
      expect(evolutionController.getState()).toBe(EvolutionState.PLAYING);
      expect(evolutionController.getEvolutionProgress()).toBeLessThan(1.0);
    });
  });

  // ==========================================================================
  // 3. THRESHOLD REACHED & READY STATE
  // ==========================================================================
  describe('3. Threshold Reached & Stage Readiness', () => {
    it('transitions to ready-to-transform and emits STAGE_READY when threshold is reached', () => {
      const readySpy = vi.fn();
      eventBus.on(Events.STAGE_READY, readySpy);

      // Award 40 + 40 = 80 (< 100)
      eventBus.emit(Events.SCORE, { awardedEnergy: 40 });
      eventBus.emit(Events.SCORE, { awardedEnergy: 40 });
      expect(evolutionController.getState()).toBe(EvolutionState.PLAYING);
      expect(readySpy).not.toHaveBeenCalled();

      // Award 25 -> total 105 (>= 100)
      eventBus.emit(Events.SCORE, { awardedEnergy: 25 });
      expect(evolutionController.getState()).toBe(EvolutionState.READY_TO_TRANSFORM);
      expect(evolutionController.getEvolutionProgress()).toBe(1.0);
      expect(readySpy).toHaveBeenCalledTimes(1);
      expect(readySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          currentStage: 1,
          targetStage: 2,
          evolutionProgress: 1.0,
        })
      );
    });
  });

  // ==========================================================================
  // 4. TRANSFORMATION TRIGGER (Ready state causes exactly one transformation)
  // ==========================================================================
  describe('4. Automatic Transformation Trigger', () => {
    it('ready state automatically initiates exactly one transformation', () => {
      const startSpy = vi.fn();
      eventBus.on(Events.TRANSFORMATION_STARTED, startSpy);

      expect(transformationController.getState()).toBe(TransformationState.IDLE);

      // Reach threshold through real score events
      eventBus.emit(Events.SCORE, { awardedEnergy: 100 });

      // Transformation automatically starts!
      expect(transformationController.getState()).toBe(TransformationState.TRANSFORMING);
      expect(transformationController.getPhase()).toBe(TransformationPhase.CHARGE);
      expect(startSpy).toHaveBeenCalledTimes(1);
      expect(startSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          currentStage: 1,
          targetStage: 2,
        })
      );
    });
  });

  // ==========================================================================
  // 5. TRANSFORMATION LOCKING (Scoring during transformation is locked out)
  // ==========================================================================
  describe('5. Transformation Locking & Concurrency Protection', () => {
    it('locks out additional scoring from triggering duplicate transformations or stage skips', () => {
      const startSpy = vi.fn();
      eventBus.on(Events.TRANSFORMATION_STARTED, startSpy);

      // Reach 100% threshold to start transformation
      eventBus.emit(Events.SCORE, { awardedEnergy: 100 });
      expect(transformationController.getState()).toBe(TransformationState.TRANSFORMING);
      expect(startSpy).toHaveBeenCalledTimes(1);

      // During active cinematic, generate multiple score events
      eventBus.emit(Events.SCORE, { awardedEnergy: 50 });
      eventBus.emit(Events.SCORE, { awardedEnergy: 50 });
      eventBus.emit(Events.SCORE, { awardedEnergy: 50 });

      // Must remain in current transformation, no second transformation launched
      expect(transformationController.getState()).toBe(TransformationState.TRANSFORMING);
      expect(startSpy).toHaveBeenCalledTimes(1);
      expect(evolutionController.getCurrentStage()).toBe(1);
      expect(evolutionController.getTargetStage()).toBe(2);
    });
  });

  // ==========================================================================
  // 6. COMPLETION ADVANCES EXACTLY ONE STAGE
  // ==========================================================================
  describe('6. Transformation Completion & Stage Advancement', () => {
    it('commits Stage 2, resets progress, and settles transformation controller on completion', () => {
      const completedSpy = vi.fn();
      eventBus.on(Events.TRANSFORMATION_COMPLETED, completedSpy);

      // Reach threshold
      eventBus.emit(Events.SCORE, { awardedEnergy: 100 });
      expect(transformationController.getState()).toBe(TransformationState.TRANSFORMING);

      // Simulate frame ticks through total duration (3.7s for 1->2)
      transformationController.update(3.75);

      // Verified: transformation completed
      expect(completedSpy).toHaveBeenCalledTimes(1);
      expect(completedSpy).toHaveBeenCalledWith({
        previousStage: 1,
        newStage: 2,
      });

      // Stage 2 is now authoritative
      expect(evolutionController.getCurrentStage()).toBe(2);
      expect(evolutionController.getTargetStage()).toBe(3);
      expect(evolutionController.getState()).toBe(EvolutionState.PLAYING);
      expect(evolutionController.getEvolutionProgress()).toBe(0.0);
      expect(evolutionController.getEvolutionEnergy()).toBe(0);

      expect(transformationController.getState()).toBe(TransformationState.IDLE);
      expect(mockRenderer.finishTransformation).toHaveBeenCalledWith(2);
    });
  });

  // ==========================================================================
  // 7. MULTI-STAGE PROGRESSION (Stage 1 -> 2 -> 3 -> 4 -> 5)
  // ==========================================================================
  describe('7. Multi-Stage Progression from Gameplay (Stages 1 through 5)', () => {
    it('advances cleanly across all stages through repeated gameplay scoring up to terminal Stage 5', () => {
      // --- Stage 1 -> 2 ---
      eventBus.emit(Events.SCORE, { awardedEnergy: 100 });
      expect(transformationController.getState()).toBe(TransformationState.TRANSFORMING);
      transformationController.update(3.75);
      expect(evolutionController.getCurrentStage()).toBe(2);
      expect(evolutionController.getTargetStage()).toBe(3);
      expect(transformationController.getState()).toBe(TransformationState.IDLE);

      // --- Stage 2 -> 3 ---
      eventBus.emit(Events.SCORE, { awardedEnergy: 100 });
      expect(transformationController.getState()).toBe(TransformationState.TRANSFORMING);
      expect(transformationController.getActiveTransition().key).toBe('2->3');
      transformationController.update(4.05); // 4.0s for 2->3
      expect(evolutionController.getCurrentStage()).toBe(3);
      expect(evolutionController.getTargetStage()).toBe(4);
      expect(transformationController.getState()).toBe(TransformationState.IDLE);

      // --- Stage 3 -> 4 ---
      eventBus.emit(Events.SCORE, { awardedEnergy: 100 });
      expect(transformationController.getState()).toBe(TransformationState.TRANSFORMING);
      expect(transformationController.getActiveTransition().key).toBe('3->4');
      transformationController.update(3.65); // 3.6s for 3->4
      expect(evolutionController.getCurrentStage()).toBe(4);
      expect(evolutionController.getTargetStage()).toBe(5);
      expect(transformationController.getState()).toBe(TransformationState.IDLE);

      // --- Stage 4 -> 5 ---
      eventBus.emit(Events.SCORE, { awardedEnergy: 100 });
      expect(transformationController.getState()).toBe(TransformationState.TRANSFORMING);
      expect(transformationController.getActiveTransition().key).toBe('4->5');
      transformationController.update(4.35); // 4.3s for 4->5
      expect(evolutionController.getCurrentStage()).toBe(5);
      expect(evolutionController.getTargetStage()).toBe(null); // Stage 5 is terminal
      expect(transformationController.getState()).toBe(TransformationState.IDLE);

      // Post-Stage 5: further scoring does not corrupt or trigger Stage 6
      eventBus.emit(Events.SCORE, { awardedEnergy: 100 });
      expect(evolutionController.getCurrentStage()).toBe(5);
      expect(evolutionController.getTargetStage()).toBe(null);
      expect(transformationController.getState()).toBe(TransformationState.IDLE);
    });
  });

  // ==========================================================================
  // 8. CELEBRATION & UNLOCK UI HANDOFF
  // ==========================================================================
  describe('8. Celebration & Unlock Plaque Presentation', () => {
    it('produces exactly one celebration and one unlock plaque per transformation', () => {
      // Stage 1 -> 2
      eventBus.emit(Events.SCORE, { awardedEnergy: 100 });
      transformationController.update(3.75);

      // Transformation completed: celebration should automatically start
      expect(unlockCelebration.isActive()).toBe(true);
      expect(unlockCelebration.getState()).toBe(CelebrationState.SPINNING);
      expect(unlockCelebration.targetStage).toBe(2);

      // Before celebration finishes, unlock plaque must not be shown
      unlockCelebration.update(2.0);
      expect(mockUnlockUI.showStage).not.toHaveBeenCalled();

      // Celebration concludes at 3.80s
      unlockCelebration.update(1.85); // Total 3.85s >= 3.80s
      expect(unlockCelebration.getState()).toBe(CelebrationState.COMPLETE);
      expect(mockUnlockUI.showStage).toHaveBeenCalledTimes(1);
      expect(mockUnlockUI.showStage).toHaveBeenCalledWith(2);
    });
  });

  // ==========================================================================
  // 9. CLEANUP & LISTENER LIFECYCLE (No duplicate listeners on re-init)
  // ==========================================================================
  describe('9. Listener Lifecycle & Duplicate Prevention', () => {
    it('does not register duplicate SCORE listeners on repeated controller re-init or bus switching', () => {
      // Re-bind event bus
      evolutionController.setEventBus(eventBus);
      evolutionController.setEventBus(eventBus);

      // Score 25 energy
      eventBus.emit(Events.SCORE, { awardedEnergy: 25 });

      // Must be exactly 25, not 50 or 75
      expect(evolutionController.getEvolutionEnergy()).toBe(25);
    });

    it('destroy() unregisters listeners cleanly so destroyed instances ignore events', () => {
      evolutionController.destroy();
      eventBus.emit(Events.SCORE, { awardedEnergy: 50 });
      expect(evolutionController.getEvolutionEnergy()).toBe(0);
    });
  });
});
