# Calibration (emulator, Hands mode)

All values from the IWSDK emulator; real-Quest numbers still to be measured.

| Cup | Orientation tolerance (off vertical) | Alignment | Real wrist input that works | Amplified (x2) | Result |
|---|---|---|---|---|---|
| Big | 40 deg | dot < -0.2 | +44 to +50 deg twist | +88 to +100 deg | CLEAN / ASSISTED |
| Small | 40 deg | dot < -0.2 | -41.5 deg twist | -83 deg | CLEAN |
| Spike | 18 deg | dot < -0.2 | Ken tilt <= ~13 deg (rest pose is ~30 deg) | none needed | CLEAN |
| Base | 40 deg | dot < -0.2 | untested (needs ~180 deg pitch flip) | clamp +/-150 deg can't reach | open question |

Other settings: rollGain 2.0, twist clamp +/-150 deg, deadzone 2 deg,
pinch close 2.0 cm / open 3.5 cm (off hand), assist/clean radii in cupConfigs.js.
Known limits: clean-vs-assisted depends on frame timing (emulator runs 20-60 FPS).

| Base | 40 deg | dot < -0.2 | pitch flip about the crossbar (local X); only when target = base | pitchGain 2.0, clamp +/-180 deg | CATCH (ASSISTED) at raw 122 deg -> amp 180 (clamped); MISS at gain 1.0 with raw 96 deg (cupNorm Y 0.23) |

Pitch gain note: the Base Cup needs >= ~140 deg of cup rotation (40 deg tolerance), so
gain 2.0 needs ~70 deg real flip; to be tuned on the headset (try 2.5-3.0).
Spike tolerance relaxed to 28 deg (was 18) by team decision (B + C).