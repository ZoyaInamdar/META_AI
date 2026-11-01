// src/main.js
import { TargetState, PhysicsState, MissionState, PlanetState, BallState } from './contracts/Interfaces.js';

console.log("Celestial Kendama — IWSDK Initialized");

// Global State Holders
export const currentTargetState = new TargetState();
export const currentPhysicsState = new PhysicsState();
export const currentMissionState = new MissionState();
export const currentPlanetState = new PlanetState();
export const currentBallState = new BallState();

// Test locally that the engine runs
export function initGame() {
  console.log("Ready for subsystems A, B, and C.");
}

initGame();