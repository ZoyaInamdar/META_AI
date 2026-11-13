/**
 * Celestial Kendama - P0 Meta Quest 3 / 3S CPU & GC Performance Optimization Tests
 *
 * Verifies that all 5 P0 optimizations successfully eliminate per-frame allocations
 * and unnecessary per-frame scene traversals:
 * 1. P0 #1: CelestialEnvironment reuses camera Vector3 instances across frames.
 * 2. P0 #2: CelestialBelt reuses frozen BELT_ROTATION_AXIS across frames.
 * 3. P0 #3: GameLoop mutates and returns persistent BallState instance across frames.
 * 4. P0 #4: GamePipeline delivers frozen, zero-allocation snapshots to WorldRenderer across ticks.
 * 5. P0 #5: CelestialEnvironment visibility updates are dirty-flagged rather than per-frame.
 */

import { describe, it, expect, vi } from 'vitest';
import { Group, Vector3 } from 'three';
import { CelestialEnvironmentSystem } from '../src/render/CelestialEnvironment.js';
import { BELT_ROTATION_AXIS, updateCelestialBelt } from '../src/render/CelestialBelt.js';
import { GameLoop } from '../src/game/GameLoop.js';
import { BallMode, BallState } from '../src/contracts/Interfaces.js';
import { GamePipeline } from '../src/main.js';
import { eventBus } from '../src/contracts/EventBus.js';

