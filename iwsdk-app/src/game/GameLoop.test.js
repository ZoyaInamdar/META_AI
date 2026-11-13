/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Unit Tests for GameLoop (Person A Coordinator & Pipeline Facets)
 * Role: Person A (The Hands)
 * ============================================================================
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GameLoop } from './GameLoop.js';
import {
  Events,
  CupKey,
  CatchType,
  BallMode,
  TargetState,
  ScoreEvent,
} from '../contracts/Interfaces.js';
import { EventBus } from '../contracts/EventBus.js';
import { BallTrajectory } from './BallTrajectory.js';
import { CatchFlow } from './CatchFlow.js';
import { ScoreManager } from './ScoreManager.js';
import { KendamaInputAndDetector } from '../input/KendamaInputAndDetector.js';
import { FakeInput } from '../input/FakeInput.js';
import { HandPoseAdapter } from '../input/HandPoseAdapter.js';
import { PoseFilter } from '../input/PoseFilter.js';
import { GamePipeline, createGameplayKenGroup, DefaultMissionController } from '../main.js';

function createMockKenGroup() {
  return createGameplayKenGroup();
}

describe('GameLoop (Person A)', () => {
  let eventBus;
  let kenGroup;
  let trajectory;
  let catchFlow;
  let detector;
  let scoreManager;
  let gameLoop;

  beforeEach(() => {
    eventBus = new EventBus();
    kenGroup = createMockKenGroup();
    trajectory = new BallTrajectory();
    catchFlow = new CatchFlow({ initialCup: CupKey.BIG, kenPose: kenGroup });
    detector = new KendamaInputAndDetector(kenGroup);
    scoreManager = new ScoreManager({ targetCadenceSeconds: 1.75 });

    gameLoop = new GameLoop({
      eventBus,
      gameplayKenGroup: kenGroup,
      trajectory,
      catchFlow,
      detector,
      scoreManager,
      initialCup: CupKey.BIG,
      targetCadenceSeconds: 1.75,
    });
  });

  // ==========================================================================
  // A. Construction and contracts
  // ==========================================================================
  describe('A. Construction and contracts', () => {
    it('1. GameLoop can be constructed with injected dependencies', () => {
      expect(gameLoop).toBeDefined();
      expect(gameLoop.eventBus).toBe(eventBus);
      expect(gameLoop.gameplayKenGroup).toBe(kenGroup);
      expect(gameLoop.trajectory).toBe(trajectory);
      expect(gameLoop.catchFlow).toBe(catchFlow);
      expect(gameLoop.detector).toBe(detector);
    });

    it('2. getBallState() returns a BallState-compatible object', () => {
      const state = gameLoop.getBallState();
      expect(state).toBeDefined();
      expect(state).toHaveProperty('position');
      expect(state).toHaveProperty('velocity');
      expect(state).toHaveProperty('mode');
    });

    it('3. BallState uses positional {x,y,z} position and velocity arguments', () => {
      const state = gameLoop.getBallState();
      expect(Array.isArray(state.position)).toBe(false);
      expect(typeof state.position).toBe('object');
      expect(Number.isFinite(state.position.x)).toBe(true);
      expect(Number.isFinite(state.position.y)).toBe(true);
      expect(Number.isFinite(state.position.z)).toBe(true);

      expect(Array.isArray(state.velocity)).toBe(false);
      expect(typeof state.velocity).toBe('object');
      expect(Number.isFinite(state.velocity.x)).toBe(true);
      expect(Number.isFinite(state.velocity.y)).toBe(true);
      expect(Number.isFinite(state.velocity.z)).toBe(true);
    });

    it('4. Initial ball state uses the correct seated mode', () => {
      const state = gameLoop.getBallState();
      expect(state.mode).toBe(BallMode.SEATED);
    });
  });

  // ==========================================================================
  // B. Launch lifecycle
  // ==========================================================================
  describe('B. Launch lifecycle', () => {
    it('5. Launch succeeds when CatchFlow is seated', () => {
      expect(catchFlow.state).toBe('seated');
      const launched = gameLoop.launchBall();
      expect(launched).toBe(true);
      expect(catchFlow.state).toBe('air');
    });

    it('6. Launch increments BallTrajectory flightId exactly once', () => {
      expect(trajectory.flightId).toBe(0);
      gameLoop.launchBall();
      expect(trajectory.flightId).toBe(1);
    });

    it('7. CatchFlow receives the same flightId', () => {
      gameLoop.launchBall();
      expect(catchFlow.flightId).toBe(trajectory.flightId);
      expect(catchFlow.flightId).toBe(1);
    });

    it('8. Launch is rejected when CatchFlow is airborne', () => {
      gameLoop.launchBall();
      expect(catchFlow.state).toBe('air');

      const secondLaunch = gameLoop.launchBall();
      expect(secondLaunch).toBe(false);
    });

    it('9. Rejected launch does not increment flightId or restart trajectory', () => {
      gameLoop.launchBall();
      expect(trajectory.flightId).toBe(1);

      trajectory.update(0.1);
      const elapsedBefore = trajectory.elapsed;
      expect(elapsedBefore).toBeGreaterThan(0);

      const secondLaunch = gameLoop.launchBall();
      expect(secondLaunch).toBe(false);
      expect(trajectory.flightId).toBe(1);
      expect(trajectory.elapsed).toBe(elapsedBefore);
    });

    it('10. Multiple completed flights keep CatchFlow and BallTrajectory flight IDs synchronized', () => {
      // Flight 1: Launch and complete through GameLoop coordination
      gameLoop.launchBall();
      expect(trajectory.flightId).toBe(1);
      expect(catchFlow.flightId).toBe(1);

      // Confirm catch via detector stub and advance through seating lerp (> 0.15s)
      detector.evaluateCatch = () => ({
        confirmed: true,
        valid: true,
        cupKey: CupKey.BIG,
        catchType: 'clean',
        details: { distance: 0.005, relativeSpeed: 0.2, approachDot: -0.9 },
      });
      gameLoop.catchDetector.update(0.016, kenGroup); // Enters 'catching'
      expect(catchFlow.state).toBe('catching');

      detector.evaluateCatch = () => ({ confirmed: false, valid: false });
      gameLoop.catchDetector.update(0.16, kenGroup); // Lerp completes to 'seated'
      expect(catchFlow.state).toBe('seated');

      // Flight 2: Launch second flight
      const launched2 = gameLoop.launchBall();
      expect(launched2).toBe(true);
      expect(trajectory.flightId).toBe(2);
      expect(catchFlow.flightId).toBe(2);
    });
  });

  // ==========================================================================
  // C. Catch lifecycle
  // ==========================================================================
  describe('C. Catch lifecycle', () => {
    it('11. Confirmed detector result invokes CatchFlow.onCatchConfirmed with the correct cupKey and ball position', () => {
      gameLoop.launchBall();
      expect(catchFlow.state).toBe('air');

      detector.evaluateCatch = () => ({
        confirmed: true,
        valid: true,
        cupKey: CupKey.BIG,
        catchType: 'clean',
        details: {
          distance: 0.005,
          relativeSpeed: 0.2,
          approachDot: -0.9,
        },
      });

      gameLoop.catchDetector.update(0.016, kenGroup);

      expect(catchFlow.state).toBe('catching');
    });

    it('11b. Invalid confirmed detector result ({ confirmed: true, valid: false }) does not trigger catch or score', () => {
      const missionController = new DefaultMissionController(eventBus);
      const initialEnergy = missionController.missionState.cosmicEnergy;

      let catchEmitted = false;
      let scoreEmitted = false;
      eventBus.on(Events.CATCH, () => {
        catchEmitted = true;
      });
      eventBus.on(Events.SCORE, () => {
        scoreEmitted = true;
      });

      gameLoop.launchBall();
      expect(catchFlow.state).toBe('air');

      // Detector reports confirmed: true, but valid: false
      detector.evaluateCatch = () => ({
        confirmed: true,
        valid: false,
        cupKey: CupKey.BIG,
        catchType: 'clean',
        details: {},
      });

      gameLoop.catchDetector.update(0.016, kenGroup);
      gameLoop.scoreManager.update(0.016);
      missionController.update(0.016);

      expect(catchFlow.state).toBe('air');
      expect(catchEmitted).toBe(false);
      expect(scoreEmitted).toBe(false);
      expect(missionController.missionState.cosmicEnergy).toBe(initialEnergy);
    });

    it('12. CatchFlow completes its seating transition after the configured duration', () => {
      gameLoop.launchBall();

      // Trigger catch through GameLoop catchDetector update
      detector.evaluateCatch = () => ({
        confirmed: true,
        valid: true,
        cupKey: CupKey.BIG,
        catchType: 'clean',
        details: { distance: 0.005, relativeSpeed: 0.2, approachDot: -0.9 },
      });
      gameLoop.catchDetector.update(0.016, kenGroup);
      expect(catchFlow.state).toBe('catching');

      // Reset detector confirmation and advance lerp duration (> 0.15s)
      detector.evaluateCatch = () => ({ confirmed: false, valid: false });
      gameLoop.catchDetector.update(0.16, kenGroup);

      expect(catchFlow.state).toBe('seated');
      expect(gameLoop.getBallState().mode).toBe(BallMode.SEATED);
    });

    it('13. A catch produces at most one score event', () => {
      let scoreEventCount = 0;
      eventBus.on(Events.SCORE, () => {
        scoreEventCount++;
      });

      gameLoop.launchBall();
      detector.evaluateCatch = () => ({
        confirmed: true,
        valid: true,
        cupKey: CupKey.BIG,
        catchType: 'clean',
        details: { distance: 0.005, relativeSpeed: 0.2, approachDot: -0.9 },
      });

      // Frame 1: catch confirmed & staged in detector update, scored in scoreManager update
      gameLoop.catchDetector.update(0.016, kenGroup);
      gameLoop.scoreManager.update(0.016);
      expect(scoreEventCount).toBe(1);

      // Frame 2: catching lerp continues; should NOT re-score
      gameLoop.catchDetector.update(0.016, kenGroup);
      gameLoop.scoreManager.update(0.016);
      expect(scoreEventCount).toBe(1);

      // Frame 3: seated completed; should NOT re-score
      gameLoop.catchDetector.update(0.15, kenGroup);
      gameLoop.scoreManager.update(0.016);
      expect(scoreEventCount).toBe(1);
    });

    it('14. Catch evaluation is suppressed while tracking is invalid', () => {
      // Injected mock input reporting tracking loss
      const mockInput = {
        update: () => ({
          position: { x: 0, y: 1.25, z: -0.45 },
          quaternion: { x: 0, y: 0, z: 0, w: 1 },
          isTrackingValid: false,
        }),
      };

      const loopWithUntracked = new GameLoop({
        eventBus,
        gameplayKenGroup: kenGroup,
        inputSource: mockInput,
        trajectory,
        catchFlow,
        detector,
        scoreManager,
      });

      loopWithUntracked.inputSystem.update(0.016, null);
      loopWithUntracked.launchBall();

      let evaluateCalled = false;
      detector.evaluateCatch = () => {
        evaluateCalled = true;
        return { confirmed: true, valid: true, cupKey: CupKey.BIG, catchType: 'clean', details: {} };
      };

      loopWithUntracked.catchDetector.update(0.016, kenGroup);

      expect(evaluateCalled).toBe(false);
      expect(catchFlow.state).toBe('air');
    });
  });

  // ==========================================================================
  // D. Miss lifecycle
  // ==========================================================================
  describe('D. Miss lifecycle', () => {
    it('15. A descending ball crossing the miss boundary produces one MISS event', () => {
      let missPayload = null;
      eventBus.on(Events.MISS, (payload) => {
        missPayload = payload;
      });

      // Injected trajectory stub representing downward flight past miss depth (y < ken.y - 0.45)
      const fallingTrajectory = {
        flightId: 1,
        state: {
          position: { x: 0, y: kenGroup.position.y - 0.55, z: -0.45 },
          velocity: { x: 0, y: -1.5, z: 0 },
          mode: 'air',
          flightId: 1,
        },
        update: () => {},
        launch: () => {},
        reset: () => {},
      };

      const loopWithFalling = new GameLoop({
        eventBus,
        gameplayKenGroup: kenGroup,
        trajectory: fallingTrajectory,
        catchFlow,
        detector,
        scoreManager,
      });

      loopWithFalling.launchBall();

      loopWithFalling.catchDetector.update(0.016, kenGroup);
      loopWithFalling.scoreManager.update(0.016);

      expect(missPayload).toBeTruthy();
      expect(missPayload.flightId).toBe(1);
      expect(catchFlow.state).toBe('seated');
    });

    it('16. The same flight cannot produce duplicate MISS events', () => {
      let missCount = 0;
      eventBus.on(Events.MISS, () => {
        missCount++;
      });

      const fallingTrajectory = {
        flightId: 1,
        state: {
          position: { x: 0, y: kenGroup.position.y - 0.55, z: -0.45 },
          velocity: { x: 0, y: -1.5, z: 0 },
          mode: 'air',
          flightId: 1,
        },
        update: () => {},
        launch: () => {},
        reset: () => {},
      };

      const loopWithFalling = new GameLoop({
        eventBus,
        gameplayKenGroup: kenGroup,
        trajectory: fallingTrajectory,
        catchFlow,
        detector,
        scoreManager,
      });

      loopWithFalling.launchBall();

      // Frame 1: Miss detected and emitted
      loopWithFalling.catchDetector.update(0.016, kenGroup);
      loopWithFalling.scoreManager.update(0.016);
      expect(missCount).toBe(1);

      // Frame 2: State is seated; should not emit miss again
      loopWithFalling.catchDetector.update(0.016, kenGroup);
      loopWithFalling.scoreManager.update(0.016);
      expect(missCount).toBe(1);
    });

    it('17. A miss calls ScoreManager.registerMiss()', () => {
      // Build streak first
      scoreManager.processCatchEvent({ type: 'CLEAN' }, 1000, 99);
      expect(scoreManager.currentStreak).toBe(1);

      const fallingTrajectory = {
        flightId: 1,
        state: {
          position: { x: 0, y: kenGroup.position.y - 0.55, z: -0.45 },
          velocity: { x: 0, y: -1.5, z: 0 },
          mode: 'air',
          flightId: 1,
        },
        update: () => {},
        launch: () => {},
        reset: () => {},
      };

      const loopWithFalling = new GameLoop({
        eventBus,
        gameplayKenGroup: kenGroup,
        trajectory: fallingTrajectory,
        catchFlow,
        detector,
        scoreManager,
      });

      loopWithFalling.launchBall();

      loopWithFalling.catchDetector.update(0.016, kenGroup);
      loopWithFalling.scoreManager.update(0.016);

      expect(scoreManager.currentStreak).toBe(0);
    });
  });

  // ==========================================================================
  // E. Scoring
  // ==========================================================================
  describe('E. Scoring', () => {
    it('18. A valid catch produces a SCORE event', () => {
      let scoreEvent = null;
      eventBus.on(Events.SCORE, (evt) => {
        scoreEvent = evt;
      });

      gameLoop.launchBall();
      detector.evaluateCatch = () => ({
        confirmed: true,
        valid: true,
        cupKey: CupKey.BIG,
        catchType: 'clean',
        details: { distance: 0.01, relativeSpeed: 0.1, approachDot: -0.95 },
      });

      gameLoop.catchDetector.update(0.016, kenGroup);
      gameLoop.scoreManager.update(0.016);

      expect(scoreEvent).toBeTruthy();
      expect(scoreEvent).toHaveProperty('payload');
    });

    it('19. The SCORE payload contains awardedEnergy compatible with DefaultMissionController', () => {
      // Integrate with Person B's DefaultMissionController
      const missionController = new DefaultMissionController(eventBus);
      const initialEnergy = missionController.missionState.cosmicEnergy;

      let scoreEventWrapper = null;
      eventBus.on(Events.SCORE, (evt) => {
        scoreEventWrapper = evt;
      });

      gameLoop.launchBall();
      detector.evaluateCatch = () => ({
        confirmed: true,
        valid: true,
        cupKey: CupKey.BIG,
        catchType: 'clean',
        details: { distance: 0.01, relativeSpeed: 0.1, approachDot: -0.95 },
      });

      gameLoop.catchDetector.update(0.016, kenGroup);
      gameLoop.scoreManager.update(0.016);

      // Validate nested payload property directly
      expect(scoreEventWrapper).toHaveProperty('payload');
      const scorePayload = scoreEventWrapper.payload;
      expect(scorePayload).toHaveProperty('awardedEnergy');
      expect(typeof scorePayload.awardedEnergy).toBe('number');
      expect(scorePayload.awardedEnergy).toBeGreaterThan(0);

      // Validate Person B's MissionController successfully consumed the payload
      missionController.update(0.016);
      expect(missionController.missionState.cosmicEnergy).toBe(initialEnergy + scorePayload.awardedEnergy);
    });

    it('20. The SCORE payload is compatible with the existing ScoreEvent contract', () => {
      let scoreEventWrapper = null;
      eventBus.on(Events.SCORE, (evt) => {
        scoreEventWrapper = evt;
      });

      gameLoop.launchBall();
      detector.evaluateCatch = () => ({
        confirmed: true,
        valid: true,
        cupKey: CupKey.BIG,
        catchType: 'clean',
        details: { distance: 0.01, relativeSpeed: 0.1, approachDot: -0.95 },
      });

      gameLoop.catchDetector.update(0.016, kenGroup);
      gameLoop.scoreManager.update(0.016);

      expect(scoreEventWrapper).toHaveProperty('payload');
      const scorePayload = scoreEventWrapper.payload;
      expect(scorePayload.eventId).toBe(`flight_${trajectory.flightId}`);
      expect(scorePayload.catchType).toBe(CatchType.CLEAN);
      expect(scorePayload.currentStreak).toBe(1);
      expect(scorePayload.streak).toBe(1);
      expect(scorePayload.multipliers).toBeDefined();
      expect(scorePayload.totalEnergy).toBe(scorePayload.awardedEnergy);

      // ScoreEvent constructor compatibility validation
      const eventInstance = new ScoreEvent(scorePayload);
      expect(eventInstance.awardedEnergy).toBe(scorePayload.awardedEnergy);
      expect(eventInstance.currentStreak).toBe(scorePayload.currentStreak);
    });

    it('21. Duplicate flight IDs cannot be scored twice', () => {
      let scoreCount = 0;
      eventBus.on(Events.SCORE, () => {
        scoreCount++;
      });

      gameLoop.launchBall();
      detector.evaluateCatch = () => ({
        confirmed: true,
        valid: true,
        cupKey: CupKey.BIG,
        catchType: 'clean',
        details: { distance: 0.01, relativeSpeed: 0.1, approachDot: -0.95 },
      });

      // Frame 1: scored for flight 1
      gameLoop.catchDetector.update(0.016, kenGroup);
      gameLoop.scoreManager.update(0.016);
      expect(scoreCount).toBe(1);

      // Frame 2: subsequent update on same flight cannot score again
      gameLoop.catchDetector.update(0.016, kenGroup);
      gameLoop.scoreManager.update(0.016);
      expect(scoreCount).toBe(1);
    });

    it('22. Scoring updates through the GamePipeline-compatible scoreManager.update(dt) facet', () => {
      expect(typeof gameLoop.scoreManager.update).toBe('function');
    });
  });

  // ==========================================================================
  // F. Pipeline compatibility
  // ==========================================================================
  describe('F. Pipeline compatibility', () => {
    it('23. GameLoop exposes inputSystem.update(dt, xrFrame)', () => {
      expect(gameLoop.inputSystem).toBeDefined();
      expect(typeof gameLoop.inputSystem.update).toBe('function');
    });

    it('24. GameLoop exposes catchDetector.update(dt, gameplayKenGroup)', () => {
      expect(gameLoop.catchDetector).toBeDefined();
      expect(typeof gameLoop.catchDetector.update).toBe('function');
    });

    it('24b. catchDetector.update synchronizes active ken group with detector via setKenGroup', () => {
      const alternateKen = createMockKenGroup();
      expect(detector.gameplayKenGroup).toBe(kenGroup);

      gameLoop.catchDetector.update(0.016, alternateKen);

      expect(detector.gameplayKenGroup).toBe(alternateKen);
    });

    it('25. GameLoop exposes catchDetector.getBallState()', () => {
      expect(typeof gameLoop.catchDetector.getBallState).toBe('function');
      const bs = gameLoop.catchDetector.getBallState();
      expect(bs).toHaveProperty('position');
      expect(bs).toHaveProperty('velocity');
      expect(bs).toHaveProperty('mode');
    });

    it('26. GameLoop exposes scoreManager.update(dt)', () => {
      expect(gameLoop.scoreManager).toBeDefined();
      expect(typeof gameLoop.scoreManager.update).toBe('function');
    });

    it('27. The three facets can be injected into GamePipeline using the actual constructor contract', () => {
      const mockMissionController = {
        update: () => {},
        getMissionState: () => ({ chapter: 1 }),
        getPlanetState: () => ({ scars: 0 }),
        getTargetState: () => ({ cupKey: 'big' }),
      };
      const mockOrbitalEngine = {
        step: () => {},
        getPhysicsState: () => ({ bodies: [] }),
      };
      const mockWorldRenderer = {
        render: () => {},
      };

      const pipeline = new GamePipeline({
        eventBus,
        gameplayKenGroup: kenGroup,
        inputSystem: gameLoop.inputSystem,
        catchDetector: gameLoop.catchDetector,
        scoreManager: gameLoop.scoreManager,
        missionController: mockMissionController,
        orbitalEngine: mockOrbitalEngine,
        worldRenderer: mockWorldRenderer,
        fixedDelta: 1 / 120,
      });

      expect(pipeline.inputSystem).toBe(gameLoop.inputSystem);
      expect(pipeline.catchDetector).toBe(gameLoop.catchDetector);
      expect(pipeline.scoreManager).toBe(gameLoop.scoreManager);

      expect(() => {
        pipeline.tick(16.6667, null, 1 / 120);
      }).not.toThrow();
    });
  });

  // ==========================================================================
  // G. Input behavior
  // ==========================================================================
  describe('G. Input behavior', () => {
    it("28. FakeInput's internally created gameplayKenGroup is synchronized with the canonical gameplayKenGroup", () => {
      const fakeInput = new FakeInput();
      const loopWithFake = new GameLoop({
        eventBus,
        gameplayKenGroup: kenGroup,
        inputSource: fakeInput,
        trajectory,
        catchFlow,
        detector,
        scoreManager,
      });

      // Move Ken through FakeInput's public mouse handler
      fakeInput.handleMouseMove({ movementX: 100, movementY: -50 });

      loopWithFake.inputSystem.update(0.016, null);

      expect(kenGroup.position.x).not.toBe(0.0);
      expect(kenGroup.position.y).not.toBe(1.25);
    });

    it("29. FakeInput's launch request is consumed only once", () => {
      const fakeInput = new FakeInput();
      const loopWithFake = new GameLoop({
        eventBus,
        gameplayKenGroup: kenGroup,
        inputSource: fakeInput,
        trajectory,
        catchFlow,
        detector,
        scoreManager,
      });

      // Public key down requesting launch
      fakeInput.handleKeyDown({ code: 'Space' });

      // Frame 1: Consumes launch request and launches ball
      loopWithFake.inputSystem.update(0.016, null);
      expect(catchFlow.state).toBe('air');
      expect(fakeInput.consumeLaunchRequest()).toBe(false);

      // Frame 2: Subsequent update does not re-launch
      loopWithFake.inputSystem.update(0.016, null);
      expect(catchFlow.state).toBe('air');
    });

    it('30. HandPoseAdapter accepts a valid joints object containing wrist position and orientation', () => {
      const adapter = new HandPoseAdapter({ hand: 'right', gripSource: 'wrist' });
      const loopWithHand = new GameLoop({
        eventBus,
        gameplayKenGroup: kenGroup,
        inputSource: adapter,
        trajectory,
        catchFlow,
        detector,
        scoreManager,
      });

      const validJoints = {
        wrist: {
          position: { x: 0.05, y: 1.28, z: -0.42 },
          quaternion: { x: 0.0, y: 0.0, z: 0.0, w: 1.0 },
          valid: true,
        },
      };

      loopWithHand.inputSystem.update(0.016, validJoints);

      expect(kenGroup.position.x).toBeCloseTo(0.05);
      expect(kenGroup.position.y).toBeCloseTo(1.28);
      expect(kenGroup.position.z).toBeCloseTo(-0.42);
      expect(adapter.isTrackingValid).toBe(true);
    });

    it('31. Invalid or missing joint data is handled as tracking loss', () => {
      const adapter = new HandPoseAdapter({ hand: 'right', gripSource: 'wrist' });
      const loopWithHand = new GameLoop({
        eventBus,
        gameplayKenGroup: kenGroup,
        inputSource: adapter,
        trajectory,
        catchFlow,
        detector,
        scoreManager,
      });

      const validJoints = {
        wrist: {
          position: { x: 0.05, y: 1.28, z: -0.42 },
          quaternion: { x: 0.0, y: 0.0, z: 0.0, w: 1.0 },
          valid: true,
        },
      };
      loopWithHand.inputSystem.update(0.016, validJoints);
      expect(adapter.isTrackingValid).toBe(true);

      // Pass null joints -> tracking loss
      loopWithHand.inputSystem.update(0.016, null);
      expect(adapter.isTrackingValid).toBe(false);
    });

    it('32. Tracking recovery restores valid pose handling', () => {
      const adapter = new HandPoseAdapter({ hand: 'right', gripSource: 'wrist' });
      const loopWithHand = new GameLoop({
        eventBus,
        gameplayKenGroup: kenGroup,
        inputSource: adapter,
        trajectory,
        catchFlow,
        detector,
        scoreManager,
      });

      const validJoints = {
        wrist: {
          position: { x: 0.05, y: 1.28, z: -0.42 },
          quaternion: { x: 0.0, y: 0.0, z: 0.0, w: 1.0 },
          valid: true,
        },
      };

      // Frame 1: Tracking loss
      loopWithHand.inputSystem.update(0.016, null);
      expect(adapter.isTrackingValid).toBe(false);

      // Frame 2: Tracking recovered
      loopWithHand.inputSystem.update(0.016, validJoints);
      expect(adapter.isTrackingValid).toBe(true);
      expect(kenGroup.position.x).toBeCloseTo(0.05);
    });

    it('32a. Valid hand positions are filtered across multiple frames', () => {
      const adapter = new HandPoseAdapter({ hand: 'right', gripSource: 'wrist' });
      const customFilter = new PoseFilter({ minCutoff: 1.0, beta: 0.1 });
      const loopWithHand = new GameLoop({
        eventBus,
        gameplayKenGroup: kenGroup,
        inputSource: adapter,
        poseFilter: customFilter,
        trajectory,
        catchFlow,
        detector,
        scoreManager,
      });

      // Frame 1: Initial position at x = 0.0
      loopWithHand.inputSystem.update(0.016, {
        wrist: {
          position: { x: 0.0, y: 1.25, z: -0.45 },
          quaternion: { x: 0.0, y: 0.0, z: 0.0, w: 1.0 },
          valid: true,
        },
      });
      expect(kenGroup.position.x).toBeCloseTo(0.0);

      // Frame 2: Sudden jump in raw tracking to x = 0.10
      loopWithHand.inputSystem.update(0.016, {
        wrist: {
          position: { x: 0.10, y: 1.25, z: -0.45 },
          quaternion: { x: 0.0, y: 0.0, z: 0.0, w: 1.0 },
          valid: true,
        },
      });
      // The filter smooths the jump: position must be strictly between 0.0 and 0.10
      expect(kenGroup.position.x).toBeGreaterThan(0.0);
      expect(kenGroup.position.x).toBeLessThan(0.10);

      // Frame 3: Consecutive sample at x = 0.10 moves closer to target
      const prevX = kenGroup.position.x;
      loopWithHand.inputSystem.update(0.016, {
        wrist: {
          position: { x: 0.10, y: 1.25, z: -0.45 },
          quaternion: { x: 0.0, y: 0.0, z: 0.0, w: 1.0 },
          valid: true,
        },
      });
      expect(kenGroup.position.x).toBeGreaterThan(prevX);
      expect(kenGroup.position.x).toBeLessThanOrEqual(0.10);
    });

    it('32b. Invalid tracking resets PoseFilter and preserves canonical transform without reverting to raw adapter pose', () => {
      const adapter = new HandPoseAdapter({ hand: 'right', gripSource: 'wrist' });
      const customFilter = new PoseFilter({ minCutoff: 1.0, beta: 0.1 });
      const loopWithHand = new GameLoop({
        eventBus,
        gameplayKenGroup: kenGroup,
        inputSource: adapter,
        poseFilter: customFilter,
        trajectory,
        catchFlow,
        detector,
        scoreManager,
      });

      // Frame 1: Initial position at x = 0.0
      loopWithHand.inputSystem.update(0.016, {
        wrist: {
          position: { x: 0.0, y: 1.25, z: -0.45 },
          quaternion: { x: 0.0, y: 0.0, z: 0.0, w: 1.0 },
          valid: true,
        },
      });
      expect(loopWithHand.poseFilter.isInitialized()).toBe(true);

      // Frame 2: Raw hand jumps to 0.10. PoseFilter smooths position strictly between 0.0 and 0.10.
      loopWithHand.inputSystem.update(0.016, {
        wrist: {
          position: { x: 0.10, y: 1.25, z: -0.45 },
          quaternion: { x: 0.0, y: 0.0, z: 0.0, w: 1.0 },
          valid: true,
        },
      });
      const filteredX = kenGroup.position.x;
      expect(filteredX).toBeGreaterThan(0.0);
      expect(filteredX).toBeLessThan(0.10);
      // Adapter's raw retained position is 0.10
      expect(adapter._lastValidPosition.x).toBeCloseTo(0.10);

      // Frame 3: Tracking lost (null joints) -> filter is reset, but canonical transform remains unchanged
      loopWithHand.inputSystem.update(0.016, null);
      expect(loopWithHand.poseFilter.isInitialized()).toBe(false);
      expect(loopWithHand._isTrackingValid).toBe(false);

      // Canonical transform preserves the filtered position in-place rather than reverting to raw adapter 0.10
      expect(kenGroup.position.x).toBe(filteredX);
      expect(kenGroup.position.x).not.toBeCloseTo(adapter._lastValidPosition.x);
    });

    it('32c. Recovery starts with a fresh filter state without lag from pre-loss position', () => {
      const adapter = new HandPoseAdapter({ hand: 'right', gripSource: 'wrist' });
      const loopWithHand = new GameLoop({
        eventBus,
        gameplayKenGroup: kenGroup,
        inputSource: adapter,
        trajectory,
        catchFlow,
        detector,
        scoreManager,
      });

      // Frame 1: Valid initial sample at origin x = 0.0
      loopWithHand.inputSystem.update(0.016, {
        wrist: {
          position: { x: 0.0, y: 1.25, z: -0.45 },
          quaternion: { x: 0.0, y: 0.0, z: 0.0, w: 1.0 },
          valid: true,
        },
      });
      expect(kenGroup.position.x).toBeCloseTo(0.0);

      // Frame 2: Tracking lost
      loopWithHand.inputSystem.update(0.016, null);
      expect(loopWithHand._isTrackingValid).toBe(false);
      expect(loopWithHand.poseFilter.isInitialized()).toBe(false);

      // Frame 3: Tracking recovers at a completely distant position x = 0.25
      loopWithHand.inputSystem.update(0.016, {
        wrist: {
          position: { x: 0.25, y: 1.30, z: -0.40 },
          quaternion: { x: 0.0, y: 0.0, z: 0.0, w: 1.0 },
          valid: true,
        },
      });
      expect(loopWithHand._isTrackingValid).toBe(true);
      // Because recovery starts with a fresh filter state, the first recovered sample snaps directly to x = 0.25
      expect(kenGroup.position.x).toBeCloseTo(0.25);
      expect(kenGroup.position.y).toBeCloseTo(1.30);
      expect(kenGroup.position.z).toBeCloseTo(-0.40);
    });

    it('32d. Quaternion orientation remains completely unchanged by position filtering', () => {
      const adapter = new HandPoseAdapter({ hand: 'right', gripSource: 'wrist' });
      const loopWithHand = new GameLoop({
        eventBus,
        gameplayKenGroup: kenGroup,
        inputSource: adapter,
        rollGain: 1.0,
        trajectory,
        catchFlow,
        detector,
        scoreManager,
      });

      // Normalized arbitrary quaternion
      const testQuat = { x: 0.1414, y: 0.2828, z: 0.4242, w: 0.8485 };

      // Frame 1
      loopWithHand.inputSystem.update(0.016, {
        wrist: {
          position: { x: 0.0, y: 1.25, z: -0.45 },
          quaternion: testQuat,
          valid: true,
        },
      });
      expect(kenGroup.quaternion.x).toBeCloseTo(testQuat.x, 3);
      expect(kenGroup.quaternion.y).toBeCloseTo(testQuat.y, 3);
      expect(kenGroup.quaternion.z).toBeCloseTo(testQuat.z, 3);
      expect(kenGroup.quaternion.w).toBeCloseTo(testQuat.w, 3);

      // Frame 2: Position moves, quaternion is rotated to a different orientation
      const testQuat2 = { x: 0.0, y: Math.SQRT1_2, z: 0.0, w: Math.SQRT1_2 };
      loopWithHand.inputSystem.update(0.016, {
        wrist: {
          position: { x: 0.15, y: 1.35, z: -0.40 },
          quaternion: testQuat2,
          valid: true,
        },
      });
      // Position is filtered/smoothed:
      expect(kenGroup.position.x).toBeLessThan(0.15);
      // But quaternion must strictly match testQuat2 without smoothing:
      expect(kenGroup.quaternion.x).toBeCloseTo(testQuat2.x, 5);
      expect(kenGroup.quaternion.y).toBeCloseTo(testQuat2.y, 5);
      expect(kenGroup.quaternion.z).toBeCloseTo(testQuat2.z, 5);
      expect(kenGroup.quaternion.w).toBeCloseTo(testQuat2.w, 5);
    });

    it('32e. FakeInput bypasses PoseFilter completely', () => {
      const fakeInput = new FakeInput();
      let filterCalled = false;
      const mockFilter = {
        filter(pos) {
          filterCalled = true;
          return pos;
        },
        reset() {},
        isInitialized() { return true; },
      };

      const loopWithFake = new GameLoop({
        eventBus,
        gameplayKenGroup: kenGroup,
        inputSource: fakeInput,
        poseFilter: mockFilter,
        trajectory,
        catchFlow,
        detector,
        scoreManager,
      });

      fakeInput.handleMouseMove({ movementX: 80, movementY: -40 });
      loopWithFake.inputSystem.update(0.016, null);

      expect(filterCalled).toBe(false);
      expect(kenGroup.position.x).not.toBe(0.0);
    });

    it('32f. Explicit poseFilter: null disables filtering for HandPoseAdapter', () => {
      const adapter = new HandPoseAdapter({ hand: 'right', gripSource: 'wrist' });
      const loopNoFilter = new GameLoop({
        eventBus,
        gameplayKenGroup: kenGroup,
        inputSource: adapter,
        poseFilter: null,
        trajectory,
        catchFlow,
        detector,
        scoreManager,
      });

      // Frame 1
      loopNoFilter.inputSystem.update(0.016, {
        wrist: {
          position: { x: 0.0, y: 1.25, z: -0.45 },
          quaternion: { x: 0.0, y: 0.0, z: 0.0, w: 1.0 },
          valid: true,
        },
      });

      // Frame 2: Immediate jump in raw tracking
      loopNoFilter.inputSystem.update(0.016, {
        wrist: {
          position: { x: 0.10, y: 1.25, z: -0.45 },
          quaternion: { x: 0.0, y: 0.0, z: 0.0, w: 1.0 },
          valid: true,
        },
      });

      // Without filter, position snaps instantly to 0.10
      expect(kenGroup.position.x).toBeCloseTo(0.10);
    });
  });

  // ==========================================================================
  // H. Event handling
  // ==========================================================================
  describe('H. Event handling', () => {
    it('33. TARGET events update the active target cup', () => {
      expect(gameLoop.activeTargetCup).toBe(CupKey.BIG);

      const target = new TargetState(CupKey.SMALL, 'alternate', 1);
      eventBus.emit(Events.TARGET, target);

      expect(gameLoop.activeTargetCup).toBe(CupKey.SMALL);
    });

    it("34. CADENCE events update the scoring engine's target cadence", () => {
      let updatedCadence = null;
      const originalSet = scoreManager.setTargetCadence.bind(scoreManager);
      scoreManager.setTargetCadence = (s) => {
        updatedCadence = s;
        originalSet(s);
      };

      eventBus.emit(Events.CADENCE, 1.5);
      expect(updatedCadence).toBe(1.5);
    });

    it("35. dispose() unsubscribes GameLoop's event listeners", () => {
      let cadenceCalled = false;
      scoreManager.setTargetCadence = () => {
        cadenceCalled = true;
      };

      gameLoop.dispose();

      eventBus.emit(Events.TARGET, new TargetState(CupKey.BASE, 'around', 2));
      expect(gameLoop.activeTargetCup).toBe(CupKey.BIG); // Unchanged

      eventBus.emit(Events.CADENCE, 2.2);
      expect(cadenceCalled).toBe(false); // Unsubscribed
    });
  });

  // ==========================================================================
  // I. WebXR Frame & HandPoseAdapter Integration
  // ==========================================================================
  describe('I. WebXR Frame & HandPoseAdapter Integration', () => {
    const createMockXRJoint = (name) => ({ name });
    const createMockXRHand = (joints = {}) => new Map(Object.entries(joints));
    const createMockXRInputSource = (joints = {}, handedness = 'right') => ({
      handedness,
      hand: createMockXRHand(joints),
    });
    const createMockXRFrame = (poses = {}, refSpace = { _id: 'ref-space' }) => ({
      referenceSpace: refSpace,
      getJointPose: vi.fn((joint, space) => {
        if (!joint || space !== refSpace) return null;
        return poses[joint.name] || null;
      }),
    });

    it('36. Valid XR wrist data extracts and propagates to gameplayKenGroup through inputSystem', () => {
      const wristJoint = createMockXRJoint('wrist');
      const inputSource = createMockXRInputSource({ wrist: wristJoint }, 'right');
      const refSpace = { _id: 'ref-space' };

      const wristPose = {
        transform: {
          position: { x: 0.15, y: 1.30, z: -0.40 },
          orientation: { x: 0.0, y: 0.38268, z: 0.0, w: 0.92388 },
        },
        radius: 0.012,
      };

      const frame = createMockXRFrame({ wrist: wristPose }, refSpace);

      const handAdapter = new HandPoseAdapter({ hand: 'right', gripSource: 'wrist' });
      const xrLoop = new GameLoop({
        gameplayKenGroup: kenGroup,
        inputSource: handAdapter,
        inputSourceType: 'hand',
        referenceSpace: refSpace,
        xrInputSource: inputSource,
        poseFilter: null, // Test pure extraction & propagation first
      });

      // Frame 1: pass real WebXR frame
      xrLoop.inputSystem.update(0.016, frame);

      expect(frame.getJointPose).toHaveBeenCalledWith(wristJoint, refSpace);
      expect(kenGroup.position.x).toBeCloseTo(0.15);
      expect(kenGroup.position.y).toBeCloseTo(1.30);
      expect(kenGroup.position.z).toBeCloseTo(-0.40);
      expect(kenGroup.quaternion.y).toBeCloseTo(0.38268);
      expect(kenGroup.quaternion.w).toBeCloseTo(0.92388);
      expect(xrLoop.isTrackingValid).toBe(true);
    });

    it('37. Missing XR frame (null or undefined) safely handled, sets tracking invalid and preserves canonical pose', () => {
      const handAdapter = new HandPoseAdapter({ hand: 'right' });
      const xrLoop = new GameLoop({
        gameplayKenGroup: kenGroup,
        inputSource: handAdapter,
        inputSourceType: 'hand',
        poseFilter: null,
      });

      kenGroup.position.set(0.20, 1.25, -0.45);

      // Pass null frame
      xrLoop.inputSystem.update(0.016, null);

      expect(xrLoop.isTrackingValid).toBe(false);
      // Canonical group position remains intact
      expect(kenGroup.position.x).toBeCloseTo(0.20);
      expect(kenGroup.position.y).toBeCloseTo(1.25);
      expect(kenGroup.position.z).toBeCloseTo(-0.45);

      // Pass undefined frame
      xrLoop.inputSystem.update(0.016, undefined);
      expect(xrLoop.isTrackingValid).toBe(false);
      expect(kenGroup.position.x).toBeCloseTo(0.20);
    });

    it('38. Missing hand input source safely handled, preserves canonical pose and marks tracking invalid', () => {
      const refSpace = { _id: 'ref-space' };
      const frame = createMockXRFrame({}, refSpace);

      const handAdapter = new HandPoseAdapter({ hand: 'right' });
      const xrLoop = new GameLoop({
        gameplayKenGroup: kenGroup,
        inputSource: handAdapter,
        inputSourceType: 'hand',
        referenceSpace: refSpace,
        xrInputSource: null, // No hand source
        poseFilter: null,
      });

      kenGroup.position.set(0.05, 1.10, -0.35);

      xrLoop.inputSystem.update(0.016, frame);

      expect(xrLoop.isTrackingValid).toBe(false);
      expect(kenGroup.position.x).toBeCloseTo(0.05);
    });

    it('39. Missing wrist joint on hand input source safely handled without throwing', () => {
      const refSpace = { _id: 'ref-space' };
      // Hand without wrist joint
      const inputSource = createMockXRInputSource({}, 'right');
      const frame = createMockXRFrame({}, refSpace);

      const handAdapter = new HandPoseAdapter({ hand: 'right' });
      const xrLoop = new GameLoop({
        gameplayKenGroup: kenGroup,
        inputSource: handAdapter,
        inputSourceType: 'hand',
        referenceSpace: refSpace,
        xrInputSource: inputSource,
        poseFilter: null,
      });

      kenGroup.position.set(0.12, 1.25, -0.40);

      expect(() => {
        xrLoop.inputSystem.update(0.016, frame);
      }).not.toThrow();

      expect(xrLoop.isTrackingValid).toBe(false);
      expect(kenGroup.position.x).toBeCloseTo(0.12);
    });

    it('40. Invalid tracking (getJointPose returns null) resets PoseFilter and preserves canonical transform in-place', () => {
      const wristJoint = createMockXRJoint('wrist');
      const inputSource = createMockXRInputSource({ wrist: wristJoint }, 'right');
      const refSpace = { _id: 'ref-space' };

      // Initial valid pose
      const validPose = {
        transform: {
          position: { x: 0.10, y: 1.25, z: -0.45 },
          orientation: { x: 0, y: 0, z: 0, w: 1 },
        },
      };

      const validFrame = createMockXRFrame({ wrist: validPose }, refSpace);

      const mockFilter = {
        reset: vi.fn(),
        filter: vi.fn((pos) => ({ ...pos })),
      };

      const handAdapter = new HandPoseAdapter({ hand: 'right' });
      const xrLoop = new GameLoop({
        gameplayKenGroup: kenGroup,
        inputSource: handAdapter,
        inputSourceType: 'hand',
        referenceSpace: refSpace,
        xrInputSource: inputSource,
        poseFilter: mockFilter,
        rollGain: 1.0,
      });

      // Frame 1: Valid tracking
      xrLoop.inputSystem.update(0.016, validFrame);
      expect(xrLoop.isTrackingValid).toBe(true);
      expect(kenGroup.position.x).toBeCloseTo(0.10);

      // Frame 2: getJointPose returns null (optical occlusion / hand out of FOV)
      const lostFrame = createMockXRFrame({ wrist: null }, refSpace);
      xrLoop.inputSystem.update(0.016, lostFrame);

      expect(xrLoop.isTrackingValid).toBe(false);
      expect(mockFilter.reset).toHaveBeenCalled();
      // Canonical position remains exactly at previous valid position
      expect(kenGroup.position.x).toBeCloseTo(0.10);
      expect(kenGroup.position.y).toBeCloseTo(1.25);
      expect(kenGroup.position.z).toBeCloseTo(-0.45);
    });

    it('41. Tracking recovery resets PoseFilter fresh, filters new position, and propagates quaternion', () => {
      const wristJoint = createMockXRJoint('wrist');
      const inputSource = createMockXRInputSource({ wrist: wristJoint }, 'right');
      const refSpace = { _id: 'ref-space' };

      const pose1 = {
        transform: {
          position: { x: 0.10, y: 1.25, z: -0.45 },
          orientation: { x: 0, y: 0, z: 0, w: 1 },
        },
      };
      const poseAfterRecovery = {
        transform: {
          position: { x: 0.25, y: 1.35, z: -0.40 },
          orientation: { x: 0.1, y: 0.2, z: 0.3, w: 0.9 },
        },
      };

      const frame1 = createMockXRFrame({ wrist: pose1 }, refSpace);
      const lostFrame = createMockXRFrame({ wrist: null }, refSpace);
      const recoveryFrame = createMockXRFrame({ wrist: poseAfterRecovery }, refSpace);

      const mockFilter = {
        reset: vi.fn(),
        filter: vi.fn((pos) => ({ ...pos })),
      };

      const handAdapter = new HandPoseAdapter({ hand: 'right' });
      const xrLoop = new GameLoop({
        gameplayKenGroup: kenGroup,
        inputSource: handAdapter,
        inputSourceType: 'hand',
        referenceSpace: refSpace,
        xrInputSource: inputSource,
        poseFilter: mockFilter,
        rollGain: 1.0,
      });

      // 1. Valid frame
      xrLoop.inputSystem.update(0.016, frame1);
      expect(xrLoop.isTrackingValid).toBe(true);
      mockFilter.reset.mockClear();

      // 2. Tracking lost
      xrLoop.inputSystem.update(0.016, lostFrame);
      expect(xrLoop.isTrackingValid).toBe(false);
      expect(mockFilter.reset).toHaveBeenCalledTimes(1);
      mockFilter.reset.mockClear();

      // 3. Tracking recovers
      xrLoop.inputSystem.update(0.016, recoveryFrame);
      expect(xrLoop.isTrackingValid).toBe(true);
      // PoseFilter must be reset upon recovery to avoid smoothing across the tele-jump
      expect(mockFilter.reset).toHaveBeenCalledTimes(1);
      expect(mockFilter.filter).toHaveBeenCalledWith(
        expect.objectContaining({ x: 0.25, y: 1.35, z: -0.40 }),
        0.016
      );

      // Gameplay group updated with new transform
      expect(kenGroup.position.x).toBeCloseTo(0.25);
      expect(kenGroup.position.y).toBeCloseTo(1.35);
      expect(kenGroup.quaternion.x).toBeCloseTo(0.1 / Math.hypot(0.1, 0.2, 0.3, 0.9));
    });

    it('42. Position is filtered while quaternion is normalized and copied directly without filtering', () => {
      const wristJoint = createMockXRJoint('wrist');
      const inputSource = createMockXRInputSource({ wrist: wristJoint }, 'right');
      const refSpace = { _id: 'ref-space' };

      const rawQuat = { x: 0.2, y: 0.0, z: 0.0, w: 0.8 };
      const rawPos = { x: 0.15, y: 1.20, z: -0.45 };

      const frame = createMockXRFrame({
        wrist: { transform: { position: rawPos, orientation: rawQuat } },
      }, refSpace);

      const filteredPos = { x: 0.148, y: 1.201, z: -0.449 };
      const mockFilter = {
        reset: vi.fn(),
        filter: vi.fn(() => filteredPos),
      };

      const handAdapter = new HandPoseAdapter({ hand: 'right' });
      const xrLoop = new GameLoop({
        gameplayKenGroup: kenGroup,
        inputSource: handAdapter,
        inputSourceType: 'hand',
        referenceSpace: refSpace,
        xrInputSource: inputSource,
        poseFilter: mockFilter,
        rollGain: 1.0,
      });

      xrLoop.inputSystem.update(0.016, frame);

      // Position received filtered coordinates
      expect(kenGroup.position.x).toBeCloseTo(0.148);
      expect(kenGroup.position.y).toBeCloseTo(1.201);
      expect(kenGroup.position.z).toBeCloseTo(-0.449);

      // Quaternion received raw normalized orientation directly (filter was never called for orientation)
      const qNorm = Math.hypot(0.2, 0.0, 0.0, 0.8);
      expect(kenGroup.quaternion.x).toBeCloseTo(0.2 / qNorm);
      expect(kenGroup.quaternion.w).toBeCloseTo(0.8 / qNorm);
    });

    it('43. Exactly one pipeline update per frame with matching XRFrame and delta time', () => {
      const wristJoint = createMockXRJoint('wrist');
      const inputSource = createMockXRInputSource({ wrist: wristJoint }, 'right');
      const refSpace = { _id: 'ref-space' };

      const wristPose = {
        transform: {
          position: { x: 0.11, y: 1.22, z: -0.44 },
          orientation: { x: 0, y: 0, z: 0, w: 1 },
        },
      };
      const frame = createMockXRFrame({ wrist: wristPose }, refSpace);

      const handAdapter = new HandPoseAdapter({ hand: 'right' });
      const xrLoop = new GameLoop({
        gameplayKenGroup: kenGroup,
        inputSource: handAdapter,
        inputSourceType: 'hand',
        referenceSpace: refSpace,
        xrInputSource: inputSource,
        poseFilter: null,
      });

      let stage1InputCalled = 0;
      const originalInputUpdate = xrLoop.inputSystem.update.bind(xrLoop.inputSystem);
      xrLoop.inputSystem.update = (dt, xrFrame) => {
        stage1InputCalled++;
        return originalInputUpdate(dt, xrFrame);
      };

      const pipeline = new GamePipeline({
        eventBus,
        gameplayKenGroup: kenGroup,
        inputSystem: xrLoop.inputSystem,
        catchDetector: xrLoop.catchDetector,
        scoreManager: xrLoop.scoreManager,
        missionController: new DefaultMissionController(eventBus),
        fixedDelta: 1 / 120,
      });

      // Execute exactly one frame tick with WebXR frame context
      const xrContext = {
        frame,
        referenceSpace: refSpace,
        inputSource,
      };

      pipeline.tick(16.6667, xrContext, 1 / 60);

      expect(pipeline.totalRenderTicks).toBe(1);
      expect(stage1InputCalled).toBe(1);
      expect(kenGroup.position.x).toBeCloseTo(0.11);
    });

    it('44. FakeInput continues to work without an XR session and bypasses PoseFilter', () => {
      const fakeInput = new FakeInput({
        initialPosition: { x: 0.05, y: 1.25, z: -0.45 },
      });

      const mockFilter = {
        reset: vi.fn(),
        filter: vi.fn(),
      };

      const fakeLoop = new GameLoop({
        gameplayKenGroup: kenGroup,
        inputSource: fakeInput,
        inputSourceType: 'fake',
        poseFilter: mockFilter,
      });

      // No XR session: xrFrame is null
      fakeLoop.inputSystem.update(0.016, null);

      // FakeInput updates gameplayKenGroup
      expect(kenGroup.position.x).toBeCloseTo(0.05);
      expect(kenGroup.position.y).toBeCloseTo(1.25);
      expect(kenGroup.position.z).toBeCloseTo(-0.45);

      // PoseFilter is bypassed for FakeInput
      expect(mockFilter.filter).not.toHaveBeenCalled();
    });

    it('45. GameLoop.updateInput safely unpacks XR context wrapper, updating setXRContext and passing actual XRFrame', () => {
      const wristJoint = createMockXRJoint('wrist');
      const inputSource = createMockXRInputSource({ wrist: wristJoint }, 'right');
      const refSpace = { _id: 'ref-space-live' };
      const wristPose = {
        transform: {
          position: { x: 0.14, y: 1.28, z: -0.42 },
          orientation: { x: 0, y: 0, z: 0, w: 1 },
        },
      };
      const frame = createMockXRFrame({ wrist: wristPose }, refSpace);

      const handAdapter = new HandPoseAdapter({ hand: 'right' });
      const xrLoop = new GameLoop({
        gameplayKenGroup: kenGroup,
        inputSource: handAdapter,
        inputSourceType: 'hand',
        poseFilter: null,
      });

      const setXRSpy = vi.spyOn(xrLoop, 'setXRContext');

      const xrContext = {
        frame,
        referenceSpace: refSpace,
        inputSource,
        hand: 'right',
      };

      // updateInput is called with context wrapper
      xrLoop.inputSystem.update(0.016, xrContext);

      expect(setXRSpy).toHaveBeenCalledWith(xrContext);
      expect(xrLoop.referenceSpace).toBe(refSpace);
      expect(xrLoop.xrInputSource).toBe(inputSource);
      expect(xrLoop.isTrackingValid).toBe(true);
      expect(kenGroup.position.x).toBeCloseTo(0.14);
    });

    it('41. Hand pinch launch: detects pinch on off-hand (left) and launches ball', () => {
      const refSpace = { _id: 'ref-space' };
      const rightWristJoint = createMockXRJoint('wrist');
      const leftThumbJoint = createMockXRJoint('thumb-tip');
      const leftIndexJoint = createMockXRJoint('index-finger-tip');

      const rightWristPose = {
        transform: {
          position: { x: 0.1, y: 1.25, z: -0.45 },
          orientation: { x: 0, y: 0, z: 0, w: 1 },
        },
      };

      const leftThumbPose = {
        transform: { position: { x: -0.1, y: 1.25, z: -0.45 } },
      };
      const leftIndexPosePinch = {
        transform: { position: { x: -0.1, y: 1.265, z: -0.45 } }, // distance 0.015 m (< 0.020 m pinch)
      };
      const leftIndexPoseOpen = {
        transform: { position: { x: -0.1, y: 1.30, z: -0.45 } },  // distance 0.050 m
      };

      const rightInputSource = createMockXRInputSource({ wrist: rightWristJoint }, 'right');
      const leftInputSource = createMockXRInputSource({
        'thumb-tip': leftThumbJoint,
        'index-finger-tip': leftIndexJoint,
      }, 'left');

      const handAdapter = new HandPoseAdapter({ hand: 'right' });
      const xrLoop = new GameLoop({
        eventBus,
        gameplayKenGroup: kenGroup,
        inputSource: handAdapter,
        inputSourceType: 'hand',
        trajectory,
        catchFlow,
        detector,
        scoreManager,
        launchHand: 'left',
      });

      const launchSpy = vi.spyOn(xrLoop, 'launchBall');

      // Frame 1: baseline open (distance 0.05 m)
      const frame1 = createMockXRFrame({
        wrist: rightWristPose,
        'thumb-tip': leftThumbPose,
        'index-finger-tip': leftIndexPoseOpen,
      }, refSpace);

      const ctx1 = {
        frame: frame1,
        referenceSpace: refSpace,
        inputSource: rightInputSource,
        otherInputSource: leftInputSource,
        hand: 'right',
      };

      xrLoop.inputSystem.update(0.016, ctx1);
      expect(catchFlow.state).toBe('seated');
      expect(launchSpy).not.toHaveBeenCalled();

      // Frame 2: pinch closed (distance 0.015 m)
      const frame2 = createMockXRFrame({
        wrist: rightWristPose,
        'thumb-tip': leftThumbPose,
        'index-finger-tip': leftIndexPosePinch,
      }, refSpace);

      const ctx2 = {
        frame: frame2,
        referenceSpace: refSpace,
        inputSource: rightInputSource,
        otherInputSource: leftInputSource,
        hand: 'right',
      };

      xrLoop.inputSystem.update(0.016, ctx2);
      expect(launchSpy).toHaveBeenCalledTimes(1);
      expect(catchFlow.state).toBe('air');
    });

    it('42. Pinch is ignored while the ball is not seated', () => {
      const handAdapter = new HandPoseAdapter({ hand: 'right' });
      const xrLoop = new GameLoop({
        eventBus,
        gameplayKenGroup: kenGroup,
        inputSource: handAdapter,
        inputSourceType: 'hand',
        trajectory,
        catchFlow,
        detector,
        scoreManager,
      });

      // Transition catchFlow into air state via onLaunch
      catchFlow.onLaunch(1);
      expect(catchFlow.state).toBe('air');

      // Manually trigger a pinch launch request
      xrLoop.pinchDetector.update(true, 0.05);
      xrLoop.pinchDetector.update(true, 0.015);
      expect(xrLoop.pinchDetector.launchRequested).toBe(true);

      const launched = xrLoop.launchBall();
      expect(launched).toBe(false);
      expect(catchFlow.state).toBe('air');
    });

    it('43. launchHand config: supports right and either', () => {
      const refSpace = { _id: 'ref-space' };
      const rightWristJoint = createMockXRJoint('wrist');
      const rightThumbJoint = createMockXRJoint('thumb-tip');
      const rightIndexJoint = createMockXRJoint('index-finger-tip');

      const rightWristPose = {
        transform: {
          position: { x: 0.1, y: 1.25, z: -0.45 },
          orientation: { x: 0, y: 0, z: 0, w: 1 },
        },
      };
      const rightThumbPose = { transform: { position: { x: 0.1, y: 1.25, z: -0.45 } } };
      const rightIndexOpenPose = { transform: { position: { x: 0.1, y: 1.30, z: -0.45 } } };
      const rightIndexPinchPose = { transform: { position: { x: 0.1, y: 1.265, z: -0.45 } } };

      const rightInputSource = createMockXRInputSource({
        wrist: rightWristJoint,
        'thumb-tip': rightThumbJoint,
        'index-finger-tip': rightIndexJoint,
      }, 'right');

      const handAdapter = new HandPoseAdapter({ hand: 'right' });
      const xrLoop = new GameLoop({
        eventBus,
        gameplayKenGroup: kenGroup,
        inputSource: handAdapter,
        inputSourceType: 'hand',
        trajectory,
        catchFlow,
        detector,
        scoreManager,
        launchHand: 'right',
      });

      const launchSpy = vi.spyOn(xrLoop, 'launchBall');

      // Baseline frame
      const frame1 = createMockXRFrame({
        wrist: rightWristPose,
        'thumb-tip': rightThumbPose,
        'index-finger-tip': rightIndexOpenPose,
      }, refSpace);
      xrLoop.inputSystem.update(0.016, {
        frame: frame1,
        referenceSpace: refSpace,
        inputSource: rightInputSource,
        hand: 'right',
      });

      // Pinch frame
      const frame2 = createMockXRFrame({
        wrist: rightWristPose,
        'thumb-tip': rightThumbPose,
        'index-finger-tip': rightIndexPinchPose,
      }, refSpace);
      xrLoop.inputSystem.update(0.016, {
        frame: frame2,
        referenceSpace: refSpace,
        inputSource: rightInputSource,
        hand: 'right',
      });

      expect(launchSpy).toHaveBeenCalledTimes(1);
      expect(catchFlow.state).toBe('air');
    });
  });

  describe('Flight Expiration and Miss Handling', () => {
    it('1. no catch -> exactly one MISS and state "seated" after ~0.84 s', () => {
      const missEvents = [];
      eventBus.on(Events.MISS, (evt) => missEvents.push(evt));

      // Build initial streak
      scoreManager.processCatchEvent({ type: 'CLEAN' }, 1000, 999);
      expect(scoreManager.currentStreak).toBe(1);

      // Launch ball
      const launched = gameLoop.launchBall();
      expect(launched).toBe(true);
      expect(catchFlow.state).toBe('air');

      // Step simulation for ~0.84 s (53 frames * 0.016 s = 0.848 s >= FLIGHT_DURATION 0.8390 s)
      // Position Ken away from ball so no catch occurs
      kenGroup.position.set(5.0, 1.25, -0.45);

      for (let i = 0; i < 53; i++) {
        gameLoop.catchDetector.update(0.016, kenGroup);
        gameLoop.scoreManager.update(0.016);
      }

      // Exactly one MISS must have been emitted
      expect(missEvents.length).toBe(1);
      expect(missEvents[0].flightId).toBe(1);
      // CatchFlow must be back in 'seated'
      expect(catchFlow.state).toBe('seated');
      // ScoreManager streak reset
      expect(scoreManager.currentStreak).toBe(0);
    });

    it('2. a second launch is accepted afterwards', () => {
      const missEvents = [];
      eventBus.on(Events.MISS, (evt) => missEvents.push(evt));

      kenGroup.position.set(5.0, 1.25, -0.45);
      gameLoop.launchBall();

      // Run until expired
      for (let i = 0; i < 53; i++) {
        gameLoop.catchDetector.update(0.016, kenGroup);
        gameLoop.scoreManager.update(0.016);
      }
      expect(catchFlow.state).toBe('seated');
      expect(missEvents.length).toBe(1);

      // Second launch should now succeed
      const secondLaunch = gameLoop.launchBall();
      expect(secondLaunch).toBe(true);
      expect(catchFlow.state).toBe('air');
    });

    it('3. a catch on the last tick is a catch, not a miss', () => {
      const catchEvents = [];
      const missEvents = [];
      eventBus.on(Events.CATCH, (evt) => catchEvents.push(evt));
      eventBus.on(Events.MISS, (evt) => missEvents.push(evt));

      gameLoop.launchBall();

      // Run 52 frames away from cup
      kenGroup.position.set(5.0, 1.25, -0.45);
      for (let i = 0; i < 52; i++) {
        gameLoop.catchDetector.update(0.016, kenGroup);
        gameLoop.scoreManager.update(0.016);
      }
      expect(catchFlow.state).toBe('air');
      expect(catchEvents.length).toBe(0);
      expect(missEvents.length).toBe(0);

      // Mock detector to confirm catch on the final frame (53rd frame)
      vi.spyOn(detector, 'evaluateCatch').mockReturnValue({
        confirmed: true,
        valid: true,
        cupKey: CupKey.BIG_CUP,
        catchType: 'clean',
        details: { distance: 0.005, relativeSpeed: 0.1, approachDot: 0.98 },
      });

      // Frame 53 (trajectory expires on this tick)
      gameLoop.catchDetector.update(0.016, kenGroup);
      gameLoop.scoreManager.update(0.016);

      // Must be a catch, not a miss
      expect(catchEvents.length).toBe(1);
      expect(missEvents.length).toBe(0);
      expect(catchFlow.state).toBe('catching');
    });

    it('4. no duplicate MISS if update keeps being called', () => {
      const missEvents = [];
      eventBus.on(Events.MISS, (evt) => missEvents.push(evt));

      kenGroup.position.set(5.0, 1.25, -0.45);
      gameLoop.launchBall();

      // Run 53 frames to expire
      for (let i = 0; i < 53; i++) {
        gameLoop.catchDetector.update(0.016, kenGroup);
        gameLoop.scoreManager.update(0.016);
      }
      expect(missEvents.length).toBe(1);

      // Run 30 additional frames
      for (let i = 0; i < 30; i++) {
        gameLoop.catchDetector.update(0.016, kenGroup);
        gameLoop.scoreManager.update(0.016);
      }
      // Must still be exactly one miss
      expect(missEvents.length).toBe(1);
    });

    it('5. a catch mid-flight produces no MISS', () => {
      const catchEvents = [];
      const missEvents = [];
      eventBus.on(Events.CATCH, (evt) => catchEvents.push(evt));
      eventBus.on(Events.MISS, (evt) => missEvents.push(evt));

      gameLoop.launchBall();

      // Mid-flight (e.g. frame 25 ~0.4s)
      for (let i = 0; i < 25; i++) {
        gameLoop.catchDetector.update(0.016, kenGroup);
        gameLoop.scoreManager.update(0.016);
      }

      // Catch mid-flight
      vi.spyOn(detector, 'evaluateCatch').mockReturnValue({
        confirmed: true,
        valid: true,
        cupKey: CupKey.BIG_CUP,
        catchType: 'clean',
        details: { distance: 0.005, relativeSpeed: 0.1, approachDot: 0.98 },
      });

      gameLoop.catchDetector.update(0.016, kenGroup);
      gameLoop.scoreManager.update(0.016);

      expect(catchEvents.length).toBe(1);
      expect(catchFlow.state).toBe('catching');

      // Continue past 0.84 s (another 40 frames)
      for (let i = 0; i < 40; i++) {
        gameLoop.catchDetector.update(0.016, kenGroup);
        gameLoop.scoreManager.update(0.016);
      }

      // No miss should have been produced
      expect(missEvents.length).toBe(0);
    });

    describe('Flight-end clamp & pre-clamp catch evaluation', () => {
      it('on the landing tick, evaluateCatch receives a non-zero downward velocity', () => {
        let evaluatedVelocityOnLanding = null;
        vi.spyOn(detector, 'evaluateCatch').mockImplementation((pos, vel) => {
          if (!gameLoop.trajectory.isAirborne) {
            evaluatedVelocityOnLanding = { ...vel };
          }
          return { confirmed: false, valid: false, reason: 'out_of_range' };
        });

        gameLoop.launchBall();

        // Run until landing tick (53 frames * 0.016 s = 0.848 s >= FLIGHT_DURATION)
        for (let i = 0; i < 53; i++) {
          gameLoop.catchDetector.update(0.016, kenGroup);
          gameLoop.scoreManager.update(0.016);
        }

        expect(evaluatedVelocityOnLanding).not.toBeNull();
        expect(evaluatedVelocityOnLanding.y).toBeLessThan(0);
        expect(Math.abs(evaluatedVelocityOnLanding.y - (-1.0488))).toBeLessThan(0.001);
      });

      it('a catch whose all checks pass on the landing tick is confirmed (catch beats the expiry miss)', () => {
        const catchEvents = [];
        const missEvents = [];
        eventBus.on(Events.CATCH, (evt) => catchEvents.push(evt));
        eventBus.on(Events.MISS, (evt) => missEvents.push(evt));

        gameLoop.launchBall();

        // 52 ticks in air away from cup
        for (let i = 0; i < 52; i++) {
          gameLoop.catchDetector.update(0.016, kenGroup);
          gameLoop.scoreManager.update(0.016);
        }

        // On landing tick (tick 53), evaluateCatch confirms catch
        vi.spyOn(detector, 'evaluateCatch').mockReturnValue({
          confirmed: true,
          valid: true,
          cupKey: CupKey.BIG_CUP,
          catchType: 'clean',
          details: { distance: 0.005, relativeSpeed: 0.1, approachDot: 0.98 },
        });

        gameLoop.catchDetector.update(0.016, kenGroup);
        gameLoop.scoreManager.update(0.016);

        expect(catchEvents.length).toBe(1);
        expect(missEvents.length).toBe(0);
        expect(catchFlow.state).toBe('catching');
      });

      it('after landing with no catch exactly one MISS', () => {
        const missEvents = [];
        eventBus.on(Events.MISS, (evt) => missEvents.push(evt));

        gameLoop.launchBall();

        // Run past landing
        for (let i = 0; i < 60; i++) {
          gameLoop.catchDetector.update(0.016, kenGroup);
          gameLoop.scoreManager.update(0.016);
        }

        expect(missEvents.length).toBe(1);
        expect(catchFlow.state).toBe('seated');
      });

      it('velocity passed to the detector is identical whether the final tick lands slightly before or after FLIGHT_DURATION (test with dt = 1/60, 1/72, 1/90)', () => {
        const dts = [1 / 60, 1 / 72, 1 / 90];
        const landingVelocities = [];

        for (const dt of dts) {
          const freshBus = new EventBus();
          const freshDetector = new KendamaInputAndDetector({ gameplayKenGroup: kenGroup });
          const freshFlow = new CatchFlow();
          const loop = new GameLoop({
            eventBus: freshBus,
            kenGroup,
            detector: freshDetector,
            catchFlow: freshFlow,
          });

          let capturedLandingVel = null;
          vi.spyOn(freshDetector, 'evaluateCatch').mockImplementation((pos, vel) => {
            if (!loop.trajectory.isAirborne) {
              capturedLandingVel = { ...vel };
            }
            return { confirmed: false, valid: false, reason: 'out_of_range' };
          });

          loop.launchBall();

          // Step until trajectory lands
          for (let step = 0; step < 120; step++) {
            loop.catchDetector.update(dt, kenGroup);
            loop.scoreManager.update(dt);
            if (!loop.trajectory.isAirborne && capturedLandingVel) {
              break;
            }
          }

          expect(capturedLandingVel).not.toBeNull();
          landingVelocities.push(capturedLandingVel.y);
        }

        expect(landingVelocities.length).toBe(3);
        expect(landingVelocities[0]).toBeLessThan(0);
        expect(landingVelocities[0]).toBeCloseTo(landingVelocities[1], 5);
        expect(landingVelocities[1]).toBeCloseTo(landingVelocities[2], 5);
      });
    });

    // ========================================================================
    // O. 2x Wrist-Roll Amplification Integration
    // ========================================================================
    describe('O. 2x Wrist-Roll Amplification Integration', () => {
      it('GameLoop constructor initializes rollGain with DEFAULT_ROLL_GAIN (2.0) or custom option', () => {
        const defaultLoop = new GameLoop({ gameplayKenGroup: kenGroup });
        expect(defaultLoop.rollGain).toBe(2.0);

        const customLoop = new GameLoop({ gameplayKenGroup: kenGroup, rollGain: 1.5 });
        expect(customLoop.rollGain).toBe(1.5);
      });

      it('Hand input branch amplifies wrist twist angle by rollGain (30 deg twist -> 60 deg twist)', () => {
        const adapter = new HandPoseAdapter({ hand: 'right', gripSource: 'wrist' });
        const loop = new GameLoop({
          eventBus,
          gameplayKenGroup: kenGroup,
          inputSource: adapter,
          rollGain: 2.0,
        });

        const q30 = {
          x: 0,
          y: 0,
          z: Math.sin(Math.PI / 12),
          w: Math.cos(Math.PI / 12),
        };

        loop.inputSystem.update(0.016, {
          wrist: {
            position: { x: 0.1, y: 1.25, z: -0.45 },
            quaternion: q30,
            valid: true,
          },
        });

        expect(loop.lastRawTwistDeg).toBeCloseTo(30, 4);
        expect(loop.lastAmplifiedTwistDeg).toBeCloseTo(60, 4);

        const expected60 = {
          z: Math.sin(Math.PI / 6),
          w: Math.cos(Math.PI / 6),
        };
        expect(kenGroup.quaternion.x).toBeCloseTo(0, 5);
        expect(kenGroup.quaternion.y).toBeCloseTo(0, 5);
        expect(kenGroup.quaternion.z).toBeCloseTo(expected60.z, 5);
        expect(kenGroup.quaternion.w).toBeCloseTo(expected60.w, 5);
      });

      it('FakeInput path is unchanged (bypasses wrist roll amplification)', () => {
        const fakeInput = new FakeInput({ autoRoll: false });
        fakeInput._rollAngle = Math.PI / 6; // 30 deg roll

        const loopWithFake = new GameLoop({
          eventBus,
          gameplayKenGroup: kenGroup,
          inputSource: fakeInput,
          rollGain: 2.0,
        });

        loopWithFake.inputSystem.update(0.016);

        // FakeInput quaternion copied directly without amplification (remains 30 deg, NOT amplified to 60 deg)
        const expected30 = {
          z: Math.sin(Math.PI / 12),
          w: Math.cos(Math.PI / 12),
        };
        expect(kenGroup.quaternion.z).toBeCloseTo(expected30.z, 5);
        expect(kenGroup.quaternion.w).toBeCloseTo(expected30.w, 5);
      });

      it('Tracking loss still freezes gameplayKenGroup and resets PoseFilter', () => {
        const adapter = new HandPoseAdapter({ hand: 'right', gripSource: 'wrist' });
        const poseFilter = new PoseFilter();
        const loop = new GameLoop({
          eventBus,
          gameplayKenGroup: kenGroup,
          inputSource: adapter,
          poseFilter,
          rollGain: 2.0,
        });

        const q30 = {
          x: 0,
          y: 0,
          z: Math.sin(Math.PI / 12),
          w: Math.cos(Math.PI / 12),
        };

        // Frame 1: Valid tracking
        loop.inputSystem.update(0.016, {
          wrist: {
            position: { x: 0.15, y: 1.25, z: -0.45 },
            quaternion: q30,
            valid: true,
          },
        });
        expect(loop.isTrackingValid).toBe(true);
        expect(poseFilter.isInitialized()).toBe(true);

        const frozenX = kenGroup.position.x;
        const frozenZ = kenGroup.quaternion.z;

        // Frame 2: Tracking loss (null joints)
        loop.inputSystem.update(0.016, null);
        expect(loop.isTrackingValid).toBe(false);
        expect(poseFilter.isInitialized()).toBe(false);

        // Transform is frozen in place
        expect(kenGroup.position.x).toBe(frozenX);
        expect(kenGroup.quaternion.z).toBe(frozenZ);
      });
    });

    // ========================================================================
    // P. Separate Wrist-Pitch Amplification Integration (Base Cup Only)
    // ========================================================================
    describe('P. Separate Wrist-Pitch Amplification Integration (Base Cup Only)', () => {
      it('GameLoop constructor initializes pitchGain and currentEffectivePitchGain', () => {
        const defaultLoop = new GameLoop({ gameplayKenGroup: kenGroup });
        expect(defaultLoop.pitchGain).toBe(2.0);
        // Default target is 'big' (non-base), so effective gain starts at 1.0
        expect(defaultLoop.currentEffectivePitchGain).toBe(1.0);

        const baseLoop = new GameLoop({ gameplayKenGroup: kenGroup, target: 'base' });
        expect(baseLoop.activeTargetCup).toBe('base');
        expect(baseLoop.currentEffectivePitchGain).toBe(2.0);

        const customLoop = new GameLoop({ gameplayKenGroup: kenGroup, pitchGain: 2.5, target: 'base' });
        expect(customLoop.pitchGain).toBe(2.5);
        expect(customLoop.currentEffectivePitchGain).toBe(2.5);
      });

      it('amplifies pitch ONLY when activeTargetCup is base (45 deg pitch -> 90 deg pitch)', () => {
        const adapter = new HandPoseAdapter({ hand: 'right', gripSource: 'wrist' });
        const loop = new GameLoop({
          eventBus,
          gameplayKenGroup: kenGroup,
          inputSource: adapter,
          target: 'base',
          pitchGain: 2.0,
        });

        const q45Pitch = {
          x: Math.sin(Math.PI / 8),
          y: 0,
          z: 0,
          w: Math.cos(Math.PI / 8),
        };

        loop.inputSystem.update(0.016, {
          wrist: {
            position: { x: 0.1, y: 1.25, z: -0.45 },
            quaternion: q45Pitch,
            valid: true,
          },
        });

        expect(loop.lastRawPitchDeg).toBeCloseTo(45, 3);
        expect(loop.lastAmplifiedPitchDeg).toBeCloseTo(90, 3);

        const expected90Pitch = {
          x: Math.sin(Math.PI / 4),
          y: 0,
          z: 0,
          w: Math.cos(Math.PI / 4),
        };
        expect(kenGroup.quaternion.x).toBeCloseTo(expected90Pitch.x, 5);
        expect(kenGroup.quaternion.y).toBeCloseTo(0, 5);
        expect(kenGroup.quaternion.z).toBeCloseTo(0, 5);
        expect(kenGroup.quaternion.w).toBeCloseTo(expected90Pitch.w, 5);
      });

      it('does NOT amplify pitch when activeTargetCup is non-base (e.g. big, small, spike)', () => {
        const nonBaseTargets = ['big', 'small', 'spike'];

        for (const target of nonBaseTargets) {
          const freshKenGroup = createMockKenGroup();
          const adapter = new HandPoseAdapter({ hand: 'right', gripSource: 'wrist' });
          const loop = new GameLoop({
            eventBus,
            gameplayKenGroup: freshKenGroup,
            inputSource: adapter,
            target,
            pitchGain: 2.0,
          });

          const q45Pitch = {
            x: Math.sin(Math.PI / 8),
            y: 0,
            z: 0,
            w: Math.cos(Math.PI / 8),
          };

          loop.inputSystem.update(0.016, {
            wrist: {
              position: { x: 0.1, y: 1.25, z: -0.45 },
              quaternion: q45Pitch,
              valid: true,
            },
          });

          expect(loop.currentEffectivePitchGain).toBe(1.0);
          expect(loop.lastRawPitchDeg).toBeCloseTo(45, 3);
          expect(loop.lastAmplifiedPitchDeg).toBeCloseTo(45, 3); // Unamplified

          expect(freshKenGroup.quaternion.x).toBeCloseTo(q45Pitch.x, 5);
          expect(freshKenGroup.quaternion.w).toBeCloseTo(q45Pitch.w, 5);
        }
      });

      it('switching target mid-pose changes effective pitch gain smoothly over ~200 ms and settles at correct value', () => {
        const adapter = new HandPoseAdapter({ hand: 'right', gripSource: 'wrist' });
        const loop = new GameLoop({
          eventBus,
          gameplayKenGroup: kenGroup,
          inputSource: adapter,
          target: 'big',
          pitchGain: 2.0,
        });

        const q45Pitch = {
          x: Math.sin(Math.PI / 8),
          y: 0,
          z: 0,
          w: Math.cos(Math.PI / 8),
        };

        const frame = {
          wrist: {
            position: { x: 0.1, y: 1.25, z: -0.45 },
            quaternion: q45Pitch,
            valid: true,
          },
        };

        // Initially target is big: effective gain is 1.0, output pitch is 45 deg
        loop.inputSystem.update(0.016, frame);
        expect(loop.currentEffectivePitchGain).toBeCloseTo(1.0, 4);
        expect(loop.lastAmplifiedPitchDeg).toBeCloseTo(45.0, 2);

        // Switch target to base mid-pose
        loop.activeTargetCup = 'base';

        // Advance 50 ms (0.05 s) -> 25% of 200ms blend: gain increases smoothly
        loop.inputSystem.update(0.05, frame);
        expect(loop.currentEffectivePitchGain).toBeGreaterThan(1.2);
        expect(loop.currentEffectivePitchGain).toBeLessThan(1.3);
        expect(loop.lastAmplifiedPitchDeg).toBeGreaterThan(45.0);
        expect(loop.lastAmplifiedPitchDeg).toBeLessThan(60.0);

        // Advance another 50 ms (0.05 s) -> 50% of 200ms blend: gain around 1.5
        loop.inputSystem.update(0.05, frame);
        expect(loop.currentEffectivePitchGain).toBeCloseTo(1.5, 2);
        expect(loop.lastAmplifiedPitchDeg).toBeCloseTo(45.0 * 1.5, 2);

        // Advance 120 ms (0.12 s) -> total time > 200ms: gain reaches 2.0 and settles
        loop.inputSystem.update(0.12, frame);
        expect(loop.currentEffectivePitchGain).toBeCloseTo(2.0, 4);
        expect(loop.lastAmplifiedPitchDeg).toBeCloseTo(90.0, 2);

        // Subsequent ticks stay settled at 2.0
        loop.inputSystem.update(0.016, frame);
        expect(loop.currentEffectivePitchGain).toBeCloseTo(2.0, 4);
        expect(loop.lastAmplifiedPitchDeg).toBeCloseTo(90.0, 2);
      });

      it('FakeInput path is unchanged (bypasses wrist pitch amplification)', () => {
        const fakeInput = new FakeInput({ autoRoll: false });
        const loopWithFake = new GameLoop({
          eventBus,
          gameplayKenGroup: kenGroup,
          inputSource: fakeInput,
          target: 'base',
          pitchGain: 2.0,
        });

        const q45Pitch = {
          x: Math.sin(Math.PI / 8),
          y: 0,
          z: 0,
          w: Math.cos(Math.PI / 8),
        };
        fakeInput.update = () => {
          fakeInput.gameplayKenGroup.quaternion.x = q45Pitch.x;
          fakeInput.gameplayKenGroup.quaternion.y = 0;
          fakeInput.gameplayKenGroup.quaternion.z = 0;
          fakeInput.gameplayKenGroup.quaternion.w = q45Pitch.w;
        };

        loopWithFake.inputSystem.update(0.016);

        expect(kenGroup.quaternion.x).toBeCloseTo(q45Pitch.x, 5);
        expect(kenGroup.quaternion.w).toBeCloseTo(q45Pitch.w, 5);
      });

      it('Tracking loss still freezes gameplayKenGroup when pitch amplification is active', () => {
        const adapter = new HandPoseAdapter({ hand: 'right', gripSource: 'wrist' });
        const poseFilter = new PoseFilter();
        const loop = new GameLoop({
          eventBus,
          gameplayKenGroup: kenGroup,
          inputSource: adapter,
          poseFilter,
          target: 'base',
          pitchGain: 2.0,
        });

        const q45Pitch = {
          x: Math.sin(Math.PI / 8),
          y: 0,
          z: 0,
          w: Math.cos(Math.PI / 8),
        };

        // Frame 1: Valid tracking
        loop.inputSystem.update(0.016, {
          wrist: {
            position: { x: 0.15, y: 1.25, z: -0.45 },
            quaternion: q45Pitch,
            valid: true,
          },
        });
        expect(loop.isTrackingValid).toBe(true);

        const frozenX = kenGroup.position.x;
        const frozenQuatX = kenGroup.quaternion.x;

        // Frame 2: Tracking loss
        loop.inputSystem.update(0.016, null);
        expect(loop.isTrackingValid).toBe(false);

        expect(kenGroup.position.x).toBe(frozenX);
        expect(kenGroup.quaternion.x).toBe(frozenQuatX);
      });
    });

    // ========================================================================
    // Q. Pitch & Roll Pose Overrides (?pitchDeg, ?rollDeg)
    // ========================================================================
    describe('Q. Pitch & Roll Pose Overrides (?pitchDeg, ?rollDeg)', () => {
      it('replaces measured pitch twist with pitchDegOverride before amplification (70 deg -> 140 deg)', () => {
        const adapter = new HandPoseAdapter({ hand: 'right', gripSource: 'wrist' });
        const loop = new GameLoop({
          eventBus,
          gameplayKenGroup: kenGroup,
          inputSource: adapter,
          target: 'base',
          pitchGain: 2.0,
          pitchDeg: 70.0,
        });

        // Feed neutral orientation from hand pose
        loop.inputSystem.update(0.016, {
          wrist: {
            position: { x: 0.1, y: 1.25, z: -0.45 },
            quaternion: { x: 0, y: 0, z: 0, w: 1 },
            valid: true,
          },
        });

        expect(loop.lastRawPitchDeg).toBeCloseTo(70.0, 2);
        expect(loop.lastAmplifiedPitchDeg).toBeCloseTo(140.0, 2);
      });

      it('replaces measured roll twist with rollDegOverride before amplification (30 deg -> 60 deg)', () => {
        const adapter = new HandPoseAdapter({ hand: 'right', gripSource: 'wrist' });
        const loop = new GameLoop({
          eventBus,
          gameplayKenGroup: kenGroup,
          inputSource: adapter,
          target: 'big',
          rollGain: 2.0,
          rollDeg: 30.0,
        });

        // Feed neutral orientation from hand pose
        loop.inputSystem.update(0.016, {
          wrist: {
            position: { x: 0.1, y: 1.25, z: -0.45 },
            quaternion: { x: 0, y: 0, z: 0, w: 1 },
            valid: true,
          },
        });

        expect(loop.lastRawTwistDeg).toBeCloseTo(30.0, 2);
        expect(loop.lastAmplifiedTwistDeg).toBeCloseTo(60.0, 2);
      });

      it('without overrides, hand pose pitch and roll remain untouched', () => {
        const adapter = new HandPoseAdapter({ hand: 'right', gripSource: 'wrist' });
        const loop = new GameLoop({
          eventBus,
          gameplayKenGroup: kenGroup,
          inputSource: adapter,
          target: 'base',
          pitchGain: 2.0,
        });

        const q45 = {
          x: Math.sin(Math.PI / 8),
          y: 0,
          z: 0,
          w: Math.cos(Math.PI / 8),
        };

        loop.inputSystem.update(0.016, {
          wrist: {
            position: { x: 0.1, y: 1.25, z: -0.45 },
            quaternion: q45,
            valid: true,
          },
        });

        expect(loop.lastRawPitchDeg).toBeCloseTo(45.0, 2);
        expect(loop.lastAmplifiedPitchDeg).toBeCloseTo(90.0, 2);
      });
    });
  });
});
