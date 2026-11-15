/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Unit Tests for KendamaXRSystem (Person A)
 * ============================================================================
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KendamaXRSystem } from './KendamaXRSystem.js';
import { GameLoop } from './GameLoop.js';
import { HandPoseAdapter } from '../input/HandPoseAdapter.js';
import { FakeInput } from '../input/FakeInput.js';
import { initGame, GamePipeline, createGameplayKenGroup } from '../main.js';
import { EventBus } from '../contracts/EventBus.js';

describe('KendamaXRSystem (Person A)', () => {
  let mockWorld;
  let system;

  beforeEach(() => {
    mockWorld = {
      xrFrame: null,
      xrReferenceSpace: null,
      input: {
        xr: {
          getPrimaryInputSource: vi.fn(),
        },
      },
    };

    // Instantiate KendamaXRSystem with mock world
    system = new KendamaXRSystem(mockWorld);
    system.init();
  });

  it('1. updates pipeline exactly once per frame with active XRFrame and matching delta', () => {
    const mockFrame = {
      getJointPose: vi.fn(),
    };
    const mockRefSpace = { _id: 'ref-space' };
    const mockInputSource = { handedness: 'right', hand: new Map() };

    mockWorld.xrFrame = mockFrame;
    mockWorld.xrReferenceSpace = mockRefSpace;
    mockWorld.input.xr.getPrimaryInputSource.mockReturnValue(mockInputSource);

    const mockPipeline = {
      tick: vi.fn(),
    };

    system.setPipeline(mockPipeline);

    // Call update for frame 1: delta = 0.016, time = 1.0s (1000ms)
    system.update(0.016, 1.0);

    expect(mockPipeline.tick).toHaveBeenCalledTimes(1);
    expect(mockPipeline.tick).toHaveBeenCalledWith(
      1000,
      expect.objectContaining({
        frame: mockFrame,
        referenceSpace: mockRefSpace,
        inputSource: mockInputSource,
        hand: 'right',
      }),
      0.016
    );
  });

  it('2. operates cleanly in desktop / non-XR mode where xrFrame is null', () => {
    mockWorld.xrFrame = null;
    mockWorld.xrReferenceSpace = null;
    mockWorld.input.xr.getPrimaryInputSource.mockReturnValue(null);

    const fakeInput = new FakeInput();
    const gameLoop = new GameLoop({ inputSource: fakeInput, inputSourceType: 'fake' });
    const updateSpy = vi.spyOn(gameLoop.inputSystem, 'update');

    system.setGameLoop(gameLoop);

    system.update(0.016, 0.5);

    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy).toHaveBeenCalledWith(
      0.016,
      expect.objectContaining({
        frame: null,
        referenceSpace: null,
        inputSource: null,
      })
    );
  });

  it('3. synchronizes XR context with GameLoop via setGameLoop', () => {
    const gameLoop = new GameLoop();
    const setXRSpy = vi.spyOn(gameLoop, 'setXRContext');

    system.setGameLoop(gameLoop);

    expect(setXRSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        world: mockWorld,
        hand: 'right',
      })
    );
  });

  describe('Runtime Wiring & IWSDK Integration (initGame)', () => {
    function createMockIWSDKWorld() {
      const systems = [];
      const world = {
        xrFrame: null,
        xrReferenceSpace: null,
        input: {
          xr: {
            getPrimaryInputSource: vi.fn(),
          },
        },
        registerSystem: vi.fn((SysClass) => {
          const sys = new SysClass(world);
          systems.push(sys);
          return world;
        }),
        getSystem: vi.fn((SysClass) => systems.find((s) => s instanceof SysClass)),
        hasSystem: vi.fn((SysClass) => systems.some((s) => s instanceof SysClass)),
        unregisterSystem: vi.fn((SysClass) => {
          const idx = systems.findIndex((s) => s instanceof SysClass);
          if (idx !== -1) {
            systems[idx].destroy?.();
            systems.splice(idx, 1);
          }
        }),
        getSystems: vi.fn(() => systems),
        update: (dt, time) => {
          for (const s of systems) {
            if (!s.isPaused) s.update(dt, time);
          }
        },
      };
      return world;
    }

    it('4. initGame registers KendamaXRSystem and routes world updates into GamePipeline', () => {
      const world = createMockIWSDKWorld();
      const wristJoint = { _id: 'wrist-joint' };
      const mockInputSource = {
        handedness: 'right',
        hand: new Map([['wrist', wristJoint]]),
      };
      const mockRefSpace = { _id: 'ref-space' };
      const mockFrame = {
        getJointPose: vi.fn((joint, refSpace) => ({
          transform: {
            position: { x: 0.12, y: 1.25, z: -0.45 },
            orientation: { x: 0, y: 0, z: 0, w: 1 },
          },
          radius: 0.015,
        })),
      };

      world.xrFrame = mockFrame;
      world.xrReferenceSpace = mockRefSpace;
      world.input.xr.getPrimaryInputSource.mockReturnValue(mockInputSource);

      const kenGroup = createGameplayKenGroup();
      const adapter = new HandPoseAdapter({ hand: 'right' });
      const gameLoop = new GameLoop({
        gameplayKenGroup: kenGroup,
        inputSource: adapter,
        inputSourceType: 'hand',
        poseFilter: null,
      });

      const game = initGame({
        world,
        gameLoop,
      });

      expect(world.registerSystem).toHaveBeenCalledWith(KendamaXRSystem);
      expect(game.xrSystem).toBeInstanceOf(KendamaXRSystem);

      // Execute a frame via IWSDK world.update
      world.update(0.016, 1.0);

      // Verify exactly one pipeline tick occurred and pose reached kenGroup
      expect(game.pipeline.totalRenderTicks).toBe(1);
      expect(kenGroup.position.x).toBeCloseTo(0.12);
      expect(gameLoop.isTrackingValid).toBe(true);

      // Disposal stops system and unregisters cleanly
      game.stop();
      expect(world.unregisterSystem).toHaveBeenCalledWith(KendamaXRSystem);
    });

    it('5. prevents competing requestAnimationFrame loops when world is supplied', () => {
      const world = createMockIWSDKWorld();
      const originalRaf = globalThis.requestAnimationFrame;
      const rafMock = vi.fn();
      globalThis.requestAnimationFrame = rafMock;

      const game = initGame({
        world,
        manualTick: false,
      });

      // Since world is provided, initGame must not start its own requestAnimationFrame loop
      expect(rafMock).not.toHaveBeenCalled();
      game.stop();

      if (originalRaf) {
        globalThis.requestAnimationFrame = originalRaf;
      } else {
        delete globalThis.requestAnimationFrame;
      }
    });

    it('6. missing XR data in runtime loop is safely handled without throwing', () => {
      const world = createMockIWSDKWorld();
      world.xrFrame = null;
      world.xrReferenceSpace = null;
      world.input.xr.getPrimaryInputSource.mockReturnValue(null);

      const kenGroup = createGameplayKenGroup();
      const adapter = new HandPoseAdapter({ hand: 'right' });
      const gameLoop = new GameLoop({
        gameplayKenGroup: kenGroup,
        inputSource: adapter,
        inputSourceType: 'hand',
      });

      const game = initGame({
        world,
        gameLoop,
      });

      expect(() => {
        world.update(0.016, 1.0);
      }).not.toThrow();

      expect(gameLoop.isTrackingValid).toBe(false);
      game.stop();
    });

    it('7. desktop FakeInput continues to update through initGame runtime wiring', () => {
      const world = createMockIWSDKWorld();
      world.xrFrame = null;

      const kenGroup = createGameplayKenGroup();
      const fakeInput = new FakeInput({
        initialPosition: { x: 0.15, y: 1.25, z: -0.45 },
      });
      const gameLoop = new GameLoop({
        gameplayKenGroup: kenGroup,
        inputSource: fakeInput,
        inputSourceType: 'fake',
      });

      const game = initGame({
        world,
        gameLoop,
      });

      world.update(0.016, 1.0);

      expect(kenGroup.position.x).toBeCloseTo(0.15);
      expect(game.pipeline.totalRenderTicks).toBe(1);
      game.stop();
    });

    it('8. current reference space and selected input source reach extraction on each frame', () => {
      const world = createMockIWSDKWorld();
      const wristJoint = { _id: 'wrist-right-1' };
      const mockInputSource = {
        handedness: 'right',
        hand: new Map([['wrist', wristJoint]]),
      };
      const mockRefSpace = { _id: 'ref-space-active' };
      const getJointPoseSpy = vi.fn((joint, refSpace) => ({
        transform: {
          position: { x: 0.22, y: 1.33, z: -0.44 },
          orientation: { x: 0, y: 0, z: 0, w: 1 },
        },
      }));
      const mockFrame = { getJointPose: getJointPoseSpy };

      world.xrFrame = mockFrame;
      world.xrReferenceSpace = mockRefSpace;
      world.input.xr.getPrimaryInputSource.mockReturnValue(mockInputSource);

      const kenGroup = createGameplayKenGroup();
      const adapter = new HandPoseAdapter({ hand: 'right' });
      const gameLoop = new GameLoop({
        gameplayKenGroup: kenGroup,
        inputSource: adapter,
        inputSourceType: 'hand',
        poseFilter: null,
      });

      const game = initGame({ world, gameLoop, hand: 'right' });
      world.update(0.016, 1.0);

      expect(getJointPoseSpy).toHaveBeenCalledWith(wristJoint, mockRefSpace);
      expect(kenGroup.position.x).toBeCloseTo(0.22);
      expect(kenGroup.position.y).toBeCloseTo(1.33);
      expect(kenGroup.position.z).toBeCloseTo(-0.44);
      game.stop();
    });

    it('9. dynamically changing XR frame, reference space, and input source updates immediately on next tick', () => {
      const world = createMockIWSDKWorld();

      // Frame 1
      const wrist1 = { _id: 'wrist-1' };
      const inputSource1 = { handedness: 'right', hand: new Map([['wrist', wrist1]]) };
      const refSpace1 = { _id: 'ref-space-1' };
      const getPose1 = vi.fn().mockReturnValue({
        transform: { position: { x: 0.10, y: 1.20, z: -0.40 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
      });
      const frame1 = { getJointPose: getPose1 };

      world.xrFrame = frame1;
      world.xrReferenceSpace = refSpace1;
      world.input.xr.getPrimaryInputSource.mockReturnValue(inputSource1);

      const kenGroup = createGameplayKenGroup();
      const adapter = new HandPoseAdapter({ hand: 'right' });
      const gameLoop = new GameLoop({
        gameplayKenGroup: kenGroup,
        inputSource: adapter,
        inputSourceType: 'hand',
        poseFilter: null,
      });

      const game = initGame({ world, gameLoop });
      world.update(0.016, 1.0);

      expect(getPose1).toHaveBeenCalledWith(wrist1, refSpace1);
      expect(kenGroup.position.x).toBeCloseTo(0.10);

      // Frame 2: new frame, new refSpace, new inputSource
      const wrist2 = { _id: 'wrist-2' };
      const inputSource2 = { handedness: 'right', hand: new Map([['wrist', wrist2]]) };
      const refSpace2 = { _id: 'ref-space-2' };
      const getPose2 = vi.fn().mockReturnValue({
        transform: { position: { x: 0.18, y: 1.28, z: -0.48 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
      });
      const frame2 = { getJointPose: getPose2 };

      world.xrFrame = frame2;
      world.xrReferenceSpace = refSpace2;
      world.input.xr.getPrimaryInputSource.mockReturnValue(inputSource2);

      world.update(0.016, 1.016);

      expect(getPose2).toHaveBeenCalledWith(wrist2, refSpace2);
      expect(kenGroup.position.x).toBeCloseTo(0.18);
      expect(game.pipeline.totalRenderTicks).toBe(2);
      game.stop();
    });

    it('10. configuring hand: "left" propagates to input source lookup and wrist extraction', () => {
      const world = createMockIWSDKWorld();
      const leftWrist = { _id: 'wrist-left' };
      const leftInputSource = {
        handedness: 'left',
        hand: new Map([['wrist', leftWrist]]),
      };
      const mockRefSpace = { _id: 'ref-left' };
      const getPose = vi.fn().mockReturnValue({
        transform: { position: { x: -0.15, y: 1.25, z: -0.45 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
      });
      const mockFrame = { getJointPose: getPose };

      world.xrFrame = mockFrame;
      world.xrReferenceSpace = mockRefSpace;
      world.input.xr.getPrimaryInputSource.mockImplementation((hand) => {
        if (hand === 'left') return leftInputSource;
        return null;
      });

      const kenGroup = createGameplayKenGroup();
      const adapter = new HandPoseAdapter({ hand: 'left' });
      const gameLoop = new GameLoop({
        gameplayKenGroup: kenGroup,
        inputSource: adapter,
        inputSourceType: 'hand',
        hand: 'left',
        poseFilter: null,
      });

      const game = initGame({ world, gameLoop, hand: 'left' });
      world.update(0.016, 1.0);

      expect(world.input.xr.getPrimaryInputSource).toHaveBeenCalledWith('left');
      expect(getPose).toHaveBeenCalledWith(leftWrist, mockRefSpace);
      expect(kenGroup.position.x).toBeCloseTo(-0.15);
      game.stop();
    });

    it('11. missing XR frame or wrist joint suppresses catch evaluation during tracking loss', () => {
      const world = createMockIWSDKWorld();
      const wristJoint = { _id: 'wrist-loss-test' };
      const mockInputSource = {
        handedness: 'right',
        hand: new Map([['wrist', wristJoint]]),
      };
      const mockRefSpace = { _id: 'ref-space' };
      const mockFrame = {
        getJointPose: vi.fn().mockReturnValue({
          transform: { position: { x: 0, y: 1.25, z: -0.45 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
        }),
      };

      world.xrFrame = mockFrame;
      world.xrReferenceSpace = mockRefSpace;
      world.input.xr.getPrimaryInputSource.mockReturnValue(mockInputSource);

      const kenGroup = createGameplayKenGroup();
      const adapter = new HandPoseAdapter({ hand: 'right' });
      const gameLoop = new GameLoop({
        gameplayKenGroup: kenGroup,
        inputSource: adapter,
        inputSourceType: 'hand',
      });

      const game = initGame({ world, gameLoop });

      // Frame 1: valid tracking, launch ball into air
      world.update(0.016, 1.0);
      gameLoop.launchBall();
      expect(gameLoop.catchFlow.state).toBe('air');
      expect(gameLoop.isTrackingValid).toBe(true);

      // Frame 2: XR tracking is lost (frame is null)
      world.xrFrame = null;
      world.update(0.016, 1.016);
      expect(gameLoop.isTrackingValid).toBe(false);

      // Mock detector evaluateCatch to confirm catch candidate
      const evalSpy = vi.spyOn(gameLoop.detector, 'evaluateCatch');

      // Frame 3: tracking remains lost -> updateCatchDetection must suppress evaluateCatch
      world.update(0.016, 1.032);
      expect(evalSpy).not.toHaveBeenCalled();
      expect(gameLoop.catchFlow.state).toBe('air');

      game.stop();
    });

    it('12. stopping the game unregisters the system and prevents subsequent pipeline updates', () => {
      const world = createMockIWSDKWorld();
      const game = initGame({ world });

      expect(world.hasSystem(KendamaXRSystem)).toBe(true);

      world.update(0.016, 1.0);
      expect(game.pipeline.totalRenderTicks).toBe(1);

      // Stop game
      game.stop();
      expect(world.unregisterSystem).toHaveBeenCalledWith(KendamaXRSystem);
      expect(world.hasSystem(KendamaXRSystem)).toBe(false);

      // Subsequent world updates must not advance the pipeline
      world.update(0.016, 2.0);
      expect(game.pipeline.totalRenderTicks).toBe(1);
    });

    it('13. non-ECS desktop fallback continues to work without an IWSDK World', () => {
      const kenGroup = createGameplayKenGroup();
      const fakeInput = new FakeInput({
        initialPosition: { x: 0.05, y: 1.25, z: -0.45 },
      });
      const gameLoop = new GameLoop({
        gameplayKenGroup: kenGroup,
        inputSource: fakeInput,
        inputSourceType: 'fake',
      });

      const game = initGame({ gameLoop, manualTick: true });

      expect(game.xrSystem).toBeNull();

      game.tick(16.6667, null, 1 / 60);

      expect(game.pipeline.totalRenderTicks).toBe(1);
      expect(kenGroup.position.x).toBeCloseTo(0.05);

      game.stop();
    });

    it('14. passes otherInputSource in xrContext on each update', () => {
      const mockRightSource = { handedness: 'right', hand: new Map() };
      const mockLeftSource = { handedness: 'left', hand: new Map() };

      mockWorld.input.xr.getPrimaryInputSource.mockImplementation((hand) => {
        if (hand === 'right') return mockRightSource;
        if (hand === 'left') return mockLeftSource;
        return null;
      });

      const mockGameLoop = {
        setXRContext: vi.fn(),
      };
      system.setGameLoop(mockGameLoop);

      system.update(0.016, 1.0);

      expect(mockGameLoop.setXRContext).toHaveBeenCalledWith(
        expect.objectContaining({
          inputSource: mockRightSource,
          otherInputSource: mockLeftSource,
          hand: 'right',
        })
      );
    });
  });
});
