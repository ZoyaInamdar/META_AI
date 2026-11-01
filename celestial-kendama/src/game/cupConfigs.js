// src/game/cupConfigs.js

export const BALL_RADIUS = 0.03; // 3 cm radius (0.06m diameter)

export const CUP_CONFIGS = {
  big: { radius: 0.038, depth: 0.015, toleranceRadius: 0.075 },
  small: { radius: 0.034, depth: 0.012, toleranceRadius: 0.055 },
  base: { radius: 0.030, depth: 0.010, toleranceRadius: 0.065 },
  spike: { length: 0.045, baseRadius: 0.005, toleranceRadius: 0.035 }
};