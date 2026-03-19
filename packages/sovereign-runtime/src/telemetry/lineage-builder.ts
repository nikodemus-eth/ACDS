export interface LineageStep {
  phase: 'request' | 'policy' | 'scoring' | 'selection' | 'execution' | 'validation';
  timestamp: string;
  details: Record<string, unknown>;
}

export interface ExecutionLineage {
  executionId: string;
  capabilityId: string;
  steps: LineageStep[];
  totalDurationMs: number;
}

export class LineageBuilder {
  private steps: LineageStep[] = [];
  private startTime: number;

  constructor(private executionId: string, private capabilityId: string) {
    this.startTime = Date.now();
  }

  addStep(phase: LineageStep['phase'], details: Record<string, unknown>): void {
    this.steps.push({
      phase,
      timestamp: new Date().toISOString(),
      details,
    });
  }

  build(): ExecutionLineage {
    return {
      executionId: this.executionId,
      capabilityId: this.capabilityId,
      steps: [...this.steps],
      totalDurationMs: Date.now() - this.startTime,
    };
  }
}
