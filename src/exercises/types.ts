export interface AngleDefinition {
  id: string;
  landmarks: [number, number, number]; // [pointA, vertex, pointC]
  label: string;
}

export interface StateTransition {
  from: string;
  to: string;
  condition: {
    angleId: string;
    operator: '>' | '<' | '>=' | '<=';
    value: number;
  };
}

export interface ExerciseDefinition {
  id: string;
  name: string;
  angles: AngleDefinition[];
  states: string[];
  initialState: string;
  transitions: StateTransition[];
  incrementOn: { from: string; to: string };
  tempoPhases: { name: string; from: string; to: string }[];
  /** Pairs of landmark indices to use (left, right) for averaging */
  bilateralPairs: { left: [number, number, number]; right: [number, number, number] }[];
  /** Minimum visibility score for landmarks to trust the frame */
  minVisibility: number;
  /** Number of consecutive frames required to confirm a state transition */
  stabilityFrames: number;
}
