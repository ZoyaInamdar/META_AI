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

Add the real measurements to the Base row: “gain 1.0, raw 96°: MISS (cupNorm Y 0.23); gain 2.0, raw 96° → 180° (clamped): CATCH (Y 0.94). Smaller flips untested

## Base Cup pitch gain (emulator, Hands mode)

Same real flip, different gain (target = base, `?debug&mode=gameplay&target=base`):

| pitchGain | pitchDeg raw | pitchDeg amplified | cupNorm Y | firstFail | Result |
|---|---|---|---|---|---|
| 1.0 | 96.27 | 96.27 | 0.23 (77 deg off vertical) | cup_orientation_invalid | MISS |
| 2.0 | 96.27 | 180.00 (clamped) | 0.94 (19.5 deg off vertical) | none | CATCH (ASSISTED) |

Notes:
- The Base Cup normal points down (local -Y), so the cup must rotate at least ~140 deg
  to be inside its 40 deg tolerance. At gain 2.0 that needs ~70 deg of real flip.
- Pitch gain applies only while the active target is the Base Cup (1.0 otherwise),
  with a ~200 ms blend when the target changes.
- Smaller flips (50-70 deg real) are not tested yet. To do on the headset: try 2.5-3.0.
- Debug overrides: `?rollGain=N`, `?pitchGain=N` (only with `?debug`).
- Spike tolerance was relaxed from 18 to 28 deg (agreed by B and C).
EOF
## Base Cup flip curve (emulator, target = base, pitchGain 2.0)

| pitchDeg raw | amplified | cupNorm Y | off vertical | Result |
|---|---|---|---|---|
| 29.5 | 59 | -0.50 | 120 deg | MISS |
| 63.1 | 126 | 0.59 | 54 deg | MISS |
| 79.8 | 160 | 0.90 | 25.5 deg | CATCH (ASSISTED) |
| 96.3 | 180 (clamped) | 0.94 | 19.5 deg | CATCH (CLEAN) |

Edge of the 40 deg tolerance (Y = 0.766) is at roughly 70-72 deg raw at gain 2.0.
A 50-60 deg real flip does not catch at 2.0; gain 2.5-3.0 still to be tested.
Rot X in the emulator panel does not map directly to pitchDeg; read pitchDeg in [DEBUG Launch].
