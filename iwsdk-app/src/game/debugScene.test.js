/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { setupDebugScene, isDebugMode, getTargetOverride, getRollGainOverride } from './debugScene.js';
import { CatchFlow, computeCupWorldSeatPoint } from './CatchFlow.js';
import { BALL_RADIUS } from '../input/cupConfigs.js';
import { EventBus } from '../contracts/EventBus.js';
import { Events, CatchResult, CatchType } from '../contracts/Interfaces.js';

describe('debugScene Module', () => {
  let eventBus;
  let mockScene;
  let mockKenGroup;
  let mockGameLoop;
  let mockGame;
  let mockWorld;

  beforeEach(() => {
    eventBus = new EventBus();
    mockScene = new THREE.Scene();
    mockKenGroup = new THREE.Group();

    mockGameLoop = {
      eventBus,
      isTrackingValid: true,
      inputSource: {
        lostFrames: 0,
        trackingConfidence: 1.0,
      },
      getBallState: vi.fn(() => ({
        position: { x: 0.1, y: 1.2, z: -0.3 },
        velocity: { x: 0, y: 0, z: 0 },
        mode: 'seated',
      })),
    };

    mockGame = {
      eventBus,
      gameplayKenGroup: mockKenGroup,
      xrSystem: {
        updateCount: 90,
      },
      pipeline: {
        catchDetector: {
          getBallState: () => mockGameLoop.getBallState(),
        },
      },
    };

    mockWorld = {
      scene: mockScene,
      xrFrame: null,
      xrReferenceSpace: null,
      input: {
        xr: {
          getPrimaryInputSource: vi.fn(),
        },
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. isDebugMode returns false when window.location has no debug parameter', () => {
    expect(isDebugMode()).toBe(false);
  });

  it('2. setupDebugScene returns null when debug is inactive', () => {
    const result = setupDebugScene({
      world: mockWorld,
      game: mockGame,
      gameLoop: mockGameLoop,
      debug: false,
    });
    expect(result).toBeNull();
    expect(mockKenGroup.children.length).toBe(0);
    expect(mockScene.children.length).toBe(0);
  });

  it('3. setupDebugScene creates placeholder Ken box and BALL_RADIUS Tama sphere when debug is active', () => {
    const result = setupDebugScene({
      world: mockWorld,
      game: mockGame,
      gameLoop: mockGameLoop,
      debug: true,
    });

    expect(result).not.toBeNull();
    expect(result.kenBox).toBeInstanceOf(THREE.Mesh);
    expect(result.kenBox.name).toBe('debug-ken-box');
    expect(mockKenGroup.children).toContain(result.kenBox);

    expect(result.tamaSphere).toBeInstanceOf(THREE.Mesh);
    expect(result.tamaSphere.name).toBe('debug-tama-sphere');
    expect(mockScene.children).toContain(result.tamaSphere);

    // Verify sphere geometry radius matches BALL_RADIUS
    expect(result.tamaSphere.geometry.parameters.radius).toBe(BALL_RADIUS);

    // Initial position synced from getBallState
    expect(result.tamaSphere.position.x).toBeCloseTo(0.1);
    expect(result.tamaSphere.position.y).toBeCloseTo(1.2);
    expect(result.tamaSphere.position.z).toBeCloseTo(-0.3);

    result.cleanup();
  });

  it('4. Tama sphere follows ballState.position on every Events.BALL update', () => {
    const result = setupDebugScene({
      world: mockWorld,
      game: mockGame,
      gameLoop: mockGameLoop,
      debug: true,
    });

    eventBus.emit(Events.BALL, {
      position: { x: 0.25, y: 1.5, z: -0.4 },
      mode: 'air',
    });

    expect(result.tamaSphere.position.x).toBeCloseTo(0.25);
    expect(result.tamaSphere.position.y).toBeCloseTo(1.5);
    expect(result.tamaSphere.position.z).toBeCloseTo(-0.4);

    result.cleanup();
  });

  it('5. logDebugStatus outputs ONE compact line per second only when changed or every 5 seconds', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = setupDebugScene({
      world: mockWorld,
      game: mockGame,
      gameLoop: mockGameLoop,
      debug: true,
    });

    // Clear startup [DEBUG CupReq] log before testing logDebugStatus
    consoleSpy.mockClear();

    // Initial log with no catches yet
    result.logDebugStatus();
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DEBUG] valid: true | pinch: open (N/A) | mode: seated | flight: none | last: none')
    );

    // Second call without any state change should be suppressed
    consoleSpy.mockClear();
    result.logDebugStatus();
    expect(consoleSpy).not.toHaveBeenCalled();

    // Emit a catch event and change tracking
    const catchResult = new CatchResult({
      type: CatchType.CLEAN,
      cupKey: 'big',
      distance: 0.005,
    });
    eventBus.emit(Events.CATCH, catchResult);

    mockGameLoop.isTrackingValid = false;
    mockGameLoop.getBallState = vi.fn(() => ({
      position: { x: 0, y: 1, z: 0 },
      mode: 'air',
    }));

    result.logDebugStatus();
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DEBUG] valid: false | pinch: open (N/A) | mode: air | flight: none | last: CATCH: CLEAN (big)')
    );

    // Call 4 more times with no change: should remain suppressed until 5th tick
    consoleSpy.mockClear();
    result.logDebugStatus();
    result.logDebugStatus();
    result.logDebugStatus();
    result.logDebugStatus();
    expect(consoleSpy).not.toHaveBeenCalled();

    // 5th tick: forces periodic log
    result.logDebugStatus();
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DEBUG] valid: false | pinch: open (N/A) | mode: air | flight: none | last: CATCH: CLEAN (big)')
    );

    result.cleanup();
  });

  it('6. cleanup removes added meshes from parent group and scene', () => {
    const result = setupDebugScene({
      world: mockWorld,
      game: mockGame,
      gameLoop: mockGameLoop,
      debug: true,
    });

    expect(mockKenGroup.children.length).toBe(1);
    expect(mockScene.children.length).toBe(1);

    result.cleanup();

    expect(mockKenGroup.children.length).toBe(0);
    expect(mockScene.children.length).toBe(0);
  });

  it('7. getDiagnosticState captures detailed XR frame, refSpace, hand joints, and input sources', () => {
    const mockWristJoint = { _type: 'wristJoint' };
    const mockRefSpace = { _type: 'refSpace' };
    const mockPose = { transform: { position: { x: 0, y: 1, z: 0 } } };

    const mockRightHandSource = {
      handedness: 'right',
      hand: {
        get: vi.fn((joint) => (joint === 'wrist' ? mockWristJoint : null)),
      },
      gamepad: null,
    };

    const mockLeftControllerSource = {
      handedness: 'left',
      hand: null,
      gamepad: { id: 'mock-controller-gamepad' },
    };

    mockWorld.xrReferenceSpace = mockRefSpace;
    mockWorld.xrFrame = {
      session: {
        inputSources: [mockRightHandSource, mockLeftControllerSource],
      },
      getJointPose: vi.fn((joint, refSpace) => {
        if (joint === mockWristJoint && refSpace === mockRefSpace) {
          return mockPose;
        }
        return null;
      }),
    };

    mockWorld.input.xr.getPrimaryInputSource.mockImplementation((hand) => {
      if (hand === 'right') return mockRightHandSource;
      if (hand === 'left') return mockLeftControllerSource;
      return null;
    });

    mockGameLoop.inputSource = {
      lostFrames: 2,
      trackingConfidence: 0.85,
    };
    mockGameLoop.pinchDetector = {
      isPinched: true,
      lastDistance: 0.015,
    };

    mockGame.xrSystem.updateCount = 72;

    const result = setupDebugScene({
      world: mockWorld,
      game: mockGame,
      gameLoop: mockGameLoop,
      debug: true,
    });

    const diag = result.getDiagnosticState();
    expect(diag.ticksInLastSecond).toBe(72);
    expect(diag.hasXrFrame).toBe(true);
    expect(diag.hasXrRefSpace).toBe(true);
    expect(diag.hasPrimaryInputSource).toBe(true);
    expect(diag.hasHand).toBe(true);
    expect(diag.handedness).toBe('right');
    expect(diag.hasWristJoint).toBe(true);
    expect(diag.hasJointPose).toBe(true);
    expect(diag.lostFrames).toBe(2);
    expect(diag.trackingConfidence).toBe(0.85);
    expect(diag.isPinched).toBe(true);
    expect(diag.pinchState).toBe('pinched');
    expect(diag.pinchDistanceCm).toBe('1.50');
    expect(diag.sourcesList).toEqual([
      { handedness: 'right', hasHand: true, hasGamepad: false },
      { handedness: 'left', hasHand: false, hasGamepad: true },
    ]);

    result.cleanup();
  });

  it('8. getDiagnosticState captures detailed tracking and input sources diagnostics', () => {
    mockWorld.xrFrame = null;
    mockWorld.xrReferenceSpace = null;
    mockWorld.input.xr.getPrimaryInputSource.mockReturnValue(null);

    const result = setupDebugScene({
      world: mockWorld,
      game: mockGame,
      gameLoop: mockGameLoop,
      debug: true,
    });

    const diag = result.getDiagnosticState();
    expect(diag.hasXrFrame).toBe(false);
    expect(diag.hasXrRefSpace).toBe(false);
    expect(diag.hasPrimaryInputSource).toBe(false);
    expect(diag.hasHand).toBe(false);
    expect(diag.handedness).toBe('none');
    expect(diag.hasWristJoint).toBe(false);
    expect(diag.hasJointPose).toBe(false);
    expect(diag.lostFrames).toBe(0);
    expect(diag.trackingConfidence).toBe(1);

    result.cleanup();
  });

  it('9. getDiagnosticState compiles ball, flight, trajectory update rate, and miss threshold diagnostics', () => {
    mockKenGroup.position.set(0.15, 1.25, -0.45);
    mockGameLoop.trajectoryUpdateCount = 60;
    mockGameLoop.getBallState = vi.fn(() => ({
      position: { x: 0.15, y: 1.42, z: -0.45 },
      velocity: { x: 0, y: -0.85, z: 0 },
      mode: 'air',
    }));
    mockGameLoop.trajectory = {
      flightId: 'flight-101',
      state: {
        position: { x: 0.15, y: 1.42, z: -0.45 },
        velocity: { x: 0, y: -0.85, z: 0 },
      },
    };
    mockGameLoop.lastLaunchInfo = {
      source: 'pinch',
      position: { x: 0.15, y: 1.25, z: -0.45 },
      velocity: { x: 0, y: 1.049, z: 0 },
      flightId: 'flight-101',
      timestamp: 123456,
    };

    const result = setupDebugScene({
      world: mockWorld,
      game: mockGame,
      gameLoop: mockGameLoop,
      debug: true,
    });

    const diag = result.getDiagnosticState();
    expect(diag.ballPosition).toEqual({ x: 0.15, y: 1.42, z: -0.45 });
    expect(diag.ballVelocityY).toBe(-0.85);
    expect(diag.flightId).toBe('flight-101');
    expect(diag.kenPosY).toBeCloseTo(1.25);
    expect(diag.trajUpdatesInLastSecond).toBe(60);
    expect(diag.missThresholdInfo.kenRelativeThreshold).toBe('0.8000');
    expect(diag.missThresholdInfo.floorThreshold).toContain('none');
    expect(diag.lastLaunchInfo.source).toBe('pinch');

    result.cleanup();
  });

  it('10. onFrame logs target cup world normal/position and Ken Euler degrees at launch and final tick (Item 3)', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    mockKenGroup.position.set(0.0, 1.25, -0.45);
    mockKenGroup.quaternion.set(0, 0, 0, 1);
    mockGameLoop.activeTargetCup = 'big';
    mockGameLoop.trajectory = {
      flightId: 1,
      elapsed: 0.0,
      flightDuration: 0.8390,
      state: { velocity: { x: 0, y: 1.0, z: 0 } },
    };
    mockGameLoop.catchFlow = {
      seatCupKey: 'big',
      ballPosition: { x: 0, y: 1.25, z: -0.45 },
    };

    const result = setupDebugScene({
      world: mockWorld,
      game: mockGame,
      gameLoop: mockGameLoop,
      debug: true,
    });

    // 1. Launch transition: from seated to air
    result.onFrame({ position: { x: 0, y: 1.25, z: -0.45 }, mode: 'air' });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DEBUG Launch] flight: 1 | target: big | seatCup: big | ballPos: (0.0000, 1.2500, -0.4500) | cupPos: (')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('cupDists: (big: ')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('kenRotDeg: (0.00°, 0.00°, 0.00°)')
    );

    // 2. Final tick transition: from air to seated (pre-clamp velocity preserved)
    consoleSpy.mockClear();
    mockGameLoop.trajectory.state.velocity = { x: 0, y: 0, z: 0 };
    mockGameLoop.trajectory.state.lastAirVelocity = { x: 0, y: -1.0488, z: 0 };
    mockGameLoop.lastEvaluatedVelocity = { x: 0, y: -1.0488, z: 0 };
    result.onFrame({ position: { x: 0, y: 1.25, z: -0.45 }, mode: 'seated' });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DEBUG FinalTick] flight: 1 | target: big | cupPos: (')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('evalVel: (0.0000, -1.0488, 0.0000) [pre-clamp]')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('kenRotDeg: (0.00°, 0.00°, 0.00°)')
    );

    result.cleanup();
  });

  it('11. onFrame logs target evaluation while in air once per second and on each of last 5 ticks (Item 2)', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    mockKenGroup.position.set(0.0, 1.25, -0.45);
    mockGameLoop.activeTargetCup = 'big';
    mockGameLoop.lastCatchEvaluation = {
      confirmed: false,
      valid: false,
      reason: 'out_of_range',
      confirmationCount: 0,
      details: {
        distance: 0.075,
        cleanRadius: 0.04,
        assistedRadius: 0.06,
        approachDot: -0.15,
        relativeSpeed: 0.95,
      },
    };

    mockGameLoop.trajectory = {
      flightId: 2,
      elapsed: 0.80, // remaining = 0.039s -> ~2 ticks left at dt=0.016
      flightDuration: 0.8390,
      state: { velocity: { x: 0, y: -0.5, z: 0 } },
    };
    mockGameLoop.lastDt = 0.016;

    const result = setupDebugScene({
      world: mockWorld,
      game: mockGame,
      gameLoop: mockGameLoop,
      debug: true,
    });

    // Baseline transition to air
    result.onFrame({ position: { x: 0, y: 1.35, z: -0.45 }, mode: 'air' });

    // Expect Item 2 logged with tick countdown
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DEBUG TargetEval Tick -2] flight: 2 | cup: big | dist: 0.0750m (R_clean: 0.0400m, R_assist: 0.0600m) | dot: -0.150 (req < -0.2) | relSpeed: 0.950 m/s (max: none) | firstFail: out_of_range | confirmed: false, valid: false | confirmCount: 0/2')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DEBUG BallPosComp Tick -2] flight: 2 | trajPos:')
    );

    result.cleanup();
  });

  it('12. onFrame logs closest distance reached once per flight on flight end (Item 4) ignoring vy >= 0 (Item 2)', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    mockKenGroup.position.set(0.0, 1.25, -0.45);
    mockGameLoop.activeTargetCup = 'big';
    mockGameLoop.trajectory = {
      flightId: 3,
      elapsed: 0.10,
      flightDuration: 0.8390,
      state: { velocity: { x: 0, y: 1.5, z: 0 } },
    };

    const result = setupDebugScene({
      world: mockWorld,
      game: mockGame,
      gameLoop: mockGameLoop,
      debug: true,
    });

    // 1. Launch
    result.onFrame({ position: { x: 0, y: 1.25, z: -0.45 }, mode: 'air' });

    // 2. Proximity check while vy > 0 (ascent - before apex): distance 0.0100 m should NOT be recorded
    mockGameLoop.lastCatchEvaluation = {
      details: { distance: 0.0100 },
      reason: null,
      valid: true,
    };
    result.onFrame({ position: { x: 0, y: 1.30, z: -0.45 }, mode: 'air' });

    // 3. Proximity check after apex (vy < 0): distance 0.0210 m at t=0.42s
    mockGameLoop.trajectory.elapsed = 0.42;
    mockGameLoop.trajectory.state.velocity.y = -0.5;
    mockGameLoop.lastCatchEvaluation = {
      details: { distance: 0.0210 },
      reason: null,
      valid: true,
    };
    result.onFrame({ position: { x: 0, y: 1.40, z: -0.45 }, mode: 'air' });

    // 4. Flight ends
    consoleSpy.mockClear();
    result.onFrame({ position: { x: 0, y: 1.25, z: -0.45 }, mode: 'seated' });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DEBUG Closest] flight: 3 | target: big | minDistance: 0.0210m at t=0.420s')
    );

    result.cleanup();
  });

  it('13. getTargetOverride parses valid target cups when debug is enabled', () => {
    const originalWindow = globalThis.window;
    try {
      globalThis.window = { location: { search: '?debug&target=spike' } };
      expect(getTargetOverride()).toBe('spike');

      globalThis.window = { location: { search: '?debug&target=base' } };
      expect(getTargetOverride()).toBe('base');

      globalThis.window = { location: { search: '?debug&target=small' } };
      expect(getTargetOverride()).toBe('small');

      globalThis.window = { location: { search: '?debug&target=big' } };
      expect(getTargetOverride()).toBe('big');

      globalThis.window = { location: { search: '?debug&target=invalid' } };
      expect(getTargetOverride()).toBeNull();

      globalThis.window = { location: { search: '?target=spike' } };
      expect(getTargetOverride()).toBeNull();
    } finally {
      if (originalWindow !== undefined) {
        globalThis.window = originalWindow;
      } else {
        delete globalThis.window;
      }
    }
  });

  it('14. setupDebugScene forces target cup override on gameLoop (Item 1)', () => {
    mockGameLoop.activeTargetCup = 'big';
    const result = setupDebugScene({
      world: mockWorld,
      game: mockGame,
      gameLoop: mockGameLoop,
      debug: true,
      target: 'base',
    });

    expect(mockGameLoop.targetOverride).toBe('base');
    expect(mockGameLoop.activeTargetCup).toBe('base');

    result.cleanup();
  });

  it('15. setupDebugScene logs SCORE and MISS events (Item 3)', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = setupDebugScene({
      world: mockWorld,
      game: mockGame,
      gameLoop: mockGameLoop,
      debug: true,
    });

    eventBus.emit(Events.SCORE, {
      catchType: CatchType.CLEAN,
      multipliers: { accuracy: 1.5, cadence: 1.2, streak: 2.0, total: 3.6 },
      awardedEnergy: 45,
      totalEnergy: 120,
      currentStreak: 3,
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DEBUG Score] catchType: CLEAN | multipliers: (accuracy: 1.5, cadence: 1.2, streak: 2, total: 3.6) | awardedEnergy: 45 | totalEnergy: 120 | streak: 3')
    );

    eventBus.emit(Events.MISS, { flightId: 42 });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DEBUG Miss] flightId: 42')
    );

    result.cleanup();
  });

  it('16. onFrame logs ticks inside R_assist and R_clean, and frame rate on flight end (Item 4)', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    mockKenGroup.position.set(0.0, 1.25, -0.45);
    mockGameLoop.activeTargetCup = 'big';
    mockGameLoop.lastDt = 0.016;
    mockGameLoop.trajectory = {
      flightId: 4,
      elapsed: 0.1,
      flightDuration: 0.8390,
      state: { velocity: { x: 0, y: -0.1, z: 0 } },
    };

    const result = setupDebugScene({
      world: mockWorld,
      game: mockGame,
      gameLoop: mockGameLoop,
      debug: true,
    });

    // Launch
    result.onFrame({ position: { x: 0, y: 1.25, z: -0.45 }, mode: 'air' });

    // Tick 1: inside R_assist (dist 0.05, assist=0.06, clean=0.04)
    mockGameLoop.lastCatchEvaluation = {
      details: { distance: 0.05, assistedRadius: 0.06, cleanRadius: 0.04 },
      valid: true,
    };
    result.onFrame({ position: { x: 0, y: 1.30, z: -0.45 }, mode: 'air' });

    // Tick 2: inside R_clean (dist 0.03, assist=0.06, clean=0.04)
    mockGameLoop.lastCatchEvaluation = {
      details: { distance: 0.03, assistedRadius: 0.06, cleanRadius: 0.04 },
      valid: true,
    };
    result.onFrame({ position: { x: 0, y: 1.30, z: -0.45 }, mode: 'air' });

    // Tick 3: outside both (dist 0.10)
    mockGameLoop.lastCatchEvaluation = {
      details: { distance: 0.10, assistedRadius: 0.06, cleanRadius: 0.04 },
      valid: false,
    };
    result.onFrame({ position: { x: 0, y: 1.30, z: -0.45 }, mode: 'air' });

    // Flight ends
    consoleSpy.mockClear();
    result.onFrame({ position: { x: 0, y: 1.25, z: -0.45 }, mode: 'seated' });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DEBUG Proximity] flight: 4 | ticksInsideAssist: 2 | ticksInsideClean: 1 | dt: 16.00ms (~63 FPS)')
    );

    result.cleanup();
  });

  it('17. with ?target=big the ball is seated at the big cup position before launch, after MISS returns to big cup; without override remains spike', () => {
    const ken = new THREE.Group();
    ken.position.set(0.1, 1.25, -0.45);

    // Case A: With ?target=big override
    const catchFlowBig = new CatchFlow({ initialCup: 'spike', kenPose: ken });
    expect(catchFlowBig.seatCupKey).toBe('spike');

    const loopBig = {
      eventBus,
      gameplayKenGroup: ken,
      catchFlow: catchFlowBig,
      activeTargetCup: 'big',
      getBallState: () => ({ position: catchFlowBig.ballPosition, mode: catchFlowBig.state }),
    };

    const debugBig = setupDebugScene({
      world: mockWorld,
      game: { eventBus, gameplayKenGroup: ken },
      gameLoop: loopBig,
      debug: true,
      target: 'big',
    });

    // 1. Ball is seated at big cup before launch
    expect(catchFlowBig.seatCupKey).toBe('big');
    const expectedBigSeat = computeCupWorldSeatPoint('big', ken);
    expect(catchFlowBig.ballPosition.x).toBeCloseTo(expectedBigSeat.x, 5);
    expect(catchFlowBig.ballPosition.y).toBeCloseTo(expectedBigSeat.y, 5);
    expect(catchFlowBig.ballPosition.z).toBeCloseTo(expectedBigSeat.z, 5);

    // 2. Launch ball
    catchFlowBig.onLaunch(10);
    expect(catchFlowBig.state).toBe('air');

    // 3. After MISS, ball returns to big cup
    catchFlowBig.reportMiss(ken);
    expect(catchFlowBig.state).toBe('seated');
    expect(catchFlowBig.seatCupKey).toBe('big');
    expect(catchFlowBig.ballPosition.x).toBeCloseTo(expectedBigSeat.x, 5);
    expect(catchFlowBig.ballPosition.y).toBeCloseTo(expectedBigSeat.y, 5);
    expect(catchFlowBig.ballPosition.z).toBeCloseTo(expectedBigSeat.z, 5);

    debugBig.cleanup();

    // Case B: Without target override (?target absent)
    const catchFlowSpike = new CatchFlow({ initialCup: 'spike', kenPose: ken });
    const loopSpike = {
      eventBus,
      gameplayKenGroup: ken,
      catchFlow: catchFlowSpike,
      activeTargetCup: 'big',
      getBallState: () => ({ position: catchFlowSpike.ballPosition, mode: catchFlowSpike.state }),
    };

    const debugSpike = setupDebugScene({
      world: mockWorld,
      game: { eventBus, gameplayKenGroup: ken },
      gameLoop: loopSpike,
      debug: true,
      // no target override
    });

    // Behavior is unchanged: seat cup is spike
    expect(catchFlowSpike.seatCupKey).toBe('spike');
    const expectedSpikeSeat = computeCupWorldSeatPoint('spike', ken);
    expect(catchFlowSpike.ballPosition.x).toBeCloseTo(expectedSpikeSeat.x, 5);
    expect(catchFlowSpike.ballPosition.y).toBeCloseTo(expectedSpikeSeat.y, 5);
    expect(catchFlowSpike.ballPosition.z).toBeCloseTo(expectedSpikeSeat.z, 5);

    debugSpike.cleanup();
  });

  it('18. logs [DEBUG FinalTickBallCup] on landing tick and includes landing tick in [DEBUG Closest]', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    mockKenGroup.name = 'gameplayKenGroup';
    mockKenGroup.position.set(0.0, 1.25, -0.45);
    mockKenGroup.updateMatrixWorld(true);

    mockGameLoop.activeTargetCup = 'big';
    mockGameLoop.lastDt = 0.016;
    mockGameLoop.trajectory = {
      flightId: 7,
      elapsed: 0.839,
      flightDuration: 0.8390,
      state: { velocity: { x: 0, y: -0.1, z: 0 } },
    };
    mockGameLoop.lastEvaluatedBallPosition = { x: 0.06075, y: 1.25, z: -0.45 };
    mockGameLoop.detector = {
      gameplayKenGroup: mockKenGroup,
      evaluateCatch: vi.fn(),
    };

    const result = setupDebugScene({
      world: mockWorld,
      game: mockGame,
      gameLoop: mockGameLoop,
      debug: true,
      target: 'big',
    });

    // Launch with vy > 0 (going up, should not count towards closest)
    mockGameLoop.trajectory.state.velocity.y = 1.0;
    mockGameLoop.lastCatchEvaluation = {
      details: {
        distance: 0.001,
        assistedRadius: 0.06,
        cleanRadius: 0.04,
        cupWorldPosition: { x: 0.06075, y: 1.25, z: -0.45 },
      },
      valid: true,
    };
    result.onFrame({ position: { x: 0.06075, y: 1.25, z: -0.45 }, mode: 'air' });

    // Mid-air tick with vy < 0 and distance = 0.05
    mockGameLoop.trajectory.state.velocity.y = -0.5;
    mockGameLoop.lastCatchEvaluation = {
      details: {
        distance: 0.05,
        assistedRadius: 0.06,
        cleanRadius: 0.04,
        cupWorldPosition: { x: 0.06075, y: 1.25, z: -0.45 },
      },
      valid: true,
    };
    result.onFrame({ position: { x: 0.06075, y: 1.30, z: -0.45 }, mode: 'air' });

    // Landing tick where landing distance is 0.01 (closer than mid-air 0.05)
    mockGameLoop.lastCatchEvaluation = {
      details: {
        distance: 0.01,
        assistedRadius: 0.06,
        cleanRadius: 0.04,
        cupWorldPosition: { x: 0.06075, y: 1.25, z: -0.45 },
      },
      valid: true,
    };

    consoleSpy.mockClear();
    result.onFrame({ position: { x: 0.06075, y: 1.25, z: -0.45 }, mode: 'seated' });

    // Verify [DEBUG FinalTickBallCup] log
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DEBUG FinalTickBallCup] flight: 7 | target: big | ballPos: (0.0607, 1.2500, -0.4500) | cupPos: (0.0607, 1.2500, -0.4500) | group: gameplayKenGroup (matrixWorldUpdated: yes)')
    );

    // Verify [DEBUG BallPosComp Final] log
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DEBUG BallPosComp Final] flight: 7 | trajPos: (0.0000, 0.0000, 0.0000) (startY: 0.0000) | catchFlowPos:')
    );

    // Verify [DEBUG Closest] captured landing tick (0.0100m at t=0.839s)
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DEBUG Closest] flight: 7 | target: big | minDistance: 0.0100m at t=0.839s')
    );

    result.cleanup();
  });

  it('19. setupDebugScene supports ?rollGain=N override and logs rollGain & twist angles in [DEBUG Launch]', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    mockKenGroup.position.set(0.0, 1.25, -0.45);
    mockKenGroup.quaternion.set(0, 0, Math.sin(Math.PI / 12), Math.cos(Math.PI / 12)); // 30 deg twist
    mockGameLoop.rollGain = 2.0;
    mockGameLoop.lastRawTwistDeg = 30.0;
    mockGameLoop.lastAmplifiedTwistDeg = 60.0;

    const result = setupDebugScene({
      world: mockWorld,
      game: mockGame,
      gameLoop: mockGameLoop,
      debug: true,
      rollGain: 3.5,
    });

    // Check that gameLoop.rollGain was overridden to 3.5
    expect(mockGameLoop.rollGain).toBe(3.5);

    // Trigger launch frame
    result.onFrame({ position: { x: 0, y: 1.25, z: -0.45 }, mode: 'air' });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DEBUG Launch] flight:')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('| rollGain: 3.50 | twistDeg: (raw: 30.00°, amp: 60.00°)')
    );

    result.cleanup();
  });

  it('20. setupDebugScene logs the last 3 ticks of a flight including landing tick with evaluateCatch status', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    mockKenGroup.position.set(0.0, 1.5, -0.45);
    mockKenGroup.quaternion.set(0, 0, 0, 1);
    mockGameLoop.lastDt = 0.0167;
    mockGameLoop.lastTickEvaluatedCatch = true;
    mockGameLoop.trajectory = {
      flightId: 99,
      elapsed: 0.8390,
      flightDuration: 0.8390,
      _position: { x: 0.0, y: 1.5, z: -0.45 },
      _startY: 1.5,
      isAirborne: false,
    };

    const result = setupDebugScene({
      world: mockWorld,
      game: mockGame,
      gameLoop: mockGameLoop,
      debug: true,
      target: 'big',
    });

    // Launch
    result.onFrame({ position: { x: 0, y: 1.5, z: -0.45 }, mode: 'air' });

    // Tick -2
    mockGameLoop.trajectory.elapsed = 0.8167;
    mockGameLoop.trajectory._position.y = 1.5228;
    mockGameLoop.trajectory.isAirborne = true;
    result.onFrame({ position: { x: 0, y: 1.5228, z: -0.45 }, mode: 'air' });

    // Tick -1
    mockGameLoop.trajectory.elapsed = 0.8333;
    mockGameLoop.trajectory._position.y = 1.5060;
    mockGameLoop.trajectory.isAirborne = true;
    result.onFrame({ position: { x: 0, y: 1.5060, z: -0.45 }, mode: 'air' });

    // Final / Landing Tick
    mockGameLoop.trajectory.elapsed = 0.8390;
    mockGameLoop.trajectory._position.y = 1.5000;
    mockGameLoop.trajectory.isAirborne = false;
    result.onFrame({ position: { x: 0, y: 1.5000, z: -0.45 }, mode: 'seated' });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DEBUG Last3Ticks Tick -2] flight: 99 | elapsed: 0.8167s | flightDuration: 0.8390s | trajPosY: 1.5228m | startY: 1.5000m | isAirborne: true | dt: 0.0167s | evaluateCatchRan: yes')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DEBUG Last3Ticks Tick -1] flight: 99 | elapsed: 0.8333s | flightDuration: 0.8390s | trajPosY: 1.5060m | startY: 1.5000m | isAirborne: true | dt: 0.0167s | evaluateCatchRan: yes')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DEBUG Last3Ticks Final] flight: 99 | elapsed: 0.8390s | flightDuration: 0.8390s | trajPosY: 1.5000m | startY: 1.5000m | isAirborne: false | dt: 0.0167s | evaluateCatchRan: yes')
    );

    result.cleanup();
  });

  it('21. setupDebugScene logs one-time [DEBUG CupReq] line at startup with local normals and thresholds', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = setupDebugScene({
      world: mockWorld,
      game: mockGame,
      gameLoop: mockGameLoop,
      debug: true,
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DEBUG CupReq] cup: big | localNorm: (1.0, 0.0, 0.0) | alignThresh: -0.2 (dot < -0.2) | orientThresh: <= 40.0° (dotUp >= 0.7660)')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DEBUG CupReq] cup: small | localNorm: (-1.0, 0.0, 0.0) | alignThresh: -0.2 (dot < -0.2) | orientThresh: <= 40.0° (dotUp >= 0.7660)')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DEBUG CupReq] cup: base | localNorm: (0.0, -1.0, 0.0) | alignThresh: -0.2 (dot < -0.2) | orientThresh: <= 40.0° (dotUp >= 0.7660)')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DEBUG CupReq] cup: spike | localNorm: (0.0, 1.0, 0.0) | alignThresh: -0.2 (dot < -0.2) | orientThresh: <= 18.0° (dotUp >= 0.9511)')
    );

    result.cleanup();
  });
});
