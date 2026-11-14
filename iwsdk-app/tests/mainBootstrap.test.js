/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Production Bootstrap & Subsystem Integration Tests
 * Role: Person B (Physics & Mission Lead / main.js)
 * ============================================================================
 *
 * Verifies that the production browser bootstrap path:
 * 1. Instantiates real production MissionController, TrickSequencer, and OrbitalEngine
 *    (with Chapter 1 initial bodies: Star 1 and Planet), rather than fallback stubs.
 * 2. Emits initial Events.TARGET after GameLoop subscribes so activeTargetCup
 *    transitions from 'spike' fallback to 'big'.
 * 3. Correctly wires Events.SCORE, Events.CATCH, and Events.MISS into MissionController.
 * 4. Preserves backward compatibility by allowing explicit subsystem overrides.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GamePipeline, initGame, DefaultMissionController, DefaultOrbitalEngine } from '../src/main.js';
import { MissionController } from '../src/mission/MissionController.js';
import { TrickSequencer } from '../src/mission/TrickSequencer.js';
import { OrbitalEngine } from '../src/physics/OrbitalEngine.js';
import { BinarySystem } from '../src/physics/BinarySystem.js';
import { CaptureBurn } from '../src/physics/CaptureBurn.js';
import { GameLoop } from '../src/game/GameLoop.js';
import { EventBus } from '../src/contracts/EventBus.js';
import { Events, CupKey, TrickType, CatchType } from '../src/contracts/Interfaces.js';
import { MISSION_THRESHOLDS } from '../src/mission/missionConfig.js';

