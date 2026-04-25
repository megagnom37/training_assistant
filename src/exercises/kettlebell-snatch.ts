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
  name: 'Рывок гири',
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
  states: ['LOW', 'RISING', 'LOCKOUT', 'DESCENDING'],
  initialState: 'LOW',
  transitions: [
    { from: 'LOW',        to: 'RISING',     condition: { angleId: 'shoulder', operator: '>',  value: 90  } },
    { from: 'RISING',     to: 'LOCKOUT',    condition: { angleId: 'shoulder', operator: '>=', value: 155 } },
    { from: 'RISING',     to: 'LOW',        condition: { angleId: 'shoulder', operator: '<',  value: 70  } },
    { from: 'LOCKOUT',    to: 'DESCENDING', condition: { angleId: 'shoulder', operator: '<',  value: 135 } },
    { from: 'DESCENDING', to: 'LOW',        condition: { angleId: 'shoulder', operator: '<',  value: 90  } },
    { from: 'DESCENDING', to: 'LOCKOUT',    condition: { angleId: 'shoulder', operator: '>=', value: 155 } },
  ],
  incrementOn: { from: 'RISING', to: 'LOCKOUT' },
  tempoPhases: [
    { name: 'eccentric',  from: 'DESCENDING', to: 'LOW' },
    { name: 'pause',      from: 'LOW',        to: 'RISING' },
    { name: 'concentric', from: 'RISING',     to: 'LOCKOUT' },
  ],
  minVisibility: 0.5,
  stabilityFrames: 2,
};
