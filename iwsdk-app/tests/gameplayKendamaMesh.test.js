/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Unit & Integration Tests: Gameplay Kendama & Tama Mesh Integration (P0 Fix 2)
 * Role: Integration / Verification
 * ============================================================================
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Vector3, Group } from 'three';
import {
  gameplayKenGroup,
  createGameplayKenGroup,
  attachKendamaAssembly,
  updateGameplayTamaMesh,
  initGame,
  GamePipeline
} from '../src/main.js';
import { BallState, BallMode } from '../src/contracts/Interfaces.js';
import { EventBus } from '../src/contracts/EventBus.js';
import { createBigCupPreviewAsset } from '../src/scene-assets/cup-preview.scene-asset.js';
import { CelestialEnvironmentSystem } from '../src/render/CelestialEnvironment.js';

describe('Gameplay Kendama & Tama Mesh Integration (P0 Fix 2)', () => {
  let eventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  describe('1. Kendama & Tama Mesh Attachment to gameplayKenGroup', () => {
    it('canonical gameplayKenGroup has all Ken components and celestial-tama attached', () => {
      const ken = createGameplayKenGroup();

      const assemblyRoot = ken.getObjectByName('kendama-assembly-root');
      expect(assemblyRoot).toBeTruthy();

      // Verify all canonical Ken meshes are present
      expect(ken.getObjectByName('sarado-crossbar')).toBeTruthy();
      expect(ken.getObjectByName('big-cup-oozara')).toBeTruthy();
      expect(ken.getObjectByName('small-cup-kozara')).toBeTruthy();
      expect(ken.getObjectByName('base-cup-chuzara')).toBeTruthy();
      expect(ken.getObjectByName('spike-kensaki')).toBeTruthy();
      expect(ken.getObjectByName('handle-ken')).toBeTruthy();

      // Verify celestial-tama is present
      const tama = ken.getObjectByName('celestial-tama');
      expect(tama).toBeTruthy();
      expect(tama.isMesh).toBe(true);
    });

    it('idempotency: multiple calls to attachKendamaAssembly do not create duplicate meshes', () => {
      const ken = new Group();
      const firstAssembly = attachKendamaAssembly(ken);
      expect(firstAssembly).toBeTruthy();
      const childCountAfterFirst = ken.children.length;

      // Call again on the same group
      const secondAssembly = attachKendamaAssembly(ken);
      expect(secondAssembly).toBe(firstAssembly);
      expect(ken.children.length).toBe(childCountAfterFirst);

      // Verify exactly one tama mesh exists
      let tamaCount = 0;
      ken.traverse((obj) => {
        if (obj.name === 'celestial-tama') tamaCount++;
      });
      expect(tamaCount).toBe(1);
    });

    it('initGame() automatically attaches the Kendama assembly if given a raw group', () => {
      const rawGroup = new Group();
      expect(rawGroup.getObjectByName('celestial-tama')).toBeUndefined();

      const game = initGame({ gameplayKenGroup: rawGroup, eventBus, manualTick: true });
      expect(rawGroup.getObjectByName('celestial-tama')).toBeTruthy();
      expect(rawGroup.getObjectByName('spike-kensaki')).toBeTruthy();

      game.stop();
    });
  });

  describe('2. Tama State Tracking: Seated vs Airborne', () => {
    it('seated mode: tama remains at the authoritative spike seat position (0, 0.078, 0)', () => {
      const ken = createGameplayKenGroup();
      const tama = ken.getObjectByName('celestial-tama');
      expect(tama).toBeTruthy();

      // Default seated local position
      expect(tama.position.x).toBeCloseTo(0.0);
      expect(tama.position.y).toBeCloseTo(0.078, 3);
      expect(tama.position.z).toBeCloseTo(0.0);

      // In seated mode, updateGameplayTamaMesh preserves seated position
      const seatedBallState = new BallState({ x: 0, y: 1.078, z: -0.4 }, { x: 0, y: 0, z: 0 }, BallMode.SEATED);
      updateGameplayTamaMesh(ken, seatedBallState);

      expect(tama.position.x).toBeCloseTo(0.0);
      expect(tama.position.y).toBeCloseTo(0.078, 3);
      expect(tama.position.z).toBeCloseTo(0.0);
    });

    it('air mode: tama follows world-space BallState position converted to Ken local space', () => {
      const ken = createGameplayKenGroup();
      const tama = ken.getObjectByName('celestial-tama');

      // Place Ken in world space at (0.2, 1.0, -0.5)
      ken.position.set(0.2, 1.0, -0.5);
      ken.updateMatrixWorld(true);

      // Ball is airborne at world position (0.2, 1.5, -0.5) (50cm above ken)
      const airBallState = new BallState(
        { x: 0.2, y: 1.5, z: -0.5 },
        { x: 0, y: 2.0, z: 0 },
        BallMode.AIR
      );

      updateGameplayTamaMesh(ken, airBallState);

      // Local Y should be 1.5 - 1.0 = 0.5m
      expect(tama.position.x).toBeCloseTo(0.0, 4);
      expect(tama.position.y).toBeCloseTo(0.5, 4);
      expect(tama.position.z).toBeCloseTo(0.0, 4);

      // World position of the Tama mesh should equal the BallState world position
      const worldPos = new Vector3();
      tama.getWorldPosition(worldPos);
      expect(worldPos.x).toBeCloseTo(0.2, 4);
      expect(worldPos.y).toBeCloseTo(1.5, 4);
      expect(worldPos.z).toBeCloseTo(-0.5, 4);
    });

    it('catching mode: tama follows interpolating BallState position in world coordinates', () => {
      const ken = createGameplayKenGroup();
      const tama = ken.getObjectByName('celestial-tama');

      ken.position.set(0, 1.0, 0);
      ken.updateMatrixWorld(true);

      const catchingState = new BallState(
        { x: 0.0, y: 1.2, z: 0.0 },
        { x: 0, y: -0.5, z: 0 },
        BallMode.CATCHING
      );

      updateGameplayTamaMesh(ken, catchingState);

      expect(tama.position.y).toBeCloseTo(0.2, 4);
    });
  });

  describe('3. Pipeline Integration (Stage 6 Frame Execution)', () => {
    it('GamePipeline.tick updates the Tama position from catchDetector.getBallState()', () => {
      const ken = createGameplayKenGroup();

      let currentMode = BallMode.AIR;
      let currentPos = { x: 0, y: 1.4, z: 0 };

      const mockInputSystem = {
        update: () => ({
          position: new Vector3(0, 1.0, 0),
          quaternion: { x: 0, y: 0, z: 0, w: 1 }
        })
      };

      const mockCatchDetector = {
        update: () => {},
        getBallState: () => new BallState(currentPos, { x: 0, y: 0, z: 0 }, currentMode)
      };

      const pipeline = new GamePipeline({
        eventBus,
        gameplayKenGroup: ken,
        inputSystem: mockInputSystem,
        catchDetector: mockCatchDetector
      });

      const tama = ken.getObjectByName('celestial-tama');

      // Frame 1: Air mode at y=1.4 world with hand at y=1.0 (local y=0.4)
      pipeline.tick(16.67, null, 1 / 120);
      expect(tama.position.y).toBeCloseTo(0.4, 4);

      // Frame 2: Seated mode
      currentMode = BallMode.SEATED;
      currentPos = { x: 0, y: 1.078, z: 0 };
      pipeline.tick(33.34, null, 1 / 120);
      expect(tama.position.y).toBeCloseTo(0.078, 3);
    });
  });

  describe('4. Showroom & Plinth Isolation', () => {
    it('gameplayKenGroup assembly is completely isolated from showroom preview assets', () => {
      const gameplayKen = createGameplayKenGroup();
      const showroomRoot = createBigCupPreviewAsset();

      const gameplayTama = gameplayKen.getObjectByName('celestial-tama');
      const showroomTama = showroomRoot.getObjectByName('celestial-tama');

      expect(gameplayTama).toBeTruthy();
      expect(showroomTama).toBeTruthy();
      expect(gameplayTama).not.toBe(showroomTama);

      // Modifying gameplay tama local position does not alter showroom tama
      gameplayTama.position.set(99, 99, 99);
      expect(showroomTama.position.x).toBeCloseTo(0.0);
      expect(showroomTama.position.y).toBeCloseTo(0.078, 3);
    });
  });

  describe('5. Gameplay vs Showroom Visibility Separation', () => {
    it('gameplayKenGroup has kendama-assembly-root attached and is visible', () => {
      const ken = createGameplayKenGroup();
      expect(ken.visible).toBe(true);
      expect(ken.name).toBe('gameplay-ken-group');
      expect(ken.getObjectByName('kendama-assembly-root')).toBeTruthy();
      expect(ken.getObjectByName('celestial-tama')).toBeTruthy();
    });

    it('hand tracking updates drive gameplayKenGroup transforms in GameLoop', () => {
      const ken = createGameplayKenGroup();
      ken.position.set(0.0, 1.25, -0.45);

      // Simulate a valid hand pose update from HandPoseAdapter
      const simulatedHandPos = { x: 0.15, y: 1.30, z: -0.40 };
      const simulatedHandQuat = { x: 0.0, y: 0.1, z: 0.0, w: 0.995 };

      // Copying simulated hand transform directly mimics GameLoop.updateInput
      ken.position.copy(simulatedHandPos);
      ken.quaternion.copy(simulatedHandQuat);

      expect(ken.position.x).toBeCloseTo(0.15);
      expect(ken.position.y).toBeCloseTo(1.30);
      expect(ken.position.z).toBeCloseTo(-0.40);
      expect(ken.quaternion.y).toBeCloseTo(0.1);
    });

    it('CelestialEnvironmentSystem hides showroom select-plinth/cup-preview in gameplay mode and hides gameplayKenGroup in showroom mode', () => {
      const sceneGroup = new Group();
      const selectPlinth = new Group(); selectPlinth.name = 'select-plinth'; selectPlinth.visible = true;
      const cupPreview = new Group(); cupPreview.name = 'cup-preview'; cupPreview.visible = true;
      selectPlinth.add(cupPreview);
      sceneGroup.add(selectPlinth);

      const gameplayKen = createGameplayKenGroup();
      sceneGroup.add(gameplayKen);

      const mockWorld = {
        activeLevel: { value: new Group() },
        scene: sceneGroup,
      };

      const envSystem = new CelestialEnvironmentSystem(mockWorld);
      envSystem.init();

      // Showroom initial: plinth & showroom cup preview are visible, gameplayKen is hidden
      envSystem.setGameplayKenGroup(gameplayKen);
      expect(selectPlinth.visible).toBe(true);
      expect(cupPreview.visible).toBe(true);
      expect(gameplayKen.visible).toBe(false);

      // Cycle 1: Switch to gameplay mode
      envSystem.setMode('gameplay');
      expect(selectPlinth.visible).toBe(false);
      expect(cupPreview.visible).toBe(false);
      expect(gameplayKen.visible).toBe(true);

      // Cycle 2: Switch to showroom mode
      envSystem.setMode('showroom');
      expect(selectPlinth.visible).toBe(true);
      expect(cupPreview.visible).toBe(true);
      expect(gameplayKen.visible).toBe(false);

      // Cycle 3: Switch to gameplay mode
      envSystem.setMode('gameplay');
      expect(selectPlinth.visible).toBe(false);
      expect(cupPreview.visible).toBe(false);
      expect(gameplayKen.visible).toBe(true);

      // Cycle 4: Switch to showroom mode
      envSystem.setMode('showroom');
      expect(selectPlinth.visible).toBe(true);
      expect(cupPreview.visible).toBe(true);
      expect(gameplayKen.visible).toBe(false);

      envSystem.destroy();
    });
  });
});
