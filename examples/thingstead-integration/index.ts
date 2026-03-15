// ---------------------------------------------------------------------------
// Thingstead Integration Example
// ---------------------------------------------------------------------------
// Demonstrates how the Thingstead application uses the ACDS SDK to classify
// documents through the governed dispatch pipeline.
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
const APPLICATION = 'thingstead';

// ---------------------------------------------------------------------------
// Document classification use-case
// ---------------------------------------------------------------------------

interface IncomingDocument {
  id: string;
  title: string;
  body: string;
  source: string;
}

async function classifyDocument(
  client: DispatchClient,
  doc: IncomingDocument,
): Promise<void> {
  console.log(`[thingstead] Classifying document: ${doc.id} — "${doc.title}"`);

  const request = new RoutingRequestBuilder()
    .forApplication(APPLICATION)
    .forProcess('ingestion')
    .forStep('classify')
    .withTaskType(TaskType.CLASSIFICATION)
    .withLoadTier(LoadTier.SINGLE_SHOT)
    .withPosture(DecisionPosture.ADVISORY)
    .withGrade(CognitiveGrade.STANDARD)
    .withInput({
      documentId: doc.id,
      title: doc.title,
      body: doc.body,
      source: doc.source,
    })
    .withConstraints({
      privacyLevel: 'local_only',
      maxLatencyMs: 3000,
      structuredOutputRequired: true,
    })
    .build();

  // Step 1: Resolve routing to see which model/tactic would be selected
  const decision = await client.resolve(request);
  console.log(`[thingstead] Routing decision:`, {
    modelProfile: decision.modelProfileId,
    tacticProfile: decision.tacticProfileId,
    provider: decision.providerId,
    fallbackCount: decision.fallbackChain?.length ?? 0,
  });

  // Step 2: Execute the full dispatch run
  const result = await client.run({
    routingRequest: request,
    executionFamily: {
      application: APPLICATION,
      process: 'ingestion',
      step: 'classify',
    },
  });

  console.log(`[thingstead] Classification result:`, {
    status: result.status,
    latencyMs: result.latencyMs,
    output: result.output,
  });
}

// ---------------------------------------------------------------------------
// Batch extraction use-case
// ---------------------------------------------------------------------------

async function extractEntities(
  client: DispatchClient,
  documents: IncomingDocument[],
): Promise<void> {
  console.log(
    `[thingstead] Extracting entities from ${documents.length} document(s)`,
  );

  for (const doc of documents) {
    const request = new RoutingRequestBuilder()
      .forApplication(APPLICATION)
      .forProcess('ingestion')
      .forStep('extract-entities')
      .withTaskType(TaskType.EXTRACTION)
      .withLoadTier(LoadTier.BATCH)
      .withPosture(DecisionPosture.AUTONOMOUS)
      .withGrade(CognitiveGrade.ENHANCED)
      .withInput({
        documentId: doc.id,
        body: doc.body,
      })
      .withConstraints({
        privacyLevel: 'local_only',
        maxLatencyMs: 10000,
        structuredOutputRequired: true,
      })
      .build();

    const result = await client.run({
      routingRequest: request,
      executionFamily: {
        application: APPLICATION,
        process: 'ingestion',
        step: 'extract-entities',
      },
    });

    console.log(`[thingstead] Entities for ${doc.id}:`, result.output);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const client = new DispatchClient({ baseUrl: ACDS_BASE_URL });

  const sampleDocuments: IncomingDocument[] = [
    {
      id: 'doc-001',
      title: 'Q4 Financial Summary',
      body: 'Revenue increased 12% year-over-year driven by subscription growth...',
      source: 'email-ingest',
    },
    {
      id: 'doc-002',
      title: 'Meeting Notes — Product Review',
      body: 'Attendees discussed the roadmap for next quarter...',
      source: 'calendar-sync',
    },
    {
      id: 'doc-003',
      title: 'Vendor Contract Amendment',
      body: 'This amendment modifies section 4.2 regarding service-level obligations...',
      source: 'document-upload',
    },
  ];

  // Classify each document
  for (const doc of sampleDocuments) {
    await classifyDocument(client, doc);
  }

  // Batch entity extraction
  await extractEntities(client, sampleDocuments);

  console.log('[thingstead] Integration example complete.');
}

main().catch((err) => {
  console.error('[thingstead] Fatal error:', err);
  process.exit(1);
});
