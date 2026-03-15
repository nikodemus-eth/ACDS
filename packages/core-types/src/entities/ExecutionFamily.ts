import { DecisionPosture } from '../enums/DecisionPosture.js';
import { CognitiveGrade } from '../enums/CognitiveGrade.js';

export interface ExecutionFamily {
  application: string;
  process: string;
  step: string;
  decisionPosture: DecisionPosture;
  cognitiveGrade: CognitiveGrade;
}
