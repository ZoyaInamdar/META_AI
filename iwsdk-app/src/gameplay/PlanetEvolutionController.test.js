/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Celestial Kendama - PlanetEvolutionController Unit Tests
 * ============================================================================
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  PlanetEvolutionController,
  EvolutionState,
  DEFAULT_EVOLUTION_ENERGY_REQUIRED,
  MIN_STAGE,
  MAX_STAGE,
} from './PlanetEvolutionController.js';
import { Events, ScoreEvent, CatchType } from '../contracts/Interfaces.js';
import { EventBus } from '../contracts/EventBus.js';

describe('PlanetEvolutionController', () => {
  let eventBus;
  let mockRenderer;
  let controller;

  beforeEach(() => {
    eventBus = new EventBus();
    mockRenderer = {
      visualStage: 1.0,
      setVisualStage: vi.fn(function (s) {
        this.visualStage = s;
      }),
      getVisualStage: vi.fn(function () {
        return this.visualStage;
      }),
    };
  });

  afterEach(() => {
    if (controller) {
      controller.destroy();
      controller = null;
    }
    const globalScope = typeof window !== 'undefined' ? window : globalThis;
    if (globalScope && globalScope.celestialEvolution) {
      delete globalScope.celestialEvolution;
    }
  });

  // ==========================================================================
  // 1. Initial State
  // ==========================================================================
  describe('1. Initial State', () => {
    it('initializes with stage 1, target stage 2, progress 0, energy 0, and playing state', () => {
      controller = new PlanetEvolutionController({
        eventBus,
        planetoidRenderer: mockRenderer,
      });

      expect(controller.getCurrentStage()).toBe(1);
      expect(controller.getTargetStage()).toBe(2);
      expect(controller.getEvolutionProgress()).toBe(0.0);
      expect(controller.getEvolutionEnergy()).toBe(0);
      expect(controller.getState()).toBe(EvolutionState.PLAYING);
      expect(controller.getEvolutionEnergyRequired()).toBe(DEFAULT_EVOLUTION_ENERGY_REQUIRED);
      expect(controller.getVisualStage()).toBe(1.0);
      expect(mockRenderer.setVisualStage).toHaveBeenCalledWith(1.0);
    });

    it('supports custom initial stage and energy required threshold', () => {
      controller = new PlanetEvolutionController({
        initialStage: 3,
        energyRequired: 150,
        eventBus,
      });

      expect(controller.getCurrentStage()).toBe(3);
      expect(controller.getTargetStage()).toBe(4);
      expect(controller.getEvolutionEnergyRequired()).toBe(150);
      expect(controller.getVisualStage()).toBe(3.0);
    });

    it('clamps initial stage between 1 and 5', () => {
      const cUnder = new PlanetEvolutionController({ initialStage: 0, exposeGlobal: false });
      expect(cUnder.getCurrentStage()).toBe(1);
      cUnder.destroy();

      const cOver = new PlanetEvolutionController({ initialStage: 99, exposeGlobal: false });
      expect(cOver.getCurrentStage()).toBe(5);
      expect(cOver.getTargetStage()).toBeNull();
      cOver.destroy();
    });
  });

  // ==========================================================================
  // 2. Energy Accumulation & Progress Clamping
  // ==========================================================================
  describe('2. Energy Accumulation & Progress Clamping', () => {
    it('addEvolutionEnergy() increments energy and updates normalized progress [0.0 .. 1.0]', () => {
      controller = new PlanetEvolutionController({
        energyRequired: 100,
        eventBus,
        planetoidRenderer: mockRenderer,
      });

      controller.addEvolutionEnergy(25);
      expect(controller.getEvolutionEnergy()).toBe(25);
      expect(controller.getEvolutionProgress()).toBe(0.25);
      expect(controller.getVisualStage()).toBe(1.25);
      expect(controller.getState()).toBe(EvolutionState.PLAYING);

      controller.addEvolutionEnergy(30);
      expect(controller.getEvolutionEnergy()).toBe(55);
      expect(controller.getEvolutionProgress()).toBe(0.55);
      expect(controller.getVisualStage()).toBe(1.55);
      expect(controller.getState()).toBe(EvolutionState.PLAYING);
    });

    it('clamps progress strictly at 1.0 when energy reaches or exceeds threshold', () => {
      controller = new PlanetEvolutionController({
        energyRequired: 100,
        eventBus,
        planetoidRenderer: mockRenderer,
      });

      controller.addEvolutionEnergy(60);
      controller.addEvolutionEnergy(60); // 120 total

      expect(controller.getEvolutionProgress()).toBe(1.0);
      expect(controller.getVisualStage()).toBe(2.0);
      expect(controller.getState()).toBe(EvolutionState.READY_TO_TRANSFORM);
    });

    it('rejects invalid or non-positive energy amounts safely', () => {
      controller = new PlanetEvolutionController({ eventBus });

      controller.addEvolutionEnergy(-10);
      controller.addEvolutionEnergy(0);
      controller.addEvolutionEnergy(NaN);
      controller.addEvolutionEnergy('50');
      controller.addEvolutionEnergy(null);

      expect(controller.getEvolutionEnergy()).toBe(0);
      expect(controller.getEvolutionProgress()).toBe(0.0);
      expect(controller.getState()).toBe(EvolutionState.PLAYING);
    });

    it('setEvolutionProgress() sets normalized progress and computes proportional energy', () => {
      controller = new PlanetEvolutionController({
        energyRequired: 200,
        eventBus,
        planetoidRenderer: mockRenderer,
      });

      controller.setEvolutionProgress(0.75);
      expect(controller.getEvolutionProgress()).toBe(0.75);
      expect(controller.getEvolutionEnergy()).toBe(150);
      expect(controller.getVisualStage()).toBe(1.75);
      expect(controller.getState()).toBe(EvolutionState.PLAYING);

      // Clamps under 0.0 and over 1.0
      controller.setEvolutionProgress(-0.2);
      expect(controller.getEvolutionProgress()).toBe(0.0);

      controller.setEvolutionProgress(1.5);
      expect(controller.getEvolutionProgress()).toBe(1.0);
      expect(controller.getState()).toBe(EvolutionState.READY_TO_TRANSFORM);
    });
  });

  // ==========================================================================
  // 3. Threshold & Ready-to-Transform Transition
  // ==========================================================================
  describe('3. Threshold & Ready-to-Transform State Boundary', () => {
    it('transitions to ready-to-transform when progress reaches 100%', () => {
      controller = new PlanetEvolutionController({
        energyRequired: 100,
        eventBus,
        planetoidRenderer: mockRenderer,
      });

      const readySpy = vi.fn();
      eventBus.on(Events.STAGE_READY, readySpy);

      controller.addEvolutionEnergy(100);

      expect(controller.getState()).toBe(EvolutionState.READY_TO_TRANSFORM);
      expect(readySpy).toHaveBeenCalledTimes(1);
      expect(readySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          currentStage: 1,
          targetStage: 2,
          evolutionProgress: 1.0,
          state: EvolutionState.READY_TO_TRANSFORM,
          visualStage: 2.0,
        })
      );
    });

    it('does NOT automatically commit or advance the stage before completeTransformation() is called', () => {
      controller = new PlanetEvolutionController({
        energyRequired: 100,
        eventBus,
      });

      controller.addEvolutionEnergy(100);

      // Must remain on Stage 1 targeting Stage 2
      expect(controller.getCurrentStage()).toBe(1);
      expect(controller.getTargetStage()).toBe(2);
      expect(controller.getState()).toBe(EvolutionState.READY_TO_TRANSFORM);
    });

    it('stops accumulating excess energy once in ready-to-transform state', () => {
      controller = new PlanetEvolutionController({
        energyRequired: 100,
        eventBus,
      });

      controller.addEvolutionEnergy(100);
      expect(controller.getEvolutionProgress()).toBe(1.0);

      // Additional energy while waiting for transformation
      controller.addEvolutionEnergy(50);
      expect(controller.getEvolutionProgress()).toBe(1.0);
      expect(controller.getState()).toBe(EvolutionState.READY_TO_TRANSFORM);
    });
  });

  // ==========================================================================
  // 4. Complete Transformation API
  // ==========================================================================
  describe('4. Complete Transformation API', () => {
    it('advances currentStage to targetStage, resets progress to 0, and returns to playing state', () => {
      controller = new PlanetEvolutionController({
        energyRequired: 100,
        eventBus,
        planetoidRenderer: mockRenderer,
      });

      const completedSpy = vi.fn();
      eventBus.on(Events.STAGE_COMPLETED, completedSpy);

      // Evolve Stage 1 -> 2
      controller.setEvolutionProgress(1.0);
      expect(controller.getState()).toBe(EvolutionState.READY_TO_TRANSFORM);

      const result = controller.completeTransformation();

      expect(result).toEqual({
        previousStage: 1,
        currentStage: 2,
        targetStage: 3,
      });

      expect(controller.getCurrentStage()).toBe(2);
      expect(controller.getTargetStage()).toBe(3);
      expect(controller.getEvolutionProgress()).toBe(0.0);
      expect(controller.getEvolutionEnergy()).toBe(0);
      expect(controller.getState()).toBe(EvolutionState.PLAYING);
      expect(controller.getVisualStage()).toBe(2.0);

      expect(completedSpy).toHaveBeenCalledWith({
        previousStage: 1,
        currentStage: 2,
        targetStage: 3,
        visualStage: 2.0,
      });
    });

    it('advances sequentially through all stages: 1 -> 2 -> 3 -> 4 -> 5', () => {
      controller = new PlanetEvolutionController({
        energyRequired: 50,
        eventBus,
      });

      // 1 -> 2
      controller.debugUnlockNextStage();
      controller.completeTransformation();
      expect(controller.getCurrentStage()).toBe(2);
      expect(controller.getTargetStage()).toBe(3);

      // 2 -> 3
      controller.debugUnlockNextStage();
      controller.completeTransformation();
      expect(controller.getCurrentStage()).toBe(3);
      expect(controller.getTargetStage()).toBe(4);

      // 3 -> 4
      controller.debugUnlockNextStage();
      controller.completeTransformation();
      expect(controller.getCurrentStage()).toBe(4);
      expect(controller.getTargetStage()).toBe(5);

      // 4 -> 5
      controller.debugUnlockNextStage();
      controller.completeTransformation();
      expect(controller.getCurrentStage()).toBe(5);
      expect(controller.getTargetStage()).toBeNull();
      expect(controller.getVisualStage()).toBe(5.0);
    });
  });

  // ==========================================================================
  // 5. Stage 5 Finale (No Invalid Stage 6)
  // ==========================================================================
  describe('5. Stage 5 Finale State', () => {
    it('sets targetStage to null at Stage 5 and rejects further progression', () => {
      controller = new PlanetEvolutionController({
        initialStage: 5,
        eventBus,
        planetoidRenderer: mockRenderer,
      });

      expect(controller.getCurrentStage()).toBe(5);
      expect(controller.getTargetStage()).toBeNull();
      expect(controller.getVisualStage()).toBe(5.0);

      // Adding energy at max stage does nothing
      controller.addEvolutionEnergy(100);
      expect(controller.getCurrentStage()).toBe(5);
      expect(controller.getTargetStage()).toBeNull();
      expect(controller.getEvolutionProgress()).toBe(0.0);

      // Complete transformation returns null and creates no Stage 6
      const result = controller.completeTransformation();
      expect(result).toBeNull();
      expect(controller.getCurrentStage()).toBe(5);
      expect(controller.getTargetStage()).toBeNull();
    });
  });

  // ==========================================================================
  // 6. Debug API (window.celestialEvolution)
  // ==========================================================================
  describe('6. Debug API (window.celestialEvolution)', () => {
    it('exposes full debug suite on window.celestialEvolution', () => {
      controller = new PlanetEvolutionController({
        energyRequired: 100,
        eventBus,
        planetoidRenderer: mockRenderer,
      });

      const globalScope = typeof window !== 'undefined' ? window : globalThis;
      const api = globalScope.celestialEvolution;
      expect(api).toBeDefined();
      expect(typeof api.getState).toBe('function');
      expect(typeof api.getCurrentStage).toBe('function');
      expect(typeof api.getTargetStage).toBe('function');
      expect(typeof api.getEvolutionProgress).toBe('function');
      expect(typeof api.getEvolutionEnergy).toBe('function');
      expect(typeof api.getEvolutionEnergyRequired).toBe('function');
      expect(typeof api.addEvolutionEnergy).toBe('function');
      expect(typeof api.setEvolutionProgress).toBe('function');
      expect(typeof api.debugUnlockNextStage).toBe('function');
      expect(typeof api.resetEvolution).toBe('function');
      expect(typeof api.completeTransformation).toBe('function');
    });

    it('debugUnlockNextStage() sets progress to 1.0 and state to ready-to-transform', () => {
      controller = new PlanetEvolutionController({ eventBus });

      const state = controller.debugUnlockNextStage();
      expect(state).toBe(EvolutionState.READY_TO_TRANSFORM);
      expect(controller.getEvolutionProgress()).toBe(1.0);
      expect(controller.getCurrentStage()).toBe(1);
    });

    it('resetEvolution() clears progress and energy, restoring playing state', () => {
      controller = new PlanetEvolutionController({ eventBus });

      controller.addEvolutionEnergy(75);
      expect(controller.getEvolutionProgress()).toBe(0.75);

      const state = controller.resetEvolution();
      expect(state).toBe(EvolutionState.PLAYING);
      expect(controller.getEvolutionProgress()).toBe(0.0);
      expect(controller.getEvolutionEnergy()).toBe(0);
    });
  });

  // ==========================================================================
  // 7. Gameplay EventBus Integration (Events.SCORE)
  // ==========================================================================
  describe('7. Gameplay EventBus Integration (Events.SCORE)', () => {
    it('automatically consumes awardedEnergy from Events.SCORE', () => {
      controller = new PlanetEvolutionController({
        energyRequired: 100,
        eventBus,
        planetoidRenderer: mockRenderer,
      });

      // Emulate GameLoop score event with canonical ScoreEvent wrapper
      const scoreEvent = new ScoreEvent('flight_1', CatchType.CLEAN, 25, 1);
      eventBus.emit(Events.SCORE, {
        payload: scoreEvent,
        awardedEnergy: scoreEvent.awardedEnergy,
      });

      expect(controller.getEvolutionEnergy()).toBe(25);
      expect(controller.getEvolutionProgress()).toBe(0.25);
      expect(controller.getVisualStage()).toBe(1.25);
      expect(mockRenderer.setVisualStage).toHaveBeenCalledWith(1.25);

      // Second score event
      eventBus.emit(Events.SCORE, {
        awardedEnergy: 40,
      });

      expect(controller.getEvolutionEnergy()).toBe(65);
      expect(controller.getEvolutionProgress()).toBe(0.65);
      expect(controller.getVisualStage()).toBe(1.65);
    });

    it('reaches ready-to-transform after multiple gameplay catches without pausing gameplay', () => {
      controller = new PlanetEvolutionController({
        energyRequired: 60,
        eventBus,
      });

      eventBus.emit(Events.SCORE, { awardedEnergy: 20 });
      expect(controller.getState()).toBe(EvolutionState.PLAYING);

      eventBus.emit(Events.SCORE, { awardedEnergy: 20 });
      expect(controller.getState()).toBe(EvolutionState.PLAYING);

      eventBus.emit(Events.SCORE, { awardedEnergy: 20 });
      expect(controller.getState()).toBe(EvolutionState.READY_TO_TRANSFORM);
      expect(controller.getEvolutionProgress()).toBe(1.0);
    });
  });

  // ==========================================================================
  // 8. Visual Mapping: evolutionProgress -> visualStage
  // ==========================================================================
  describe('8. Visual Stage Mapping', () => {
    it('maps evolutionProgress continuously across stages to visualStage', () => {
      controller = new PlanetEvolutionController({
        energyRequired: 100,
        eventBus,
        planetoidRenderer: mockRenderer,
      });

      // Stage 1 -> 2
      controller.setEvolutionProgress(0.0);
      expect(controller.getVisualStage()).toBe(1.0);

      controller.setEvolutionProgress(0.5);
      expect(controller.getVisualStage()).toBe(1.5);

      controller.setEvolutionProgress(0.9);
      expect(controller.getVisualStage()).toBe(1.9);

      controller.setEvolutionProgress(1.0);
      expect(controller.getVisualStage()).toBe(2.0);

      // Commit to Stage 2 -> 3
      controller.completeTransformation();
      expect(controller.getVisualStage()).toBe(2.0);

      controller.setEvolutionProgress(0.5);
      expect(controller.getVisualStage()).toBe(2.5);

      controller.setEvolutionProgress(1.0);
      expect(controller.getVisualStage()).toBe(3.0);
    });
  });
});