describe('Production Subsystem Bootstrap (main.js)', () => {
  let eventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  describe('1. Real Production Class Instantiation', () => {
    it('GamePipeline defaults to real MissionController and OrbitalEngine instances', () => {
      const pipeline = new GamePipeline({ eventBus });

      expect(pipeline.missionController).toBeInstanceOf(MissionController);
      expect(pipeline.orbitalEngine).toBeInstanceOf(OrbitalEngine);
      expect(pipeline.missionController).not.toBeInstanceOf(DefaultMissionController);
      expect(pipeline.orbitalEngine).not.toBeInstanceOf(DefaultOrbitalEngine);
    });

    it('OrbitalEngine initializes with Chapter 1 Star 1 and Planet bodies', () => {
      const pipeline = new GamePipeline({ eventBus });
      const engine = pipeline.orbitalEngine;

      expect(engine.getBodyCount()).toBe(2);

      // Star 1: index 0 at origin, mass 1.0, fixed
      expect(engine.getBodyId(0)).toBe('star_1');
      expect(engine.getBodyMass(0)).toBeCloseTo(1.0);
      expect(engine.isBodyFixed(0)).toBe(true);
      const starPos = engine.getBodyPosition(0);
      expect(starPos.x).toBeCloseTo(0.0);
      expect(starPos.y).toBeCloseTo(0.0);
      expect(starPos.z).toBeCloseTo(0.0);

      // Planet: index 1 at (1.0, 0, 0), mass 1e-6, vy = 1.55, dynamic
      expect(engine.getBodyId(1)).toBe('planet');
      expect(engine.getBodyMass(1)).toBeCloseTo(1e-6);
      expect(engine.isBodyFixed(1)).toBe(false);
      const planetPos = engine.getBodyPosition(1);
      expect(planetPos.x).toBeCloseTo(1.0);
      expect(planetPos.y).toBeCloseTo(0.0);
      expect(planetPos.z).toBeCloseTo(0.0);
      const planetVel = engine.getBodyVelocity(1);
      expect(planetVel.x).toBeCloseTo(0.0);
      expect(planetVel.y).toBeCloseTo(1.55);
      expect(planetVel.z).toBeCloseTo(0.0);
    });

    it('MissionController is wired with real TrickSequencer, BinarySystem, and CaptureBurn', () => {
      const pipeline = new GamePipeline({ eventBus });
      const mc = pipeline.missionController;

      expect(mc.trickSequencer).toBeInstanceOf(TrickSequencer);
      expect(mc.binarySystem).toBeInstanceOf(BinarySystem);
      expect(mc.captureBurn).toBeInstanceOf(CaptureBurn);
      expect(mc.orbitalEngine).toBe(pipeline.orbitalEngine);
    });

    it('initGame() constructs real production subsystems and returns gameLoop and pipeline', () => {
      const game = initGame({ eventBus, manualTick: true });

      expect(game.pipeline).toBeInstanceOf(GamePipeline);
      expect(game.pipeline.missionController).toBeInstanceOf(MissionController);
      expect(game.pipeline.orbitalEngine).toBeInstanceOf(OrbitalEngine);
      expect(game.gameLoop).toBeInstanceOf(GameLoop);

      game.stop();
    });
  });

  describe('2. Initial Events.TARGET Emission & GameLoop Synchronization', () => {
    it('initGame() ensures GameLoop receives initial target so activeTargetCup is "big" (not "spike")', () => {
      const game = initGame({ eventBus, manualTick: true });

      // Default initialCup in GameLoop is 'spike', but initGame must emit Events.TARGET
      // so activeTargetCup immediately updates to 'big'
      expect(game.gameLoop.activeTargetCup).toBe(CupKey.BIG);

      const target = game.pipeline.missionController.getTargetState();
      expect(target.cupKey).toBe(CupKey.BIG);
      expect(target.trick).toBe(TrickType.SINGLE);
      expect(target.sequenceIndex).toBe(0);

      game.stop();
    });

    it('wires injected GameLoop and emits initial target to transition it from "spike" to "big"', () => {
      // Create a GameLoop directly (defaults activeTargetCup to 'spike')
      const customGameLoop = new GameLoop({ eventBus });
      expect(customGameLoop.activeTargetCup).toBe(CupKey.SPIKE);

      // Pass into initGame
      const game = initGame({
        eventBus,
        gameLoop: customGameLoop,
        manualTick: true
      });

      expect(customGameLoop.activeTargetCup).toBe(CupKey.BIG);
      expect(game.gameLoop).toBe(customGameLoop);

      game.stop();
    });

    it('GamePipeline constructor with gameLoop option automatically emits initial target', () => {
      const customGameLoop = new GameLoop({ eventBus });
      expect(customGameLoop.activeTargetCup).toBe(CupKey.SPIKE);

      const pipeline = new GamePipeline({
        eventBus,
        gameLoop: customGameLoop
      });

      expect(customGameLoop.activeTargetCup).toBe(CupKey.BIG);
    });
  });

  describe('3. Score Progression & Intra-Frame Event Dispatch', () => {
    it('Events.SCORE on eventBus advances MissionController energy and updates PlanetState', () => {
      const game = initGame({ eventBus, manualTick: true });
      const mc = game.pipeline.missionController;

      expect(mc.cosmicEnergy).toBe(0);

      // Emit SCORE event from Person A scoring engine
      eventBus.emit(Events.SCORE, {
        eventId: 'score_1',
        catchType: CatchType.CLEAN,
        awardedEnergy: 100
      });

      expect(mc.cosmicEnergy).toBe(100);

      // Tick the pipeline to trigger Stage 4 mission easing and Stage 5 physics step
      game.tick(16.6667, null, 1 / 120);

      const planetState = mc.getPlanetState();
      expect(planetState.kintsugiVeinGlow).toBeGreaterThan(0.0);

      const missionState = mc.getMissionState();
      expect(missionState.cosmicEnergy).toBe(100);

      game.stop();
    });

    it('Events.CATCH advances TrickSequencer sequence through eventBus wiring', () => {
      const game = initGame({ eventBus, manualTick: true });
      const mc = game.pipeline.missionController;

      const initialTarget = mc.getTargetState();
      expect(initialTarget.cupKey).toBe(CupKey.BIG);
      expect(initialTarget.sequenceIndex).toBe(0);

      // Successful catch on active cup
      eventBus.emit(Events.CATCH, {
        type: CatchType.CLEAN,
        cupKey: CupKey.BIG
      });

      const nextTarget = mc.getTargetState();
      expect(nextTarget.sequenceIndex).toBe(1);

      game.stop();
    });

    it('Events.MISS increments surface scars count through eventBus wiring', () => {
      const game = initGame({ eventBus, manualTick: true });
      const mc = game.pipeline.missionController;

      expect(mc.scarsCount).toBe(0);

      eventBus.emit(Events.MISS, { flightId: 'flight_001' });
      expect(mc.scarsCount).toBe(1);

      // Deduplication test: same flightId does not duplicate scars
      eventBus.emit(Events.MISS, { flightId: 'flight_001' });
      expect(mc.scarsCount).toBe(1);

      // Different flight increments scars
      eventBus.emit(Events.MISS, { flightId: 'flight_002' });
      expect(mc.scarsCount).toBe(2);

      game.stop();
    });

    it('reaching Chapter 1 milestone (400 energy) triggers capture burn', () => {
      const game = initGame({ eventBus, manualTick: true });
      const mc = game.pipeline.missionController;
      const burn = mc.getCaptureBurn();

      expect(mc.chapter).toBe(1);
      expect(burn.isActive).toBe(false);

      // Award 400 energy
      eventBus.emit(Events.SCORE, {
        eventId: 'score_milestone',
        awardedEnergy: MISSION_THRESHOLDS.CHAPTER_1
      });

      expect(mc.cosmicEnergy).toBe(400);
      expect(burn.isActive).toBe(true);

      game.stop();
    });
  });

  describe('4. Custom Subsystem Injections (Backward Compatibility)', () => {
    it('preserves custom mock orbitalEngine and mock missionController when injected', () => {
      const mockMissionController = new DefaultMissionController(eventBus);
      const mockOrbitalEngine = new DefaultOrbitalEngine(eventBus);

      const pipeline = new GamePipeline({
        eventBus,
        missionController: mockMissionController,
        orbitalEngine: mockOrbitalEngine
      });

      expect(pipeline.missionController).toBe(mockMissionController);
      expect(pipeline.orbitalEngine).toBe(mockOrbitalEngine);
      expect(pipeline.missionController).toBeInstanceOf(DefaultMissionController);
      expect(pipeline.orbitalEngine).toBeInstanceOf(DefaultOrbitalEngine);
    });
  });

  describe('5. Lifecycle and Teardown', () => {
    it('stop() disposes gameLoop and stops execution', () => {
      const game = initGame({ eventBus, manualTick: true });
      const disposeSpy = vi.spyOn(game.gameLoop, 'dispose');

      game.stop();

      expect(disposeSpy).toHaveBeenCalledTimes(1);
    });
  });
});

