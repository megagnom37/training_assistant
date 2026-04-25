import type { ExerciseDefinition } from './types';

/**
 * MediaPipe landmark indices:
 *  11/12 = left/right shoulder
 *  13/14 = left/right elbow
 *  15/16 = left/right wrist
 */
export const PUSH_UP: ExerciseDefinition = {
  id: 'push-up',
  name: 'Push-ups',
  angles: [
    {
      id: 'elbow',
      landmarks: [11, 13, 15],
      label: 'Elbow',
    },
  ],
  bilateralPairs: [
    { left: [11, 13, 15], right: [12, 14, 16] },
  ],
  states: ['PLANK', 'DESCENDING', 'BOTTOM', 'ASCENDING'],
  initialState: 'PLANK',
  transitions: [
    { from: 'PLANK',      to: 'DESCENDING', condition: { angleId: 'elbow', operator: '<',  value: 150 } },
    { from: 'DESCENDING', to: 'BOTTOM',     condition: { angleId: 'elbow', operator: '<',  value: 100 } },
    { from: 'DESCENDING', to: 'PLANK',      condition: { angleId: 'elbow', operator: '>=', value: 160 } },
    { from: 'BOTTOM',     to: 'ASCENDING',  condition: { angleId: 'elbow', operator: '>',  value: 110 } },
    { from: 'ASCENDING',  to: 'PLANK',      condition: { angleId: 'elbow', operator: '>=', value: 160 } },
  ],
  incrementOn: { from: 'ASCENDING', to: 'PLANK' },
  tempoPhases: [
    { name: 'eccentric',  from: 'DESCENDING', to: 'BOTTOM' },
    { name: 'pause',      from: 'BOTTOM',     to: 'ASCENDING' },
    { name: 'concentric', from: 'ASCENDING',  to: 'PLANK' },
  ],
  minVisibility: 0.6,
  stabilityFrames: 3,
};
