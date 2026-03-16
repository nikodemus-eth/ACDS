// ---------------------------------------------------------------------------
// Process Swarm Integration Example
// ---------------------------------------------------------------------------
// Demonstrates how Process Swarm uses the ACDS SDK for creative synthesis
// tasks, leveraging cloud providers for frontier-grade cognitive work.
// ---------------------------------------------------------------------------

import {
  DispatchClient,
  RoutingRequestBuilder,
} from '@acds/sdk';
import {
  TaskType,
  LoadTier,
  DecisionPosture,
  CognitiveGrade,
} from '@acds/core-types';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ACDS_BASE_URL = process.env.ACDS_BASE_URL ?? 'http://localhost:3000/api';
const APPLICATION = 'processSwarm';

// ---------------------------------------------------------------------------
// Creative synthesis use-case
// ---------------------------------------------------------------------------

interface SynthesisTask {
  id: string;
  topic: string;
  sources: string[];
  outputFormat: 'markdown' | 'json' | 'plain';
}

async function runCreativeSynthesis(
  client: DispatchClient,
  task: SynthesisTask,
): Promise<void> {
  console.log(`[processSwarm] Starting synthesis: ${task.id} — "${task.topic}"`);

  const request = new RoutingRequestBuilder()
    .forApplication(APPLICATION)
    .forProcess('creative-pipeline')
    .forStep('synthesize')
    .withTaskType(TaskType.CREATIVE)
    .withLoadTier(LoadTier.BATCH)
    .withPosture(DecisionPosture.AUTONOMOUS)
    .withGrade(CognitiveGrade.FRONTIER)
    .withInput({
      taskId: task.id,
      topic: task.topic,
      sources: task.sources,
      outputFormat: task.outputFormat,
    })
    .withConstraints({
      privacyLevel: 'cloud_allowed',
      maxLatencyMs: 20000,
      structuredOutputRequired: task.outputFormat === 'json',
    })
    .build();

  const result = await client.run({
    routingRequest: request,
    executionFamily: {
      application: APPLICATION,
      process: 'creative-pipeline',
      step: 'synthesize',
    },
  });

  console.log(`[processSwarm] Synthesis complete:`, {
    status: result.status,
    latencyMs: result.latencyMs,
    outputPreview: typeof result.output === 'string'
      ? result.output.slice(0, 200)
      : JSON.stringify(result.output).slice(0, 200),
  });
}

// ---------------------------------------------------------------------------
// Multi-step planning use-case
// ---------------------------------------------------------------------------

interface PlanningContext {
  projectId: string;
  objective: string;
  constraints: string[];
  priorSteps: string[];
}

async function runStrategicPlanning(
  client: DispatchClient,
  ctx: PlanningContext,
): Promise<void> {
  console.log(
    `[processSwarm] Planning for project: ${ctx.projectId} — "${ctx.objective}"`,
  );

  // Step 1: Generate draft plan
  const draftRequest = new RoutingRequestBuilder()
    .forApplication(APPLICATION)
    .forProcess('planning-pipeline')
    .forStep('draft-plan')
    .withTaskType(TaskType.PLANNING)
    .withLoadTier(LoadTier.BATCH)
    .withPosture(DecisionPosture.ADVISORY)
    .withGrade(CognitiveGrade.FRONTIER)
    .withInput({
      projectId: ctx.projectId,
      objective: ctx.objective,
      constraints: ctx.constraints,
      priorSteps: ctx.priorSteps,
    })
    .withConstraints({
      privacyLevel: 'cloud_allowed',
      maxLatencyMs: 30000,
      structuredOutputRequired: true,
    })
    .build();

  const draftResult = await client.run({
    routingRequest: draftRequest,
    executionFamily: {
      application: APPLICATION,
      process: 'planning-pipeline',
      step: 'draft-plan',
    },
  });

  console.log(`[processSwarm] Draft plan generated (${draftResult.latencyMs}ms)`);

  // Step 2: Critique the draft
  const critiqueRequest = new RoutingRequestBuilder()
    .forApplication(APPLICATION)
    .forProcess('planning-pipeline')
    .forStep('critique')
    .withTaskType(TaskType.CRITIQUE)
    .withLoadTier(LoadTier.SINGLE_SHOT)
    .withPosture(DecisionPosture.ADVISORY)
    .withGrade(CognitiveGrade.ENHANCED)
    .withInput({
      projectId: ctx.projectId,
      draftPlan: draftResult.output,
      objective: ctx.objective,
    })
    .withConstraints({
      privacyLevel: 'cloud_allowed',
      maxLatencyMs: 15000,
      structuredOutputRequired: false,
    })
    .build();

  const critiqueResult = await client.run({
    routingRequest: critiqueRequest,
    executionFamily: {
      application: APPLICATION,
      process: 'planning-pipeline',
      step: 'critique',
    },
  });

  console.log(`[processSwarm] Critique complete (${critiqueResult.latencyMs}ms)`);
  console.log(`[processSwarm] Critique output:`, critiqueResult.output);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const client = new DispatchClient({ baseUrl: ACDS_BASE_URL });

  // Creative synthesis
  await runCreativeSynthesis(client, {
    id: 'synth-001',
    topic: 'Emerging trends in autonomous agent architectures',
    sources: [
      'https://arxiv.org/abs/example-1',
      'https://arxiv.org/abs/example-2',
      'Internal research notes on multi-agent coordination',
    ],
    outputFormat: 'markdown',
  });

  // Strategic planning
  await runStrategicPlanning(client, {
    projectId: 'proj-alpha',
    objective: 'Design a self-improving task decomposition framework',
    constraints: [
      'Must operate within existing compute budget',
      'Latency per decomposition step under 5 seconds',
      'Support at least 3 parallel sub-task streams',
    ],
    priorSteps: [
      'Identified core decomposition patterns',
      'Benchmarked candidate models for sub-task routing',
    ],
  });

  console.log('[processSwarm] Integration example complete.');
}

main().catch((err) => {
  console.error('[processSwarm] Fatal error:', err);
  process.exit(1);
});
