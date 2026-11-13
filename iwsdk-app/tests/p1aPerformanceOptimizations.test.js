/**
 * Celestial Kendama - P1-A CPU & GC Performance Optimization Tests
 *
 * Verifies the three targeted P1-A CPU optimizations:
 * 1. P1-A #1: BallTrajectory zero-allocation direct velocity and position access.
 *    - trajectory.velocity returns persistent internal object.
 *    - GameLoop.getBallState() hot path bypasses allocating trajectory.state getter.
 *    - Backwards compatibility of trajectory.state snapshot is fully preserved.
 * 2. P1-A #2: KendamaXRSystem persistent _xrContext reuse.
 *    - Single persistent _xrContext is allocated once in constructor.
 *    - Per-frame ticks update properties in place and pass the identical reference to consumers.
 * 3. P1-A #3: CelestialBelt direct iteration.
 *    - Direct loop over children eliminates per-frame traverse closure allocation.
 *    - beltGroup.traverse is not called during updateCelestialBelt.
 *    - Nested children support is preserved.
 */

import { describe, it, expect, vi } from 'vitest';
import { Group, Mesh, Points, ShaderMaterial, Vector3 } from 'three';
import { BallTrajectory, BallTrajectoryMode, INITIAL_VELOCITY_Y } from '../src/game/BallTrajectory.js';
import { GameLoop } from '../src/game/GameLoop.js';
import { BallMode, BallState } from '../src/contracts/Interfaces.js';
import { KendamaXRSystem } from '../src/game/KendamaXRSystem.js';
import { updateCelestialBelt, BELT_ROTATION_AXIS } from '../src/render/CelestialBelt.js';

