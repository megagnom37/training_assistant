import type { ExerciseDefinition } from './types';

/**
 * MediaPipe landmark indices:
 *  11/12 = left/right shoulder
 *  15/16 = left/right wrist
 *  23/24 = left/right hip
 *
 * Tracking angle: hip → shoulder → wrist (arm elevation relative to torso).
 * Unilateral exercise — AngleCalculator will detect asymmetry and pick
 * the active arm via Math.max.
 */
export const KETTLEBELL_SNATCH: ExerciseDefinition = {
  id: 'kettlebell-snatch',
  name: 'Kettlebell Snatch',
  bodyPart: 'full',
  angles: [
    {
      id: 'shoulder',
      landmarks: [23, 11, 15],
      label: 'Shoulder',
    },
  ],
  bilateralPairs: [
    { left: [23, 11, 15], right: [24, 12, 16] },
  ],
  states: ['BOTTOM', 'RISING', 'LOCKOUT', 'DESCENDING'],
  initialState: 'BOTTOM',
  transitions: [
    // Arm must come up from below waist before we start tracking the pull
    { from: 'BOTTOM',     to: 'RISING',     condition: { angleId: 'shoulder', operator: '>',  value: 70  } },
    // Full lockout: arm straight overhead, wrist well above head
    { from: 'RISING',     to: 'LOCKOUT',    condition: { angleId: 'shoulder', operator: '>=', value: 165 } },
    // Failed attempt — arm dropped back down between legs
    { from: 'RISING',     to: 'BOTTOM',     condition: { angleId: 'shoulder', operator: '<',  value: 50  } },
    // Arm leaving overhead position
    { from: 'LOCKOUT',    to: 'DESCENDING', condition: { angleId: 'shoulder', operator: '<',  value: 150 } },
    // Arm returned between legs below waist — ready for next rep
    { from: 'DESCENDING', to: 'BOTTOM',     condition: { angleId: 'shoulder', operator: '<',  value: 50  } },
    // Quick re-lockout without full descent
    { from: 'DESCENDING', to: 'LOCKOUT',    condition: { angleId: 'shoulder', operator: '>=', value: 165 } },
  ],
  incrementOn: { from: 'RISING', to: 'LOCKOUT' },
  tempoPhases: [
    { name: 'eccentric',  from: 'DESCENDING', to: 'BOTTOM' },
    { name: 'pause',      from: 'BOTTOM',     to: 'RISING' },
    { name: 'concentric', from: 'RISING',     to: 'LOCKOUT' },
  ],
  minVisibility: 0.5,
  stabilityFrames: 2,
};
