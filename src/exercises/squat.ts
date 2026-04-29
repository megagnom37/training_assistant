import type { ExerciseDefinition } from './types';

/**
 * MediaPipe landmark indices:
 *  11/12 = left/right shoulder
 *  23/24 = left/right hip
 *  25/26 = left/right knee
 *  27/28 = left/right ankle
 */
export const SQUAT: ExerciseDefinition = {
  id: 'squat',
  name: 'Squats',
  bodyPart: 'lower',
  angles: [
    {
      id: 'knee',
      landmarks: [23, 25, 27], // hip -> knee -> ankle (left side template)
      label: 'Knee',
    },
    {
      id: 'hip',
      landmarks: [11, 23, 25], // shoulder -> hip -> knee (left side template)
      label: 'Hip',
    },
  ],
  bilateralPairs: [
    { left: [23, 25, 27], right: [24, 26, 28] }, // knee angle
    { left: [11, 23, 25], right: [12, 24, 26] }, // hip angle
  ],
  states: ['STANDING', 'DESCENDING', 'BOTTOM', 'ASCENDING'],
  initialState: 'STANDING',
  transitions: [
    { from: 'STANDING',   to: 'DESCENDING', condition: { angleId: 'knee', operator: '<',  value: 150 } },
    { from: 'DESCENDING', to: 'BOTTOM',     condition: { angleId: 'knee', operator: '<',  value: 100 } },
    { from: 'DESCENDING', to: 'STANDING',   condition: { angleId: 'knee', operator: '>=', value: 160 } },
    { from: 'BOTTOM',     to: 'ASCENDING',  condition: { angleId: 'knee', operator: '>',  value: 110 } },
    { from: 'ASCENDING',  to: 'STANDING',   condition: { angleId: 'knee', operator: '>=', value: 160 } },
  ],
  incrementOn: { from: 'ASCENDING', to: 'STANDING' },
  tempoPhases: [
    { name: 'eccentric',   from: 'DESCENDING', to: 'BOTTOM' },
    { name: 'pause',       from: 'BOTTOM',     to: 'ASCENDING' },
    { name: 'concentric',  from: 'ASCENDING',  to: 'STANDING' },
  ],
  minVisibility: 0.6,
  stabilityFrames: 3,
};