describe('Celestial Kendama - P1-A CPU/GC Performance Optimizations', () => {
  describe('P1-A #1: BallTrajectory Zero-Allocation Velocity & Position Access', () => {
    it('provides direct getters for velocity and position returning persistent internal objects', () => {
      const trajectory = new BallTrajectory();

      const vel1 = trajectory.velocity;
      const vel2 = trajectory.velocity;
      const pos1 = trajectory.position;
      const pos2 = trajectory.position;

      // Must be object with x, y, z
      expect(vel1).toEqual({ x: 0, y: 0, z: 0 });
      expect(pos1).toEqual({ x: 0, y: 0, z: 0 });

      // Verifies exact reference identity (zero new instance allocation per getter call)
      expect(vel2).toBe(vel1);
      expect(pos2).toBe(pos1);
    });

    it('updates persistent velocity and position in-place during ballistic update', () => {
      const trajectory = new BallTrajectory();
      trajectory.launch({ x: 0, y: 1.0, z: -0.5 });

      const velRef = trajectory.velocity;
      const posRef = trajectory.position;

      expect(trajectory.isAirborne).toBe(true);

      // Advance trajectory by 0.1s
      trajectory.update(0.1);

      // Reference identity preserved
      expect(trajectory.velocity).toBe(velRef);
      expect(trajectory.position).toBe(posRef);

      // Values updated in-place
      expect(posRef.x).toBe(0);
      expect(posRef.y).toBeGreaterThan(1.0);
      expect(posRef.z).toBe(-0.5);
      expect(velRef.y).toBeCloseTo(INITIAL_VELOCITY_Y - 2.5 * 0.1);
    });

    it('preserves public trajectory.state API returning defensive copy', () => {
      const trajectory = new BallTrajectory();
      trajectory.launch({ x: 1, y: 2, z: 3 });

      const state1 = trajectory.state;
      const state2 = trajectory.state;

      // Defensive copy: different object references
      expect(state1).not.toBe(state2);
      expect(state1.position).not.toBe(state2.position);
      expect(state1.velocity).not.toBe(state2.velocity);

      // Values match
      expect(state1.position).toEqual(state2.position);
      expect(state1.velocity).toEqual(state2.velocity);
      expect(state1.mode).toBe(BallTrajectoryMode.AIR);
    });

    it('GameLoop.getBallState() reads trajectory.velocity without invoking trajectory.state getter', () => {
      const trajectory = new BallTrajectory();
      trajectory.launch({ x: 0, y: 1.0, z: 0 });

      // Spy on the allocating state getter
      const stateGetterSpy = vi.spyOn(trajectory, 'state', 'get');

      const mockCatchFlow = {
        ballPosition: { x: 0, y: 1.1, z: 0 },
        state: BallMode.AIR,
      };

      const gameLoop = new GameLoop({
        catchFlow: mockCatchFlow,
        trajectory,
        initialCup: 'big',
      });

      // Call getBallState() 5 times (simulating 5 frames)
      for (let i = 0; i < 5; i++) {
        const ballState = gameLoop.getBallState();
        expect(ballState).toBeInstanceOf(BallState);
        expect(ballState.velocity.y).toBeCloseTo(INITIAL_VELOCITY_Y);
      }

      // Proves hot path never accessed the allocating state getter
      expect(stateGetterSpy).toHaveBeenCalledTimes(0);
    });

    it('GameLoop.getBallState() gracefully falls back if trajectory only exposes state.velocity', () => {
      const mockLegacyTrajectory = {
        state: { velocity: { x: 0.1, y: -0.8, z: 0.3 } },
      };

      const mockCatchFlow = {
        ballPosition: { x: 0.2, y: 1.2, z: -0.4 },
        state: BallMode.AIR,
      };

      const gameLoop = new GameLoop({
        catchFlow: mockCatchFlow,
        trajectory: mockLegacyTrajectory,
        initialCup: 'big',
      });

      const ballState = gameLoop.getBallState();
      expect(ballState.velocity.x).toBeCloseTo(0.1);
      expect(ballState.velocity.y).toBeCloseTo(-0.8);
      expect(ballState.velocity.z).toBeCloseTo(0.3);
    });
  });

  describe('P1-A #2: KendamaXRSystem Persistent _xrContext Reuse', () => {
    it('instantiates persistent _xrContext on creation and reuses it across update ticks', () => {
      const mockWorld = {
        xrFrame: { _id: 'frame-1' },
        xrReferenceSpace: { _id: 'ref-space-1' },
        input: {
          xr: {
            getPrimaryInputSource: vi.fn((hand) => ({ handedness: hand })),
          },
        },
      };

      const system = new KendamaXRSystem(mockWorld);
      expect(system._xrContext).toBeDefined();
      expect(system._xrContext.hand).toBe('right');
      expect(system._xrContext.world).toBe(mockWorld);

      const capturedContexts = [];
      const mockGameLoop = {
        setXRContext: vi.fn((ctx) => {
          capturedContexts.push(ctx);
        }),
      };
      system.setGameLoop(mockGameLoop);

      // Frame 1 update
      system.update(0.016, 1.0);
      expect(capturedContexts.length).toBe(2); // 1 from setGameLoop + 1 from update
      const updateContext1 = capturedContexts[1];
      expect(updateContext1).toBe(system._xrContext);
      expect(updateContext1.frame).toBe(mockWorld.xrFrame);
      expect(updateContext1.referenceSpace).toBe(mockWorld.xrReferenceSpace);

      // Frame 2 update with changed frame/refSpace
      const frame2 = { _id: 'frame-2' };
      const refSpace2 = { _id: 'ref-space-2' };
      mockWorld.xrFrame = frame2;
      mockWorld.xrReferenceSpace = refSpace2;

      system.update(0.016, 1.016);
      expect(capturedContexts.length).toBe(3);
      const updateContext2 = capturedContexts[2];

      // Exact reference identity across ticks: zero allocation
      expect(updateContext2).toBe(system._xrContext);
      expect(updateContext2).toBe(updateContext1);

      // Properties updated in place
      expect(updateContext2.frame).toBe(frame2);
      expect(updateContext2.referenceSpace).toBe(refSpace2);
    });

    it('passes identical persistent _xrContext to pipeline.tick', () => {
      const mockWorld = {
        xrFrame: { _id: 'frame-1' },
        xrReferenceSpace: { _id: 'ref-space-1' },
      };

      const system = new KendamaXRSystem(mockWorld);
      const mockPipeline = {
        tick: vi.fn(),
      };
      system.setPipeline(mockPipeline);

      system.update(0.016, 0.5);
      expect(mockPipeline.tick).toHaveBeenCalledWith(500, system._xrContext, 0.016);

      system.update(0.016, 0.516);
      expect(mockPipeline.tick).toHaveBeenLastCalledWith(516, system._xrContext, 0.016);
      expect(mockPipeline.tick.mock.calls[0][1]).toBe(mockPipeline.tick.mock.calls[1][1]);
    });

    it('setHand updates persistent _xrContext.hand immediately', () => {
      const system = new KendamaXRSystem({});
      expect(system._xrContext.hand).toBe('right');

      system.setHand('left');
      expect(system.hand).toBe('left');
      expect(system._xrContext.hand).toBe('left');
    });
  });

  describe('P1-A #3: CelestialBelt Direct Child Iteration Without Traverse Closure', () => {
    it('advances uTime on direct child materials without calling beltGroup.traverse', () => {
      const beltGroup = new Group();
      const mockMat1 = { uniforms: { uTime: { value: 1.0 } } };
      const mockMat2 = { uniforms: { uTime: { value: 2.5 } } };

      const meshChild = new Mesh();
      meshChild.material = mockMat1;

      const pointsChild = new Points();
      pointsChild.material = mockMat2;

      beltGroup.add(meshChild);
      beltGroup.add(pointsChild);

      // Mock traverse to detect if any per-frame traverse is called
      const traverseSpy = vi.spyOn(beltGroup, 'traverse');

      updateCelestialBelt(beltGroup, 0.05);

      // Traverse was NOT called (0 closures created)
      expect(traverseSpy).toHaveBeenCalledTimes(0);

      // Both child materials had uTime incremented by dt
      expect(mockMat1.uniforms.uTime.value).toBeCloseTo(1.05);
      expect(mockMat2.uniforms.uTime.value).toBeCloseTo(2.55);
    });

    it('advances uTime on nested children without allocating a callback closure', () => {
      const beltGroup = new Group();
      const parentSubGroup = new Group();

      const mockNestedMat = { uniforms: { uTime: { value: 10.0 } } };
      const nestedMesh = new Mesh();
      nestedMesh.material = mockNestedMat;

      parentSubGroup.add(nestedMesh);
      beltGroup.add(parentSubGroup);

      const traverseSpy = vi.spyOn(beltGroup, 'traverse');

      updateCelestialBelt(beltGroup, 0.1);

      expect(traverseSpy).toHaveBeenCalledTimes(0);
      expect(mockNestedMat.uniforms.uTime.value).toBeCloseTo(10.1);
    });

    it('continues rotating on BELT_ROTATION_AXIS cleanly', () => {
      const beltGroup = new Group();
      const rotateSpy = vi.spyOn(beltGroup, 'rotateOnAxis');

      updateCelestialBelt(beltGroup, 0.016);
      expect(rotateSpy).toHaveBeenCalledWith(BELT_ROTATION_AXIS, expect.any(Number));
    });
  });
});