describe('Celestial Kendama - P0 Performance Optimizations', () => {
  describe('P0 #1: Camera Vector Reuse in CelestialEnvironment', () => {
    it('pre-allocates and reuses _cachedCamPos and _cachedCamDir across updates', () => {
      const mockCamera = {
        getWorldPosition: vi.fn((v) => v.set(0, 1.5, 0)),
        getWorldDirection: vi.fn((v) => v.set(0, 0, -1)),
        fov: 60,
      };

      const mockWorld = {
        camera: mockCamera,
        scene: new Group(),
      };

      const system = new CelestialEnvironmentSystem(mockWorld);
      system.init();

      expect(system._cachedCamPos).toBeInstanceOf(Vector3);
      expect(system._cachedCamDir).toBeInstanceOf(Vector3);

      const cachedPosRef = system._cachedCamPos;
      const cachedDirRef = system._cachedCamDir;

      system.ensurePlanetoidRenderer();

      // First call
      system.updatePlanetoidAnchorFromCamera();
      expect(mockCamera.getWorldPosition).toHaveBeenCalledWith(cachedPosRef);
      expect(mockCamera.getWorldDirection).toHaveBeenCalledWith(cachedDirRef);

      // Second call
      system.updatePlanetoidAnchorFromCamera();
      expect(system._cachedCamPos).toBe(cachedPosRef);
      expect(system._cachedCamDir).toBe(cachedDirRef);
    });
  });

  describe('P0 #2: Celestial Belt Rotation Axis Reuse', () => {
    it('exports a frozen BELT_ROTATION_AXIS with z=1', () => {
      expect(BELT_ROTATION_AXIS).toBeInstanceOf(Vector3);
      expect(BELT_ROTATION_AXIS.x).toBe(0);
      expect(BELT_ROTATION_AXIS.y).toBe(0);
      expect(BELT_ROTATION_AXIS.z).toBe(1);
      expect(Object.isFrozen(BELT_ROTATION_AXIS)).toBe(true);
    });

    it('updateCelestialBelt rotates on the shared BELT_ROTATION_AXIS without new allocations', () => {
      const beltGroup = new Group();
      const rotateSpy = vi.spyOn(beltGroup, 'rotateOnAxis');

      updateCelestialBelt(beltGroup, 0.016);
      expect(rotateSpy).toHaveBeenCalledWith(BELT_ROTATION_AXIS, expect.any(Number));

      const firstCallAxis = rotateSpy.mock.calls[0][0];
      expect(firstCallAxis).toBe(BELT_ROTATION_AXIS);

      updateCelestialBelt(beltGroup, 0.016);
      const secondCallAxis = rotateSpy.mock.calls[1][0];
      expect(secondCallAxis).toBe(BELT_ROTATION_AXIS);
    });
  });

  describe('P0 #3: Zero-Allocation BallState in GameLoop', () => {
    it('getBallState() reuses the same BallState instance across multiple frames', () => {
      const mockCatchFlow = {
        ballPosition: { x: 0.1, y: 1.2, z: -0.3 },
        state: BallMode.AIR,
      };
      const mockTrajectory = {
        state: { velocity: { x: 0.5, y: -1.0, z: 0.2 } },
      };

      const gameLoop = new GameLoop({
        catchFlow: mockCatchFlow,
        trajectory: mockTrajectory,
        initialCup: 'big',
      });

      const state1 = gameLoop.getBallState();
      expect(state1).toBeInstanceOf(BallState);
      expect(state1.position.x).toBeCloseTo(0.1);
      expect(state1.position.y).toBeCloseTo(1.2);
      expect(state1.position.z).toBeCloseTo(-0.3);
      expect(state1.velocity.x).toBeCloseTo(0.5);
      expect(state1.velocity.y).toBeCloseTo(-1.0);
      expect(state1.velocity.z).toBeCloseTo(0.2);
      expect(state1.mode).toBe(BallMode.AIR);

      // Mutate trajectory/catchFlow for next frame
      mockCatchFlow.ballPosition.x = 0.25;
      mockCatchFlow.ballPosition.y = 1.35;
      mockCatchFlow.state = BallMode.SEATED;
      mockTrajectory.state.velocity.x = 0.0;
      mockTrajectory.state.velocity.y = 0.0;
      mockTrajectory.state.velocity.z = 0.0;

      const state2 = gameLoop.getBallState();

      // Verifies exact reference identity (zero new instance allocation)
      expect(state2).toBe(state1);
      expect(state2.position.x).toBeCloseTo(0.25);
      expect(state2.position.y).toBeCloseTo(1.35);
      expect(state2.mode).toBe(BallMode.SEATED);
    });
  });

  describe('P0 #4: Frozen Zero-Allocation Snapshot in GamePipeline', () => {
    it('delivers frozen snapshots where sub-states and container instances are reused across ticks', () => {
      let capturedSnapshots = [];
      const mockRenderer = {
        render(snapshot) {
          capturedSnapshots.push(snapshot);
        },
      };

      const pipeline = new GamePipeline({
        eventBus,
        worldRenderer: mockRenderer,
        fixedDelta: 1 / 120,
      });

      // Tick 1
      pipeline.tick(16.6667, null, 1 / 120);
      expect(capturedSnapshots.length).toBe(1);

      const snap1 = capturedSnapshots[0];
      expect(Object.isFrozen(snap1)).toBe(true);
      expect(Object.isFrozen(snap1.physicsState)).toBe(true);
      expect(Object.isFrozen(snap1.missionState)).toBe(true);
      expect(Object.isFrozen(snap1.planetState)).toBe(true);
      expect(Object.isFrozen(snap1.targetState)).toBe(true);

      // Tick 2
      pipeline.tick(33.3333, null, 1 / 120);
      expect(capturedSnapshots.length).toBe(2);

      const snap2 = capturedSnapshots[1];

      // Verifies identical snapshot and sub-state references (zero per-tick allocations)
      expect(snap2).toBe(snap1);
      expect(snap2.physicsState).toBe(snap1.physicsState);
      expect(snap2.missionState).toBe(snap1.missionState);
      expect(snap2.planetState).toBe(snap1.planetState);
      expect(snap2.targetState).toBe(snap1.targetState);

      // Verifies properties dynamically update across ticks
      expect(snap2.timestamp).toBe(33.3333);
    });
  });

  describe('P0 #5: Dirty-Flagged Gameplay Visibility in CelestialEnvironment', () => {
    it('only performs visibility hierarchy traversal when _visibilityDirty is true', () => {
      const mockWorld = {
        scene: new Group(),
        activeLevel: { value: null },
      };
      const system = new CelestialEnvironmentSystem(mockWorld);
      system.init();

      const applyGameplaySpy = vi.spyOn(system, 'applyGameplayVisibility');
      const applyShowcaseSpy = vi.spyOn(system, 'applyShowcaseVisibility');

      // 1. Initial mode switch sets dirty flag and invokes visibility immediately
      system.setMode('gameplay');
      expect(applyGameplaySpy).toHaveBeenCalledTimes(1);
      expect(system._visibilityDirty).toBe(false);

      // 2. Subsequent frame updates in gameplay mode DO NOT call applyGameplayVisibility repeatedly
      system.update(0.016);
      system.update(0.016);
      system.update(0.016);
      expect(applyGameplaySpy).toHaveBeenCalledTimes(1); // Still 1! Not 4!

      // 3. Late-loaded child triggers dirty flag
      const mockNode = {
        addEventListener: vi.fn(),
      };
      system.wireChildAddedListener(mockNode, 'cup-preview');
      expect(mockNode.addEventListener).toHaveBeenCalledWith('childadded', expect.any(Function));

      // Trigger listener
      const onChildAdded = mockNode.addEventListener.mock.calls[0][1];
      onChildAdded({ child: { name: 'late-child' } });

      // Triggered visibility on child addition
      expect(applyGameplaySpy).toHaveBeenCalledTimes(2);
      expect(system._visibilityDirty).toBe(false);

      // 4. Switching to planet-showcase mode
      system.setMode('planet-showcase');
      expect(applyShowcaseSpy).toHaveBeenCalledTimes(1);
      expect(system._visibilityDirty).toBe(false);

      // Subsequent frame updates in showcase mode DO NOT call applyShowcaseVisibility repeatedly
      system.update(0.016);
      system.update(0.016);
      expect(applyShowcaseSpy).toHaveBeenCalledTimes(1); // Still 1! Not 3!
    });
  });
});
