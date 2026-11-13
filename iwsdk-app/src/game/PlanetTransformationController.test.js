/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Celestial Kendama - PlanetTransformationController Unit Tests
 * ============================================================================
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  PlanetTransformationController,
  TransformationState,
  TransformationPhase,
  DEFAULT_TRANSFORMATION_DURATIONS,
  Stage1To2Phase,
  Stage2To3Phase,
  Stage3To4Phase,
  Stage4To5Phase,
  TRANSITION_CONFIGS,
} from './PlanetTransformationController.js';
import { PlanetEvolutionController, EvolutionState } from '../gameplay/PlanetEvolutionController.js';
import { Events } from '../contracts/Interfaces.js';
import { EventBus } from '../contracts/EventBus.js';

describe('PlanetTransformationController', () => {
  let eventBus;
  let mockRenderer;
  let evolutionController;
  let transformationController;

  beforeEach(() => {
    eventBus = new EventBus();
    mockRenderer = {
      visualStage: 1.0,
      awakeningProgress: 0.0,
      transformationProgress: 0.0,
      isTransformationActive: false,
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
        if (params && typeof params.awakeningProgress === 'number') {
          this.awakeningProgress = params.awakeningProgress;
        }
        if (params && typeof params.oceanFill === 'number') {
          this.oceanFill = params.oceanFill;
        }
        if (params && typeof params.atmosphereDensity === 'number') {
          this.atmosphereDensity = params.atmosphereDensity;
        }
        if (params && typeof params.shieldCharge === 'number') {
          this.shieldCharge = params.shieldCharge;
        }
        if (params && typeof params.ringAlpha === 'number') {
          this.ringAlpha = params.ringAlpha;
        }
        if (params && typeof params.goldIgnited !== 'undefined') {
          this.goldIgnited = params.goldIgnited;
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

    evolutionController = new PlanetEvolutionController({
      initialStage: 1,
      energyRequired: 100,
      eventBus,
      planetoidRenderer: mockRenderer,
      exposeGlobal: false,
    });
  });

  afterEach(() => {
    if (transformationController) {
      transformationController.destroy();
      transformationController = null;
    }
    if (evolutionController) {
      evolutionController.destroy();
      evolutionController = null;
    }
    const globalScope = typeof window !== 'undefined' ? window : globalThis;
    if (globalScope && globalScope.celestialTransformation) {
      delete globalScope.celestialTransformation;
    }
  });

  // ==========================================================================
  // 1. Initialization
  // ==========================================================================
  describe('1. Initialization', () => {
    it('initializes in idle state with 0 progress and idle phase', () => {
      transformationController = new PlanetTransformationController({
        evolutionController,
        planetoidRenderer: mockRenderer,
        eventBus,
      });

      expect(transformationController.getState()).toBe(TransformationState.IDLE);
      expect(transformationController.getPhase()).toBe(TransformationPhase.IDLE);
      expect(transformationController.getProgress()).toBe(0.0);
      expect(transformationController.getTotalDuration()).toBeCloseTo(3.7, 1);
      expect(mockRenderer.startTransformation).not.toHaveBeenCalled();
    });

    it('exposes debug handle on global scope', () => {
      transformationController = new PlanetTransformationController({
        evolutionController,
        planetoidRenderer: mockRenderer,
        eventBus,
      });

      const globalScope = typeof window !== 'undefined' ? window : globalThis;
      const api = globalScope.celestialTransformation;
      expect(api).toBeDefined();
      expect(typeof api.getState).toBe('function');
      expect(typeof api.getProgress).toBe('function');
      expect(typeof api.getPhase).toBe('function');
      expect(typeof api.beginTransformation).toBe('function');
      expect(typeof api.cancelTransformation).toBe('function');
      expect(typeof api.reset).toBe('function');
      expect(typeof api.debugTransform).toBe('function');
    });
  });

  // ==========================================================================
  // 2. Eligibility & Gating
  // ==========================================================================
  describe('2. Eligibility & Achievement Gating', () => {
    it('rejects beginTransformation() before evolution requirement is reached', () => {
      transformationController = new PlanetTransformationController({
        evolutionController,
        planetoidRenderer: mockRenderer,
        eventBus,
      });

      // Evolution is at 0%
      expect(evolutionController.getState()).toBe(EvolutionState.PLAYING);
      expect(transformationController.canTransform()).toBe(false);

      const started = transformationController.beginTransformation();
      expect(started).toBe(false);
      expect(transformationController.getState()).toBe(TransformationState.IDLE);
      expect(mockRenderer.startTransformation).not.toHaveBeenCalled();
    });

    it('rejects beginTransformation() at partial evolution (e.g. 50%)', () => {
      transformationController = new PlanetTransformationController({
        evolutionController,
        planetoidRenderer: mockRenderer,
        eventBus,
      });

      evolutionController.addEvolutionEnergy(50);
      expect(evolutionController.getEvolutionProgress()).toBe(0.5);
      expect(transformationController.canTransform()).toBe(false);

      const started = transformationController.beginTransformation();
      expect(started).toBe(false);
      expect(transformationController.getState()).toBe(TransformationState.IDLE);
    });

    it('allows beginTransformation() when evolution reaches 100% (ready-to-transform)', () => {
      transformationController = new PlanetTransformationController({
        evolutionController,
        planetoidRenderer: mockRenderer,
        eventBus,
      });

      evolutionController.addEvolutionEnergy(100);
      expect(evolutionController.getState()).toBe(EvolutionState.READY_TO_TRANSFORM);
      expect(transformationController.canTransform()).toBe(true);

      const started = transformationController.beginTransformation();
      expect(started).toBe(true);
      expect(transformationController.getState()).toBe(TransformationState.TRANSFORMING);
      expect(mockRenderer.startTransformation).toHaveBeenCalledWith({ targetStage: 2.0 });
    });

    it('automatically begins transformation when autoTransform is true and evolution reaches 100%', () => {
      transformationController = new PlanetTransformationController({
        evolutionController,
        planetoidRenderer: mockRenderer,
        eventBus,
        autoTransform: true,
      });

      expect(transformationController.getState()).toBe(TransformationState.IDLE);
      evolutionController.addEvolutionEnergy(100);
      expect(evolutionController.getState()).toBe(EvolutionState.READY_TO_TRANSFORM);
      expect(transformationController.getState()).toBe(TransformationState.TRANSFORMING);
      expect(mockRenderer.startTransformation).toHaveBeenCalledWith({ targetStage: 2.0 });
    });

    it('rejects beginTransformation() if already at Stage 2', () => {
      evolutionController.resetAll(2);
      transformationController = new PlanetTransformationController({
        evolutionController,
        planetoidRenderer: mockRenderer,
        eventBus,
      });

      expect(transformationController.canTransform()).toBe(false);
      expect(transformationController.beginTransformation()).toBe(false);
    });
  });

  // ==========================================================================
  // 3. Transformation Start & Stage Retention During Cinematic
  // ==========================================================================
  describe('3. Transformation Start & Stage Retention', () => {
    it('enters transforming state with progress 0 while currentStage remains 1 throughout cinematic', () => {
      transformationController = new PlanetTransformationController({
        evolutionController,
        planetoidRenderer: mockRenderer,
        eventBus,
      });

      evolutionController.debugUnlockNextStage();

      const startSpy = vi.fn();
      eventBus.on(Events.TRANSFORMATION_STARTED, startSpy);

      transformationController.beginTransformation();

      expect(transformationController.getState()).toBe(TransformationState.TRANSFORMING);
      expect(transformationController.getPhase()).toBe(TransformationPhase.CHARGE);
      expect(transformationController.getProgress()).toBe(0.0);

      // CRITICAL: currentStage must remain 1 during the cinematic
      expect(evolutionController.getCurrentStage()).toBe(1);
      expect(evolutionController.getTargetStage()).toBe(2);

      expect(startSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          currentStage: 1,
          targetStage: 2,
        })
      );
    });
  });

  // ==========================================================================
  // 4. Progression Across All 5 Phases
  // ==========================================================================
  describe('4. Phase Choreography & Timing', () => {
    it('progresses sequentially through charge, geological_awakening, climax, reveal, and settle phases', () => {
      // Use test durations: charge 0.5s, awakening 1.0s, climax 0.5s, reveal 0.5s, settle 0.5s (total 3.0s)
      transformationController = new PlanetTransformationController({
        evolutionController,
        planetoidRenderer: mockRenderer,
        eventBus,
        durations: {
          [TransformationPhase.CHARGE]: 0.5,
          [TransformationPhase.GEOLOGICAL_AWAKENING]: 1.0,
          [TransformationPhase.CLIMAX]: 0.5,
          [TransformationPhase.STAGE_2_REVEAL]: 0.5,
          [TransformationPhase.SETTLE]: 0.5,
        },
      });

      const phaseEvents = [];
      eventBus.on(Events.TRANSFORMATION_PHASE, (e) => phaseEvents.push(e.phase));

      evolutionController.debugUnlockNextStage();
      transformationController.beginTransformation();

      expect(transformationController.getPhase()).toBe(TransformationPhase.CHARGE);

      // Advance through Phase 1: CHARGE (t = 0.25s)
      transformationController.update(0.25);
      expect(transformationController.getPhase()).toBe(TransformationPhase.CHARGE);
      expect(mockRenderer.updateTransformation).toHaveBeenCalled();

      // Advance into Phase 2: GEOLOGICAL_AWAKENING (t = 0.55s -> in awakening window 0.5 - 1.5s)
      transformationController.update(0.30);
      expect(transformationController.getPhase()).toBe(TransformationPhase.GEOLOGICAL_AWAKENING);

      // Mid-awakening (t = 1.0s)
      transformationController.update(0.45);
      expect(transformationController.getPhase()).toBe(TransformationPhase.GEOLOGICAL_AWAKENING);

      // Advance into Phase 3: CLIMAX (t = 1.6s -> in climax window 1.5 - 2.0s)
      transformationController.update(0.60);
      expect(transformationController.getPhase()).toBe(TransformationPhase.CLIMAX);

      // Advance into Phase 4: STAGE_2_REVEAL (t = 2.1s -> in reveal window 2.0 - 2.5s)
      transformationController.update(0.50);
      expect(transformationController.getPhase()).toBe(TransformationPhase.STAGE_2_REVEAL);

      // Advance into Phase 5: SETTLE (t = 2.6s -> in settle window 2.5 - 3.0s)
      transformationController.update(0.50);
      expect(transformationController.getPhase()).toBe(TransformationPhase.SETTLE);

      // Verify all phases occurred in order
      expect(phaseEvents).toContain(TransformationPhase.CHARGE);
      expect(phaseEvents).toContain(TransformationPhase.GEOLOGICAL_AWAKENING);
      expect(phaseEvents).toContain(TransformationPhase.CLIMAX);
      expect(phaseEvents).toContain(TransformationPhase.STAGE_2_REVEAL);
      expect(phaseEvents).toContain(TransformationPhase.SETTLE);
    });
  });

  // ==========================================================================
  // 5. Completion & Stage Commitment
  // ==========================================================================
  describe('5. Completion & Stage Commitment', () => {
    it('commits Stage 2, resets progression, calls completeTransformation(), and emits completion event', () => {
      transformationController = new PlanetTransformationController({
        evolutionController,
        planetoidRenderer: mockRenderer,
        eventBus,
        durations: {
          [TransformationPhase.CHARGE]: 0.2,
          [TransformationPhase.GEOLOGICAL_AWAKENING]: 0.2,
          [TransformationPhase.CLIMAX]: 0.2,
          [TransformationPhase.STAGE_2_REVEAL]: 0.2,
          [TransformationPhase.SETTLE]: 0.2,
        }, // Total 1.0s
      });

      const completeSpy = vi.fn();
      eventBus.on(Events.TRANSFORMATION_COMPLETED, completeSpy);

      evolutionController.debugUnlockNextStage();
      transformationController.beginTransformation();

      expect(evolutionController.getCurrentStage()).toBe(1);

      // Step across the entire duration (1.1s total)
      transformationController.update(1.1);

      // Transformation concludes
      expect(transformationController.getState()).toBe(TransformationState.IDLE);
      expect(transformationController.getPhase()).toBe(TransformationPhase.IDLE);
      expect(transformationController.getProgress()).toBe(0.0);

      // Stage advances to 2, target is 3, evolution resets, state is playing
      expect(evolutionController.getCurrentStage()).toBe(2);
      expect(evolutionController.getTargetStage()).toBe(3);
      expect(evolutionController.getEvolutionProgress()).toBe(0.0);
      expect(evolutionController.getEvolutionEnergy()).toBe(0);
      expect(evolutionController.getState()).toBe(EvolutionState.PLAYING);

      // Renderer was settled onto Stage 2
      expect(mockRenderer.finishTransformation).toHaveBeenCalledWith(2.0);

      // Completion event dispatched for future PlanetUnlockUI
      expect(completeSpy).toHaveBeenCalledWith({
        previousStage: 1,
        newStage: 2,
      });
    });
  });

  // ==========================================================================
  // 6. Safety & Cancellation
  // ==========================================================================
  describe('6. Safety & Cancellation', () => {
    it('repeated beginTransformation() calls while transforming are safely ignored', () => {
      transformationController = new PlanetTransformationController({
        evolutionController,
        planetoidRenderer: mockRenderer,
        eventBus,
      });

      evolutionController.debugUnlockNextStage();
      expect(transformationController.beginTransformation()).toBe(true);

      // Second call during active transformation
      expect(transformationController.beginTransformation()).toBe(false);
      expect(transformationController.getState()).toBe(TransformationState.TRANSFORMING);
    });

    it('cancelTransformation() cancels cinematic safely and restores idle state', () => {
      transformationController = new PlanetTransformationController({
        evolutionController,
        planetoidRenderer: mockRenderer,
        eventBus,
      });

      evolutionController.debugUnlockNextStage();
      transformationController.beginTransformation();
      transformationController.update(0.5);

      expect(transformationController.getState()).toBe(TransformationState.TRANSFORMING);

      transformationController.cancelTransformation();

      expect(transformationController.getState()).toBe(TransformationState.IDLE);
      expect(transformationController.getProgress()).toBe(0.0);
      expect(mockRenderer.cancelTransformation).toHaveBeenCalled();

      // Current stage is still 1, not prematurely advanced
      expect(evolutionController.getCurrentStage()).toBe(1);
    });

    it('premature requests do not mutate evolution state', () => {
      transformationController = new PlanetTransformationController({
        evolutionController,
        planetoidRenderer: mockRenderer,
        eventBus,
      });

      expect(evolutionController.getEvolutionEnergy()).toBe(0);
      expect(evolutionController.getEvolutionProgress()).toBe(0.0);

      transformationController.beginTransformation();

      expect(evolutionController.getEvolutionEnergy()).toBe(0);
      expect(evolutionController.getEvolutionProgress()).toBe(0.0);
      expect(evolutionController.getCurrentStage()).toBe(1);
    });
  });

  // ==========================================================================
  // 7. debugTransform() Shortcut
  // ==========================================================================
  describe('7. debugTransform() Shortcut', () => {
    it('debugTransform() unlocks ready-to-transform and starts the cinematic directly', () => {
      transformationController = new PlanetTransformationController({
        evolutionController,
        planetoidRenderer: mockRenderer,
        eventBus,
      });

      // Evolution is at 0
      expect(evolutionController.getEvolutionProgress()).toBe(0.0);

      const ok = transformationController.debugTransform();

      expect(ok).toBe(true);
      expect(transformationController.getState()).toBe(TransformationState.TRANSFORMING);
      expect(evolutionController.getState()).toBe(EvolutionState.READY_TO_TRANSFORM);
      expect(mockRenderer.startTransformation).toHaveBeenCalledWith({ targetStage: 2.0 });
    });
  });

  // ==========================================================================
  // 8. Stage 2 -> Stage 3 (Awakened Mineral -> Blue Ocean World)
  // ==========================================================================
  describe('8. Stage 2 -> Stage 3 Transformation', () => {
    it('executes full 4.0s sequence through cooling, moisture_formation, ocean_expansion, atmospheric_awakening, and stage_3_reveal', () => {
      evolutionController.resetAll(2);
      transformationController = new PlanetTransformationController({
        evolutionController,
        planetoidRenderer: mockRenderer,
        eventBus,
      });

      expect(transformationController.canTransform()).toBe(false);

      // Energy threshold reached
      evolutionController.debugUnlockNextStage();
      expect(transformationController.canTransform()).toBe(true);

      const startSpy = vi.fn();
      const phaseEvents = [];
      const completeSpy = vi.fn();
      eventBus.on(Events.TRANSFORMATION_STARTED, startSpy);
      eventBus.on(Events.TRANSFORMATION_PHASE, (e) => phaseEvents.push(e.phase));
      eventBus.on(Events.TRANSFORMATION_COMPLETED, completeSpy);

      const started = transformationController.beginTransformation();
      expect(started).toBe(true);
      expect(transformationController.getState()).toBe(TransformationState.TRANSFORMING);
      expect(transformationController.getTotalDuration()).toBeCloseTo(4.0, 1);
      expect(mockRenderer.startTransformation).toHaveBeenCalledWith({ targetStage: 3.0 });
      expect(startSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          currentStage: 2,
          targetStage: 3,
        })
      );

      // Phase 1: COOLING (0.0 .. 0.8s)
      expect(transformationController.getPhase()).toBe(Stage2To3Phase.COOLING);
      transformationController.update(0.4);
      expect(transformationController.getPhase()).toBe(Stage2To3Phase.COOLING);

      // Phase 2: MOISTURE_FORMATION (0.8 .. 1.7s)
      transformationController.update(0.6); // t = 1.0s
      expect(transformationController.getPhase()).toBe(Stage2To3Phase.MOISTURE_FORMATION);

      // Phase 3: OCEAN_EXPANSION (1.7 .. 2.8s)
      transformationController.update(0.9); // t = 1.9s
      expect(transformationController.getPhase()).toBe(Stage2To3Phase.OCEAN_EXPANSION);

      // Phase 4: ATMOSPHERIC_AWAKENING (2.8 .. 3.4s)
      transformationController.update(1.0); // t = 2.9s
      expect(transformationController.getPhase()).toBe(Stage2To3Phase.ATMOSPHERIC_AWAKENING);

      // Phase 5: STAGE_3_REVEAL (3.4 .. 4.0s)
      transformationController.update(0.7); // t = 3.6s
      expect(transformationController.getPhase()).toBe(Stage2To3Phase.STAGE_3_REVEAL);

      // Complete transformation
      transformationController.update(0.5); // t = 4.1s (past 4.0s)

      expect(transformationController.getState()).toBe(TransformationState.IDLE);
      expect(evolutionController.getCurrentStage()).toBe(3);
      expect(evolutionController.getTargetStage()).toBe(4);
      expect(mockRenderer.finishTransformation).toHaveBeenCalledWith(3.0);
      expect(completeSpy).toHaveBeenCalledWith({
        previousStage: 2,
        newStage: 3,
      });

      expect(phaseEvents).toContain(Stage2To3Phase.COOLING);
      expect(phaseEvents).toContain(Stage2To3Phase.MOISTURE_FORMATION);
      expect(phaseEvents).toContain(Stage2To3Phase.OCEAN_EXPANSION);
      expect(phaseEvents).toContain(Stage2To3Phase.ATMOSPHERIC_AWAKENING);
      expect(phaseEvents).toContain(Stage2To3Phase.STAGE_3_REVEAL);
    });
  });

  // ==========================================================================
  // 9. Stage 3 -> Stage 4 (Blue Ocean -> Living Green World)
  // ==========================================================================
  describe('9. Stage 3 -> Stage 4 Transformation', () => {
    it('executes full 3.6s sequence through atmospheric_enrichment, land_awakening, vegetation_emergence, and stage_4_reveal', () => {
      evolutionController.resetAll(3);
      transformationController = new PlanetTransformationController({
        evolutionController,
        planetoidRenderer: mockRenderer,
        eventBus,
      });

      evolutionController.debugUnlockNextStage();
      expect(transformationController.canTransform()).toBe(true);

      const phaseEvents = [];
      const completeSpy = vi.fn();
      eventBus.on(Events.TRANSFORMATION_PHASE, (e) => phaseEvents.push(e.phase));
      eventBus.on(Events.TRANSFORMATION_COMPLETED, completeSpy);

      const started = transformationController.beginTransformation();
      expect(started).toBe(true);
      expect(transformationController.getTotalDuration()).toBeCloseTo(3.6, 1);
      expect(mockRenderer.startTransformation).toHaveBeenCalledWith({ targetStage: 4.0 });

      // Phase 1: ATMOSPHERIC_ENRICHMENT (0.0 .. 0.7s)
      expect(transformationController.getPhase()).toBe(Stage3To4Phase.ATMOSPHERIC_ENRICHMENT);
      transformationController.update(0.35);
      expect(transformationController.getPhase()).toBe(Stage3To4Phase.ATMOSPHERIC_ENRICHMENT);

      // Phase 2: LAND_AWAKENING (0.7 .. 1.6s)
      transformationController.update(0.55); // t = 0.9s
      expect(transformationController.getPhase()).toBe(Stage3To4Phase.LAND_AWAKENING);

      // Phase 3: VEGETATION_EMERGENCE (1.6 .. 2.8s)
      transformationController.update(0.9); // t = 1.8s
      expect(transformationController.getPhase()).toBe(Stage3To4Phase.VEGETATION_EMERGENCE);

      // Phase 4: STAGE_4_REVEAL (2.8 .. 3.6s)
      transformationController.update(1.2); // t = 3.0s
      expect(transformationController.getPhase()).toBe(Stage3To4Phase.STAGE_4_REVEAL);

      // Complete transformation
      transformationController.update(0.7); // t = 3.7s

      expect(transformationController.getState()).toBe(TransformationState.IDLE);
      expect(evolutionController.getCurrentStage()).toBe(4);
      expect(evolutionController.getTargetStage()).toBe(5);
      expect(mockRenderer.finishTransformation).toHaveBeenCalledWith(4.0);
      expect(completeSpy).toHaveBeenCalledWith({
        previousStage: 3,
        newStage: 4,
      });

      expect(phaseEvents).toContain(Stage3To4Phase.ATMOSPHERIC_ENRICHMENT);
      expect(phaseEvents).toContain(Stage3To4Phase.LAND_AWAKENING);
      expect(phaseEvents).toContain(Stage3To4Phase.VEGETATION_EMERGENCE);
      expect(phaseEvents).toContain(Stage3To4Phase.STAGE_4_REVEAL);
    });
  });

  // ==========================================================================
  // 10. Stage 4 -> Stage 5 (Living Green -> Transcendent Celestial World)
  // ==========================================================================
  describe('10. Stage 4 -> Stage 5 Transformation', () => {
    it('executes full 4.3s sequence through global_energy_awakening, planetary_luminosity, celestial_atmosphere, ring_awakening, and celestial_ascension', () => {
      evolutionController.resetAll(4);
      transformationController = new PlanetTransformationController({
        evolutionController,
        planetoidRenderer: mockRenderer,
        eventBus,
      });

      evolutionController.debugUnlockNextStage();
      expect(transformationController.canTransform()).toBe(true);

      const phaseEvents = [];
      const completeSpy = vi.fn();
      eventBus.on(Events.TRANSFORMATION_PHASE, (e) => phaseEvents.push(e.phase));
      eventBus.on(Events.TRANSFORMATION_COMPLETED, completeSpy);

      const started = transformationController.beginTransformation();
      expect(started).toBe(true);
      expect(transformationController.getTotalDuration()).toBeCloseTo(4.3, 1);
      expect(mockRenderer.startTransformation).toHaveBeenCalledWith({ targetStage: 5.0 });

      // Phase 1: GLOBAL_ENERGY_AWAKENING (0.0 .. 0.8s)
      expect(transformationController.getPhase()).toBe(Stage4To5Phase.GLOBAL_ENERGY_AWAKENING);
      transformationController.update(0.4);
      expect(transformationController.getPhase()).toBe(Stage4To5Phase.GLOBAL_ENERGY_AWAKENING);

      // Phase 2: PLANETARY_LUMINOSITY (0.8 .. 1.9s)
      transformationController.update(0.6); // t = 1.0s
      expect(transformationController.getPhase()).toBe(Stage4To5Phase.PLANETARY_LUMINOSITY);

      // Phase 3: CELESTIAL_ATMOSPHERE (1.9 .. 2.7s)
      transformationController.update(1.0); // t = 2.0s
      expect(transformationController.getPhase()).toBe(Stage4To5Phase.CELESTIAL_ATMOSPHERE);

      // Phase 4: RING_AWAKENING (2.7 .. 3.5s)
      transformationController.update(0.9); // t = 2.9s
      expect(transformationController.getPhase()).toBe(Stage4To5Phase.RING_AWAKENING);

      // Phase 5: CELESTIAL_ASCENSION (3.5 .. 4.3s)
      transformationController.update(0.8); // t = 3.7s
      expect(transformationController.getPhase()).toBe(Stage4To5Phase.CELESTIAL_ASCENSION);

      // Complete transformation
      transformationController.update(0.8); // t = 4.5s

      expect(transformationController.getState()).toBe(TransformationState.IDLE);
      expect(evolutionController.getCurrentStage()).toBe(5);
      expect(evolutionController.getTargetStage()).toBe(null);
      expect(mockRenderer.finishTransformation).toHaveBeenCalledWith(5.0);
      expect(completeSpy).toHaveBeenCalledWith({
        previousStage: 4,
        newStage: 5,
      });

      expect(phaseEvents).toContain(Stage4To5Phase.GLOBAL_ENERGY_AWAKENING);
      expect(phaseEvents).toContain(Stage4To5Phase.PLANETARY_LUMINOSITY);
      expect(phaseEvents).toContain(Stage4To5Phase.CELESTIAL_ATMOSPHERE);
      expect(phaseEvents).toContain(Stage4To5Phase.RING_AWAKENING);
      expect(phaseEvents).toContain(Stage4To5Phase.CELESTIAL_ASCENSION);
    });
  });

  // ==========================================================================
  // 11. Multi-Stage Progression & Full Sequence (1 -> 2 -> 3 -> 4 -> 5)
  // ==========================================================================
  describe('11. Multi-Stage Progression & Final Stage Boundary', () => {
    it('progresses smoothly through all 4 transformations sequentially to Stage 5', () => {
      evolutionController.resetAll(1);
      transformationController = new PlanetTransformationController({
        evolutionController,
        planetoidRenderer: mockRenderer,
        eventBus,
      });

      // 1 -> 2
      expect(transformationController.debugTransform(1, 2)).toBe(true);
      transformationController.update(transformationController.getTotalDuration() + 0.1);
      expect(evolutionController.getCurrentStage()).toBe(2);

      // 2 -> 3
      expect(transformationController.debugTransform(2, 3)).toBe(true);
      transformationController.update(transformationController.getTotalDuration() + 0.1);
      expect(evolutionController.getCurrentStage()).toBe(3);

      // 3 -> 4
      expect(transformationController.debugTransform(3, 4)).toBe(true);
      transformationController.update(transformationController.getTotalDuration() + 0.1);
      expect(evolutionController.getCurrentStage()).toBe(4);

      // 4 -> 5
      expect(transformationController.debugTransform(4, 5)).toBe(true);
      transformationController.update(transformationController.getTotalDuration() + 0.1);
      expect(evolutionController.getCurrentStage()).toBe(5);

      // At Stage 5: No further transformation possible
      expect(transformationController.canTransform()).toBe(false);
      expect(transformationController.beginTransformation()).toBe(false);
    });

    it('debugTransform() with explicit arguments starts the specified pair directly', () => {
      transformationController = new PlanetTransformationController({
        evolutionController,
        planetoidRenderer: mockRenderer,
        eventBus,
      });

      // Test direct 2 -> 3
      expect(transformationController.debugTransform(2, 3)).toBe(true);
      expect(transformationController.getActiveTransition().key).toBe('2->3');
      transformationController.cancelTransformation();

      // Test direct 3 -> 4
      expect(transformationController.debugTransform(3, 4)).toBe(true);
      expect(transformationController.getActiveTransition().key).toBe('3->4');
      transformationController.cancelTransformation();

      // Test direct 4 -> 5
      expect(transformationController.debugTransform(4, 5)).toBe(true);
      expect(transformationController.getActiveTransition().key).toBe('4->5');
      transformationController.cancelTransformation();
    });
  });
});
