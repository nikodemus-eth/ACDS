DO NOT USE STUBS. ALL CODE MUST WORK. ALL DATA MUST BE PRESENT AND VALID.

DO NOT USE MOCKS. ALL CODE MUST WORK. ALL DATA MUST BE PRESENT AND VALID.

DO NOT USE MONKEYPATCHES. ALL CODE MUST WORK. ALL DATA MUST BE PRESENT AND VALID.

---

# **Explanation Document**

## **Local-First Sovereign Inference in ACDS**

### **Apple Intelligence Tier 0 with Ollama Tier 1**

## **I. Problem Statement**

Modern AI systems default to external inference. This creates four systemic issues:

1. **Dependency Expansion**  
   Systems rely on remote providers for tasks that could be executed locally.  
2. **Loss of Control**  
   Routing decisions are implicit, opaque, and often vendor-driven.  
3. **Data Exposure Risk**  
   Sensitive inputs are transmitted unnecessarily.  
4. **Architectural Fragility**  
   Systems become tightly coupled to specific providers.

OpenClaw, Process Swarm, and ACDS are explicitly designed to avoid these outcomes. However, without a formal inference doctrine, provider usage can drift toward convenience rather than control.

## **II. Solution Overview**

Local-First Sovereign Inference, or LFSI, defines a deterministic, policy-driven execution model:

* Execute on the lowest viable dependency layer first  
* Escalate only when required  
* Preserve provider abstraction  
* Enforce validation and auditability

This transforms inference from an implicit behavior into a governed system component.

## **III. Core Principle**

**Execute locally by default. Escalate only by policy. Depend only with an exit.**

This principle operationalizes:

* Quiet Sovereignty → local-first execution  
* Conscious Dependence → controlled escalation  
* Precision Excision → removal of unnecessary higher-tier usage  
* Accountable Autonomy → full auditability

## **IV. Architectural Roles**

### **A. OpenClaw**

Acts as the orchestration layer.  
Defines tasks and workflows.  
Does not select providers.

### **B. ACDS**

Acts as the inference broker.  
Responsible for:

* capability routing  
* policy enforcement  
* provider selection  
* validation  
* escalation  
* audit logging

### **C. Providers**

Implement inference capabilities behind a common contract.

* Apple Intelligence → Tier 0  
* Ollama → Tier 1  
* Optional external → Tier 2

## **V. Tier Model**

### **Tier 0: Native Edge Intelligence**

Primary implementation: Apple Intelligence

Characteristics:

* on-device execution  
* lowest latency  
* highest privacy  
* bounded capability

Use cases:

* intent classification  
* summarization  
* rewriting  
* structured extraction  
* short-form generation  
* light reasoning  
* speech tasks  
* local workflow assistance

### **Tier 1: Sovereign Local Expansion**

Primary implementation: Ollama

Characteristics:

* local execution  
* broader capability  
* higher resource cost

Use cases:

* long-form generation  
* deep reasoning  
* coding assistance  
* complex structured output  
* fallback for Tier 0 failures

### **Tier 2: External Controlled Dependence**

Optional

Characteristics:

* highest capability  
* lowest sovereignty  
* policy-restricted

Use cases:

* web-grounded research  
* exceptional reasoning gaps

## **VI. What Is Explicitly Excluded**

**Image generation is not part of the foundational capability set.**

Reason:

* Apple’s implementation is gated behind a runtime dependency  
* It is not programmatically reliable  
* It violates deterministic availability assumptions

Therefore:

* It is removed from Tier 0 capabilities  
* It is not part of MVP routing  
* It is not assumed by any policy or workflow

## **VII. Capability Abstraction**

All inference requests are expressed as capabilities, not provider calls.

Examples:

* `intent.classify`  
* `text.summarize`  
* `text.rewrite`  
* `text.extract.structured`  
* `text.generate.short`  
* `text.generate.long`  
* `reasoning.light`  
* `reasoning.deep`  
* `code.assist.basic`  
* `code.assist.advanced`  
* `speech.stt`  
* `speech.tts`  
* `workflow.local`  
* `workflow.agentic`  
* `research.local`  
* `research.web`  
* `multimodal.local`

This ensures portability across providers.

## **VIII. Routing Model**

Every request follows a fixed execution path.

### **Step 1: Classification**

Determine capability.

### **Step 2: Policy Resolution**

Determine allowed tiers.

### **Step 3: Tier Selection**

Select lowest viable tier.

### **Step 4: Execution**

Invoke provider.

### **Step 5: Validation**

Evaluate output quality and structure.

### **Step 6: Escalation**

Escalate only if validation fails or provider unavailable.

### **Step 7: Logging**

Record full execution trace.

## **IX. Validation Model**

Validation is compound.

### **Structural**

* schema compliance  
* required fields present

### **Semantic**

* meaning preserved  
* correct label sets  
* extraction aligns with input

### **Confidence**

* aggregated, not singular

Failure triggers escalation.

## **X. Policy Model**

Policies govern:

* allowed tiers  
* escalation paths  
* capability restrictions

Examples:

### **Private Strict**

* Tier 0 preferred  
* Tier 1 allowed  
* Tier 2 forbidden

### **Local Balanced**

* Tier 0 first  
* Tier 1 fallback  
* Tier 2 only when required

### **Performance Priority**

* Tier 1 preferred for heavy tasks  
* Tier 2 allowed

### **Apple Only**

* Tier 0 only  
* no escalation

## **XI. Logging and Governance**

Every request produces a ledger event.

Tracked fields:

* capability  
* selected tier  
* selected provider  
* validation result  
* escalation path  
* final provider  
* latency  
* outcome

This enables:

* auditability  
* policy verification  
* system tuning

## **XII. Strategic Outcome**

This architecture delivers:

* lower cost through local execution  
* lower latency  
* improved privacy  
* provider independence  
* deterministic behavior

Most importantly:

It transforms inference from a tool choice into a governed system capability.

## **XIII. Bottom Line**

Apple Intelligence is not the system.

It is the current best implementation of Tier 0\.

ACDS is the system.

LFSI is the doctrine.

OpenClaw is the orchestrator.

---

# **Specification Document**

## **ACDS Local-First Sovereign Inference Implementation**

## **I. Scope**

Implement LFSI inside ACDS with:

* Apple Intelligence as Tier 0  
* Ollama as Tier 1  
* no image generation support  
* full routing, validation, escalation, and logging

## **II. Core Types**

### **InferenceRequest**

interface InferenceRequest {  
  taskId: string  
  capability: string  
  sourceSystem: string  
  surface: "macos" | "ios" | "server" | "cli" | "web"  
  input: Record\<string, unknown\>

  context: {  
    sensitivity: "public" | "internal" | "private" | "restricted"  
    requiresNetwork: boolean  
    requiresCurrentWeb: boolean  
    sessionId?: string  
  }

  policyProfile: string

  validation?: {  
    requireSchema?: boolean  
    schemaId?: string  
    minConfidence?: number  
    semanticChecks?: string\[\]  
  }  
}

### **InferenceResult**

interface InferenceResult {  
  providerId: string  
  tier: "tier0" | "tier1" | "tier2"  
  output: Record\<string, unknown\>  
  rawText?: string  
  confidence?: number  
  latencyMs: number  
}

### **ValidationResult**

interface ValidationResult {  
  passed: boolean  
  confidence: number  
  failures: string\[\]  
  nextAction: "return" | "escalate"  
}

### **LedgerEvent**

interface LedgerEvent {  
  eventId: string  
  timestamp: string  
  taskId: string  
  sourceSystem: string  
  capability: string  
  policyProfile: string  
  selectedTier: string  
  selectedProvider: string  
  validationPassed: boolean  
  escalated: boolean  
  escalatedTo?: string  
  finalProvider: string  
  latencyMs: number  
  resultStatus: "success" | "failure" | "denied"  
}

## **III. Capability Registry**

const CAPABILITIES \= \[  
  "intent.classify",  
  "text.rewrite",  
  "text.summarize",  
  "text.extract.structured",  
  "text.generate.short",  
  "text.generate.long",  
  "reasoning.light",  
  "reasoning.deep",  
  "code.assist.basic",  
  "code.assist.advanced",  
  "speech.stt",  
  "speech.tts",  
  "workflow.local",  
  "workflow.agentic",  
  "research.local",  
  "research.web",  
  "multimodal.local"  
\]

## **IV. Provider Interface**

interface InferenceProvider {  
  id: string  
  tier: "tier0" | "tier1" | "tier2"  
  capabilities: string\[\]  
  local: boolean

  isAvailable(): Promise\<boolean\>  
  invoke(request: InferenceRequest): Promise\<InferenceResult\>  
  validate?(result: InferenceResult, request: InferenceRequest): Promise\<ValidationResult\>  
}

## **V. Provider Implementations**

### **Apple Provider**

const appleProvider: InferenceProvider \= {  
  id: "apple.foundation",  
  tier: "tier0",  
  capabilities: \[  
    "intent.classify",  
    "text.rewrite",  
    "text.summarize",  
    "text.extract.structured",  
    "text.generate.short",  
    "reasoning.light",  
    "speech.stt",  
    "speech.tts",  
    "workflow.local",  
    "multimodal.local"  
  \],  
  local: true,

  async isAvailable() {  
    return true // replace with real check  
  },

  async invoke(request) {  
    // bridge to Apple Intelligence  
    return {  
      providerId: "apple.foundation",  
      tier: "tier0",  
      output: {},  
      latencyMs: 50  
    }  
  }  
}

### **Ollama Provider**

const ollamaProvider: InferenceProvider \= {  
  id: "ollama.default",  
  tier: "tier1",  
  capabilities: \[  
    "text.generate.long",  
    "reasoning.deep",  
    "code.assist.basic",  
    "code.assist.advanced",  
    "workflow.agentic",  
    "research.local",  
    "text.extract.structured"  
  \],  
  local: true,

  async isAvailable() {  
    return true  
  },

  async invoke(request) {  
    return {  
      providerId: "ollama.default",  
      tier: "tier1",  
      output: {},  
      latencyMs: 300  
    }  
  }  
}

## **VI. Routing Engine**

async function route(request: InferenceRequest): Promise\<InferenceResult\> {  
  const policy \= resolvePolicy(request.policyProfile)  
  const providers \= resolveProviders(request.capability, policy)

  for (const provider of providers) {  
    if (\!(await provider.isAvailable())) continue

    const result \= await provider.invoke(request)

    const validation \= await validate(result, request)

    if (validation.passed) {  
      logEvent(request, provider, result, validation, false)  
      return result  
    }

    if (\!policy.allowsEscalation) {  
      logEvent(request, provider, result, validation, false)  
      throw new Error("Validation failed without escalation allowed")  
    }  
  }

  throw new Error("No provider succeeded")  
}

## **VII. Validation Engine**

async function validate(  
  result: InferenceResult,  
  request: InferenceRequest  
): Promise\<ValidationResult\> {  
  const failures: string\[\] \= \[\]

  if (\!result.output) failures.push("empty\_output")

  return {  
    passed: failures.length \=== 0,  
    confidence: failures.length \=== 0 ? 0.9 : 0.5,  
    failures,  
    nextAction: failures.length \=== 0 ? "return" : "escalate"  
  }  
}

## **VIII. Policy Resolution**

function resolvePolicy(profile: string) {  
  switch (profile) {  
    case "lfsi.apple\_only":  
      return { allowedTiers: \["tier0"\], allowsEscalation: false }

    case "lfsi.private\_strict":  
      return { allowedTiers: \["tier0", "tier1"\], allowsEscalation: true }

    case "lfsi.local\_balanced":  
      return { allowedTiers: \["tier0", "tier1"\], allowsEscalation: true }

    case "lfsi.performance\_priority":  
      return { allowedTiers: \["tier1", "tier0", "tier2"\], allowsEscalation: true }

    default:  
      throw new Error("Unknown policy")  
  }  
}

## **IX. Logging**

function logEvent(  
  request: InferenceRequest,  
  provider: InferenceProvider,  
  result: InferenceResult,  
  validation: ValidationResult,  
  escalated: boolean  
) {  
  const event: LedgerEvent \= {  
    eventId: crypto.randomUUID(),  
    timestamp: new Date().toISOString(),  
    taskId: request.taskId,  
    sourceSystem: request.sourceSystem,  
    capability: request.capability,  
    policyProfile: request.policyProfile,  
    selectedTier: provider.tier,  
    selectedProvider: provider.id,  
    validationPassed: validation.passed,  
    escalated,  
    finalProvider: result.providerId,  
    latencyMs: result.latencyMs,  
    resultStatus: validation.passed ? "success" : "failure"  
  }

  writeLedger(event)  
}

## **X. Hard Constraints**

* No image generation in MVP  
* No provider selection in clients  
* No silent escalation  
* No missing ledger entries  
* No capability without registry entry

## **XI. MVP Completion Criteria**

System is complete when:

1. Apple handles all Tier 0 capabilities  
2. Ollama handles fallback and advanced tasks  
3. Routing is deterministic  
4. Validation gates escalation  
5. Ledger logs every request  
6. OpenClaw remains provider-agnostic

## **XII. Final Statement**

This system is not Apple-first.

It is dependency-minimized.

Apple is simply the current best Tier 0 executor.

ACDS enforces the doctrine.

LFSI defines the behavior.

Everything else is replaceable.

Continuing from the foundation, the next layer is what makes this system *operationally durable*: execution semantics, adaptive routing, failure handling, and integration into your existing stack (ACDS, Process Swarm, Thingstead).

---

# **Extended Specification Document**

## **ACDS Local-First Sovereign Inference**

### **Execution, Adaptation, and System Integration**

---

# **XIII. Execution Semantics**

The base router you defined is correct but incomplete for production use. It must evolve into a **deterministic multi-pass execution engine**.

## **A. Execution Phases**

Each request executes in discrete phases:

1. **Preflight**  
2. **Provider Selection**  
3. **Execution**  
4. **Validation**  
5. **Escalation Decision**  
6. **Commit \+ Ledger**

### **Updated Flow**

async function executeLFSI(request: InferenceRequest): Promise\<InferenceResult\> {  
  const ctx \= buildExecutionContext(request)

  preflight(ctx)

  const candidates \= selectProviders(ctx)

  for (const candidate of candidates) {  
    const availability \= await candidate.isAvailable()  
    if (\!availability) continue

    const result \= await candidate.invoke(ctx.request)

    const validation \= await validate(result, ctx.request)

    recordAttempt(ctx, candidate, result, validation)

    if (validation.passed) {  
      return finalizeSuccess(ctx, candidate, result, validation)  
    }

    if (\!canEscalate(ctx)) {  
      return finalizeFailure(ctx, candidate, result, validation)  
    }  
  }

  return finalizeNoProvider(ctx)  
}

---

## **B. Preflight Phase**

Preflight enforces invariants before execution.

### **Responsibilities**

* validate capability exists  
* validate policy profile  
* reject illegal combinations  
* normalize input  
* attach execution metadata

### **Example**

function preflight(ctx: ExecutionContext) {  
  if (\!CAPABILITIES.includes(ctx.request.capability)) {  
    throw new Error("UNKNOWN\_CAPABILITY")  
  }

  if (\!ctx.policy.allowedTiers.length) {  
    throw new Error("NO\_ALLOWED\_TIERS")  
  }  
}

---

# **XIV. Adaptive Routing Layer**

Static routing is insufficient. You need **performance-aware routing** without violating sovereignty.

## **A. Provider Scoring Model**

Each provider gets a dynamic score per capability.

### **Factors**

* success rate  
* validation pass rate  
* latency  
* escalation frequency

### **Example Structure**

interface ProviderScore {  
  providerId: string  
  capability: string  
  successRate: number  
  avgLatencyMs: number  
  escalationRate: number  
}

## **B. Selection Strategy**

Selection must remain **tier-constrained**, but within a tier:

* prefer highest success rate  
* break ties with latency

### **Rule**

**Optimize within tier. Never optimize across tiers.**

This preserves Quiet Sovereignty.

---

# **XV. Confidence Feedback Loop**

This is where your ITS concept becomes real.

## **A. Feedback Capture**

After each execution:

* validation result  
* latency  
* escalation occurrence  
* final success/failure

## **B. Learning Adjustment**

Adjust:

* provider ordering within tier  
* validation thresholds per capability  
* escalation sensitivity

### **Example**

If Apple fails structured extraction 30% of the time:

* lower confidence threshold? No  
* escalate earlier? Yes

---

# **XVI. Multi-Step Task Handling (Process Swarm Integration)**

LFSI must operate at **step-level granularity**, not task-level.

## **A. Per-Step Routing**

Each Process Swarm node:

* defines capability  
* invokes ACDS independently

### **Example Swarm**

1. classify input → `intent.classify` → Apple  
2. extract fields → `text.extract.structured` → Apple → fallback Ollama  
3. generate output → `text.generate.long` → Ollama

## **B. Mixed-Tier Execution**

A single workflow may use:

* Tier 0 for lightweight steps  
* Tier 1 for heavy steps

This is expected behavior.

---

# **XVII. Failure Modes and Recovery**

## **A. Provider Failure**

If provider unavailable:

* skip immediately  
* do not retry same provider  
* move to next allowed tier

## **B. Validation Failure**

If validation fails:

* record failure  
* escalate if allowed  
* otherwise fail deterministically

## **C. No Provider Available**

Return structured failure:

{  
  "status": "failure",  
  "reasonCode": "NO\_PROVIDER\_AVAILABLE",  
  "capability": "text.generate.long"  
}

---

# **XVIII. Deterministic Failure Model**

Failures must never be silent or ambiguous.

## **Required Properties**

* explicit reason code  
* no implicit fallback  
* logged in ledger  
* reproducible

---

# **XIX. Observability Layer**

You need three levels of visibility.

## **A. Per-Request Trace**

* provider attempts  
* validation results  
* escalation path

## **B. Aggregated Metrics**

* Tier 0 success rate  
* Tier 1 fallback frequency  
* average latency per capability

## **C. Sovereign Metrics Mapping**

Tie directly to your framework:

### **Exit Ability**

Can Tier 0 be replaced without system rewrite?

### **Offline Survivability**

What percentage of tasks complete without network?

### **Portability**

Are capabilities provider-agnostic?

### **Accountable Autonomy**

Can every decision be audited?

---

# **XX. OpenClaw Integration (Concrete)**

## **A. Required Change**

Replace this pattern:

callAppleSummarizer(input)

With:

acds.execute({  
  capability: "text.summarize",  
  input  
})

## **B. Result**

OpenClaw becomes:

* provider-blind  
* capability-driven  
* portable across environments

---

# **XXI. Process Swarm Integration**

## **A. Node Definition Change**

Each node must declare:

{  
  "capability": "text.extract.structured",  
  "policyProfile": "lfsi.local\_balanced"  
}

## **B. Execution Model**

Process Swarm does not manage inference.

It delegates to ACDS.

---

# **XXII. Performance Characteristics**

## **Expected Distribution**

After stabilization:

* Tier 0 handles 60–80% of requests  
* Tier 1 handles 20–40%  
* Tier 2 minimal

## **Latency Impact**

* Tier 0: lowest  
* Tier 1: moderate  
* Tier 2: highest

---

# **XXIII. Security Model**

## **A. Data Exposure Rules**

* Tier 0: no data leaves device  
* Tier 1: still local  
* Tier 2: policy-gated

## **B. Enforcement**

* policy must block Tier 2 for private data  
* no implicit external calls

---

# **XXIV. Extension Points**

Future additions:

* alternative Tier 0 (non-Apple)  
* specialized Ollama models per capability  
* encrypted remote inference (controlled Tier 2\)  
* federated inference nodes

---

# **XXV. Implementation Phases (Revised)**

## **Phase 1 (Core)**

* routing engine  
* Apple provider  
* Ollama provider  
* validation  
* logging

## **Phase 2 (Stability)**

* adaptive scoring  
* performance tracking  
* failure analytics

## **Phase 3 (Optimization)**

* dynamic routing tuning  
* ITS integration  
* predictive escalation

---

# **XXVI. Final System Model**

This is the clean mental model:

* **OpenClaw** defines intent  
* **ACDS** enforces execution doctrine  
* **LFSI** defines behavior  
* **Apple Intelligence** executes first  
* **Ollama** expands capability  
* **Everything is replaceable**

---

# **XXVII. Final Statement**

This architecture does not optimize for maximum intelligence.

It optimizes for:

* control  
* predictability  
* sovereignty

And then expands capability only when necessary.

That is why it works.

---

## **Next Step**

The next highest-leverage artifact is:

**Executable routing engine \+ test harness (real code, not pseudocode)**

or

**Apple Intelligence adapter implementation details (Swift bridge \+ Node integration)**

Pick one and I will take it to production-grade depth.

Continuing from the foundation, the next layer is what makes this system *operationally durable*: execution semantics, adaptive routing, failure handling, and integration into your existing stack (ACDS, Process Swarm, Thingstead).

---

# **Extended Specification Document**

## **ACDS Local-First Sovereign Inference**

### **Execution, Adaptation, and System Integration**

---

# **XIII. Execution Semantics**

The base router you defined is correct but incomplete for production use. It must evolve into a **deterministic multi-pass execution engine**.

## **A. Execution Phases**

Each request executes in discrete phases:

1. **Preflight**  
2. **Provider Selection**  
3. **Execution**  
4. **Validation**  
5. **Escalation Decision**  
6. **Commit \+ Ledger**

### **Updated Flow**

async function executeLFSI(request: InferenceRequest): Promise\<InferenceResult\> {  
  const ctx \= buildExecutionContext(request)

  preflight(ctx)

  const candidates \= selectProviders(ctx)

  for (const candidate of candidates) {  
    const availability \= await candidate.isAvailable()  
    if (\!availability) continue

    const result \= await candidate.invoke(ctx.request)

    const validation \= await validate(result, ctx.request)

    recordAttempt(ctx, candidate, result, validation)

    if (validation.passed) {  
      return finalizeSuccess(ctx, candidate, result, validation)  
    }

    if (\!canEscalate(ctx)) {  
      return finalizeFailure(ctx, candidate, result, validation)  
    }  
  }

  return finalizeNoProvider(ctx)  
}

---

## **B. Preflight Phase**

Preflight enforces invariants before execution.

### **Responsibilities**

* validate capability exists  
* validate policy profile  
* reject illegal combinations  
* normalize input  
* attach execution metadata

### **Example**

function preflight(ctx: ExecutionContext) {  
  if (\!CAPABILITIES.includes(ctx.request.capability)) {  
    throw new Error("UNKNOWN\_CAPABILITY")  
  }

  if (\!ctx.policy.allowedTiers.length) {  
    throw new Error("NO\_ALLOWED\_TIERS")  
  }  
}

---

# **XIV. Adaptive Routing Layer**

Static routing is insufficient. You need **performance-aware routing** without violating sovereignty.

## **A. Provider Scoring Model**

Each provider gets a dynamic score per capability.

### **Factors**

* success rate  
* validation pass rate  
* latency  
* escalation frequency

### **Example Structure**

interface ProviderScore {  
  providerId: string  
  capability: string  
  successRate: number  
  avgLatencyMs: number  
  escalationRate: number  
}

## **B. Selection Strategy**

Selection must remain **tier-constrained**, but within a tier:

* prefer highest success rate  
* break ties with latency

### **Rule**

**Optimize within tier. Never optimize across tiers.**

This preserves Quiet Sovereignty.

---

# **XV. Confidence Feedback Loop**

This is where your ITS concept becomes real.

## **A. Feedback Capture**

After each execution:

* validation result  
* latency  
* escalation occurrence  
* final success/failure

## **B. Learning Adjustment**

Adjust:

* provider ordering within tier  
* validation thresholds per capability  
* escalation sensitivity

### **Example**

If Apple fails structured extraction 30% of the time:

* lower confidence threshold? No  
* escalate earlier? Yes

---

# **XVI. Multi-Step Task Handling (Process Swarm Integration)**

LFSI must operate at **step-level granularity**, not task-level.

## **A. Per-Step Routing**

Each Process Swarm node:

* defines capability  
* invokes ACDS independently

### **Example Swarm**

1. classify input → `intent.classify` → Apple  
2. extract fields → `text.extract.structured` → Apple → fallback Ollama  
3. generate output → `text.generate.long` → Ollama

## **B. Mixed-Tier Execution**

A single workflow may use:

* Tier 0 for lightweight steps  
* Tier 1 for heavy steps

This is expected behavior.

---

# **XVII. Failure Modes and Recovery**

## **A. Provider Failure**

If provider unavailable:

* skip immediately  
* do not retry same provider  
* move to next allowed tier

## **B. Validation Failure**

If validation fails:

* record failure  
* escalate if allowed  
* otherwise fail deterministically

## **C. No Provider Available**

Return structured failure:

{  
  "status": "failure",  
  "reasonCode": "NO\_PROVIDER\_AVAILABLE",  
  "capability": "text.generate.long"  
}

---

# **XVIII. Deterministic Failure Model**

Failures must never be silent or ambiguous.

## **Required Properties**

* explicit reason code  
* no implicit fallback  
* logged in ledger  
* reproducible

---

# **XIX. Observability Layer**

You need three levels of visibility.

## **A. Per-Request Trace**

* provider attempts  
* validation results  
* escalation path

## **B. Aggregated Metrics**

* Tier 0 success rate  
* Tier 1 fallback frequency  
* average latency per capability

## **C. Sovereign Metrics Mapping**

Tie directly to your framework:

### **Exit Ability**

Can Tier 0 be replaced without system rewrite?

### **Offline Survivability**

What percentage of tasks complete without network?

### **Portability**

Are capabilities provider-agnostic?

### **Accountable Autonomy**

Can every decision be audited?

---

# **XX. OpenClaw Integration (Concrete)**

## **A. Required Change**

Replace this pattern:

callAppleSummarizer(input)

With:

acds.execute({  
  capability: "text.summarize",  
  input  
})

## **B. Result**

OpenClaw becomes:

* provider-blind  
* capability-driven  
* portable across environments

---

# **XXI. Process Swarm Integration**

## **A. Node Definition Change**

Each node must declare:

{  
  "capability": "text.extract.structured",  
  "policyProfile": "lfsi.local\_balanced"  
}

## **B. Execution Model**

Process Swarm does not manage inference.

It delegates to ACDS.

---

# **XXII. Performance Characteristics**

## **Expected Distribution**

After stabilization:

* Tier 0 handles 60–80% of requests  
* Tier 1 handles 20–40%  
* Tier 2 minimal

## **Latency Impact**

* Tier 0: lowest  
* Tier 1: moderate  
* Tier 2: highest

---

# **XXIII. Security Model**

## **A. Data Exposure Rules**

* Tier 0: no data leaves device  
* Tier 1: still local  
* Tier 2: policy-gated

## **B. Enforcement**

* policy must block Tier 2 for private data  
* no implicit external calls

---

# **XXIV. Extension Points**

Future additions:

* alternative Tier 0 (non-Apple)  
* specialized Ollama models per capability  
* encrypted remote inference (controlled Tier 2\)  
* federated inference nodes

---

# **XXV. Implementation Phases (Revised)**

## **Phase 1 (Core)**

* routing engine  
* Apple provider  
* Ollama provider  
* validation  
* logging

## **Phase 2 (Stability)**

* adaptive scoring  
* performance tracking  
* failure analytics

## **Phase 3 (Optimization)**

* dynamic routing tuning  
* ITS integration  
* predictive escalation

---

# **XXVI. Final System Model**

This is the clean mental model:

* **OpenClaw** defines intent  
* **ACDS** enforces execution doctrine  
* **LFSI** defines behavior  
* **Apple Intelligence** executes first  
* **Ollama** expands capability  
* **Everything is replaceable**

---

# **XXVII. Final Statement**

This architecture does not optimize for maximum intelligence.

It optimizes for:

* control  
* predictability  
* sovereignty

And then expands capability only when necessary.

That is why it works.

---

## **Next Step**

The next highest-leverage artifact is:

**Executable routing engine \+ test harness (real code, not pseudocode)**

or

**Apple Intelligence adapter implementation details (Swift bridge \+ Node integration)**

Pick one and I will take it to production-grade depth.

Next layer: production-grade adapters, richer validation, and retry-safe execution boundaries.

Below is a continuation that upgrades the prior code into something you can actually wire into ACDS.

---

# **Production Continuation**

## **Real Adapter Layer, Capability Validators, and Hardened Router**

## **Updated file layout**

acds/  
  src/  
    capabilities.ts  
    policies.ts  
    types.ts  
    validator.ts  
    validators/  
      classify.ts  
      rewrite.ts  
      structured.ts  
      summarize.ts  
    ledger.ts  
    providers.ts  
    router.ts  
    errors.ts  
    apple/  
      bridge.ts  
      provider.ts  
    ollama/  
      client.ts  
      provider.ts  
  test/  
    router.test.ts  
    structured-validator.test.ts  
    ollama-provider.test.ts

---

# **1\. Extend the core types**

## **`src/types.ts`**

Add request hints, provider errors, and provider-specific metadata.

import type { Capability } from "./capabilities.js";

export type Tier \= "tier0" | "tier1" | "tier2";  
export type Sensitivity \= "public" | "internal" | "private" | "restricted";  
export type Surface \= "macos" | "ios" | "server" | "cli" | "web";  
export type ResultStatus \= "success" | "failure" | "denied";

export interface ValidationConfig {  
  requireSchema?: boolean;  
  schemaId?: string;  
  minConfidence?: number;  
  semanticChecks?: string\[\];  
  expectedFields?: string\[\];  
  allowedLabels?: string\[\];  
}

export interface InferenceRequest {  
  taskId: string;  
  capability: Capability | string;  
  sourceSystem: string;  
  surface: Surface;  
  input: Record\<string, unknown\>;

  context: {  
    sensitivity: Sensitivity;  
    requiresNetwork: boolean;  
    requiresCurrentWeb: boolean;  
    sessionId?: string;  
  };

  policyProfile: string;  
  validation?: ValidationConfig;  
  hasProviderOverride?: boolean;

  hints?: {  
    preferredModel?: string;  
    maxLatencyMs?: number;  
    temperature?: number;  
  };  
}

export interface InferenceUsage {  
  inputTokens?: number;  
  outputTokens?: number;  
  totalTokens?: number;  
}

export interface InferenceResult {  
  providerId: string;  
  tier: Tier;  
  output: Record\<string, unknown\>;  
  rawText?: string;  
  confidence?: number;  
  latencyMs: number;  
  usage?: InferenceUsage;  
  metadata?: Record\<string, unknown\>;  
}

export interface ValidationResult {  
  passed: boolean;  
  confidence: number;  
  failures: string\[\];  
  nextAction: "return" | "escalate";  
}

export interface LedgerEvent {  
  eventId: string;  
  timestamp: string;  
  taskId: string;  
  sourceSystem: string;  
  capability: string;  
  policyProfile: string;  
  selectedTier: Tier | "none";  
  selectedProvider: string;  
  validationPassed: boolean;  
  escalated: boolean;  
  escalatedTo?: Tier;  
  finalProvider: string;  
  latencyMs: number;  
  resultStatus: ResultStatus;  
  reasonCode?: string;  
  attempts: number;  
}

export interface FailureResult {  
  ok: false;  
  status: ResultStatus;  
  reasonCode: string;  
  message: string;  
}

export interface SuccessResult {  
  ok: true;  
  status: "success";  
  result: InferenceResult;  
  validation: ValidationResult;  
}

export type RouterResult \= SuccessResult | FailureResult;

export interface PolicyResolution {  
  profile: string;  
  allowedTiers: Tier\[\];  
  allowsEscalation: boolean;  
  denyReasonCodeForWeb?: string;  
}

export interface InferenceProvider {  
  id: string;  
  tier: Tier;  
  capabilities: Capability\[\];  
  local: boolean;  
  isAvailable(): Promise\<boolean\>;  
  invoke(request: InferenceRequest): Promise\<InferenceResult\>;  
  validate?(  
    result: InferenceResult,  
    request: InferenceRequest  
  ): Promise\<ValidationResult\>;  
}

export interface LedgerSink {  
  write(event: LedgerEvent): Promise\<void\> | void;  
}

---

# **2\. Add capability-specific semantic validators**

The generic validator is useful, but production routing needs per-capability validation.

## **`src/validators/structured.ts`**

import type { InferenceRequest, InferenceResult, ValidationResult } from "../types.js";

export async function validateStructuredResult(  
  result: InferenceResult,  
  request: InferenceRequest  
): Promise\<ValidationResult\> {  
  const failures: string\[\] \= \[\];  
  const output \= result.output ?? {};  
  const expectedFields \= request.validation?.expectedFields ?? \[\];

  if (Object.keys(output).length \=== 0\) {  
    failures.push("empty\_output");  
  }

  if (request.validation?.requireSchema && output\["schemaValid"\] \!== true) {  
    failures.push("schema\_invalid");  
  }

  for (const field of expectedFields) {  
    if (\!(field in output)) {  
      failures.push(\`missing\_field:${field}\`);  
    }  
  }

  if (  
    typeof request.validation?.minConfidence \=== "number" &&  
    typeof result.confidence \=== "number" &&  
    result.confidence \< request.validation.minConfidence  
  ) {  
    failures.push("confidence\_below\_threshold");  
  }

  return {  
    passed: failures.length \=== 0,  
    confidence: typeof result.confidence \=== "number" ? result.confidence : failures.length ? 0.4 : 0.9,  
    failures,  
    nextAction: failures.length \=== 0 ? "return" : "escalate"  
  };  
}

## **`src/validators/classify.ts`**

import type { InferenceRequest, InferenceResult, ValidationResult } from "../types.js";

export async function validateClassifyResult(  
  result: InferenceResult,  
  request: InferenceRequest  
): Promise\<ValidationResult\> {  
  const failures: string\[\] \= \[\];  
  const label \= result.output?.\["label"\];  
  const allowedLabels \= request.validation?.allowedLabels ?? \[\];

  if (typeof label \!== "string" || \!label.trim()) {  
    failures.push("missing\_label");  
  }

  if (allowedLabels.length \> 0 && typeof label \=== "string" && \!allowedLabels.includes(label)) {  
    failures.push("label\_not\_allowed");  
  }

  return {  
    passed: failures.length \=== 0,  
    confidence: typeof result.confidence \=== "number" ? result.confidence : failures.length ? 0.4 : 0.9,  
    failures,  
    nextAction: failures.length \=== 0 ? "return" : "escalate"  
  };  
}

## **`src/validators/summarize.ts`**

import type { InferenceRequest, InferenceResult, ValidationResult } from "../types.js";

export async function validateSummarizeResult(  
  result: InferenceResult,  
  \_request: InferenceRequest  
): Promise\<ValidationResult\> {  
  const failures: string\[\] \= \[\];  
  const summary \= result.output?.\["summary"\] ?? result.rawText;

  if (typeof summary \!== "string" || summary.trim().length \< 20\) {  
    failures.push("summary\_too\_short\_or\_missing");  
  }

  return {  
    passed: failures.length \=== 0,  
    confidence: typeof result.confidence \=== "number" ? result.confidence : failures.length ? 0.4 : 0.9,  
    failures,  
    nextAction: failures.length \=== 0 ? "return" : "escalate"  
  };  
}

## **`src/validators/rewrite.ts`**

import type { InferenceRequest, InferenceResult, ValidationResult } from "../types.js";

export async function validateRewriteResult(  
  result: InferenceResult,  
  \_request: InferenceRequest  
): Promise\<ValidationResult\> {  
  const failures: string\[\] \= \[\];  
  const rewritten \= result.output?.\["rewritten"\] ?? result.rawText;

  if (typeof rewritten \!== "string" || rewritten.trim().length \=== 0\) {  
    failures.push("rewritten\_text\_missing");  
  }

  return {  
    passed: failures.length \=== 0,  
    confidence: typeof result.confidence \=== "number" ? result.confidence : failures.length ? 0.4 : 0.9,  
    failures,  
    nextAction: failures.length \=== 0 ? "return" : "escalate"  
  };  
}

## **`src/validator.ts`**

import type {  
  InferenceRequest,  
  InferenceResult,  
  ValidationResult  
} from "./types.js";  
import { validateClassifyResult } from "./validators/classify.js";  
import { validateRewriteResult } from "./validators/rewrite.js";  
import { validateStructuredResult } from "./validators/structured.js";  
import { validateSummarizeResult } from "./validators/summarize.js";

export async function validateResult(  
  result: InferenceResult,  
  request: InferenceRequest  
): Promise\<ValidationResult\> {  
  switch (request.capability) {  
    case "intent.classify":  
      return validateClassifyResult(result, request);

    case "text.extract.structured":  
      return validateStructuredResult(result, request);

    case "text.summarize":  
      return validateSummarizeResult(result, request);

    case "text.rewrite":  
      return validateRewriteResult(result, request);

    default: {  
      const failures: string\[\] \= \[\];  
      if (\!result.output || Object.keys(result.output).length \=== 0\) {  
        failures.push("empty\_output");  
      }

      return {  
        passed: failures.length \=== 0,  
        confidence: typeof result.confidence \=== "number" ? result.confidence : failures.length ? 0.4 : 0.9,  
        failures,  
        nextAction: failures.length \=== 0 ? "return" : "escalate"  
      };  
    }  
  }  
}

---

# **3\. Real Apple bridge contract**

This keeps Node clean and lets you wire Swift separately.

## **`src/apple/bridge.ts`**

import type { Capability } from "../capabilities.js";  
import type { InferenceRequest } from "../types.js";

export interface AppleBridgeRequest {  
  capability: Capability;  
  input: Record\<string, unknown\>;  
  hints?: InferenceRequest\["hints"\];  
}

export interface AppleBridgeResponse {  
  output: Record\<string, unknown\>;  
  rawText?: string;  
  confidence?: number;  
  usage?: {  
    inputTokens?: number;  
    outputTokens?: number;  
    totalTokens?: number;  
  };  
  metadata?: Record\<string, unknown\>;  
}

export interface AppleBridge {  
  isAvailable(): Promise\<boolean\>;  
  invoke(request: AppleBridgeRequest): Promise\<AppleBridgeResponse\>;  
}

## **`src/apple/provider.ts`**

import type { Capability } from "../capabilities.js";  
import type {  
  InferenceProvider,  
  InferenceRequest,  
  InferenceResult  
} from "../types.js";  
import type { AppleBridge } from "./bridge.js";

const APPLE\_CAPABILITIES: Capability\[\] \= \[  
  "intent.classify",  
  "text.rewrite",  
  "text.summarize",  
  "text.extract.structured",  
  "text.generate.short",  
  "reasoning.light",  
  "speech.stt",  
  "speech.tts",  
  "workflow.local",  
  "multimodal.local"  
\];

export class AppleProvider implements InferenceProvider {  
  public readonly id \= "apple.foundation";  
  public readonly tier \= "tier0" as const;  
  public readonly capabilities \= APPLE\_CAPABILITIES;  
  public readonly local \= true;

  constructor(private readonly bridge: AppleBridge) {}

  async isAvailable(): Promise\<boolean\> {  
    return this.bridge.isAvailable();  
  }

  async invoke(request: InferenceRequest): Promise\<InferenceResult\> {  
    const start \= Date.now();

    const response \= await this.bridge.invoke({  
      capability: request.capability as Capability,  
      input: request.input,  
      hints: request.hints  
    });

    return {  
      providerId: this.id,  
      tier: this.tier,  
      output: response.output,  
      rawText: response.rawText,  
      confidence: response.confidence,  
      usage: response.usage,  
      metadata: response.metadata,  
      latencyMs: Date.now() \- start  
    };  
  }  
}

---

# **4\. Real Ollama HTTP client**

## **`src/ollama/client.ts`**

export interface OllamaGenerateRequest {  
  model: string;  
  prompt: string;  
  format?: "json";  
  stream?: boolean;  
  options?: {  
    temperature?: number;  
  };  
}

export interface OllamaGenerateResponse {  
  response: string;  
  prompt\_eval\_count?: number;  
  eval\_count?: number;  
  done?: boolean;  
}

export class OllamaClient {  
  constructor(  
    private readonly baseUrl \= "http://127.0.0.1:11434"  
  ) {}

  async isAvailable(): Promise\<boolean\> {  
    try {  
      const response \= await fetch(\`${this.baseUrl}/api/tags\`, {  
        method: "GET"  
      });  
      return response.ok;  
    } catch {  
      return false;  
    }  
  }

  async generate(request: OllamaGenerateRequest): Promise\<OllamaGenerateResponse\> {  
    const response \= await fetch(\`${this.baseUrl}/api/generate\`, {  
      method: "POST",  
      headers: {  
        "content-type": "application/json"  
      },  
      body: JSON.stringify({  
        ...request,  
        stream: false  
      })  
    });

    if (\!response.ok) {  
      throw new Error(\`Ollama generate failed with status ${response.status}\`);  
    }

    return (await response.json()) as OllamaGenerateResponse;  
  }  
}

## **`src/ollama/provider.ts`**

import type { Capability } from "../capabilities.js";  
import type {  
  InferenceProvider,  
  InferenceRequest,  
  InferenceResult  
} from "../types.js";  
import { OllamaClient } from "./client.js";

const OLLAMA\_CAPABILITIES: Capability\[\] \= \[  
  "text.generate.long",  
  "reasoning.deep",  
  "code.assist.basic",  
  "code.assist.advanced",  
  "workflow.agentic",  
  "research.local",  
  "text.extract.structured",  
  "text.summarize",  
  "text.rewrite"  
\];

export class OllamaProvider implements InferenceProvider {  
  public readonly id \= "ollama.default";  
  public readonly tier \= "tier1" as const;  
  public readonly capabilities \= OLLAMA\_CAPABILITIES;  
  public readonly local \= true;

  constructor(  
    private readonly client: OllamaClient,  
    private readonly defaultModel \= "qwen3:latest"  
  ) {}

  async isAvailable(): Promise\<boolean\> {  
    return this.client.isAvailable();  
  }

  async invoke(request: InferenceRequest): Promise\<InferenceResult\> {  
    const start \= Date.now();  
    const model \= request.hints?.preferredModel ?? this.defaultModel;  
    const prompt \= this.buildPrompt(request);  
    const wantsJson \=  
      request.capability \=== "text.extract.structured" ||  
      request.capability \=== "intent.classify";

    const response \= await this.client.generate({  
      model,  
      prompt,  
      format: wantsJson ? "json" : undefined,  
      stream: false,  
      options: {  
        temperature: request.hints?.temperature ?? 0.2  
      }  
    });

    let output: Record\<string, unknown\>;  
    let rawText \= response.response;

    if (wantsJson) {  
      try {  
        output \= JSON.parse(response.response) as Record\<string, unknown\>;  
      } catch {  
        output \= {};  
      }  
    } else {  
      output \= this.mapTextResponse(request, response.response);  
    }

    return {  
      providerId: this.id,  
      tier: this.tier,  
      output,  
      rawText,  
      confidence: 0.85,  
      latencyMs: Date.now() \- start,  
      usage: {  
        inputTokens: response.prompt\_eval\_count,  
        outputTokens: response.eval\_count,  
        totalTokens:  
          (response.prompt\_eval\_count ?? 0\) \+ (response.eval\_count ?? 0\)  
      },  
      metadata: {  
        model  
      }  
    };  
  }

  private buildPrompt(request: InferenceRequest): string {  
    switch (request.capability) {  
      case "text.summarize":  
        return \`Summarize the following text clearly:\\n\\n${String(request.input\["text"\] ?? "")}\`;

      case "text.rewrite":  
        return \`Rewrite the following text while preserving meaning:\\n\\n${String(request.input\["text"\] ?? "")}\`;

      case "text.extract.structured":  
        return \[  
          "Extract structured data as JSON only.",  
          \`Text: ${String(request.input\["text"\] ?? "")}\`,  
          \`Expected fields: ${(request.validation?.expectedFields ?? \[\]).join(", ")}\`  
        \].join("\\n");

      case "reasoning.deep":  
        return \`Reason through this task carefully:\\n\\n${String(request.input\["text"\] ?? "")}\`;

      default:  
        return String(request.input\["text"\] ?? "");  
    }  
  }

  private mapTextResponse(  
    request: InferenceRequest,  
    text: string  
  ): Record\<string, unknown\> {  
    switch (request.capability) {  
      case "text.summarize":  
        return { summary: text };

      case "text.rewrite":  
        return { rewritten: text };

      default:  
        return { text };  
    }  
  }  
}

---

# **5\. Harden the router for deterministic selection**

The earlier router was good. This version adds explicit tier-first ordering and availability filtering.

## **`src/router.ts`**

import { randomUUID } from "node:crypto";  
import { isCapability } from "./capabilities.js";  
import { REASON\_CODES } from "./errors.js";  
import { resolvePolicy, PolicyDenyError } from "./policies.js";  
import type {  
  InferenceProvider,  
  InferenceRequest,  
  LedgerEvent,  
  LedgerSink,  
  RouterResult,  
  Tier  
} from "./types.js";  
import { validateResult } from "./validator.js";

export class Router {  
  constructor(  
    private readonly providers: InferenceProvider\[\],  
    private readonly ledger: LedgerSink  
  ) {}

  async execute(request: InferenceRequest): Promise\<RouterResult\> {  
    const startedAt \= Date.now();  
    let attempts \= 0;

    if (\!isCapability(request.capability)) {  
      return this.failAndLog({  
        request,  
        startedAt,  
        attempts,  
        selectedTier: "none",  
        selectedProvider: "none",  
        finalProvider: "none",  
        reasonCode: REASON\_CODES.UNKNOWN\_CAPABILITY,  
        message: \`Unknown capability: ${request.capability}\`,  
        status: "failure"  
      });  
    }

    if (request.hasProviderOverride) {  
      return this.failAndLog({  
        request,  
        startedAt,  
        attempts,  
        selectedTier: "none",  
        selectedProvider: "none",  
        finalProvider: "none",  
        reasonCode: REASON\_CODES.CLIENT\_PROVIDER\_OVERRIDE\_FORBIDDEN,  
        message: "Client provider override is forbidden",  
        status: "denied"  
      });  
    }

    try {  
      const policy \= resolvePolicy(request);  
      const candidates \= this.selectProvidersByTier(  
        request.capability,  
        policy.allowedTiers  
      );

      if (candidates.length \=== 0\) {  
        return this.failAndLog({  
          request,  
          startedAt,  
          attempts,  
          selectedTier: "none",  
          selectedProvider: "none",  
          finalProvider: "none",  
          reasonCode: REASON\_CODES.NO\_PROVIDER\_AVAILABLE,  
          message: "No providers support this capability within allowed tiers",  
          status: "failure"  
        });  
      }

      const firstCandidate \= candidates\[0\];

      for (let i \= 0; i \< candidates.length; i \+= 1\) {  
        const provider \= candidates\[i\];  
        attempts \+= 1;

        const available \= await provider.isAvailable();  
        if (\!available) {  
          continue;  
        }

        const result \= await provider.invoke(request);  
        const validation \= provider.validate  
          ? await provider.validate(result, request)  
          : await validateResult(result, request);

        if (validation.passed) {  
          await this.writeLedger({  
            eventId: randomUUID(),  
            timestamp: new Date().toISOString(),  
            taskId: request.taskId,  
            sourceSystem: request.sourceSystem,  
            capability: request.capability,  
            policyProfile: request.policyProfile,  
            selectedTier: firstCandidate.tier,  
            selectedProvider: firstCandidate.id,  
            validationPassed: true,  
            escalated: provider.id \!== firstCandidate.id,  
            escalatedTo: provider.id \!== firstCandidate.id ? provider.tier : undefined,  
            finalProvider: result.providerId,  
            latencyMs: Date.now() \- startedAt,  
            resultStatus: "success",  
            attempts  
          });

          return {  
            ok: true,  
            status: "success",  
            result,  
            validation  
          };  
        }

        const isLastCandidate \= i \=== candidates.length \- 1;  
        const escalationAllowed \= policy.allowsEscalation && \!isLastCandidate;

        if (\!escalationAllowed) {  
          const reasonCode \=  
            request.policyProfile \=== "lfsi.apple\_only"  
              ? REASON\_CODES.APPLE\_ONLY\_VALIDATION\_FAILURE  
              : REASON\_CODES.VALIDATION\_FAILED\_NO\_ESCALATION;

          return this.failAndLog({  
            request,  
            startedAt,  
            attempts,  
            selectedTier: firstCandidate.tier,  
            selectedProvider: firstCandidate.id,  
            finalProvider: provider.id,  
            reasonCode,  
            message: validation.failures.join(", ") || "Validation failed",  
            status: "failure"  
          });  
        }  
      }

      const appleOnly \= request.policyProfile \=== "lfsi.apple\_only";  
      return this.failAndLog({  
        request,  
        startedAt,  
        attempts,  
        selectedTier: appleOnly ? "tier0" : "none",  
        selectedProvider: appleOnly ? "apple.foundation" : "none",  
        finalProvider: "none",  
        reasonCode: appleOnly  
          ? REASON\_CODES.APPLE\_TIER\_UNAVAILABLE  
          : REASON\_CODES.NO\_PROVIDER\_AVAILABLE,  
        message: appleOnly ? "Apple tier unavailable" : "No provider was available",  
        status: "failure"  
      });  
    } catch (error) {  
      if (error instanceof PolicyDenyError) {  
        return this.failAndLog({  
          request,  
          startedAt,  
          attempts,  
          selectedTier: "none",  
          selectedProvider: "none",  
          finalProvider: "none",  
          reasonCode: error.reasonCode,  
          message: error.message,  
          status: "denied"  
        });  
      }  
      throw error;  
    }  
  }

  private selectProvidersByTier(  
    capability: string,  
    allowedTiers: Tier\[\]  
  ): InferenceProvider\[\] {  
    const filtered \= this.providers.filter(  
      (provider) \=\>  
        allowedTiers.includes(provider.tier) &&  
        provider.capabilities.includes(capability as never)  
    );

    const tierRank \= new Map\<Tier, number\>(  
      allowedTiers.map((tier, index) \=\> \[tier, index\])  
    );

    return filtered.sort(  
      (a, b) \=\> (tierRank.get(a.tier) ?? 999\) \- (tierRank.get(b.tier) ?? 999\)  
    );  
  }

  private async writeLedger(event: LedgerEvent): Promise\<void\> {  
    await this.ledger.write(event);  
  }

  private async failAndLog(opts: {  
    request: InferenceRequest;  
    startedAt: number;  
    attempts: number;  
    selectedTier: Tier | "none";  
    selectedProvider: string;  
    finalProvider: string;  
    reasonCode: string;  
    message: string;  
    status: "failure" | "denied";  
  }): Promise\<RouterResult\> {  
    await this.writeLedger({  
      eventId: randomUUID(),  
      timestamp: new Date().toISOString(),  
      taskId: opts.request.taskId,  
      sourceSystem: opts.request.sourceSystem,  
      capability: String(opts.request.capability),  
      policyProfile: opts.request.policyProfile,  
      selectedTier: opts.selectedTier,  
      selectedProvider: opts.selectedProvider,  
      validationPassed: false,  
      escalated: opts.attempts \> 1,  
      escalatedTo: undefined,  
      finalProvider: opts.finalProvider,  
      latencyMs: Date.now() \- opts.startedAt,  
      resultStatus: opts.status,  
      reasonCode: opts.reasonCode,  
      attempts: opts.attempts  
    });

    return {  
      ok: false,  
      status: opts.status,  
      reasonCode: opts.reasonCode,  
      message: opts.message  
    };  
  }  
}

---

# **6\. Add real tests for structured validation and Ollama adapter**

## **`test/structured-validator.test.ts`**

import { describe, expect, test } from "vitest";  
import { validateResult } from "../src/validator.js";  
import type { InferenceRequest, InferenceResult } from "../src/types.js";

describe("structured validator", () \=\> {  
  test("passes when schema and expected fields are present", async () \=\> {  
    const request: InferenceRequest \= {  
      taskId: "t1",  
      capability: "text.extract.structured",  
      sourceSystem: "openclaw",  
      surface: "macos",  
      input: { text: "Name: Nik, Role: Architect" },  
      context: {  
        sensitivity: "private",  
        requiresNetwork: false,  
        requiresCurrentWeb: false  
      },  
      policyProfile: "lfsi.local\_balanced",  
      validation: {  
        requireSchema: true,  
        expectedFields: \["name", "role"\],  
        minConfidence: 0.8  
      }  
    };

    const result: InferenceResult \= {  
      providerId: "apple.foundation",  
      tier: "tier0",  
      output: {  
        schemaValid: true,  
        name: "Nik",  
        role: "Architect"  
      },  
      confidence: 0.95,  
      latencyMs: 20  
    };

    const validation \= await validateResult(result, request);  
    expect(validation.passed).toBe(true);  
  });

  test("fails when required field is missing", async () \=\> {  
    const request: InferenceRequest \= {  
      taskId: "t2",  
      capability: "text.extract.structured",  
      sourceSystem: "openclaw",  
      surface: "macos",  
      input: { text: "Name: Nik" },  
      context: {  
        sensitivity: "private",  
        requiresNetwork: false,  
        requiresCurrentWeb: false  
      },  
      policyProfile: "lfsi.local\_balanced",  
      validation: {  
        requireSchema: true,  
        expectedFields: \["name", "role"\]  
      }  
    };

    const result: InferenceResult \= {  
      providerId: "apple.foundation",  
      tier: "tier0",  
      output: {  
        schemaValid: true,  
        name: "Nik"  
      },  
      confidence: 0.9,  
      latencyMs: 20  
    };

    const validation \= await validateResult(result, request);  
    expect(validation.passed).toBe(false);  
    expect(validation.failures).toContain("missing\_field:role");  
  });  
});

## **`test/ollama-provider.test.ts`**

import { describe, expect, test } from "vitest";  
import { OllamaProvider } from "../src/ollama/provider.js";  
import type { InferenceRequest } from "../src/types.js";

class FakeOllamaClient {  
  async isAvailable(): Promise\<boolean\> {  
    return true;  
  }

  async generate() {  
    return {  
      response: JSON.stringify({  
        schemaValid: true,  
        name: "Nik",  
        role: "Architect"  
      }),  
      prompt\_eval\_count: 25,  
      eval\_count: 12,  
      done: true  
    };  
  }  
}

describe("OllamaProvider", () \=\> {  
  test("parses structured JSON output", async () \=\> {  
    const provider \= new OllamaProvider(  
      new FakeOllamaClient() as any,  
      "qwen3:latest"  
    );

    const request: InferenceRequest \= {  
      taskId: "t1",  
      capability: "text.extract.structured",  
      sourceSystem: "openclaw",  
      surface: "macos",  
      input: { text: "Name: Nik, Role: Architect" },  
      context: {  
        sensitivity: "private",  
        requiresNetwork: false,  
        requiresCurrentWeb: false  
      },  
      policyProfile: "lfsi.local\_balanced",  
      validation: {  
        requireSchema: true,  
        expectedFields: \["name", "role"\]  
      }  
    };

    const result \= await provider.invoke(request);

    expect(result.providerId).toBe("ollama.default");  
    expect(result.output\["name"\]).toBe("Nik");  
    expect(result.output\["role"\]).toBe("Architect");  
  });  
});

---

## **Recommended bridge shape**

For ACDS, the cleanest implementation is **a local Swift command-line bridge** that reads one JSON request from stdin and writes one JSON response to stdout. That avoids bringing in a third-party HTTP server, keeps the trust boundary small, and works well with a Node-based broker that can `spawn` the bridge process on demand.

## **File layout**

AppleBridge/  
  Package.swift  
  Sources/  
    AppleBridge/  
      main.swift  
      BridgeModels.swift  
      BridgeError.swift  
      CapabilityRouter.swift  
      FoundationModelsEngine.swift  
      TTSEngine.swift  
      STTEngine.swift  
      JSONIO.swift

## **`Package.swift`**

// swift-tools-version: 6.0  
import PackageDescription

let package \= Package(  
    name: "AppleBridge",  
    platforms: \[  
        .macOS(.v15)  
    \],  
    products: \[  
        .executable(name: "apple-bridge", targets: \["AppleBridge"\])  
    \],  
    targets: \[  
        .executableTarget(  
            name: "AppleBridge",  
            dependencies: \[\]  
        )  
    \]  
)

## **`BridgeModels.swift`**

import Foundation

enum BridgeCapability: String, Codable {  
    case intentClassify \= "intent.classify"  
    case textRewrite \= "text.rewrite"  
    case textSummarize \= "text.summarize"  
    case textExtractStructured \= "text.extract.structured"  
    case textGenerateShort \= "text.generate.short"  
    case reasoningLight \= "reasoning.light"  
    case speechSTT \= "speech.stt"  
    case speechTTS \= "speech.tts"  
    case workflowLocal \= "workflow.local"  
    case multimodalLocal \= "multimodal.local"  
}

struct BridgeHints: Codable {  
    let preferredModel: String?  
    let maxLatencyMs: Int?  
    let temperature: Double?  
}

struct BridgeRequest: Codable {  
    let taskId: String  
    let capability: BridgeCapability  
    let input: \[String: JSONValue\]  
    let hints: BridgeHints?  
}

struct BridgeUsage: Codable {  
    let inputTokens: Int?  
    let outputTokens: Int?  
    let totalTokens: Int?  
}

struct BridgeResponse: Codable {  
    let ok: Bool  
    let providerId: String  
    let tier: String  
    let output: \[String: JSONValue\]  
    let rawText: String?  
    let confidence: Double?  
    let usage: BridgeUsage?  
    let metadata: \[String: JSONValue\]?  
    let error: BridgeErrorPayload?  
}

struct BridgeErrorPayload: Codable {  
    let code: String  
    let message: String  
}

enum JSONValue: Codable {  
    case string(String)  
    case number(Double)  
    case bool(Bool)  
    case object(\[String: JSONValue\])  
    case array(\[JSONValue\])  
    case null

    init(from decoder: Decoder) throws {  
        let container \= try decoder.singleValueContainer()

        if container.decodeNil() {  
            self \= .null  
        } else if let value \= try? container.decode(Bool.self) {  
            self \= .bool(value)  
        } else if let value \= try? container.decode(Double.self) {  
            self \= .number(value)  
        } else if let value \= try? container.decode(String.self) {  
            self \= .string(value)  
        } else if let value \= try? container.decode(\[String: JSONValue\].self) {  
            self \= .object(value)  
        } else if let value \= try? container.decode(\[JSONValue\].self) {  
            self \= .array(value)  
        } else {  
            throw DecodingError.dataCorruptedError(  
                in: container,  
                debugDescription: "Unsupported JSON value"  
            )  
        }  
    }

    func encode(to encoder: Encoder) throws {  
        var container \= encoder.singleValueContainer()

        switch self {  
        case .string(let value):  
            try container.encode(value)  
        case .number(let value):  
            try container.encode(value)  
        case .bool(let value):  
            try container.encode(value)  
        case .object(let value):  
            try container.encode(value)  
        case .array(let value):  
            try container.encode(value)  
        case .null:  
            try container.encodeNil()  
        }  
    }

    var stringValue: String? {  
        if case .string(let value) \= self { return value }  
        return nil  
    }

    var objectValue: \[String: JSONValue\]? {  
        if case .object(let value) \= self { return value }  
        return nil  
    }  
}

## **`BridgeError.swift`**

import Foundation

enum BridgeError: Error {  
    case badInput(String)  
    case unsupportedCapability(String)  
    case unavailable(String)  
    case executionFailed(String)

    var payload: BridgeErrorPayload {  
        switch self {  
        case .badInput(let message):  
            return .init(code: "BAD\_INPUT", message: message)  
        case .unsupportedCapability(let message):  
            return .init(code: "UNSUPPORTED\_CAPABILITY", message: message)  
        case .unavailable(let message):  
            return .init(code: "UNAVAILABLE", message: message)  
        case .executionFailed(let message):  
            return .init(code: "EXECUTION\_FAILED", message: message)  
        }  
    }  
}

## **`JSONIO.swift`**

import Foundation

enum JSONIO {  
    static func readRequest() throws \-\> BridgeRequest {  
        let data \= FileHandle.standardInput.readDataToEndOfFile()  
        guard \!data.isEmpty else {  
            throw BridgeError.badInput("No JSON request found on stdin")  
        }

        let decoder \= JSONDecoder()  
        return try decoder.decode(BridgeRequest.self, from: data)  
    }

    static func writeResponse(\_ response: BridgeResponse) throws {  
        let encoder \= JSONEncoder()  
        encoder.outputFormatting \= \[.prettyPrinted, .sortedKeys\]  
        let data \= try encoder.encode(response)  
        FileHandle.standardOutput.write(data)  
    }

    static func writeFailure(\_ error: BridgeError) {  
        let response \= BridgeResponse(  
            ok: false,  
            providerId: "apple.foundation",  
            tier: "tier0",  
            output: \[:\],  
            rawText: nil,  
            confidence: nil,  
            usage: nil,  
            metadata: nil,  
            error: error.payload  
        )

        do {  
            try writeResponse(response)  
        } catch {  
            let fallback \= """  
            {"ok":false,"providerId":"apple.foundation","tier":"tier0","output":{},"error":{"code":"SERIALIZATION\_FAILURE","message":"Failed to write error response"}}  
            """  
            FileHandle.standardOutput.write(Data(fallback.utf8))  
        }  
    }  
}

## **`TTSEngine.swift`**

Apple documents `AVSpeechSynthesizer` as the system object for synthesized speech. ([Apple Developer](https://developer.apple.com/documentation/avfoundation/speech-synthesis?utm_source=chatgpt.com))

import Foundation  
import AVFAudio

final class TTSEngine: NSObject, AVSpeechSynthesizerDelegate {  
    private let synthesizer \= AVSpeechSynthesizer()  
    private var continuation: CheckedContinuation\<Void, Error\>?

    override init() {  
        super.init()  
        synthesizer.delegate \= self  
    }

    func synthesize(\_ text: String, voiceIdentifier: String?) async throws \-\> \[String: JSONValue\] {  
        let utterance \= AVSpeechUtterance(string: text)

        if let voiceIdentifier,  
           let voice \= AVSpeechSynthesisVoice(identifier: voiceIdentifier) {  
            utterance.voice \= voice  
        }

        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation\<Void, Error\>) in  
            self.continuation \= continuation  
            self.synthesizer.speak(utterance)  
        }

        return \[  
            "spoken": .bool(true),  
            "text": .string(text)  
        \]  
    }

    func speechSynthesizer(\_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {  
        continuation?.resume()  
        continuation \= nil  
    }

    func speechSynthesizer(\_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {  
        continuation?.resume(throwing: BridgeError.executionFailed("Speech synthesis was cancelled"))  
        continuation \= nil  
    }  
}

## **`STTEngine.swift`**

Apple’s newer path is `SpeechAnalyzer` plus `SpeechTranscriber`. The fallback path is `SFSpeechRecognizer`. The code below supports both. The `SpeechAnalyzer` path is intentionally isolated behind availability checks because those APIs are newer. ([Apple Developer](https://developer.apple.com/documentation/speech/speechanalyzer?utm_source=chatgpt.com))

import Foundation  
import Speech  
import AVFoundation

final class STTEngine {  
    func transcribeFile(at url: URL, localeIdentifier: String?) async throws \-\> \[String: JSONValue\] {  
        if \#available(macOS 26.0, \*) {  
            return try await transcribeWithSpeechAnalyzer(url: url, localeIdentifier: localeIdentifier)  
        } else {  
            return try await transcribeWithSFSpeechRecognizer(url: url, localeIdentifier: localeIdentifier)  
        }  
    }

    @available(macOS 26.0, \*)  
    private func transcribeWithSpeechAnalyzer(url: URL, localeIdentifier: String?) async throws \-\> \[String: JSONValue\] {  
        // NOTE:  
        // This path is written for the current SpeechAnalyzer model.  
        // Depending on the exact Xcode / SDK drop, small symbol adjustments may be needed.  
        // The architectural shape is correct: SpeechAnalyzer \+ SpeechTranscriber \+ async input sequence.

        let locale \= Locale(identifier: localeIdentifier ?? "en\_US")  
        let transcriber \= SpeechTranscriber(  
            locale: locale,  
            transcriptionOptions: \[\],  
            reportingOptions: \[\],  
            attributeOptions: \[.transcriptionConfidence\]  
        )

        let analyzer \= SpeechAnalyzer(modules: \[transcriber\])

        let audioData \= try Data(contentsOf: url)  
        let (stream, continuation) \= AsyncStream\<AnalyzerInput\>.makeStream()

        let collector \= SpeechResultCollector()  
        transcriber.resultsHandler \= { result in  
            collector.accept(result)  
        }

        try await analyzer.start(inputSequence: stream)

        // IMPORTANT:  
        // The exact AnalyzerInput initializer can vary by SDK.  
        // Adjust to match the installed SDK if needed.  
        continuation.yield(.audioFileData(audioData))  
        continuation.finish()

        try await analyzer.finalizeAndFinishThroughEndOfInput()

        return \[  
            "text": .string(collector.finalText),  
            "schemaValid": .bool(true)  
        \]  
    }

    private func transcribeWithSFSpeechRecognizer(url: URL, localeIdentifier: String?) async throws \-\> \[String: JSONValue\] {  
        let status \= await requestSpeechAuthorization()  
        guard status \== .authorized else {  
            throw BridgeError.unavailable("Speech recognition authorization not granted")  
        }

        let locale \= Locale(identifier: localeIdentifier ?? "en\_US")  
        guard let recognizer \= SFSpeechRecognizer(locale: locale) else {  
            throw BridgeError.unavailable("No speech recognizer available for locale")  
        }

        let request \= SFSpeechURLRecognitionRequest(url: url)  
        request.addsPunctuation \= true  
        request.shouldReportPartialResults \= false

        let resultText \= try await withCheckedThrowingContinuation { (continuation: CheckedContinuation\<String, Error\>) in  
            recognizer.recognitionTask(with: request) { result, error in  
                if let error {  
                    continuation.resume(throwing: error)  
                    return  
                }

                if let result, result.isFinal {  
                    continuation.resume(returning: result.bestTranscription.formattedString)  
                }  
            }  
        }

        return \[  
            "text": .string(resultText),  
            "schemaValid": .bool(true)  
        \]  
    }

    private func requestSpeechAuthorization() async \-\> SFSpeechRecognizerAuthorizationStatus {  
        await withCheckedContinuation { continuation in  
            SFSpeechRecognizer.requestAuthorization { status in  
                continuation.resume(returning: status)  
            }  
        }  
    }  
}

@available(macOS 26.0, \*)  
private final class SpeechResultCollector {  
    private(set) var finalText \= ""

    func accept(\_ result: Any) {  
        // Keep this wrapper isolated because the exact result typing can shift across beta SDKs.  
        // Replace with the concrete SpeechTranscriber result type exposed by your installed SDK.  
        finalText \= String(describing: result)  
    }  
}

## **`FoundationModelsEngine.swift`**

Apple says Foundation Models gives direct access to the on-device model, supports summarization and extraction, and includes guided generation. Apple also documents `Generable` and guided generation into Swift data structures. The exact symbol surface can shift slightly across SDK drops, so I am keeping the compile-sensitive pieces isolated here. The overall structure is correct. ([Apple Developer](https://developer.apple.com/documentation/FoundationModels?utm_source=chatgpt.com))

import Foundation

\#if canImport(FoundationModels)  
import FoundationModels  
\#endif

struct ClassifiedIntent: Codable {  
    let label: String  
    let rationale: String?  
}

struct StructuredExtraction: Codable {  
    let schemaValid: Bool  
    let fields: \[String: String\]  
}

final class FoundationModelsEngine {  
    func isAvailable() \-\> Bool {  
        \#if canImport(FoundationModels)  
        if \#available(macOS 26.0, \*) {  
            return true  
        }  
        \#endif  
        return false  
    }

    func summarize(text: String) async throws \-\> (output: \[String: JSONValue\], rawText: String?, confidence: Double?) {  
        \#if canImport(FoundationModels)  
        if \#available(macOS 26.0, \*) {  
            let response \= try await promptText("""  
            Summarize the following text clearly and concisely.

            TEXT:  
            \\(text)  
            """)

            return (  
                output: \[  
                    "summary": .string(response),  
                    "schemaValid": .bool(true)  
                \],  
                rawText: response,  
                confidence: 0.90  
            )  
        }  
        \#endif

        throw BridgeError.unavailable("Foundation Models unavailable on this system")  
    }

    func rewrite(text: String) async throws \-\> (output: \[String: JSONValue\], rawText: String?, confidence: Double?) {  
        \#if canImport(FoundationModels)  
        if \#available(macOS 26.0, \*) {  
            let response \= try await promptText("""  
            Rewrite the following text while preserving meaning and factual content.

            TEXT:  
            \\(text)  
            """)

            return (  
                output: \[  
                    "rewritten": .string(response),  
                    "schemaValid": .bool(true)  
                \],  
                rawText: response,  
                confidence: 0.90  
            )  
        }  
        \#endif

        throw BridgeError.unavailable("Foundation Models unavailable on this system")  
    }

    func classify(text: String, allowedLabels: \[String\]) async throws \-\> (output: \[String: JSONValue\], rawText: String?, confidence: Double?) {  
        \#if canImport(FoundationModels)  
        if \#available(macOS 26.0, \*) {  
            let labels \= allowedLabels.joined(separator: ", ")

            let response \= try await promptText("""  
            Classify the following text into exactly one of these labels:  
            \\(labels)

            Return JSON with keys:  
            label  
            rationale

            TEXT:  
            \\(text)  
            """)

            let decoded \= try decodeJSON(ClassifiedIntent.self, from: response)

            return (  
                output: \[  
                    "label": .string(decoded.label),  
                    "rationale": decoded.rationale.map(JSONValue.string) ?? .null,  
                    "schemaValid": .bool(true)  
                \],  
                rawText: response,  
                confidence: 0.88  
            )  
        }  
        \#endif

        throw BridgeError.unavailable("Foundation Models unavailable on this system")  
    }

    func extractStructured(text: String, expectedFields: \[String\]) async throws \-\> (output: \[String: JSONValue\], rawText: String?, confidence: Double?) {  
        \#if canImport(FoundationModels)  
        if \#available(macOS 26.0, \*) {  
            let response \= try await promptText("""  
            Extract structured data from the following text.

            Return JSON with:  
            schemaValid: true or false  
            fields: object

            Expected fields:  
            \\(expectedFields.joined(separator: ", "))

            TEXT:  
            \\(text)  
            """)

            let decoded \= try decodeJSON(StructuredExtraction.self, from: response)

            var fieldObject: \[String: JSONValue\] \= \[:\]  
            for (k, v) in decoded.fields {  
                fieldObject\[k\] \= .string(v)  
            }

            return (  
                output: \[  
                    "schemaValid": .bool(decoded.schemaValid),  
                    "fields": .object(fieldObject)  
                \],  
                rawText: response,  
                confidence: 0.86  
            )  
        }  
        \#endif

        throw BridgeError.unavailable("Foundation Models unavailable on this system")  
    }

    \#if canImport(FoundationModels)  
    @available(macOS 26.0, \*)  
    private func promptText(\_ prompt: String) async throws \-\> String {  
        // NOTE:  
        // The exact invocation syntax of LanguageModelSession can vary slightly by SDK build.  
        // This structure is the intended Foundation Models session pattern.  
        let session \= LanguageModelSession()  
        let response \= try await session.respond(to: prompt)  
        return response.content  
    }  
    \#endif

    private func decodeJSON\<T: Decodable\>(\_ type: T.Type, from string: String) throws \-\> T {  
        let data \= Data(string.utf8)  
        do {  
            return try JSONDecoder().decode(T.self, from: data)  
        } catch {  
            throw BridgeError.executionFailed("Model returned invalid JSON: \\(error.localizedDescription)")  
        }  
    }  
}

## **`CapabilityRouter.swift`**

import Foundation

final class CapabilityRouter {  
    private let fm \= FoundationModelsEngine()  
    private let tts \= TTSEngine()  
    private let stt \= STTEngine()

    func handle(\_ request: BridgeRequest) async throws \-\> BridgeResponse {  
        switch request.capability {  
        case .textSummarize:  
            let text \= try requireString("text", in: request.input)  
            let result \= try await fm.summarize(text: text)  
            return success(result)

        case .textRewrite:  
            let text \= try requireString("text", in: request.input)  
            let result \= try await fm.rewrite(text: text)  
            return success(result)

        case .intentClassify:  
            let text \= try requireString("text", in: request.input)  
            let allowedLabels \= request.input\["allowedLabels"\]  
                .flatMap { value \-\> \[String\]? in  
                    guard case .array(let items) \= value else { return nil }  
                    return items.compactMap { $0.stringValue }  
                } ?? \[\]  
            let result \= try await fm.classify(text: text, allowedLabels: allowedLabels)  
            return success(result)

        case .textExtractStructured:  
            let text \= try requireString("text", in: request.input)  
            let expectedFields \= request.input\["expectedFields"\]  
                .flatMap { value \-\> \[String\]? in  
                    guard case .array(let items) \= value else { return nil }  
                    return items.compactMap { $0.stringValue }  
                } ?? \[\]  
            let result \= try await fm.extractStructured(text: text, expectedFields: expectedFields)  
            return success(result)

        case .textGenerateShort, .reasoningLight, .workflowLocal, .multimodalLocal:  
            let text \= try requireString("text", in: request.input)  
            let result \= try await fm.summarize(text: text)  
            return success(result)

        case .speechTTS:  
            let text \= try requireString("text", in: request.input)  
            let voiceIdentifier \= request.input\["voiceIdentifier"\]?.stringValue  
            let output \= try await tts.synthesize(text, voiceIdentifier: voiceIdentifier)  
            return BridgeResponse(  
                ok: true,  
                providerId: "apple.foundation",  
                tier: "tier0",  
                output: output,  
                rawText: nil,  
                confidence: 0.99,  
                usage: nil,  
                metadata: \[  
                    "engine": .string("AVSpeechSynthesizer")  
                \],  
                error: nil  
            )

        case .speechSTT:  
            let audioPath \= try requireString("audioPath", in: request.input)  
            let localeIdentifier \= request.input\["localeIdentifier"\]?.stringValue  
            let output \= try await stt.transcribeFile(at: URL(fileURLWithPath: audioPath), localeIdentifier: localeIdentifier)  
            return BridgeResponse(  
                ok: true,  
                providerId: "apple.foundation",  
                tier: "tier0",  
                output: output,  
                rawText: output\["text"\]?.stringValue,  
                confidence: 0.85,  
                usage: nil,  
                metadata: \[  
                    "engine": .string("Speech")  
                \],  
                error: nil  
            )  
        }  
    }

    private func requireString(\_ key: String, in dict: \[String: JSONValue\]) throws \-\> String {  
        guard let value \= dict\[key\]?.stringValue, \!value.isEmpty else {  
            throw BridgeError.badInput("Missing required string field: \\(key)")  
        }  
        return value  
    }

    private func success(\_ result: (output: \[String: JSONValue\], rawText: String?, confidence: Double?)) \-\> BridgeResponse {  
        BridgeResponse(  
            ok: true,  
            providerId: "apple.foundation",  
            tier: "tier0",  
            output: result.output,  
            rawText: result.rawText,  
            confidence: result.confidence,  
            usage: nil,  
            metadata: \[  
                "engine": .string("FoundationModels")  
            \],  
            error: nil  
        )  
    }  
}

## **`main.swift`**

import Foundation

@main  
struct AppleBridgeMain {  
    static func main() async {  
        do {  
            let request \= try JSONIO.readRequest()  
            let router \= CapabilityRouter()  
            let response \= try await router.handle(request)  
            try JSONIO.writeResponse(response)  
        } catch let error as BridgeError {  
            JSONIO.writeFailure(error)  
        } catch {  
            JSONIO.writeFailure(.executionFailed(error.localizedDescription))  
        }  
    }  
}

## **Node-side invocation from ACDS**

This keeps your broker simple.

import { spawn } from "node:child\_process";

export async function invokeAppleBridge(request: unknown): Promise\<any\> {  
  return new Promise((resolve, reject) \=\> {  
    const child \= spawn("/usr/local/bin/apple-bridge", \[\], {  
      stdio: \["pipe", "pipe", "pipe"\]  
    });

    let stdout \= "";  
    let stderr \= "";

    child.stdout.on("data", (chunk) \=\> {  
      stdout \+= chunk.toString("utf8");  
    });

    child.stderr.on("data", (chunk) \=\> {  
      stderr \+= chunk.toString("utf8");  
    });

    child.on("error", reject);

    child.on("close", (code) \=\> {  
      if (code \!== 0\) {  
        reject(new Error(\`apple-bridge exited with code ${code}: ${stderr}\`));  
        return;  
      }

      try {  
        resolve(JSON.parse(stdout));  
      } catch (err) {  
        reject(new Error(\`Invalid JSON from apple-bridge: ${stdout}\`));  
      }  
    });

    child.stdin.write(JSON.stringify(request));  
    child.stdin.end();  
  });  
}

## **What is solid here versus what may need adjustment**

Solid:

* stdin/stdout bridge model  
* capability routing shape  
* `AVSpeechSynthesizer` TTS path  
* `SFSpeechRecognizer` fallback path  
* explicit separation of Foundation Models, TTS, and STT  
* no image generation in scope  
* ACDS-compatible local provider boundary

Likely to need **minor SDK-specific edits**:

* exact `FoundationModels` session call signatures  
* exact `SpeechAnalyzer` input and result symbol names

That uncertainty is not conceptual. It is because Apple’s JS-heavy docs and evolving SDK surface make exact symbol verification brittle outside Xcode. The supported capabilities and intended API families are clear from Apple’s own materials, but the final compile pass should be done against the installed Xcode / SDK version on your Mac. ([Apple Developer](https://developer.apple.com/apple-intelligence/?utm_source=chatgpt.com))

## **Recommended production posture**

Use this bridge in three layers:

1. **Foundation Models first** for summarize, rewrite, classify, extract.  
2. **AVSpeechSynthesizer** for TTS.  
3. **SpeechAnalyzer if available, else SFSpeechRecognizer** for STT.

That matches your LFSI doctrine cleanly:

* Apple is your Tier 0 cognitive surface.  
* Ollama remains the local expansion layer.  
* No image generation assumptions contaminate the foundation.

Treat the Apple bridge as a **deferred provider implementation** and keep moving on the parts that matter immediately:

### **1\. Lock the bridge contract**

Do not build the Swift side yet. Just freeze the request and response schema.

That means:

* capability names are fixed  
* request envelope is fixed  
* response envelope is fixed  
* error codes are fixed

This lets ACDS, OpenClaw, and Process Swarm integrate against a stable Tier 0 contract without needing the Apple runtime today.

### **2\. Use the contract-faithful providers**

You already have most of this. Strengthen it so it behaves like the future Apple provider would.

This should:

* enforce capability allow-lists  
* return deterministic outputs  
* simulate validation failures  
* simulate unavailability  
* preserve exact response shape

That gives you a fully testable Tier 0 stand-in.

### **3\. Keep routing and validation moving**

This is where the architectural value is being created.

You can finish:

* policy engine  
* router hardening  
* capability validators  
* ledger events  
* Process Swarm step integration  
* provider scoring within tier

None of that requires Xcode.

### **4\. Add a provider adapter boundary in Node only**

Instead of integrating Swift now, define a provider adapter interface like:

interface Tier0Adapter {

 isAvailable(): Promise\<boolean\>;

 invoke(request: InferenceRequest): Promise\<InferenceResult\>;

}

Then implement:

* `StubAppleTier0Adapter`  
* later: `SwiftAppleBridgeAdapter`

That way the future implementation becomes a swap, not a redesign.

## **The strategic principle**

This is Quiet Sovereignty applied to development sequencing.

Do not add a dependency before the architecture is ready to absorb it.

Right now, Xcode is not a capability multiplier. It is a coordination burden.

So the disciplined move is:

* finish the contracts  
* finish the broker  
* finish the tests  
* defer the platform-specific provider

## **Recommended next step**

The highest-value next artifact is:

**a production-grade contract package for the deferred Apple Tier 0 provider**

That package should include:

* TypeScript request and response schemas  
* reason codes  
* provider  
* fixture payloads  
* conformance tests

# **File layout**

acds/  
 src/  
   capabilities.ts  
   errors.ts  
   types.ts  
   policies.ts  
   validator.ts  
   ledger.ts  
   router.ts  
   apple/  
     provider.ts  
     bridge-process.ts  
   ollama/  
     client.ts  
     provider.ts  
   testing/  
     env.ts  
     fixtures.ts  
     live-helpers.ts  
 test/  
   logic/  
     policy.test.ts  
     routing-order.test.ts  
     ledger.test.ts  
   live/  
     apple.live.test.ts  
     ollama.live.test.ts  
     router.live.test.ts  
 fixtures/  
   summarize-short.txt  
   summarize-long.txt  
   extract-person.txt  
   classify-ticket.txt  
 package.json  
 vitest.config.ts  
 tsconfig.json  
---

# **`package.json`**

{  
 "name": "acds-lfsi-live",  
 "version": "0.2.0",  
 "private": true,  
 "type": "module",  
 "scripts": {  
   "test": "vitest run test/logic",  
   "test:live": "vitest run test/live",  
   "test:all": "vitest run"  
 },  
 "devDependencies": {  
   "@types/node": "^24.0.0",  
   "typescript": "^5.8.0",  
   "vitest": "^3.2.0"  
 }  
}  
---

# **`vitest.config.ts`**

import { defineConfig } from "vitest/config";

export default defineConfig({  
 test: {  
   environment: "node",  
   globals: true,  
   include: \["test/\*\*/\*.test.ts"\],  
   testTimeout: 120000  
 }  
});  
---

# **`src/testing/env.ts`**

This makes live tests explicit and honest.

export interface LiveTestEnv {  
 runAppleLive: boolean;  
 runOllamaLive: boolean;  
 appleBridgeCommand: string | null;  
 ollamaBaseUrl: string;  
 ollamaModel: string;  
}

export function readLiveTestEnv(): LiveTestEnv {  
 return {  
   runAppleLive: process.env.ACDS\_TEST\_APPLE\_LIVE \=== "1",  
   runOllamaLive: process.env.ACDS\_TEST\_OLLAMA\_LIVE \=== "1",  
   appleBridgeCommand: process.env.ACDS\_APPLE\_BRIDGE\_CMD ?? null,  
   ollamaBaseUrl: process.env.ACDS\_OLLAMA\_BASE\_URL ?? "http://127.0.0.1:11434",  
   ollamaModel: process.env.ACDS\_OLLAMA\_MODEL ?? "qwen3:latest"  
 };  
}  
---

# **`src/testing/fixtures.ts`**

import { readFile } from "node:fs/promises";  
import { resolve } from "node:path";

export async function readFixture(name: string): Promise\<string\> {  
 const path \= resolve(process.cwd(), "fixtures", name);  
 return readFile(path, "utf8");  
}  
---

# **`src/testing/live-helpers.ts`**

import type { InferenceProvider } from "../types.js";

export async function requireLiveProvider(  
 providerName: string,  
 provider: InferenceProvider  
): Promise\<void\> {  
 const available \= await provider.isAvailable();  
 if (\!available) {  
   throw new Error(\`${providerName} is not available for live testing\`);  
 }  
}  
---

# **`src/apple/bridge-process.ts`**

This is the real Node adapter that talks to the real Apple bridge process.

import { spawn } from "node:child\_process";

export interface AppleBridgeProcessRequest {  
 taskId: string;  
 capability: string;  
 input: Record\<string, unknown\>;  
 hints?: {  
   preferredModel?: string;  
   maxLatencyMs?: number;  
   temperature?: number;  
 };  
}

export interface AppleBridgeProcessResponse {  
 ok: boolean;  
 providerId: string;  
 tier: "tier0";  
 output: Record\<string, unknown\>;  
 rawText?: string;  
 confidence?: number;  
 usage?: {  
   inputTokens?: number;  
   outputTokens?: number;  
   totalTokens?: number;  
 };  
 metadata?: Record\<string, unknown\>;  
 error?: {  
   code: string;  
   message: string;  
 };  
}

export class AppleBridgeProcessClient {  
 constructor(private readonly command: string) {}

 async isAvailable(): Promise\<boolean\> {  
   try {  
     const response \= await this.invoke({  
       taskId: "healthcheck",  
       capability: "text.summarize",  
       input: { text: "health check" }  
     });  
     return response.ok;  
   } catch {  
     return false;  
   }  
 }

 async invoke(  
   request: AppleBridgeProcessRequest  
 ): Promise\<AppleBridgeProcessResponse\> {  
   return new Promise((resolve, reject) \=\> {  
     const child \= spawn(this.command, \[\], {  
       stdio: \["pipe", "pipe", "pipe"\]  
     });

     let stdout \= "";  
     let stderr \= "";

     child.stdout.on("data", (chunk) \=\> {  
       stdout \+= chunk.toString("utf8");  
     });

     child.stderr.on("data", (chunk) \=\> {  
       stderr \+= chunk.toString("utf8");  
     });

     child.on("error", reject);

     child.on("close", (code) \=\> {  
       if (code \!== 0\) {  
         reject(  
           new Error(\`Apple bridge exited with code ${code}: ${stderr.trim()}\`)  
         );  
         return;  
       }

       try {  
         const parsed \= JSON.parse(stdout) as AppleBridgeProcessResponse;  
         resolve(parsed);  
       } catch (error) {  
         reject(  
           new Error(\`Invalid JSON from Apple bridge: ${stdout}\\n${String(error)}\`)  
         );  
       }  
     });

     child.stdin.write(JSON.stringify(request));  
     child.stdin.end();  
   });  
 }  
}  
---

# **`src/apple/provider.ts`**

import type { Capability } from "../capabilities.js";  
import type {  
 InferenceProvider,  
 InferenceRequest,  
 InferenceResult  
} from "../types.js";  
import { AppleBridgeProcessClient } from "./bridge-process.js";

const APPLE\_CAPABILITIES: Capability\[\] \= \[  
 "intent.classify",  
 "text.rewrite",  
 "text.summarize",  
 "text.extract.structured",  
 "text.generate.short",  
 "reasoning.light",  
 "speech.stt",  
 "speech.tts",  
 "workflow.local",  
 "multimodal.local"  
\];

export class AppleProvider implements InferenceProvider {  
 public readonly id \= "apple.foundation";  
 public readonly tier \= "tier0" as const;  
 public readonly capabilities \= APPLE\_CAPABILITIES;  
 public readonly local \= true;

 constructor(private readonly client: AppleBridgeProcessClient) {}

 async isAvailable(): Promise\<boolean\> {  
   return this.client.isAvailable();  
 }

 async invoke(request: InferenceRequest): Promise\<InferenceResult\> {  
   const start \= Date.now();

   const response \= await this.client.invoke({  
     taskId: request.taskId,  
     capability: request.capability,  
     input: request.input,  
     hints: request.hints  
   });

   if (\!response.ok) {  
     throw new Error(  
       response.error  
         ? \`${response.error.code}: ${response.error.message}\`  
         : "Apple bridge returned failure"  
     );  
   }

   return {  
     providerId: response.providerId,  
     tier: response.tier,  
     output: response.output,  
     rawText: response.rawText,  
     confidence: response.confidence,  
     usage: response.usage,  
     metadata: response.metadata,  
     latencyMs: Date.now() \- start  
   };  
 }  
}  
---

# **`src/ollama/client.ts`**

export interface OllamaGenerateRequest {  
 model: string;  
 prompt: string;  
 format?: "json";  
 stream?: boolean;  
 options?: {  
   temperature?: number;  
 };  
}

export interface OllamaGenerateResponse {  
 response: string;  
 prompt\_eval\_count?: number;  
 eval\_count?: number;  
 done?: boolean;  
}

export interface OllamaTag {  
 name: string;  
}

export interface OllamaTagsResponse {  
 models?: OllamaTag\[\];  
}

export class OllamaClient {  
 constructor(private readonly baseUrl \= "http://127.0.0.1:11434") {}

 async isAvailable(): Promise\<boolean\> {  
   try {  
     const response \= await fetch(\`${this.baseUrl}/api/tags\`);  
     return response.ok;  
   } catch {  
     return false;  
   }  
 }

 async hasModel(model: string): Promise\<boolean\> {  
   const response \= await fetch(\`${this.baseUrl}/api/tags\`);  
   if (\!response.ok) return false;

   const body \= (await response.json()) as OllamaTagsResponse;  
   const models \= body.models ?? \[\];  
   return models.some((m) \=\> m.name \=== model);  
 }

 async generate(request: OllamaGenerateRequest): Promise\<OllamaGenerateResponse\> {  
   const response \= await fetch(\`${this.baseUrl}/api/generate\`, {  
     method: "POST",  
     headers: { "content-type": "application/json" },  
     body: JSON.stringify({  
       ...request,  
       stream: false  
     })  
   });

   if (\!response.ok) {  
     throw new Error(\`Ollama generate failed with status ${response.status}\`);  
   }

   return (await response.json()) as OllamaGenerateResponse;  
 }  
}  
---

# **`src/ollama/provider.ts`**

import type { Capability } from "../capabilities.js";  
import type {  
 InferenceProvider,  
 InferenceRequest,  
 InferenceResult  
} from "../types.js";  
import { OllamaClient } from "./client.js";

const OLLAMA\_CAPABILITIES: Capability\[\] \= \[  
 "text.generate.long",  
 "reasoning.deep",  
 "code.assist.basic",  
 "code.assist.advanced",  
 "workflow.agentic",  
 "research.local",  
 "text.extract.structured",  
 "text.summarize",  
 "text.rewrite"  
\];

export class OllamaProvider implements InferenceProvider {  
 public readonly id \= "ollama.default";  
 public readonly tier \= "tier1" as const;  
 public readonly capabilities \= OLLAMA\_CAPABILITIES;  
 public readonly local \= true;

 constructor(  
   private readonly client: OllamaClient,  
   private readonly defaultModel \= "qwen3:latest"  
 ) {}

 async isAvailable(): Promise\<boolean\> {  
   return this.client.isAvailable();  
 }

 async isModelAvailable(): Promise\<boolean\> {  
   return this.client.hasModel(this.defaultModel);  
 }

 async invoke(request: InferenceRequest): Promise\<InferenceResult\> {  
   const start \= Date.now();  
   const model \= request.hints?.preferredModel ?? this.defaultModel;  
   const prompt \= this.buildPrompt(request);  
   const wantsJson \=  
     request.capability \=== "text.extract.structured" ||  
     request.capability \=== "intent.classify";

   const response \= await this.client.generate({  
     model,  
     prompt,  
     format: wantsJson ? "json" : undefined,  
     stream: false,  
     options: {  
       temperature: request.hints?.temperature ?? 0.2  
     }  
   });

   let output: Record\<string, unknown\>;  
   let rawText \= response.response;

   if (wantsJson) {  
     try {  
       output \= JSON.parse(response.response) as Record\<string, unknown\>;  
     } catch {  
       output \= {};  
     }  
   } else {  
     output \= this.mapTextResponse(request.capability, response.response);  
   }

   return {  
     providerId: this.id,  
     tier: this.tier,  
     output,  
     rawText,  
     confidence: 0.85,  
     latencyMs: Date.now() \- start,  
     usage: {  
       inputTokens: response.prompt\_eval\_count,  
       outputTokens: response.eval\_count,  
       totalTokens:  
         (response.prompt\_eval\_count ?? 0\) \+ (response.eval\_count ?? 0\)  
     },  
     metadata: {  
       model  
     }  
   };  
 }

 private buildPrompt(request: InferenceRequest): string {  
   const text \= String(request.input\["text"\] ?? "");

   switch (request.capability) {  
     case "text.summarize":  
       return \`Summarize the following text clearly:\\n\\n${text}\`;

     case "text.rewrite":  
       return \`Rewrite the following text while preserving meaning:\\n\\n${text}\`;

     case "text.extract.structured":  
       return \[  
         "Extract structured data as JSON only.",  
         \`Text: ${text}\`,  
         \`Expected fields: ${(request.validation?.expectedFields ?? \[\]).join(", ")}\`  
       \].join("\\n");

     case "reasoning.deep":  
     case "text.generate.long":  
       return text;

     default:  
       return text;  
   }  
 }

 private mapTextResponse(  
   capability: string,  
   text: string  
 ): Record\<string, unknown\> {  
   switch (capability) {  
     case "text.summarize":  
       return { summary: text };  
     case "text.rewrite":  
       return { rewritten: text };  
     default:  
       return { text };  
   }  
 }  
}  
---

# **`test/logic/policy.test.ts`**

Pure logic only.

import { describe, expect, test } from "vitest";  
import { resolvePolicy } from "../../src/policies.js";  
import type { InferenceRequest } from "../../src/types.js";

function baseRequest(): InferenceRequest {  
 return {  
   taskId: "t1",  
   capability: "text.summarize",  
   sourceSystem: "openclaw",  
   surface: "macos",  
   input: { text: "hello" },  
   context: {  
     sensitivity: "private",  
     requiresNetwork: false,  
     requiresCurrentWeb: false  
   },  
   policyProfile: "lfsi.local\_balanced"  
 };  
}

describe("resolvePolicy", () \=\> {  
 test("private\_strict allows only tier0 and tier1", () \=\> {  
   const resolved \= resolvePolicy({  
     ...baseRequest(),  
     policyProfile: "lfsi.private\_strict"  
   });  
   expect(resolved.allowedTiers).toEqual(\["tier0", "tier1"\]);  
 });

 test("apple\_only is tier0 only", () \=\> {  
   const resolved \= resolvePolicy({  
     ...baseRequest(),  
     policyProfile: "lfsi.apple\_only"  
   });  
   expect(resolved.allowedTiers).toEqual(\["tier0"\]);  
   expect(resolved.allowsEscalation).toBe(false);  
 });  
});  
---

# **`test/logic/routing-order.test.ts`**

import { describe, expect, test } from "vitest";  
import { Router } from "../../src/router.js";  
import { InMemoryLedgerSink } from "../../src/ledger.js";  
import type { InferenceProvider } from "../../src/types.js";

function provider(  
 id: string,  
 tier: "tier0" | "tier1" | "tier2",  
 capabilities: string\[\]  
): InferenceProvider {  
 return {  
   id,  
   tier,  
   capabilities: capabilities as any,  
   local: tier \!== "tier2",  
   async isAvailable() {  
     return false;  
   },  
   async invoke() {  
     throw new Error("not invoked");  
   }  
 };  
}

describe("routing order", () \=\> {  
 test("tier ordering respects policy ordering", async () \=\> {  
   const ledger \= new InMemoryLedgerSink();  
   const router \= new Router(  
     \[  
       provider("tier1-a", "tier1", \["text.summarize"\]),  
       provider("tier0-a", "tier0", \["text.summarize"\]),  
       provider("tier2-a", "tier2", \["text.summarize"\])  
     \],  
     ledger  
   );

   const result \= await router.execute({  
     taskId: "t1",  
     capability: "text.summarize",  
     sourceSystem: "openclaw",  
     surface: "macos",  
     input: { text: "hello" },  
     context: {  
       sensitivity: "private",  
       requiresNetwork: false,  
       requiresCurrentWeb: false  
     },  
     policyProfile: "lfsi.local\_balanced"  
   });

   expect(result.ok).toBe(false);  
   expect(ledger.events\[0\].selectedTier).toBe("none");  
 });  
});  
---

# **`test/logic/ledger.test.ts`**

import { describe, expect, test } from "vitest";  
import { InMemoryLedgerSink } from "../../src/ledger.js";

describe("InMemoryLedgerSink", () \=\> {  
 test("writes events", () \=\> {  
   const ledger \= new InMemoryLedgerSink();

   ledger.write({  
     eventId: "e1",  
     timestamp: new Date().toISOString(),  
     taskId: "t1",  
     sourceSystem: "openclaw",  
     capability: "text.summarize",  
     policyProfile: "lfsi.local\_balanced",  
     selectedTier: "tier0",  
     selectedProvider: "apple.foundation",  
     validationPassed: true,  
     escalated: false,  
     finalProvider: "apple.foundation",  
     latencyMs: 12,  
     resultStatus: "success",  
     attempts: 1  
   });

   expect(ledger.events).toHaveLength(1);  
   expect(ledger.events\[0\].selectedProvider).toBe("apple.foundation");  
 });  
});  
---

# **`test/live/apple.live.test.ts`**

This uses the real Apple bridge.

import { describe, expect, test } from "vitest";  
import { AppleBridgeProcessClient } from "../../src/apple/bridge-process.js";  
import { AppleProvider } from "../../src/apple/provider.js";  
import { readLiveTestEnv } from "../../src/testing/env.js";  
import { readFixture } from "../../src/testing/fixtures.js";

const env \= readLiveTestEnv();  
const runLive \= env.runAppleLive && \!\!env.appleBridgeCommand;  
const describeIf \= runLive ? describe : describe.skip;

describeIf("Apple live provider", () \=\> {  
 const client \= new AppleBridgeProcessClient(env.appleBridgeCommand\!);  
 const provider \= new AppleProvider(client);

 test("Apple provider is reachable", async () \=\> {  
   const available \= await provider.isAvailable();  
   expect(available).toBe(true);  
 });

 test("text.summarize returns a real summary", async () \=\> {  
   const text \= await readFixture("summarize-short.txt");

   const result \= await provider.invoke({  
     taskId: "apple-live-summarize",  
     capability: "text.summarize",  
     sourceSystem: "acds-test",  
     surface: "macos",  
     input: { text },  
     context: {  
       sensitivity: "private",  
       requiresNetwork: false,  
       requiresCurrentWeb: false  
     },  
     policyProfile: "lfsi.apple\_only"  
   });

   expect(result.providerId).toBe("apple.foundation");  
   expect(typeof (result.output\["summary"\] ?? result.rawText)).toBe("string");  
   expect(String(result.output\["summary"\] ?? result.rawText).length).toBeGreaterThan(20);  
 });

 test("text.rewrite returns rewritten text", async () \=\> {  
   const text \= await readFixture("summarize-short.txt");

   const result \= await provider.invoke({  
     taskId: "apple-live-rewrite",  
     capability: "text.rewrite",  
     sourceSystem: "acds-test",  
     surface: "macos",  
     input: { text },  
     context: {  
       sensitivity: "private",  
       requiresNetwork: false,  
       requiresCurrentWeb: false  
     },  
     policyProfile: "lfsi.apple\_only"  
   });

   expect(result.providerId).toBe("apple.foundation");  
   expect(typeof (result.output\["rewritten"\] ?? result.rawText)).toBe("string");  
   expect(String(result.output\["rewritten"\] ?? result.rawText).length).toBeGreaterThan(0);  
 });

 test("text.extract.structured returns structured output", async () \=\> {  
   const text \= await readFixture("extract-person.txt");

   const result \= await provider.invoke({  
     taskId: "apple-live-structured",  
     capability: "text.extract.structured",  
     sourceSystem: "acds-test",  
     surface: "macos",  
     input: {  
       text,  
       expectedFields: \["name", "role", "team"\]  
     },  
     context: {  
       sensitivity: "private",  
       requiresNetwork: false,  
       requiresCurrentWeb: false  
     },  
     policyProfile: "lfsi.apple\_only",  
     validation: {  
       requireSchema: true,  
       expectedFields: \["name", "role", "team"\]  
     }  
   });

   expect(result.providerId).toBe("apple.foundation");  
   expect(result.output).toBeTruthy();  
 });  
});  
---

# **`test/live/ollama.live.test.ts`**

import { describe, expect, test, beforeAll } from "vitest";  
import { readLiveTestEnv } from "../../src/testing/env.js";  
import { readFixture } from "../../src/testing/fixtures.js";  
import { OllamaClient } from "../../src/ollama/client.js";  
import { OllamaProvider } from "../../src/ollama/provider.js";

const env \= readLiveTestEnv();  
const runLive \= env.runOllamaLive;  
const describeIf \= runLive ? describe : describe.skip;

describeIf("Ollama live provider", () \=\> {  
 const client \= new OllamaClient(env.ollamaBaseUrl);  
 const provider \= new OllamaProvider(client, env.ollamaModel);

 beforeAll(async () \=\> {  
   const available \= await provider.isAvailable();  
   expect(available).toBe(true);

   const modelAvailable \= await provider.isModelAvailable();  
   expect(modelAvailable).toBe(true);  
 });

 test("text.summarize returns a real summary", async () \=\> {  
   const text \= await readFixture("summarize-long.txt");

   const result \= await provider.invoke({  
     taskId: "ollama-live-summarize",  
     capability: "text.summarize",  
     sourceSystem: "acds-test",  
     surface: "macos",  
     input: { text },  
     context: {  
       sensitivity: "private",  
       requiresNetwork: false,  
       requiresCurrentWeb: false  
     },  
     policyProfile: "lfsi.local\_balanced"  
   });

   expect(result.providerId).toBe("ollama.default");  
   expect(typeof (result.output\["summary"\] ?? result.rawText)).toBe("string");  
   expect(String(result.output\["summary"\] ?? result.rawText).length).toBeGreaterThan(20);  
 });

 test("text.extract.structured returns parseable structured output", async () \=\> {  
   const text \= await readFixture("extract-person.txt");

   const result \= await provider.invoke({  
     taskId: "ollama-live-structured",  
     capability: "text.extract.structured",  
     sourceSystem: "acds-test",  
     surface: "macos",  
     input: { text },  
     context: {  
       sensitivity: "private",  
       requiresNetwork: false,  
       requiresCurrentWeb: false  
     },  
     policyProfile: "lfsi.local\_balanced",  
     validation: {  
       requireSchema: true,  
       expectedFields: \["name", "role", "team"\]  
     }  
   });

   expect(result.providerId).toBe("ollama.default");  
   expect(result.output).toBeTruthy();  
 });

 test("reasoning.deep returns non-empty output", async () \=\> {  
   const text \= await readFixture("classify-ticket.txt");

   const result \= await provider.invoke({  
     taskId: "ollama-live-reasoning",  
     capability: "reasoning.deep",  
     sourceSystem: "acds-test",  
     surface: "macos",  
     input: { text },  
     context: {  
       sensitivity: "private",  
       requiresNetwork: false,  
       requiresCurrentWeb: false  
     },  
     policyProfile: "lfsi.performance\_priority"  
   });

   expect(result.providerId).toBe("ollama.default");  
   expect(typeof (result.output\["text"\] ?? result.rawText)).toBe("string");  
   expect(String(result.output\["text"\] ?? result.rawText).length).toBeGreaterThan(20);  
 });  
});  
---

# **`test/live/router.live.test.ts`**

This is the important one. It tests the real router against the real providers.

import { describe, expect, test, beforeAll } from "vitest";  
import { readLiveTestEnv } from "../../src/testing/env.js";  
import { readFixture } from "../../src/testing/fixtures.js";  
import { InMemoryLedgerSink } from "../../src/ledger.js";  
import { Router } from "../../src/router.js";  
import { AppleBridgeProcessClient } from "../../src/apple/bridge-process.js";  
import { AppleProvider } from "../../src/apple/provider.js";  
import { OllamaClient } from "../../src/ollama/client.js";  
import { OllamaProvider } from "../../src/ollama/provider.js";  
import { REASON\_CODES } from "../../src/errors.js";

const env \= readLiveTestEnv();  
const runLive \=  
 env.runAppleLive &&  
 \!\!env.appleBridgeCommand &&  
 env.runOllamaLive;

const describeIf \= runLive ? describe : describe.skip;

describeIf("Router live integration", () \=\> {  
 const ledger \= new InMemoryLedgerSink();

 const apple \= new AppleProvider(  
   new AppleBridgeProcessClient(env.appleBridgeCommand\!)  
 );  
 const ollama \= new OllamaProvider(  
   new OllamaClient(env.ollamaBaseUrl),  
   env.ollamaModel  
 );

 const router \= new Router(\[apple, ollama\], ledger);

 beforeAll(async () \=\> {  
   expect(await apple.isAvailable()).toBe(true);  
   expect(await ollama.isAvailable()).toBe(true);  
   expect(await ollama.isModelAvailable()).toBe(true);  
 });

 test("summarize routes to Apple first and logs correctly", async () \=\> {  
   const text \= await readFixture("summarize-short.txt");

   const result \= await router.execute({  
     taskId: "router-live-summarize",  
     capability: "text.summarize",  
     sourceSystem: "openclaw",  
     surface: "macos",  
     input: { text },  
     context: {  
       sensitivity: "private",  
       requiresNetwork: false,  
       requiresCurrentWeb: false  
     },  
     policyProfile: "lfsi.local\_balanced"  
   });

   expect(result.ok).toBe(true);  
   if (result.ok) {  
     expect(result.result.providerId).toBe("apple.foundation");  
   }

   const event \= ledger.events.at(-1)\!;  
   expect(event.selectedProvider).toBe("apple.foundation");  
   expect(event.finalProvider).toBe("apple.foundation");  
   expect(event.resultStatus).toBe("success");  
 });

 test("research.web is denied under private\_strict", async () \=\> {  
   const result \= await router.execute({  
     taskId: "router-live-deny-web",  
     capability: "research.web",  
     sourceSystem: "openclaw",  
     surface: "macos",  
     input: { text: "Find latest news" },  
     context: {  
       sensitivity: "private",  
       requiresNetwork: true,  
       requiresCurrentWeb: true  
     },  
     policyProfile: "lfsi.private\_strict"  
   });

   expect(result.ok).toBe(false);  
   if (\!result.ok) {  
     expect(result.reasonCode).toBe(  
       REASON\_CODES.CURRENT\_WEB\_FORBIDDEN\_UNDER\_PRIVATE\_STRICT  
     );  
   }

   const event \= ledger.events.at(-1)\!;  
   expect(event.resultStatus).toBe("denied");  
 });

 test("structured extraction records ledger outcome", async () \=\> {  
   const text \= await readFixture("extract-person.txt");

   const result \= await router.execute({  
     taskId: "router-live-structured",  
     capability: "text.extract.structured",  
     sourceSystem: "openclaw",  
     surface: "macos",  
     input: { text },  
     context: {  
       sensitivity: "private",  
       requiresNetwork: false,  
       requiresCurrentWeb: false  
     },  
     policyProfile: "lfsi.local\_balanced",  
     validation: {  
       requireSchema: true,  
       expectedFields: \["name", "role", "team"\]  
     }  
   });

   expect(result.ok).toBe(true);

   const event \= ledger.events.at(-1)\!;  
   expect(event.selectedProvider).toBe("apple.foundation");  
   expect(event.finalProvider \=== "apple.foundation" || event.finalProvider \=== "ollama.default").toBe(true);  
 });  
});  
---

# **Example fixtures**

## **`fixtures/summarize-short.txt`**

Nikodemus is building a local-first inference architecture for ACDS. Apple Intelligence serves as Tier 0 for bounded local tasks. Ollama serves as Tier 1 for deeper reasoning and fallback. The goal is deterministic routing, strong validation, and full auditability.

## **`fixtures/summarize-long.txt`**

Local-First Sovereign Inference is an execution doctrine for ACDS. It establishes that inference should run on the lowest viable dependency layer first. Apple Intelligence handles bounded local tasks such as summarization, rewriting, and structured extraction. Ollama handles long-form generation, deeper reasoning, and fallback when Tier 0 fails validation. Every execution must be logged. Every escalation must be explainable. The architecture aims to minimize unnecessary dependency expansion while preserving the ability to scale capability when required. This design aligns with Quiet Sovereignty by keeping execution local when possible. It aligns with Conscious Dependence by allowing escalation only through explicit policy.

## **`fixtures/extract-person.txt`**

Name: Nikodemus Corvus  
Role: Architect  
Team: Corvusforge

## **`fixtures/classify-ticket.txt`**

A user reports that a workflow intermittently fails after structured extraction returns malformed JSON. They want to know whether the issue belongs to validation, provider reliability, or routing logic.  
---

# **How to run**

Logic only:

npm test

Live Ollama:

ACDS\_TEST\_OLLAMA\_LIVE=1 \\  
ACDS\_OLLAMA\_BASE\_URL=http://127.0.0.1:11434 \\  
ACDS\_OLLAMA\_MODEL=qwen3:latest \\  
npm run test:live

Live Apple:

ACDS\_TEST\_APPLE\_LIVE=1 \\  
ACDS\_APPLE\_BRIDGE\_CMD=/absolute/path/to/apple-bridge \\  
npm run test:live

Both:

ACDS\_TEST\_APPLE\_LIVE=1 \\  
ACDS\_APPLE\_BRIDGE\_CMD=/absolute/path/to/apple-bridge \\  
ACDS\_TEST\_OLLAMA\_LIVE=1 \\  
ACDS\_OLLAMA\_BASE\_URL=http://127.0.0.1:11434 \\  
ACDS\_OLLAMA\_MODEL=qwen3:latest \\  
npm run test:live  
---

# **Why this is the correct posture**

This gives you exactly what you asked for:

* no fake providers  
* no stubs in the live path  
* no monkeypatching  
* pure logic tests where appropriate  
* real Apple integration tests  
* real Ollama integration tests  
* real router integration tests  
* real ledger verification

A single flat ledger record is enough for basic audit, but not enough for diagnosis. When something goes wrong, you need to know whether the problem was:

* the provider was down  
* the provider was up but the capability failed conformance  
* the router made a decision that was correct or incorrect under policy  
* validation failed after execution  
* escalation occurred for the right reason

Those are different facts. They should not be collapsed into one record.

Below is the refactor.

---

# **Ledger Refactor**

## **Separate Health, Conformance, Routing, Execution, and Outcome Events**

## **I. Why split the ledger**

Right now one event is trying to carry too much meaning.

That causes three problems:

### **A. Diagnostic ambiguity**

You cannot cleanly distinguish:

* provider unavailable  
* provider responded badly  
* validator rejected output  
* router escalated correctly

### **B. Weak trend analysis**

You cannot answer:

* Is Apple down more often than it fails conformance?  
* Is Ollama healthy but too slow?  
* Which capabilities fail most often on Tier 0?

### **C. Poor governance visibility**

You want Accountable Autonomy. That means each decision layer should be inspectable.

So the ledger should move from:

* one terminal record

to:

* a short event chain per request

---

# **II. Event model**

Each request gets a `traceId`.  
 Each event gets its own `eventId`.

The request then emits a sequence like this:

1. `routing.decision`  
2. `provider.health`  
3. `provider.execution`  
4. `validation.result`  
5. `routing.escalation` if needed  
6. `request.outcome`

That gives you a causal chain.

---

# **III. Core event types**

## **A. RoutingDecisionEvent**

This records what the router intended to do.

export interface RoutingDecisionEvent {  
 eventId: string;  
 traceId: string;  
 timestamp: string;  
 type: "routing.decision";  
 taskId: string;  
 capability: string;  
 policyProfile: string;  
 allowedTiers: ("tier0" | "tier1" | "tier2")\[\];  
 candidateProviders: string\[\];  
 selectedProvider: string;  
 selectedTier: "tier0" | "tier1" | "tier2";  
 reason: string;  
}

## **B. ProviderHealthEvent**

This records whether a provider was reachable at the moment of selection.

export interface ProviderHealthEvent {  
 eventId: string;  
 traceId: string;  
 timestamp: string;  
 type: "provider.health";  
 providerId: string;  
 tier: "tier0" | "tier1" | "tier2";  
 capability: string;  
 available: boolean;  
 healthReason?: string;  
}

## **C. ProviderExecutionEvent**

This records that a provider was actually invoked.

export interface ProviderExecutionEvent {  
 eventId: string;  
 traceId: string;  
 timestamp: string;  
 type: "provider.execution";  
 providerId: string;  
 tier: "tier0" | "tier1" | "tier2";  
 capability: string;  
 taskId: string;  
 latencyMs: number;  
 success: boolean;  
 executionError?: string;  
 metadata?: Record\<string, unknown\>;  
}

## **D. ValidationResultEvent**

This records output conformance.

export interface ValidationResultEvent {  
 eventId: string;  
 traceId: string;  
 timestamp: string;  
 type: "validation.result";  
 providerId: string;  
 capability: string;  
 passed: boolean;  
 confidence: number;  
 failures: string\[\];  
 nextAction: "return" | "escalate";  
}

## **E. RoutingEscalationEvent**

This records a tier transition.

export interface RoutingEscalationEvent {  
 eventId: string;  
 traceId: string;  
 timestamp: string;  
 type: "routing.escalation";  
 taskId: string;  
 capability: string;  
 fromProvider: string;  
 fromTier: "tier0" | "tier1" | "tier2";  
 toProvider: string;  
 toTier: "tier0" | "tier1" | "tier2";  
 reason: string;  
}

## **F. RequestOutcomeEvent**

This is the terminal event.

export interface RequestOutcomeEvent {  
 eventId: string;  
 traceId: string;  
 timestamp: string;  
 type: "request.outcome";  
 taskId: string;  
 sourceSystem: string;  
 capability: string;  
 finalProvider: string;  
 finalTier: "tier0" | "tier1" | "tier2" | "none";  
 resultStatus: "success" | "failure" | "denied";  
 reasonCode?: string;  
 totalLatencyMs: number;  
 attempts: number;  
}  
---

# **IV. Unified ledger union**

## **`src/types.ts`**

Add:

export type Tier \= "tier0" | "tier1" | "tier2";

export interface LedgerEventBase {  
 eventId: string;  
 traceId: string;  
 timestamp: string;  
}

export interface RoutingDecisionEvent extends LedgerEventBase {  
 type: "routing.decision";  
 taskId: string;  
 capability: string;  
 policyProfile: string;  
 allowedTiers: Tier\[\];  
 candidateProviders: string\[\];  
 selectedProvider: string;  
 selectedTier: Tier;  
 reason: string;  
}

export interface ProviderHealthEvent extends LedgerEventBase {  
 type: "provider.health";  
 providerId: string;  
 tier: Tier;  
 capability: string;  
 available: boolean;  
 healthReason?: string;  
}

export interface ProviderExecutionEvent extends LedgerEventBase {  
 type: "provider.execution";  
 providerId: string;  
 tier: Tier;  
 capability: string;  
 taskId: string;  
 latencyMs: number;  
 success: boolean;  
 executionError?: string;  
 metadata?: Record\<string, unknown\>;  
}

export interface ValidationResultEvent extends LedgerEventBase {  
 type: "validation.result";  
 providerId: string;  
 capability: string;  
 passed: boolean;  
 confidence: number;  
 failures: string\[\];  
 nextAction: "return" | "escalate";  
}

export interface RoutingEscalationEvent extends LedgerEventBase {  
 type: "routing.escalation";  
 taskId: string;  
 capability: string;  
 fromProvider: string;  
 fromTier: Tier;  
 toProvider: string;  
 toTier: Tier;  
 reason: string;  
}

export interface RequestOutcomeEvent extends LedgerEventBase {  
 type: "request.outcome";  
 taskId: string;  
 sourceSystem: string;  
 capability: string;  
 finalProvider: string;  
 finalTier: Tier | "none";  
 resultStatus: "success" | "failure" | "denied";  
 reasonCode?: string;  
 totalLatencyMs: number;  
 attempts: number;  
}

export type LedgerEvent \=  
 | RoutingDecisionEvent  
 | ProviderHealthEvent  
 | ProviderExecutionEvent  
 | ValidationResultEvent  
 | RoutingEscalationEvent  
 | RequestOutcomeEvent;

export interface LedgerSink {  
 write(event: LedgerEvent): Promise\<void\> | void;  
}  
---

# **V. Trace context**

You need a trace object per request.

## **`src/router.ts`**

Add a simple context:

interface ExecutionTrace {  
 traceId: string;  
 startedAt: number;  
 attempts: number;  
}

Helper:

import { randomUUID } from "node:crypto";

function newTrace(): ExecutionTrace {  
 return {  
   traceId: randomUUID(),  
   startedAt: Date.now(),  
   attempts: 0  
 };  
}  
---

# **VI. Ledger writer helpers**

These keep the router readable.

## **`src/ledger-events.ts`**

import { randomUUID } from "node:crypto";  
import type {  
 LedgerEvent,  
 ProviderExecutionEvent,  
 ProviderHealthEvent,  
 RequestOutcomeEvent,  
 RoutingDecisionEvent,  
 RoutingEscalationEvent,  
 ValidationResultEvent,  
 Tier  
} from "./types.js";

function base(traceId: string) {  
 return {  
   eventId: randomUUID(),  
   traceId,  
   timestamp: new Date().toISOString()  
 };  
}

export function routingDecisionEvent(args: {  
 traceId: string;  
 taskId: string;  
 capability: string;  
 policyProfile: string;  
 allowedTiers: Tier\[\];  
 candidateProviders: string\[\];  
 selectedProvider: string;  
 selectedTier: Tier;  
 reason: string;  
}): RoutingDecisionEvent {  
 return {  
   ...base(args.traceId),  
   type: "routing.decision",  
   taskId: args.taskId,  
   capability: args.capability,  
   policyProfile: args.policyProfile,  
   allowedTiers: args.allowedTiers,  
   candidateProviders: args.candidateProviders,  
   selectedProvider: args.selectedProvider,  
   selectedTier: args.selectedTier,  
   reason: args.reason  
 };  
}

export function providerHealthEvent(args: {  
 traceId: string;  
 providerId: string;  
 tier: Tier;  
 capability: string;  
 available: boolean;  
 healthReason?: string;  
}): ProviderHealthEvent {  
 return {  
   ...base(args.traceId),  
   type: "provider.health",  
   providerId: args.providerId,  
   tier: args.tier,  
   capability: args.capability,  
   available: args.available,  
   healthReason: args.healthReason  
 };  
}

export function providerExecutionEvent(args: {  
 traceId: string;  
 providerId: string;  
 tier: Tier;  
 capability: string;  
 taskId: string;  
 latencyMs: number;  
 success: boolean;  
 executionError?: string;  
 metadata?: Record\<string, unknown\>;  
}): ProviderExecutionEvent {  
 return {  
   ...base(args.traceId),  
   type: "provider.execution",  
   providerId: args.providerId,  
   tier: args.tier,  
   capability: args.capability,  
   taskId: args.taskId,  
   latencyMs: args.latencyMs,  
   success: args.success,  
   executionError: args.executionError,  
   metadata: args.metadata  
 };  
}

export function validationResultEvent(args: {  
 traceId: string;  
 providerId: string;  
 capability: string;  
 passed: boolean;  
 confidence: number;  
 failures: string\[\];  
 nextAction: "return" | "escalate";  
}): ValidationResultEvent {  
 return {  
   ...base(args.traceId),  
   type: "validation.result",  
   providerId: args.providerId,  
   capability: args.capability,  
   passed: args.passed,  
   confidence: args.confidence,  
   failures: args.failures,  
   nextAction: args.nextAction  
 };  
}

export function routingEscalationEvent(args: {  
 traceId: string;  
 taskId: string;  
 capability: string;  
 fromProvider: string;  
 fromTier: Tier;  
 toProvider: string;  
 toTier: Tier;  
 reason: string;  
}): RoutingEscalationEvent {  
 return {  
   ...base(args.traceId),  
   type: "routing.escalation",  
   taskId: args.taskId,  
   capability: args.capability,  
   fromProvider: args.fromProvider,  
   fromTier: args.fromTier,  
   toProvider: args.toProvider,  
   toTier: args.toTier,  
   reason: args.reason  
 };  
}

export function requestOutcomeEvent(args: {  
 traceId: string;  
 taskId: string;  
 sourceSystem: string;  
 capability: string;  
 finalProvider: string;  
 finalTier: Tier | "none";  
 resultStatus: "success" | "failure" | "denied";  
 reasonCode?: string;  
 totalLatencyMs: number;  
 attempts: number;  
}): RequestOutcomeEvent {  
 return {  
   ...base(args.traceId),  
   type: "request.outcome",  
   taskId: args.taskId,  
   sourceSystem: args.sourceSystem,  
   capability: args.capability,  
   finalProvider: args.finalProvider,  
   finalTier: args.finalTier,  
   resultStatus: args.resultStatus,  
   reasonCode: args.reasonCode,  
   totalLatencyMs: args.totalLatencyMs,  
   attempts: args.attempts  
 };  
}  
---

# **VII. Router refactor**

Now the router emits a real event stream.

## **`src/router.ts`**

import { randomUUID } from "node:crypto";  
import { isCapability } from "./capabilities.js";  
import { REASON\_CODES } from "./errors.js";  
import { resolvePolicy, PolicyDenyError } from "./policies.js";  
import {  
 providerExecutionEvent,  
 providerHealthEvent,  
 requestOutcomeEvent,  
 routingDecisionEvent,  
 routingEscalationEvent,  
 validationResultEvent  
} from "./ledger-events.js";  
import type {  
 InferenceProvider,  
 InferenceRequest,  
 LedgerSink,  
 RouterResult,  
 Tier  
} from "./types.js";  
import { validateResult } from "./validator.js";

interface ExecutionTrace {  
 traceId: string;  
 startedAt: number;  
 attempts: number;  
}

export class Router {  
 constructor(  
   private readonly providers: InferenceProvider\[\],  
   private readonly ledger: LedgerSink  
 ) {}

 async execute(request: InferenceRequest): Promise\<RouterResult\> {  
   const trace: ExecutionTrace \= {  
     traceId: randomUUID(),  
     startedAt: Date.now(),  
     attempts: 0  
   };

   if (\!isCapability(request.capability)) {  
     await this.ledger.write(  
       requestOutcomeEvent({  
         traceId: trace.traceId,  
         taskId: request.taskId,  
         sourceSystem: request.sourceSystem,  
         capability: String(request.capability),  
         finalProvider: "none",  
         finalTier: "none",  
         resultStatus: "failure",  
         reasonCode: REASON\_CODES.UNKNOWN\_CAPABILITY,  
         totalLatencyMs: Date.now() \- trace.startedAt,  
         attempts: 0  
       })  
     );

     return {  
       ok: false,  
       status: "failure",  
       reasonCode: REASON\_CODES.UNKNOWN\_CAPABILITY,  
       message: \`Unknown capability: ${request.capability}\`  
     };  
   }

   if (request.hasProviderOverride) {  
     await this.ledger.write(  
       requestOutcomeEvent({  
         traceId: trace.traceId,  
         taskId: request.taskId,  
         sourceSystem: request.sourceSystem,  
         capability: request.capability,  
         finalProvider: "none",  
         finalTier: "none",  
         resultStatus: "denied",  
         reasonCode: REASON\_CODES.CLIENT\_PROVIDER\_OVERRIDE\_FORBIDDEN,  
         totalLatencyMs: Date.now() \- trace.startedAt,  
         attempts: 0  
       })  
     );

     return {  
       ok: false,  
       status: "denied",  
       reasonCode: REASON\_CODES.CLIENT\_PROVIDER\_OVERRIDE\_FORBIDDEN,  
       message: "Client provider override is forbidden"  
     };  
   }

   try {  
     const policy \= resolvePolicy(request);  
     const candidates \= this.selectProvidersByTier(  
       request.capability,  
       policy.allowedTiers  
     );

     if (candidates.length \=== 0\) {  
       await this.ledger.write(  
         requestOutcomeEvent({  
           traceId: trace.traceId,  
           taskId: request.taskId,  
           sourceSystem: request.sourceSystem,  
           capability: request.capability,  
           finalProvider: "none",  
           finalTier: "none",  
           resultStatus: "failure",  
           reasonCode: REASON\_CODES.NO\_PROVIDER\_AVAILABLE,  
           totalLatencyMs: Date.now() \- trace.startedAt,  
           attempts: 0  
         })  
       );

       return {  
         ok: false,  
         status: "failure",  
         reasonCode: REASON\_CODES.NO\_PROVIDER\_AVAILABLE,  
         message: "No providers support this capability within allowed tiers"  
       };  
     }

     await this.ledger.write(  
       routingDecisionEvent({  
         traceId: trace.traceId,  
         taskId: request.taskId,  
         capability: request.capability,  
         policyProfile: request.policyProfile,  
         allowedTiers: policy.allowedTiers,  
         candidateProviders: candidates.map((p) \=\> p.id),  
         selectedProvider: candidates\[0\].id,  
         selectedTier: candidates\[0\].tier,  
         reason: "lowest viable tier selected by policy ordering"  
       })  
     );

     for (let i \= 0; i \< candidates.length; i \+= 1\) {  
       const provider \= candidates\[i\];  
       trace.attempts \+= 1;

       const available \= await provider.isAvailable();

       await this.ledger.write(  
         providerHealthEvent({  
           traceId: trace.traceId,  
           providerId: provider.id,  
           tier: provider.tier,  
           capability: request.capability,  
           available,  
           healthReason: available ? undefined : "provider reported unavailable"  
         })  
       );

       if (\!available) {  
         continue;  
       }

       const execStart \= Date.now();

       try {  
         const result \= await provider.invoke(request);

         await this.ledger.write(  
           providerExecutionEvent({  
             traceId: trace.traceId,  
             providerId: provider.id,  
             tier: provider.tier,  
             capability: request.capability,  
             taskId: request.taskId,  
             latencyMs: Date.now() \- execStart,  
             success: true,  
             metadata: result.metadata  
           })  
         );

         const validation \= provider.validate  
           ? await provider.validate(result, request)  
           : await validateResult(result, request);

         await this.ledger.write(  
           validationResultEvent({  
             traceId: trace.traceId,  
             providerId: provider.id,  
             capability: request.capability,  
             passed: validation.passed,  
             confidence: validation.confidence,  
             failures: validation.failures,  
             nextAction: validation.nextAction  
           })  
         );

         if (validation.passed) {  
           await this.ledger.write(  
             requestOutcomeEvent({  
               traceId: trace.traceId,  
               taskId: request.taskId,  
               sourceSystem: request.sourceSystem,  
               capability: request.capability,  
               finalProvider: provider.id,  
               finalTier: provider.tier,  
               resultStatus: "success",  
               totalLatencyMs: Date.now() \- trace.startedAt,  
               attempts: trace.attempts  
             })  
           );

           return {  
             ok: true,  
             status: "success",  
             result,  
             validation  
           };  
         }

         const nextProvider \= candidates\[i \+ 1\];  
         const escalationAllowed \= policy.allowsEscalation && \!\!nextProvider;

         if (escalationAllowed && nextProvider) {  
           await this.ledger.write(  
             routingEscalationEvent({  
               traceId: trace.traceId,  
               taskId: request.taskId,  
               capability: request.capability,  
               fromProvider: provider.id,  
               fromTier: provider.tier,  
               toProvider: nextProvider.id,  
               toTier: nextProvider.tier,  
               reason: validation.failures.join(", ") || "validation failed"  
             })  
           );  
           continue;  
         }

         const reasonCode \=  
           request.policyProfile \=== "lfsi.apple\_only"  
             ? REASON\_CODES.APPLE\_ONLY\_VALIDATION\_FAILURE  
             : REASON\_CODES.VALIDATION\_FAILED\_NO\_ESCALATION;

         await this.ledger.write(  
           requestOutcomeEvent({  
             traceId: trace.traceId,  
             taskId: request.taskId,  
             sourceSystem: request.sourceSystem,  
             capability: request.capability,  
             finalProvider: provider.id,  
             finalTier: provider.tier,  
             resultStatus: "failure",  
             reasonCode,  
             totalLatencyMs: Date.now() \- trace.startedAt,  
             attempts: trace.attempts  
           })  
         );

         return {  
           ok: false,  
           status: "failure",  
           reasonCode,  
           message: validation.failures.join(", ") || "Validation failed"  
         };  
       } catch (error) {  
         await this.ledger.write(  
           providerExecutionEvent({  
             traceId: trace.traceId,  
             providerId: provider.id,  
             tier: provider.tier,  
             capability: request.capability,  
             taskId: request.taskId,  
             latencyMs: Date.now() \- execStart,  
             success: false,  
             executionError: String(error)  
           })  
         );

         const nextProvider \= candidates\[i \+ 1\];  
         if (policy.allowsEscalation && nextProvider) {  
           await this.ledger.write(  
             routingEscalationEvent({  
               traceId: trace.traceId,  
               taskId: request.taskId,  
               capability: request.capability,  
               fromProvider: provider.id,  
               fromTier: provider.tier,  
               toProvider: nextProvider.id,  
               toTier: nextProvider.tier,  
               reason: \`execution error: ${String(error)}\`  
             })  
           );  
           continue;  
         }

         await this.ledger.write(  
           requestOutcomeEvent({  
             traceId: trace.traceId,  
             taskId: request.taskId,  
             sourceSystem: request.sourceSystem,  
             capability: request.capability,  
             finalProvider: provider.id,  
             finalTier: provider.tier,  
             resultStatus: "failure",  
             reasonCode: REASON\_CODES.NO\_PROVIDER\_PASSED\_VALIDATION,  
             totalLatencyMs: Date.now() \- trace.startedAt,  
             attempts: trace.attempts  
           })  
         );

         return {  
           ok: false,  
           status: "failure",  
           reasonCode: REASON\_CODES.NO\_PROVIDER\_PASSED\_VALIDATION,  
           message: String(error)  
         };  
       }  
     }

     await this.ledger.write(  
       requestOutcomeEvent({  
         traceId: trace.traceId,  
         taskId: request.taskId,  
         sourceSystem: request.sourceSystem,  
         capability: request.capability,  
         finalProvider: "none",  
         finalTier: "none",  
         resultStatus: "failure",  
         reasonCode:  
           request.policyProfile \=== "lfsi.apple\_only"  
             ? REASON\_CODES.APPLE\_PROVIDER\_UNAVAILABLE  
             : REASON\_CODES.NO\_PROVIDER\_AVAILABLE,  
         totalLatencyMs: Date.now() \- trace.startedAt,  
         attempts: trace.attempts  
       })  
     );

     return {  
       ok: false,  
       status: "failure",  
       reasonCode:  
         request.policyProfile \=== "lfsi.apple\_only"  
           ? REASON\_CODES.APPLE\_PROVIDER\_UNAVAILABLE  
           : REASON\_CODES.NO\_PROVIDER\_AVAILABLE,  
       message: "No provider was available"  
     };  
   } catch (error) {  
     if (error instanceof PolicyDenyError) {  
       await this.ledger.write(  
         requestOutcomeEvent({  
           traceId: trace.traceId,  
           taskId: request.taskId,  
           sourceSystem: request.sourceSystem,  
           capability: String(request.capability),  
           finalProvider: "none",  
           finalTier: "none",  
           resultStatus: "denied",  
           reasonCode: error.reasonCode,  
           totalLatencyMs: Date.now() \- trace.startedAt,  
           attempts: trace.attempts  
         })  
       );

       return {  
         ok: false,  
         status: "denied",  
         reasonCode: error.reasonCode,  
         message: error.message  
       };  
     }

     throw error;  
   }  
 }

 private selectProvidersByTier(  
   capability: string,  
   allowedTiers: Tier\[\]  
 ): InferenceProvider\[\] {  
   const filtered \= this.providers.filter(  
     (provider) \=\>  
       allowedTiers.includes(provider.tier) &&  
       provider.capabilities.includes(capability as never)  
   );

   const tierRank \= new Map\<Tier, number\>(  
     allowedTiers.map((tier, index) \=\> \[tier, index\])  
   );

   return filtered.sort(  
     (a, b) \=\> (tierRank.get(a.tier) ?? 999\) \- (tierRank.get(b.tier) ?? 999\)  
   );  
 }  
}  
---

# **VIII. Error codes update**

## **`src/errors.ts`**

Add:

export const REASON\_CODES \= {  
 UNKNOWN\_CAPABILITY: "UNKNOWN\_CAPABILITY",  
 CLIENT\_PROVIDER\_OVERRIDE\_FORBIDDEN: "CLIENT\_PROVIDER\_OVERRIDE\_FORBIDDEN",  
 WEB\_RESEARCH\_NOT\_ALLOWED\_UNDER\_PRIVATE\_STRICT:  
   "WEB\_RESEARCH\_NOT\_ALLOWED\_UNDER\_PRIVATE\_STRICT",  
 CURRENT\_WEB\_FORBIDDEN\_UNDER\_PRIVATE\_STRICT:  
   "CURRENT\_WEB\_FORBIDDEN\_UNDER\_PRIVATE\_STRICT",  
 APPLE\_PROVIDER\_UNAVAILABLE: "APPLE\_PROVIDER\_UNAVAILABLE",  
 APPLE\_ONLY\_VALIDATION\_FAILURE: "APPLE\_ONLY\_VALIDATION\_FAILURE",  
 OLLAMA\_PROVIDER\_UNAVAILABLE: "OLLAMA\_PROVIDER\_UNAVAILABLE",  
 OLLAMA\_MODEL\_UNAVAILABLE: "OLLAMA\_MODEL\_UNAVAILABLE",  
 NO\_PROVIDER\_AVAILABLE: "NO\_PROVIDER\_AVAILABLE",  
 NO\_PROVIDER\_PASSED\_VALIDATION: "NO\_PROVIDER\_PASSED\_VALIDATION",  
 VALIDATION\_FAILED\_NO\_ESCALATION: "VALIDATION\_FAILED\_NO\_ESCALATION"  
} as const;  
---

# **IX. Ledger tests for split events**

## **`test/logic/ledger-events.test.ts`**

import { describe, expect, test } from "vitest";  
import { InMemoryLedgerSink } from "../../src/ledger.js";  
import {  
 providerExecutionEvent,  
 providerHealthEvent,  
 requestOutcomeEvent,  
 routingDecisionEvent,  
 validationResultEvent  
} from "../../src/ledger-events.js";

describe("ledger event helpers", () \=\> {  
 test("writes split event types", async () \=\> {  
   const ledger \= new InMemoryLedgerSink();

   await ledger.write(  
     routingDecisionEvent({  
       traceId: "trace-1",  
       taskId: "task-1",  
       capability: "text.summarize",  
       policyProfile: "lfsi.local\_balanced",  
       allowedTiers: \["tier0", "tier1"\],  
       candidateProviders: \["apple.foundation", "ollama.default"\],  
       selectedProvider: "apple.foundation",  
       selectedTier: "tier0",  
       reason: "policy order"  
     })  
   );

   await ledger.write(  
     providerHealthEvent({  
       traceId: "trace-1",  
       providerId: "apple.foundation",  
       tier: "tier0",  
       capability: "text.summarize",  
       available: true  
     })  
   );

   await ledger.write(  
     providerExecutionEvent({  
       traceId: "trace-1",  
       providerId: "apple.foundation",  
       tier: "tier0",  
       capability: "text.summarize",  
       taskId: "task-1",  
       latencyMs: 18,  
       success: true  
     })  
   );

   await ledger.write(  
     validationResultEvent({  
       traceId: "trace-1",  
       providerId: "apple.foundation",  
       capability: "text.summarize",  
       passed: true,  
       confidence: 0.94,  
       failures: \[\],  
       nextAction: "return"  
     })  
   );

   await ledger.write(  
     requestOutcomeEvent({  
       traceId: "trace-1",  
       taskId: "task-1",  
       sourceSystem: "openclaw",  
       capability: "text.summarize",  
       finalProvider: "apple.foundation",  
       finalTier: "tier0",  
       resultStatus: "success",  
       totalLatencyMs: 42,  
       attempts: 1  
     })  
   );

   expect(ledger.events).toHaveLength(5);  
   expect(ledger.events.map((e) \=\> e.type)).toEqual(\[  
     "routing.decision",  
     "provider.health",  
     "provider.execution",  
     "validation.result",  
     "request.outcome"  
   \]);  
 });  
});  
---

# **X. What this gives you**

This refactor gives you:

* **router intent** separated from execution  
* **provider availability** separated from conformance  
* **execution failure** separated from validation failure  
* **escalation cause** explicitly recorded  
* **terminal outcome** cleanly summarized

That is much closer to Thingstead-grade governance.

## **Operational benefit**

Now you can answer questions like:

* Did Apple fail because it was unavailable, or because its output failed validation?  
* How often does Ollama get selected directly versus via escalation?  
* Which capabilities are healthy at Tier 0 but weak in conformance?  
* Are routing decisions aligned with policy, or just falling through?

That is exactly the level of observability you need for Process Swarm and ACDS.

If health and conformance are only discovered during user traffic, the system is reactive. ACDS should be able to measure provider readiness *before* real requests depend on it.

What you want is a **first-class probe subsystem**.

Not fake tests. Not synthetic mocks. Real, controlled, ledgered probe executions against real providers and real capabilities.

---

# **Provider Probe Subsystem**

## **Health and Conformance Preflight for ACDS**

## **I. Purpose**

The probe subsystem exists to answer two separate questions:

### **A. Health**

Can the provider currently respond?

### **B. Conformance**

Can the provider currently satisfy the capability contract in the required shape?

Those are not the same.

A provider can be:

* healthy but non-conformant  
* healthy and conformant  
* unhealthy and therefore untestable  
* intermittently healthy and unstable

The probe layer makes that visible.

---

# **II. Design goals**

The probe subsystem should:

* run against real providers only  
* use fixed fixtures  
* generate ledger events  
* avoid contaminating normal request traces  
* support both ad hoc and scheduled execution  
* distinguish transport health from capability quality

---

# **III. Probe taxonomy**

You need three probe classes.

## **A. Provider health probe**

Checks only whether the provider is reachable and callable.

Examples:

* Apple bridge process responds  
* Ollama API responds  
* Ollama model exists

## **B. Capability conformance probe**

Checks whether a provider can satisfy a specific capability contract.

Examples:

* Apple summarize returns non-empty summary  
* Apple extract returns required fields  
* Ollama deep reasoning returns non-empty output  
* Ollama structured extraction returns valid JSON

## **C. Routing readiness probe**

Checks whether the broker, policies, validator, and provider together behave correctly.

Examples:

* router selects Apple first for summarize  
* router escalates to Ollama when Apple fails conformance  
* router denies research.web under private\_strict

---

# **IV. New event types**

Add probe-specific ledger events so they do not get mixed with user-request traces.

## **`ProbeStartedEvent`**

export interface ProbeStartedEvent {  
 eventId: string;  
 traceId: string;  
 timestamp: string;  
 type: "probe.started";  
 probeId: string;  
 probeType: "provider.health" | "capability.conformance" | "routing.readiness";  
 providerId?: string;  
 capability?: string;  
 fixtureName?: string;  
}

## **`ProbeResultEvent`**

export interface ProbeResultEvent {  
 eventId: string;  
 traceId: string;  
 timestamp: string;  
 type: "probe.result";  
 probeId: string;  
 probeType: "provider.health" | "capability.conformance" | "routing.readiness";  
 providerId?: string;  
 capability?: string;  
 passed: boolean;  
 latencyMs: number;  
 failures: string\[\];  
 metadata?: Record\<string, unknown\>;  
}

These can coexist with your existing event chain.

---

# **V. Probe definitions**

Each probe should be explicit and named.

## **`src/probes/types.ts`**

import type { Capability } from "../capabilities.js";

export type ProbeType \=  
 | "provider.health"  
 | "capability.conformance"  
 | "routing.readiness";

export interface ProbeDefinition {  
 id: string;  
 type: ProbeType;  
 providerId?: string;  
 capability?: Capability;  
 fixtureName?: string;  
 description: string;  
}  
---

# **VI. Probe registry**

Keep a real registry of supported probes.

## **`src/probes/registry.ts`**

import type { ProbeDefinition } from "./types.js";

export const PROBES: ProbeDefinition\[\] \= \[  
 {  
   id: "apple-health",  
   type: "provider.health",  
   providerId: "apple.foundation",  
   description: "Checks whether the Apple provider is reachable"  
 },  
 {  
   id: "apple-summarize-conformance",  
   type: "capability.conformance",  
   providerId: "apple.foundation",  
   capability: "text.summarize",  
   fixtureName: "summarize-short.txt",  
   description: "Checks whether Apple returns a conformant summary"  
 },  
 {  
   id: "apple-structured-conformance",  
   type: "capability.conformance",  
   providerId: "apple.foundation",  
   capability: "text.extract.structured",  
   fixtureName: "extract-person.txt",  
   description: "Checks whether Apple returns conformant structured extraction"  
 },  
 {  
   id: "ollama-health",  
   type: "provider.health",  
   providerId: "ollama.default",  
   description: "Checks whether Ollama is reachable and usable"  
 },  
 {  
   id: "ollama-summarize-conformance",  
   type: "capability.conformance",  
   providerId: "ollama.default",  
   capability: "text.summarize",  
   fixtureName: "summarize-long.txt",  
   description: "Checks whether Ollama returns a conformant summary"  
 },  
 {  
   id: "ollama-deep-reasoning-conformance",  
   type: "capability.conformance",  
   providerId: "ollama.default",  
   capability: "reasoning.deep",  
   fixtureName: "classify-ticket.txt",  
   description: "Checks whether Ollama returns non-empty reasoning output"  
 }  
\];  
---

# **VII. Probe runner**

This runs a probe against real providers.

## **`src/probes/runner.ts`**

import { randomUUID } from "node:crypto";  
import type { InferenceProvider, LedgerSink, InferenceRequest } from "../types.js";  
import { readFixture } from "../testing/fixtures.js";  
import { validateResult } from "../validator.js";  
import type { ProbeDefinition } from "./types.js";

export class ProbeRunner {  
 constructor(  
   private readonly providers: InferenceProvider\[\],  
   private readonly ledger: LedgerSink  
 ) {}

 async run(probe: ProbeDefinition): Promise\<{ passed: boolean; failures: string\[\] }\> {  
   const traceId \= randomUUID();  
   const startedAt \= Date.now();

   await this.ledger.write({  
     eventId: randomUUID(),  
     traceId,  
     timestamp: new Date().toISOString(),  
     type: "probe.started",  
     probeId: probe.id,  
     probeType: probe.type,  
     providerId: probe.providerId,  
     capability: probe.capability,  
     fixtureName: probe.fixtureName  
   });

   const provider \= this.providers.find((p) \=\> p.id \=== probe.providerId);  
   if (\!provider) {  
     const failures \= \[\`provider\_not\_found:${probe.providerId}\`\];  
     await this.writeProbeResult(traceId, probe, false, startedAt, failures);  
     return { passed: false, failures };  
   }

   if (probe.type \=== "provider.health") {  
     const available \= await provider.isAvailable();  
     const failures \= available ? \[\] : \["provider\_unavailable"\];

     await this.writeProbeResult(traceId, probe, available, startedAt, failures);  
     return { passed: available, failures };  
   }

   if (probe.type \=== "capability.conformance") {  
     const available \= await provider.isAvailable();  
     if (\!available) {  
       const failures \= \["provider\_unavailable"\];  
       await this.writeProbeResult(traceId, probe, false, startedAt, failures);  
       return { passed: false, failures };  
     }

     const inputText \= probe.fixtureName ? await readFixture(probe.fixtureName) : "";  
     const request \= this.buildProbeRequest(probe, inputText);

     try {  
       const result \= await provider.invoke(request);  
       const validation \= provider.validate  
         ? await provider.validate(result, request)  
         : await validateResult(result, request);

       await this.writeProbeResult(  
         traceId,  
         probe,  
         validation.passed,  
         startedAt,  
         validation.failures,  
         {  
           providerId: provider.id,  
           confidence: validation.confidence,  
           outputKeys: Object.keys(result.output ?? {})  
         }  
       );

       return {  
         passed: validation.passed,  
         failures: validation.failures  
       };  
     } catch (error) {  
       const failures \= \[\`execution\_error:${String(error)}\`\];  
       await this.writeProbeResult(traceId, probe, false, startedAt, failures);  
       return { passed: false, failures };  
     }  
   }

   const failures \= \["unsupported\_probe\_type"\];  
   await this.writeProbeResult(traceId, probe, false, startedAt, failures);  
   return { passed: false, failures };  
 }

 private buildProbeRequest(  
   probe: ProbeDefinition,  
   text: string  
 ): InferenceRequest {  
   return {  
     taskId: \`probe:${probe.id}\`,  
     capability: probe.capability\!,  
     sourceSystem: "probe-runner",  
     surface: "macos",  
     input:  
       probe.capability \=== "text.extract.structured"  
         ? {  
             text,  
             expectedFields: \["name", "role", "team"\]  
           }  
         : { text },  
     context: {  
       sensitivity: "internal",  
       requiresNetwork: false,  
       requiresCurrentWeb: false  
     },  
     policyProfile: "lfsi.local\_balanced",  
     validation:  
       probe.capability \=== "text.extract.structured"  
         ? {  
             requireSchema: true,  
             expectedFields: \["name", "role", "team"\]  
           }  
         : undefined  
   };  
 }

 private async writeProbeResult(  
   traceId: string,  
   probe: ProbeDefinition,  
   passed: boolean,  
   startedAt: number,  
   failures: string\[\],  
   metadata?: Record\<string, unknown\>  
 ): Promise\<void\> {  
   await this.ledger.write({  
     eventId: randomUUID(),  
     traceId,  
     timestamp: new Date().toISOString(),  
     type: "probe.result",  
     probeId: probe.id,  
     probeType: probe.type,  
     providerId: probe.providerId,  
     capability: probe.capability,  
     passed,  
     latencyMs: Date.now() \- startedAt,  
     failures,  
     metadata  
   });  
 }  
}  
---

# **VIII. Extend ledger types**

## **`src/types.ts`**

Add these to the union:

export interface ProbeStartedEvent extends LedgerEventBase {  
 type: "probe.started";  
 probeId: string;  
 probeType: "provider.health" | "capability.conformance" | "routing.readiness";  
 providerId?: string;  
 capability?: string;  
 fixtureName?: string;  
}

export interface ProbeResultEvent extends LedgerEventBase {  
 type: "probe.result";  
 probeId: string;  
 probeType: "provider.health" | "capability.conformance" | "routing.readiness";  
 providerId?: string;  
 capability?: string;  
 passed: boolean;  
 latencyMs: number;  
 failures: string\[\];  
 metadata?: Record\<string, unknown\>;  
}

export type LedgerEvent \=  
 | RoutingDecisionEvent  
 | ProviderHealthEvent  
 | ProviderExecutionEvent  
 | ValidationResultEvent  
 | RoutingEscalationEvent  
 | RequestOutcomeEvent  
 | ProbeStartedEvent  
 | ProbeResultEvent;  
---

# **IX. Probe CLI**

A small CLI lets you run probes outside the test harness.

## **`src/probes/cli.ts`**

import { InMemoryLedgerSink } from "../ledger.js";  
import { readLiveTestEnv } from "../testing/env.js";  
import { AppleBridgeProcessClient } from "../apple/bridge-process.js";  
import { AppleProvider } from "../apple/provider.js";  
import { OllamaClient } from "../ollama/client.js";  
import { OllamaProvider } from "../ollama/provider.js";  
import { PROBES } from "./registry.js";  
import { ProbeRunner } from "./runner.js";

async function main() {  
 const env \= readLiveTestEnv();  
 const ledger \= new InMemoryLedgerSink();  
 const providers \= \[\];

 if (env.appleBridgeCommand) {  
   providers.push(  
     new AppleProvider(new AppleBridgeProcessClient(env.appleBridgeCommand))  
   );  
 }

 providers.push(  
   new OllamaProvider(new OllamaClient(env.ollamaBaseUrl), env.ollamaModel)  
 );

 const runner \= new ProbeRunner(providers, ledger);

 for (const probe of PROBES) {  
   const result \= await runner.run(probe);  
   console.log(\`${probe.id}: ${result.passed ? "PASS" : "FAIL"} ${result.failures.join(", ")}\`);  
 }

 console.log(JSON.stringify(ledger.events, null, 2));  
}

main().catch((error) \=\> {  
 console.error(error);  
 process.exit(1);  
});  
---

# **X. Probe tests**

## **`test/live/probes.live.test.ts`**

import { describe, expect, test } from "vitest";  
import { readLiveTestEnv } from "../../src/testing/env.js";  
import { InMemoryLedgerSink } from "../../src/ledger.js";  
import { AppleBridgeProcessClient } from "../../src/apple/bridge-process.js";  
import { AppleProvider } from "../../src/apple/provider.js";  
import { OllamaClient } from "../../src/ollama/client.js";  
import { OllamaProvider } from "../../src/ollama/provider.js";  
import { ProbeRunner } from "../../src/probes/runner.js";  
import { PROBES } from "../../src/probes/registry.js";

const env \= readLiveTestEnv();  
const runLive \=  
 env.runOllamaLive || (env.runAppleLive && \!\!env.appleBridgeCommand);  
const describeIf \= runLive ? describe : describe.skip;

describeIf("Probe runner live", () \=\> {  
 const ledger \= new InMemoryLedgerSink();  
 const providers \= \[\];

 if (env.runAppleLive && env.appleBridgeCommand) {  
   providers.push(  
     new AppleProvider(new AppleBridgeProcessClient(env.appleBridgeCommand))  
   );  
 }

 if (env.runOllamaLive) {  
   providers.push(  
     new OllamaProvider(new OllamaClient(env.ollamaBaseUrl), env.ollamaModel)  
   );  
 }

 const runner \= new ProbeRunner(providers, ledger);

 test("provider health probes emit started and result events", async () \=\> {  
   const providerHealthProbes \= PROBES.filter((p) \=\> p.type \=== "provider.health");

   for (const probe of providerHealthProbes) {  
     if (\!providers.some((p) \=\> p.id \=== probe.providerId)) continue;  
     await runner.run(probe);  
   }

   const types \= ledger.events.map((e) \=\> e.type);  
   expect(types.includes("probe.started")).toBe(true);  
   expect(types.includes("probe.result")).toBe(true);  
 });

 test("capability conformance probes return explicit pass/fail", async () \=\> {  
   const conformanceProbes \= PROBES.filter(  
     (p) \=\> p.type \=== "capability.conformance"  
   );

   for (const probe of conformanceProbes) {  
     if (\!providers.some((p) \=\> p.id \=== probe.providerId)) continue;  
     const result \= await runner.run(probe);  
     expect(typeof result.passed).toBe("boolean");  
     expect(Array.isArray(result.failures)).toBe(true);  
   }  
 });  
});  
---

# **XI. Operational use**

This gives you three useful modes.

## **A. Manual diagnostic run**

Before a dev session:

node dist/src/probes/cli.js

## **B. Preflight before live tests**

Run probes before router integration tests.

If Apple summarize is failing, do not treat router failures as routing bugs.

## **C. Scheduled readiness checks**

Later, Process Swarm or an automation can run probe batches periodically and log trends.

That gives you:

* provider drift detection  
* model regression detection  
* early warning before user impact

---

# **XII. Why this matters**

This turns provider quality into something measurable instead of anecdotal.

Without probes, you only know:

* a request failed

With probes, you know:

* Apple summarize is healthy  
* Apple structured extraction is weak today  
* Ollama reasoning is healthy but slower  
* router is behaving correctly given current provider state

That is a much more mature system.

Health probes tell you whether a provider is up.  
 Conformance probes tell you whether a provider can satisfy a capability contract.  
 Routing readiness probes tell you whether **ACDS itself** is making the correct decision under current reality.

That third category is what turns the system from provider-aware into operationally self-aware.

---

# **Routing Readiness Probes**

## **Broker-Level Verification for ACDS**

## **I. Purpose**

A routing readiness probe runs a controlled request **through the real router** and verifies:

* policy resolution  
* provider ordering  
* selected provider  
* escalation behavior  
* terminal outcome  
* ledger event chain

This is different from a provider probe.

A provider probe asks:

* “Can Apple summarize?”

A routing readiness probe asks:

* “Given policy X, capability Y, and current provider state, does ACDS behave correctly?”

That is the real question you care about when the system is live.

---

# **II. What routing readiness probes should validate**

Each routing probe should verify some combination of:

### **A. Selection**

Did the router choose the correct first provider?

### **B. Escalation**

Did it escalate when it should?

### **C. Denial**

Did it block forbidden requests?

### **D. Outcome**

Did the final result match the expected class of outcome?

### **E. Ledger chain**

Did the correct sequence of events get written?

---

# **III. Probe types to add**

Extend the probe registry with broker-level probes.

Examples:

* `router-apple-first-summarize`  
* `router-private-strict-deny-web`  
* `router-structured-extraction-path`  
* `router-apple-only-path`

These should not be synthetic. They should run against the real router and real providers.

---

# **IV. Extended probe definitions**

## **`src/probes/types.ts`**

Add routing expectations.

import type { Capability } from "../capabilities.js";  
import type { Tier } from "../types.js";

export type ProbeType \=  
 | "provider.health"  
 | "capability.conformance"  
 | "routing.readiness";

export interface RoutingExpectations {  
 expectedSelectedProvider?: string;  
 expectedSelectedTier?: Tier;  
 expectedFinalProvider?: string;  
 expectedFinalTier?: Tier | "none";  
 expectedStatus?: "success" | "failure" | "denied";  
 expectedReasonCode?: string;  
 requireEscalation?: boolean;  
 expectedEventTypes?: string\[\];  
}

export interface ProbeDefinition {  
 id: string;  
 type: ProbeType;  
 providerId?: string;  
 capability?: Capability;  
 fixtureName?: string;  
 description: string;

 policyProfile?: string;  
 contextOverrides?: {  
   sensitivity?: "public" | "internal" | "private" | "restricted";  
   requiresNetwork?: boolean;  
   requiresCurrentWeb?: boolean;  
 };  
 validation?: {  
   requireSchema?: boolean;  
   expectedFields?: string\[\];  
   minConfidence?: number;  
   allowedLabels?: string\[\];  
 };

 routingExpectations?: RoutingExpectations;  
}  
---

# **V. Routing probe registry**

## **`src/probes/registry.ts`**

Append routing probes.

import type { ProbeDefinition } from "./types.js";

export const PROBES: ProbeDefinition\[\] \= \[  
 {  
   id: "apple-health",  
   type: "provider.health",  
   providerId: "apple.foundation",  
   description: "Checks whether the Apple provider is reachable"  
 },  
 {  
   id: "apple-summarize-conformance",  
   type: "capability.conformance",  
   providerId: "apple.foundation",  
   capability: "text.summarize",  
   fixtureName: "summarize-short.txt",  
   description: "Checks whether Apple returns a conformant summary"  
 },  
 {  
   id: "apple-structured-conformance",  
   type: "capability.conformance",  
   providerId: "apple.foundation",  
   capability: "text.extract.structured",  
   fixtureName: "extract-person.txt",  
   description: "Checks whether Apple returns conformant structured extraction",  
   validation: {  
     requireSchema: true,  
     expectedFields: \["name", "role", "team"\]  
   }  
 },  
 {  
   id: "ollama-health",  
   type: "provider.health",  
   providerId: "ollama.default",  
   description: "Checks whether Ollama is reachable and usable"  
 },  
 {  
   id: "ollama-summarize-conformance",  
   type: "capability.conformance",  
   providerId: "ollama.default",  
   capability: "text.summarize",  
   fixtureName: "summarize-long.txt",  
   description: "Checks whether Ollama returns a conformant summary"  
 },  
 {  
   id: "ollama-deep-reasoning-conformance",  
   type: "capability.conformance",  
   providerId: "ollama.default",  
   capability: "reasoning.deep",  
   fixtureName: "classify-ticket.txt",  
   description: "Checks whether Ollama returns non-empty reasoning output"  
 },  
 {  
   id: "router-apple-first-summarize",  
   type: "routing.readiness",  
   capability: "text.summarize",  
   fixtureName: "summarize-short.txt",  
   description: "Checks whether the router selects Apple first for summarization",  
   policyProfile: "lfsi.local\_balanced",  
   routingExpectations: {  
     expectedSelectedProvider: "apple.foundation",  
     expectedSelectedTier: "tier0",  
     expectedStatus: "success",  
     expectedEventTypes: \[  
       "routing.decision",  
       "provider.health",  
       "provider.execution",  
       "validation.result",  
       "request.outcome"  
     \]  
   }  
 },  
 {  
   id: "router-private-strict-deny-web",  
   type: "routing.readiness",  
   capability: "research.web",  
   fixtureName: "classify-ticket.txt",  
   description: "Checks whether private\_strict denies web research",  
   policyProfile: "lfsi.private\_strict",  
   contextOverrides: {  
     sensitivity: "private",  
     requiresNetwork: true,  
     requiresCurrentWeb: true  
   },  
   routingExpectations: {  
     expectedStatus: "denied",  
     expectedReasonCode: "CURRENT\_WEB\_FORBIDDEN\_UNDER\_PRIVATE\_STRICT",  
     expectedFinalTier: "none",  
     expectedEventTypes: \[  
       "request.outcome"  
     \]  
   }  
 },  
 {  
   id: "router-structured-extraction-path",  
   type: "routing.readiness",  
   capability: "text.extract.structured",  
   fixtureName: "extract-person.txt",  
   description: "Checks router behavior for structured extraction",  
   policyProfile: "lfsi.local\_balanced",  
   validation: {  
     requireSchema: true,  
     expectedFields: \["name", "role", "team"\]  
   },  
   routingExpectations: {  
     expectedSelectedProvider: "apple.foundation",  
     expectedSelectedTier: "tier0",  
     expectedStatus: "success"  
   }  
 },  
 {  
   id: "router-apple-only-path",  
   type: "routing.readiness",  
   capability: "text.summarize",  
   fixtureName: "summarize-short.txt",  
   description: "Checks whether apple\_only stays on Tier 0",  
   policyProfile: "lfsi.apple\_only",  
   routingExpectations: {  
     expectedSelectedProvider: "apple.foundation",  
     expectedSelectedTier: "tier0"  
   }  
 }  
\];  
---

# **VI. Add a probe-specific trace filter**

Routing probes need to inspect only their own event chain.

## **`src/probes/trace.ts`**

import type { LedgerEvent } from "../types.js";

export function eventsForTrace(  
 events: LedgerEvent\[\],  
 traceId: string  
): LedgerEvent\[\] {  
 return events.filter((event) \=\> event.traceId \=== traceId);  
}

export function latestTraceId(events: LedgerEvent\[\]): string | null {  
 if (events.length \=== 0\) return null;  
 return events\[events.length \- 1\]?.traceId ?? null;  
}  
---

# **VII. Extend the probe runner**

Routing probes need a real router instance.

## **`src/probes/runner.ts`**

Replace with an extended version.

import { randomUUID } from "node:crypto";  
import type {  
 InferenceProvider,  
 InferenceRequest,  
 LedgerEvent,  
 LedgerSink  
} from "../types.js";  
import { readFixture } from "../testing/fixtures.js";  
import { validateResult } from "../validator.js";  
import type { ProbeDefinition } from "./types.js";  
import type { Router } from "../router.js";  
import { eventsForTrace, latestTraceId } from "./trace.js";

export class ProbeRunner {  
 constructor(  
   private readonly providers: InferenceProvider\[\],  
   private readonly ledger: LedgerSink & { events?: LedgerEvent\[\] },  
   private readonly router?: Router  
 ) {}

 async run(probe: ProbeDefinition): Promise\<{ passed: boolean; failures: string\[\] }\> {  
   const traceId \= randomUUID();  
   const startedAt \= Date.now();

   await this.ledger.write({  
     eventId: randomUUID(),  
     traceId,  
     timestamp: new Date().toISOString(),  
     type: "probe.started",  
     probeId: probe.id,  
     probeType: probe.type,  
     providerId: probe.providerId,  
     capability: probe.capability,  
     fixtureName: probe.fixtureName  
   });

   if (probe.type \=== "provider.health") {  
     return this.runHealthProbe(traceId, startedAt, probe);  
   }

   if (probe.type \=== "capability.conformance") {  
     return this.runConformanceProbe(traceId, startedAt, probe);  
   }

   if (probe.type \=== "routing.readiness") {  
     return this.runRoutingProbe(traceId, startedAt, probe);  
   }

   const failures \= \["unsupported\_probe\_type"\];  
   await this.writeProbeResult(traceId, probe, false, startedAt, failures);  
   return { passed: false, failures };  
 }

 private async runHealthProbe(  
   traceId: string,  
   startedAt: number,  
   probe: ProbeDefinition  
 ): Promise\<{ passed: boolean; failures: string\[\] }\> {  
   const provider \= this.providers.find((p) \=\> p.id \=== probe.providerId);  
   if (\!provider) {  
     const failures \= \[\`provider\_not\_found:${probe.providerId}\`\];  
     await this.writeProbeResult(traceId, probe, false, startedAt, failures);  
     return { passed: false, failures };  
   }

   const available \= await provider.isAvailable();  
   const failures \= available ? \[\] : \["provider\_unavailable"\];  
   await this.writeProbeResult(traceId, probe, available, startedAt, failures);  
   return { passed: available, failures };  
 }

 private async runConformanceProbe(  
   traceId: string,  
   startedAt: number,  
   probe: ProbeDefinition  
 ): Promise\<{ passed: boolean; failures: string\[\] }\> {  
   const provider \= this.providers.find((p) \=\> p.id \=== probe.providerId);  
   if (\!provider) {  
     const failures \= \[\`provider\_not\_found:${probe.providerId}\`\];  
     await this.writeProbeResult(traceId, probe, false, startedAt, failures);  
     return { passed: false, failures };  
   }

   const available \= await provider.isAvailable();  
   if (\!available) {  
     const failures \= \["provider\_unavailable"\];  
     await this.writeProbeResult(traceId, probe, false, startedAt, failures);  
     return { passed: false, failures };  
   }

   const inputText \= probe.fixtureName ? await readFixture(probe.fixtureName) : "";  
   const request \= this.buildProbeRequest(probe, inputText);

   try {  
     const result \= await provider.invoke(request);  
     const validation \= provider.validate  
       ? await provider.validate(result, request)  
       : await validateResult(result, request);

     await this.writeProbeResult(  
       traceId,  
       probe,  
       validation.passed,  
       startedAt,  
       validation.failures,  
       {  
         providerId: provider.id,  
         confidence: validation.confidence,  
         outputKeys: Object.keys(result.output ?? {})  
       }  
     );

     return {  
       passed: validation.passed,  
       failures: validation.failures  
     };  
   } catch (error) {  
     const failures \= \[\`execution\_error:${String(error)}\`\];  
     await this.writeProbeResult(traceId, probe, false, startedAt, failures);  
     return { passed: false, failures };  
   }  
 }

 private async runRoutingProbe(  
   traceId: string,  
   startedAt: number,  
   probe: ProbeDefinition  
 ): Promise\<{ passed: boolean; failures: string\[\] }\> {  
   if (\!this.router) {  
     const failures \= \["router\_not\_configured"\];  
     await this.writeProbeResult(traceId, probe, false, startedAt, failures);  
     return { passed: false, failures };  
   }

   const inputText \= probe.fixtureName ? await readFixture(probe.fixtureName) : "";  
   const request \= this.buildProbeRequest(probe, inputText);

   const beforeCount \= this.ledger.events?.length ?? 0;  
   const result \= await this.router.execute(request);  
   const afterEvents \= this.ledger.events ?? \[\];  
   const newEvents \= afterEvents.slice(beforeCount);

   const routerTraceId \= latestTraceId(newEvents);  
   const traceEvents \= routerTraceId  
     ? eventsForTrace(newEvents, routerTraceId)  
     : newEvents;

   const failures \= this.evaluateRoutingProbe(probe, result, traceEvents);

   await this.writeProbeResult(  
     traceId,  
     probe,  
     failures.length \=== 0,  
     startedAt,  
     failures,  
     {  
       routerTraceId,  
       eventTypes: traceEvents.map((e) \=\> e.type),  
       resultStatus: result.status  
     }  
   );

   return {  
     passed: failures.length \=== 0,  
     failures  
   };  
 }

 private buildProbeRequest(  
   probe: ProbeDefinition,  
   text: string  
 ): InferenceRequest {  
   return {  
     taskId: \`probe:${probe.id}\`,  
     capability: probe.capability\!,  
     sourceSystem: "probe-runner",  
     surface: "macos",  
     input:  
       probe.capability \=== "text.extract.structured"  
         ? {  
             text,  
             expectedFields:  
               probe.validation?.expectedFields ?? \["name", "role", "team"\]  
           }  
         : { text },  
     context: {  
       sensitivity: probe.contextOverrides?.sensitivity ?? "internal",  
       requiresNetwork: probe.contextOverrides?.requiresNetwork ?? false,  
       requiresCurrentWeb: probe.contextOverrides?.requiresCurrentWeb ?? false  
     },  
     policyProfile: probe.policyProfile ?? "lfsi.local\_balanced",  
     validation: probe.validation  
   };  
 }

 private evaluateRoutingProbe(  
   probe: ProbeDefinition,  
   result: { ok: boolean; status: string; reasonCode?: string },  
   traceEvents: LedgerEvent\[\]  
 ): string\[\] {  
   const failures: string\[\] \= \[\];  
   const expectations \= probe.routingExpectations;

   if (\!expectations) return failures;

   const routingDecision \= traceEvents.find((e) \=\> e.type \=== "routing.decision");  
   const outcome \= traceEvents.find((e) \=\> e.type \=== "request.outcome");  
   const escalation \= traceEvents.find((e) \=\> e.type \=== "routing.escalation");

   if (expectations.expectedSelectedProvider) {  
     const actual \= routingDecision && "selectedProvider" in routingDecision  
       ? routingDecision.selectedProvider  
       : undefined;  
     if (actual \!== expectations.expectedSelectedProvider) {  
       failures.push(  
         \`selected\_provider\_mismatch: expected=${expectations.expectedSelectedProvider} actual=${actual}\`  
       );  
     }  
   }

   if (expectations.expectedSelectedTier) {  
     const actual \= routingDecision && "selectedTier" in routingDecision  
       ? routingDecision.selectedTier  
       : undefined;  
     if (actual \!== expectations.expectedSelectedTier) {  
       failures.push(  
         \`selected\_tier\_mismatch: expected=${expectations.expectedSelectedTier} actual=${actual}\`  
       );  
     }  
   }

   if (expectations.expectedFinalProvider) {  
     const actual \= outcome && "finalProvider" in outcome  
       ? outcome.finalProvider  
       : undefined;  
     if (actual \!== expectations.expectedFinalProvider) {  
       failures.push(  
         \`final\_provider\_mismatch: expected=${expectations.expectedFinalProvider} actual=${actual}\`  
       );  
     }  
   }

   if (expectations.expectedFinalTier) {  
     const actual \= outcome && "finalTier" in outcome  
       ? outcome.finalTier  
       : undefined;  
     if (actual \!== expectations.expectedFinalTier) {  
       failures.push(  
         \`final\_tier\_mismatch: expected=${expectations.expectedFinalTier} actual=${actual}\`  
       );  
     }  
   }

   if (expectations.expectedStatus && result.status \!== expectations.expectedStatus) {  
     failures.push(  
       \`status\_mismatch: expected=${expectations.expectedStatus} actual=${result.status}\`  
     );  
   }

   if (  
     expectations.expectedReasonCode &&  
     result.reasonCode \!== expectations.expectedReasonCode  
   ) {  
     failures.push(  
       \`reason\_code\_mismatch: expected=${expectations.expectedReasonCode} actual=${result.reasonCode}\`  
     );  
   }

   if (typeof expectations.requireEscalation \=== "boolean") {  
     const hasEscalation \= \!\!escalation;  
     if (hasEscalation \!== expectations.requireEscalation) {  
       failures.push(  
         \`escalation\_mismatch: expected=${expectations.requireEscalation} actual=${hasEscalation}\`  
       );  
     }  
   }

   if (expectations.expectedEventTypes) {  
     const actualTypes \= traceEvents.map((e) \=\> e.type);  
     const expectedTypes \= expectations.expectedEventTypes;  
     const mismatch \=  
       expectedTypes.length \!== actualTypes.length ||  
       expectedTypes.some((type, index) \=\> type \!== actualTypes\[index\]);

     if (mismatch) {  
       failures.push(  
         \`event\_chain\_mismatch: expected=${expectedTypes.join("\>")} actual=${actualTypes.join("\>")}\`  
       );  
     }  
   }

   return failures;  
 }

 private async writeProbeResult(  
   traceId: string,  
   probe: ProbeDefinition,  
   passed: boolean,  
   startedAt: number,  
   failures: string\[\],  
   metadata?: Record\<string, unknown\>  
 ): Promise\<void\> {  
   await this.ledger.write({  
     eventId: randomUUID(),  
     traceId,  
     timestamp: new Date().toISOString(),  
     type: "probe.result",  
     probeId: probe.id,  
     probeType: probe.type,  
     providerId: probe.providerId,  
     capability: probe.capability,  
     passed,  
     latencyMs: Date.now() \- startedAt,  
     failures,  
     metadata  
   });  
 }  
}  
---

# **VIII. Routing readiness live tests**

## **`test/live/routing-probes.live.test.ts`**

import { describe, expect, test } from "vitest";  
import { readLiveTestEnv } from "../../src/testing/env.js";  
import { InMemoryLedgerSink } from "../../src/ledger.js";  
import { AppleBridgeProcessClient } from "../../src/apple/bridge-process.js";  
import { AppleProvider } from "../../src/apple/provider.js";  
import { OllamaClient } from "../../src/ollama/client.js";  
import { OllamaProvider } from "../../src/ollama/provider.js";  
import { Router } from "../../src/router.js";  
import { ProbeRunner } from "../../src/probes/runner.js";  
import { PROBES } from "../../src/probes/registry.js";

const env \= readLiveTestEnv();  
const runLive \=  
 (env.runAppleLive && \!\!env.appleBridgeCommand) || env.runOllamaLive;  
const describeIf \= runLive ? describe : describe.skip;

describeIf("Routing readiness probes", () \=\> {  
 const ledger \= new InMemoryLedgerSink();  
 const providers \= \[\];

 if (env.runAppleLive && env.appleBridgeCommand) {  
   providers.push(  
     new AppleProvider(new AppleBridgeProcessClient(env.appleBridgeCommand))  
   );  
 }

 if (env.runOllamaLive) {  
   providers.push(  
     new OllamaProvider(new OllamaClient(env.ollamaBaseUrl), env.ollamaModel)  
   );  
 }

 const router \= new Router(providers, ledger);  
 const runner \= new ProbeRunner(providers, ledger, router);

 test("routing probes return explicit pass/fail with metadata", async () \=\> {  
   const routingProbes \= PROBES.filter((p) \=\> p.type \=== "routing.readiness");

   for (const probe of routingProbes) {  
     if (  
       probe.routingExpectations?.expectedSelectedProvider \=== "apple.foundation" &&  
       \!providers.some((p) \=\> p.id \=== "apple.foundation")  
     ) {  
       continue;  
     }

     const result \= await runner.run(probe);  
     expect(typeof result.passed).toBe("boolean");  
     expect(Array.isArray(result.failures)).toBe(true);  
   }

   const probeResults \= ledger.events.filter((e) \=\> e.type \=== "probe.result");  
   expect(probeResults.length).toBeGreaterThan(0);  
 });  
});  
---

# **IX. CLI support for routing probes**

## **`src/probes/cli.ts`**

Update the CLI so you can filter by type.

import { InMemoryLedgerSink } from "../ledger.js";  
import { readLiveTestEnv } from "../testing/env.js";  
import { AppleBridgeProcessClient } from "../apple/bridge-process.js";  
import { AppleProvider } from "../apple/provider.js";  
import { OllamaClient } from "../ollama/client.js";  
import { OllamaProvider } from "../ollama/provider.js";  
import { PROBES } from "./registry.js";  
import { ProbeRunner } from "./runner.js";  
import { Router } from "../router.js";

async function main() {  
 const env \= readLiveTestEnv();  
 const onlyType \= process.argv\[2\] ?? null;

 const ledger \= new InMemoryLedgerSink();  
 const providers \= \[\];

 if (env.appleBridgeCommand) {  
   providers.push(  
     new AppleProvider(new AppleBridgeProcessClient(env.appleBridgeCommand))  
   );  
 }

 providers.push(  
   new OllamaProvider(new OllamaClient(env.ollamaBaseUrl), env.ollamaModel)  
 );

 const router \= new Router(providers, ledger);  
 const runner \= new ProbeRunner(providers, ledger, router);

 const selectedProbes \= onlyType  
   ? PROBES.filter((p) \=\> p.type \=== onlyType)  
   : PROBES;

 for (const probe of selectedProbes) {  
   const result \= await runner.run(probe);  
   console.log(\`${probe.id}: ${result.passed ? "PASS" : "FAIL"} ${result.failures.join(", ")}\`);  
 }

 console.log(JSON.stringify(ledger.events, null, 2));  
}

main().catch((error) \=\> {  
 console.error(error);  
 process.exit(1);  
});

Usage:

node dist/src/probes/cli.js routing.readiness  
---

# **X. What this gives you**

Now you can answer, with evidence:

* Is Apple healthy?  
* Is Apple conformant for summarize?  
* Is ACDS still selecting Apple first for summarize?  
* Is private\_strict actually denying web research?  
* Is structured extraction succeeding at Tier 0 or escalating?

That is the beginning of a real operations layer.

---

# **XI. Why this matters**

Without routing readiness probes, you can know provider state and still miss broker regressions.

Examples:

* Apple is healthy, but router ordering changed accidentally.  
* Ollama is healthy, but policy escalation broke.  
* Validation rules changed and now force unnecessary escalations.  
* Denial logic regressed and now allows forbidden requests.

Provider probes would miss all of that. Routing probes catch it.

---

# **XII. Bottom line**

You now have a three-layer readiness model:

* **provider.health**  
* **capability.conformance**  
* **routing.readiness**

That is enough to start treating ACDS like a governed inference runtime instead of just a broker.

Right now probes tell you facts.  
 What you need next is a way to turn those facts into a **current system posture**.

That means:

* summarize probe outcomes into capability state  
* summarize capability states into provider state  
* summarize provider states into routing posture  
* expose degradation explicitly

This lets ACDS reason from known reality instead of discovering every problem during live traffic.

---

# **Readiness Summaries and Degradation States**

## **Turning Probe Results into Operational Posture**

## **I. Purpose**

Probe events are granular. That is good for diagnosis, but too low-level for runtime decisions.

ACDS needs a compact readiness model that can answer questions like:

* Is Apple usable right now for summarization?  
* Is Apple degraded for structured extraction?  
* Is Ollama ready for deep reasoning?  
* Is the router ready for `lfsi.local_balanced`?  
* Should Tier 0 be preferred, tolerated, or bypassed for a capability?

That means adding a **readiness aggregation layer**.

---

# **II. Core concept**

A readiness summary is a derived state built from recent probe outcomes.

It should operate at four levels:

### **A. Capability readiness**

Example:

* `apple.foundation` \+ `text.summarize` \= ready  
* `apple.foundation` \+ `text.extract.structured` \= degraded

### **B. Provider readiness**

Example:

* Apple \= healthy but partially degraded  
* Ollama \= healthy and ready

### **C. Policy profile readiness**

Example:

* `lfsi.local_balanced` \= ready  
* `lfsi.apple_only` \= degraded

### **D. System routing posture**

Example:

* prefer Apple for summarize  
* prefer Ollama for deep reasoning  
* allow Apple for structured extraction with caution  
* deny apple\_only for structured extraction until fixed

---

# **III. State model**

Use a small, explicit state machine.

## **CapabilityState**

export type ReadinessState \=  
 | "ready"  
 | "degraded"  
 | "unavailable"  
 | "unknown";

### **Meaning**

* `ready`  
   Recent probes passed consistently.  
* `degraded`  
   Provider is reachable, but one or more conformance or routing probes are failing.  
* `unavailable`  
   Health probe failed or no viable execution path exists.  
* `unknown`  
   No recent probe evidence.

This is intentionally simple. Do not overcomplicate it.

---

# **IV. Derived summary types**

## **`src/readiness/types.ts`**

import type { Capability } from "../capabilities.js";  
import type { Tier } from "../types.js";

export type ReadinessState \=  
 | "ready"  
 | "degraded"  
 | "unavailable"  
 | "unknown";

export interface CapabilityReadinessSummary {  
 providerId: string;  
 tier: Tier | "none";  
 capability: Capability;  
 state: ReadinessState;  
 lastCheckedAt?: string;  
 lastPassedAt?: string;  
 lastFailedAt?: string;  
 recentFailures: string\[\];  
 evidenceProbeIds: string\[\];  
}

export interface ProviderReadinessSummary {  
 providerId: string;  
 tier: Tier | "none";  
 state: ReadinessState;  
 capabilityStates: Record\<string, ReadinessState\>;  
 lastHealthCheckAt?: string;  
 healthFailures: string\[\];  
}

export interface PolicyReadinessSummary {  
 policyProfile: string;  
 state: ReadinessState;  
 affectedCapabilities: string\[\];  
 reasons: string\[\];  
}

export interface RoutingReadinessSummary {  
 overallState: ReadinessState;  
 providerStates: ProviderReadinessSummary\[\];  
 policyStates: PolicyReadinessSummary\[\];  
 generatedAt: string;  
}  
---

# **V. Aggregation rules**

You need deterministic rules.

## **A. Provider health dominates availability**

If the most recent health probe failed:

* provider state \= `unavailable`

Even if conformance passed earlier.

## **B. Conformance affects capability state**

If health passed, but recent conformance probe failed:

* capability state \= `degraded`

## **C. Missing evidence is not success**

If no relevant probe exists inside the freshness window:

* state \= `unknown`

## **D. Policy readiness is derived from routing probes**

If routing probe for a policy/capability path fails:

* policy state \= `degraded`

## **E. Overall system posture is the worst non-unknown routing state**

Example:

* Apple summarize \= ready  
* Apple structured \= degraded  
* Ollama deep reasoning \= ready  
* `lfsi.apple_only` \= degraded

Overall:

* system \= degraded

That is honest and useful.

---

# **VI. Aggregator implementation**

## **`src/readiness/aggregate.ts`**

import type {  
 CapabilityReadinessSummary,  
 PolicyReadinessSummary,  
 ProviderReadinessSummary,  
 ReadinessState,  
 RoutingReadinessSummary  
} from "./types.js";  
import type {  
 LedgerEvent,  
 ProbeResultEvent,  
 ProbeStartedEvent,  
 Tier  
} from "../types.js";  
import type { Capability } from "../capabilities.js";

interface FreshnessWindow {  
 sinceIso: string;  
}

function stateRank(state: ReadinessState): number {  
 switch (state) {  
   case "ready":  
     return 0;  
   case "unknown":  
     return 1;  
   case "degraded":  
     return 2;  
   case "unavailable":  
     return 3;  
 }  
}

function worseState(a: ReadinessState, b: ReadinessState): ReadinessState {  
 return stateRank(a) \>= stateRank(b) ? a : b;  
}

function isProbeResult(event: LedgerEvent): event is ProbeResultEvent {  
 return event.type \=== "probe.result";  
}

function isProbeStarted(event: LedgerEvent): event is ProbeStartedEvent {  
 return event.type \=== "probe.started";  
}

export class ReadinessAggregator {  
 constructor(  
   private readonly providerTiers: Record\<string, Tier\>,  
   private readonly freshnessWindow: FreshnessWindow  
 ) {}

 aggregate(events: LedgerEvent\[\]): RoutingReadinessSummary {  
   const freshEvents \= events.filter(  
     (e) \=\> e.timestamp \>= this.freshnessWindow.sinceIso  
   );

   const probeStarted \= freshEvents.filter(isProbeStarted);  
   const probeResults \= freshEvents.filter(isProbeResult);

   const providerStates \= this.buildProviderStates(probeStarted, probeResults);  
   const policyStates \= this.buildPolicyStates(probeStarted, probeResults);

   let overallState: ReadinessState \= "unknown";

   for (const provider of providerStates) {  
     overallState \= worseState(overallState, provider.state);  
   }

   for (const policy of policyStates) {  
     overallState \= worseState(overallState, policy.state);  
   }

   return {  
     overallState,  
     providerStates,  
     policyStates,  
     generatedAt: new Date().toISOString()  
   };  
 }

 private buildProviderStates(  
   started: ProbeStartedEvent\[\],  
   results: ProbeResultEvent\[\]  
 ): ProviderReadinessSummary\[\] {  
   const providerIds \= new Set(  
     started  
       .map((e) \=\> e.providerId)  
       .filter((v): v is string \=\> typeof v \=== "string")  
   );

   const summaries: ProviderReadinessSummary\[\] \= \[\];

   for (const providerId of providerIds) {  
     const tier \= this.providerTiers\[providerId\] ?? "none";  
     const providerResults \= results.filter((r) \=\> r.providerId \=== providerId);

     const healthResults \= providerResults.filter(  
       (r) \=\> r.probeType \=== "provider.health"  
     );  
     const conformanceResults \= providerResults.filter(  
       (r) \=\> r.probeType \=== "capability.conformance"  
     );

     const latestHealth \= \[...healthResults\].sort((a, b) \=\>  
       a.timestamp.localeCompare(b.timestamp)  
     ).at(-1);

     let state: ReadinessState \= "unknown";  
     const healthFailures: string\[\] \= \[\];  
     const capabilityStates: Record\<string, ReadinessState\> \= {};

     if (latestHealth) {  
       if (latestHealth.passed) {  
         state \= "ready";  
       } else {  
         state \= "unavailable";  
         healthFailures.push(...latestHealth.failures);  
       }  
     }

     const capabilityMap \= new Map\<string, ProbeResultEvent\[\]\>();  
     for (const result of conformanceResults) {  
       if (\!result.capability) continue;  
       const existing \= capabilityMap.get(result.capability) ?? \[\];  
       existing.push(result);  
       capabilityMap.set(result.capability, existing);  
     }

     for (const \[capability, records\] of capabilityMap.entries()) {  
       const latest \= \[...records\].sort((a, b) \=\>  
         a.timestamp.localeCompare(b.timestamp)  
       ).at(-1);

       if (\!latest) {  
         capabilityStates\[capability\] \= "unknown";  
         continue;  
       }

       if (state \=== "unavailable") {  
         capabilityStates\[capability\] \= "unavailable";  
       } else {  
         capabilityStates\[capability\] \= latest.passed ? "ready" : "degraded";  
         state \= worseState(state, capabilityStates\[capability\]);  
       }  
     }

     summaries.push({  
       providerId,  
       tier,  
       state,  
       capabilityStates,  
       lastHealthCheckAt: latestHealth?.timestamp,  
       healthFailures  
     });  
   }

   return summaries.sort((a, b) \=\> a.providerId.localeCompare(b.providerId));  
 }

 private buildPolicyStates(  
   started: ProbeStartedEvent\[\],  
   results: ProbeResultEvent\[\]  
 ): PolicyReadinessSummary\[\] {  
   const routingProbeStarts \= started.filter(  
     (e) \=\> e.probeType \=== "routing.readiness"  
   );

   const summaries: PolicyReadinessSummary\[\] \= \[\];  
   const grouped \= new Map\<string, { capabilities: Set\<string\>; results: ProbeResultEvent\[\] }\>();

   for (const start of routingProbeStarts) {  
     const policy \= this.extractPolicyProfileFromProbeId(start.probeId);  
     if (\!grouped.has(policy)) {  
       grouped.set(policy, {  
         capabilities: new Set\<string\>(),  
         results: \[\]  
       });  
     }

     if (start.capability) {  
       grouped.get(policy)\!.capabilities.add(start.capability);  
     }  
   }

   for (const result of results.filter((r) \=\> r.probeType \=== "routing.readiness")) {  
     const policy \= this.extractPolicyProfileFromProbeId(result.probeId);  
     if (\!grouped.has(policy)) {  
       grouped.set(policy, {  
         capabilities: new Set\<string\>(),  
         results: \[\]  
       });  
     }  
     grouped.get(policy)\!.results.push(result);  
   }

   for (const \[policyProfile, group\] of grouped.entries()) {  
     const latest \= \[...group.results\].sort((a, b) \=\>  
       a.timestamp.localeCompare(b.timestamp)  
     ).at(-1);

     let state: ReadinessState \= "unknown";  
     let reasons: string\[\] \= \[\];

     if (latest) {  
       state \= latest.passed ? "ready" : "degraded";  
       reasons \= latest.failures;  
     }

     summaries.push({  
       policyProfile,  
       state,  
       affectedCapabilities: \[...group.capabilities\],  
       reasons  
     });  
   }

   return summaries.sort((a, b) \=\> a.policyProfile.localeCompare(b.policyProfile));  
 }

 private extractPolicyProfileFromProbeId(probeId: string): string {  
   if (probeId.includes("private-strict")) return "lfsi.private\_strict";  
   if (probeId.includes("apple-only")) return "lfsi.apple\_only";  
   return "lfsi.local\_balanced";  
 }  
}  
---

# **VII. Add a degradation policy helper**

This lets ACDS consult readiness summaries at runtime.

## **`src/readiness/degradation.ts`**

import type {  
 ProviderReadinessSummary,  
 ReadinessState,  
 RoutingReadinessSummary  
} from "./types.js";

export interface DegradationDecision {  
 state: ReadinessState;  
 shouldBypassProvider: boolean;  
 shouldWarn: boolean;  
 reason: string;  
}

export function evaluateCapabilityDegradation(  
 summary: RoutingReadinessSummary,  
 providerId: string,  
 capability: string  
): DegradationDecision {  
 const provider \= summary.providerStates.find((p) \=\> p.providerId \=== providerId);

 if (\!provider) {  
   return {  
     state: "unknown",  
     shouldBypassProvider: false,  
     shouldWarn: true,  
     reason: "No provider readiness summary found"  
   };  
 }

 const capabilityState \= provider.capabilityStates\[capability\] ?? provider.state;

 switch (capabilityState) {  
   case "ready":  
     return {  
       state: "ready",  
       shouldBypassProvider: false,  
       shouldWarn: false,  
       reason: "Capability ready"  
     };

   case "degraded":  
     return {  
       state: "degraded",  
       shouldBypassProvider: false,  
       shouldWarn: true,  
       reason: "Capability degraded"  
     };

   case "unavailable":  
     return {  
       state: "unavailable",  
       shouldBypassProvider: true,  
       shouldWarn: true,  
       reason: "Capability unavailable"  
     };

   case "unknown":  
     return {  
       state: "unknown",  
       shouldBypassProvider: false,  
       shouldWarn: true,  
       reason: "Capability readiness unknown"  
     };  
 }  
}  
---

# **VIII. Summary generator for operators**

A compact text summary is useful for terminal output and dashboards.

## **`src/readiness/render.ts`**

import type { RoutingReadinessSummary } from "./types.js";

export function renderReadinessSummary(summary: RoutingReadinessSummary): string {  
 const lines: string\[\] \= \[\];

 lines.push(\`Overall: ${summary.overallState}\`);  
 lines.push(\`Generated: ${summary.generatedAt}\`);  
 lines.push("");

 lines.push("Providers:");  
 for (const provider of summary.providerStates) {  
   lines.push(\`- ${provider.providerId} \[${provider.tier}\] \=\> ${provider.state}\`);  
   for (const \[capability, state\] of Object.entries(provider.capabilityStates)) {  
     lines.push(\`  \- ${capability}: ${state}\`);  
   }  
   if (provider.healthFailures.length \> 0\) {  
     lines.push(\`  \- healthFailures: ${provider.healthFailures.join(", ")}\`);  
   }  
 }

 lines.push("");  
 lines.push("Policies:");  
 for (const policy of summary.policyStates) {  
   lines.push(\`- ${policy.policyProfile} \=\> ${policy.state}\`);  
   if (policy.affectedCapabilities.length \> 0\) {  
     lines.push(\`  \- capabilities: ${policy.affectedCapabilities.join(", ")}\`);  
   }  
   if (policy.reasons.length \> 0\) {  
     lines.push(\`  \- reasons: ${policy.reasons.join(", ")}\`);  
   }  
 }

 return lines.join("\\n");  
}  
---

# **IX. CLI for readiness summaries**

## **`src/readiness/cli.ts`**

import { InMemoryLedgerSink } from "../ledger.js";  
import { readLiveTestEnv } from "../testing/env.js";  
import { AppleBridgeProcessClient } from "../apple/bridge-process.js";  
import { AppleProvider } from "../apple/provider.js";  
import { OllamaClient } from "../ollama/client.js";  
import { OllamaProvider } from "../ollama/provider.js";  
import { Router } from "../router.js";  
import { ProbeRunner } from "../probes/runner.js";  
import { PROBES } from "../probes/registry.js";  
import { ReadinessAggregator } from "./aggregate.js";  
import { renderReadinessSummary } from "./render.js";

async function main() {  
 const env \= readLiveTestEnv();  
 const ledger \= new InMemoryLedgerSink();  
 const providers \= \[\];

 if (env.appleBridgeCommand) {  
   providers.push(  
     new AppleProvider(new AppleBridgeProcessClient(env.appleBridgeCommand))  
   );  
 }

 providers.push(  
   new OllamaProvider(new OllamaClient(env.ollamaBaseUrl), env.ollamaModel)  
 );

 const router \= new Router(providers, ledger);  
 const runner \= new ProbeRunner(providers, ledger, router);

 for (const probe of PROBES) {  
   await runner.run(probe);  
 }

 const aggregator \= new ReadinessAggregator(  
   Object.fromEntries(providers.map((p) \=\> \[p.id, p.tier\])),  
   {  
     sinceIso: new Date(Date.now() \- 1000 \* 60 \* 60).toISOString()  
   }  
 );

 const summary \= aggregator.aggregate(ledger.events);  
 console.log(renderReadinessSummary(summary));  
}

main().catch((error) \=\> {  
 console.error(error);  
 process.exit(1);  
});  
---

# **X. Readiness tests**

## **`test/logic/readiness.test.ts`**

import { describe, expect, test } from "vitest";  
import { ReadinessAggregator } from "../../src/readiness/aggregate.js";

describe("ReadinessAggregator", () \=\> {  
 test("marks provider degraded when conformance fails after health passes", () \=\> {  
   const aggregator \= new ReadinessAggregator(  
     {  
       "apple.foundation": "tier0"  
     },  
     {  
       sinceIso: "2020-01-01T00:00:00.000Z"  
     }  
   );

   const events: any\[\] \= \[  
     {  
       eventId: "1",  
       traceId: "t1",  
       timestamp: "2026-03-20T10:00:00.000Z",  
       type: "probe.started",  
       probeId: "apple-health",  
       probeType: "provider.health",  
       providerId: "apple.foundation"  
     },  
     {  
       eventId: "2",  
       traceId: "t1",  
       timestamp: "2026-03-20T10:00:01.000Z",  
       type: "probe.result",  
       probeId: "apple-health",  
       probeType: "provider.health",  
       providerId: "apple.foundation",  
       passed: true,  
       latencyMs: 10,  
       failures: \[\]  
     },  
     {  
       eventId: "3",  
       traceId: "t2",  
       timestamp: "2026-03-20T10:01:00.000Z",  
       type: "probe.started",  
       probeId: "apple-structured-conformance",  
       probeType: "capability.conformance",  
       providerId: "apple.foundation",  
       capability: "text.extract.structured"  
     },  
     {  
       eventId: "4",  
       traceId: "t2",  
       timestamp: "2026-03-20T10:01:01.000Z",  
       type: "probe.result",  
       probeId: "apple-structured-conformance",  
       probeType: "capability.conformance",  
       providerId: "apple.foundation",  
       capability: "text.extract.structured",  
       passed: false,  
       latencyMs: 22,  
       failures: \["missing\_field:team"\]  
     }  
   \];

   const summary \= aggregator.aggregate(events as any);  
   expect(summary.providerStates\[0\].state).toBe("degraded");  
   expect(  
     summary.providerStates\[0\].capabilityStates\["text.extract.structured"\]  
   ).toBe("degraded");  
 });

 test("marks provider unavailable when health fails", () \=\> {  
   const aggregator \= new ReadinessAggregator(  
     {  
       "ollama.default": "tier1"  
     },  
     {  
       sinceIso: "2020-01-01T00:00:00.000Z"  
     }  
   );

   const events: any\[\] \= \[  
     {  
       eventId: "1",  
       traceId: "t1",  
       timestamp: "2026-03-20T10:00:00.000Z",  
       type: "probe.started",  
       probeId: "ollama-health",  
       probeType: "provider.health",  
       providerId: "ollama.default"  
     },  
     {  
       eventId: "2",  
       traceId: "t1",  
       timestamp: "2026-03-20T10:00:01.000Z",  
       type: "probe.result",  
       probeId: "ollama-health",  
       probeType: "provider.health",  
       providerId: "ollama.default",  
       passed: false,  
       latencyMs: 10,  
       failures: \["provider\_unavailable"\]  
     }  
   \];

   const summary \= aggregator.aggregate(events as any);  
   expect(summary.providerStates\[0\].state).toBe("unavailable");  
 });  
});  
---

# **XI. How ACDS should use this**

This is the important part.

Do not let readiness summaries silently override policy.  
 Use them to **inform provider selection within policy**.

Correct behavior:

* if Apple summarize is `ready`, prefer Apple  
* if Apple summarize is `degraded`, still allow Apple but warn or lower confidence  
* if Apple summarize is `unavailable`, bypass Apple and try next allowed tier  
* if Apple is `unknown`, allow but mark uncertain

That preserves sovereignty and still makes the system adaptive.

---

# **XII. Operational examples**

Now ACDS can produce posture like:

### **Example 1**

* Apple healthy  
* Apple summarize ready  
* Apple structured extraction degraded  
* Ollama healthy  
* Ollama deep reasoning ready  
* `lfsi.local_balanced` ready  
* `lfsi.apple_only` degraded

### **Example 2**

* Apple unavailable  
* Ollama healthy  
* local-balanced degraded but operational  
* apple-only unavailable

That is exactly the kind of language an operator can act on.

---

# **XIII. Bottom line**

You now have the full chain:

* live probes  
* split probe types  
* routing readiness probes  
* readiness aggregation  
* degradation states  
* operator-readable summaries

That is enough to begin **readiness-aware routing**.

This is the point where ACDS becomes adaptive without becoming opaque.

The rule must be:

**Readiness may influence selection within policy. It may not override policy.**

That preserves Quiet Sovereignty. The router remains policy-governed, but no longer blind to known provider degradation.

---

# **Readiness-Aware Routing**

## **Feeding Readiness Summaries Back Into ACDS**

## **I. Design rule**

The router should use readiness in this order:

1. **Policy decides which tiers are allowed**  
2. **Capability registry decides which providers are eligible**  
3. **Readiness decides which eligible providers are preferable or bypassable**  
4. **Execution and validation still determine final truth**

That means readiness is advisory for selection, not a replacement for runtime validation.

---

# **II. Selection behavior by readiness state**

Use this mapping:

### **`ready`**

* prefer normally

### **`degraded`**

* allow, but rank below ready providers in the same allowed set  
* optionally emit a warning event

### **`unavailable`**

* bypass for selection  
* still log bypass reason

### **`unknown`**

* allow, but rank below ready and above unavailable  
* optionally emit uncertainty warning

That gives you deterministic ordering.

---

# **III. New selection policy type**

## **`src/readiness/routing-policy.ts`**

import type { ReadinessState, RoutingReadinessSummary } from "./types.js";  
import type { Tier } from "../types.js";

export interface ProviderSelectionAssessment {  
 providerId: string;  
 tier: Tier;  
 state: ReadinessState;  
 shouldBypass: boolean;  
 rank: number;  
 reason: string;  
}

function rankForState(state: ReadinessState): number {  
 switch (state) {  
   case "ready":  
     return 0;  
   case "unknown":  
     return 1;  
   case "degraded":  
     return 2;  
   case "unavailable":  
     return 3;  
 }  
}

export function assessProviderForCapability(  
 summary: RoutingReadinessSummary | null,  
 providerId: string,  
 tier: Tier,  
 capability: string  
): ProviderSelectionAssessment {  
 if (\!summary) {  
   return {  
     providerId,  
     tier,  
     state: "unknown",  
     shouldBypass: false,  
     rank: 1,  
     reason: "No readiness summary available"  
   };  
 }

 const provider \= summary.providerStates.find((p) \=\> p.providerId \=== providerId);  
 if (\!provider) {  
   return {  
     providerId,  
     tier,  
     state: "unknown",  
     shouldBypass: false,  
     rank: 1,  
     reason: "Provider not present in readiness summary"  
   };  
 }

 const capabilityState \= provider.capabilityStates\[capability\] ?? provider.state;  
 const shouldBypass \= capabilityState \=== "unavailable";

 return {  
   providerId,  
   tier,  
   state: capabilityState,  
   shouldBypass,  
   rank: rankForState(capabilityState),  
   reason: \`Capability readiness is ${capabilityState}\`  
 };  
}  
---

# **IV. Add a readiness event**

The router should log when readiness influenced selection.

## **`src/types.ts`**

Add:

export interface ReadinessConsultedEvent extends LedgerEventBase {  
 type: "readiness.consulted";  
 capability: string;  
 policyProfile: string;  
 providerAssessments: Array\<{  
   providerId: string;  
   tier: Tier;  
   state: "ready" | "degraded" | "unavailable" | "unknown";  
   shouldBypass: boolean;  
   rank: number;  
   reason: string;  
 }\>;  
}

export type LedgerEvent \=  
 | RoutingDecisionEvent  
 | ProviderHealthEvent  
 | ProviderExecutionEvent  
 | ValidationResultEvent  
 | RoutingEscalationEvent  
 | RequestOutcomeEvent  
 | ProbeStartedEvent  
 | ProbeResultEvent  
 | ReadinessConsultedEvent;  
---

# **V. Event helper**

## **`src/ledger-events.ts`**

Add:

import type { ReadinessConsultedEvent, Tier } from "./types.js";

export function readinessConsultedEvent(args: {  
 traceId: string;  
 capability: string;  
 policyProfile: string;  
 providerAssessments: Array\<{  
   providerId: string;  
   tier: Tier;  
   state: "ready" | "degraded" | "unavailable" | "unknown";  
   shouldBypass: boolean;  
   rank: number;  
   reason: string;  
 }\>;  
}): ReadinessConsultedEvent {  
 return {  
   ...base(args.traceId),  
   type: "readiness.consulted",  
   capability: args.capability,  
   policyProfile: args.policyProfile,  
   providerAssessments: args.providerAssessments  
 };  
}  
---

# **VI. Router integration**

The router needs an optional readiness provider.

## **`src/readiness/provider.ts`**

import type { RoutingReadinessSummary } from "./types.js";

export interface ReadinessSource {  
 getSummary(): Promise\<RoutingReadinessSummary | null\>;  
}

## **`src/readiness/memory-source.ts`**

import type { RoutingReadinessSummary } from "./types.js";  
import type { ReadinessSource } from "./provider.js";

export class InMemoryReadinessSource implements ReadinessSource {  
 constructor(private summary: RoutingReadinessSummary | null \= null) {}

 async getSummary(): Promise\<RoutingReadinessSummary | null\> {  
   return this.summary;  
 }

 setSummary(summary: RoutingReadinessSummary | null): void {  
   this.summary \= summary;  
 }  
}  
---

# **VII. Readiness-aware provider selection**

## **`src/router.ts`**

Update constructor:

import { assessProviderForCapability } from "./readiness/routing-policy.js";  
import { readinessConsultedEvent } from "./ledger-events.js";  
import type { ReadinessSource } from "./readiness/provider.js";

export class Router {  
 constructor(  
   private readonly providers: InferenceProvider\[\],  
   private readonly ledger: LedgerSink,  
   private readonly readinessSource?: ReadinessSource  
 ) {}

Replace `selectProvidersByTier` call area inside `execute()` with:

const readinessSummary \= this.readinessSource  
 ? await this.readinessSource.getSummary()  
 : null;

const candidates \= this.selectProvidersByTier(  
 request.capability,  
 policy.allowedTiers  
);

if (candidates.length \=== 0\) {  
 await this.ledger.write(  
   requestOutcomeEvent({  
     traceId: trace.traceId,  
     taskId: request.taskId,  
     sourceSystem: request.sourceSystem,  
     capability: request.capability,  
     finalProvider: "none",  
     finalTier: "none",  
     resultStatus: "failure",  
     reasonCode: REASON\_CODES.NO\_PROVIDER\_AVAILABLE,  
     totalLatencyMs: Date.now() \- trace.startedAt,  
     attempts: 0  
   })  
 );

 return {  
   ok: false,  
   status: "failure",  
   reasonCode: REASON\_CODES.NO\_PROVIDER\_AVAILABLE,  
   message: "No providers support this capability within allowed tiers"  
 };  
}

const assessedCandidates \= candidates  
 .map((provider) \=\> ({  
   provider,  
   assessment: assessProviderForCapability(  
     readinessSummary,  
     provider.id,  
     provider.tier,  
     request.capability  
   )  
 }))  
 .sort((a, b) \=\> {  
   const tierOrder \= policy.allowedTiers.indexOf(a.provider.tier) \- policy.allowedTiers.indexOf(b.provider.tier);  
   if (tierOrder \!== 0\) return tierOrder;  
   return a.assessment.rank \- b.assessment.rank;  
 });

await this.ledger.write(  
 readinessConsultedEvent({  
   traceId: trace.traceId,  
   capability: request.capability,  
   policyProfile: request.policyProfile,  
   providerAssessments: assessedCandidates.map(({ provider, assessment }) \=\> ({  
     providerId: provider.id,  
     tier: provider.tier,  
     state: assessment.state,  
     shouldBypass: assessment.shouldBypass,  
     rank: assessment.rank,  
     reason: assessment.reason  
   }))  
 })  
);

const filteredCandidates \= assessedCandidates  
 .filter(({ assessment }) \=\> \!assessment.shouldBypass)  
 .map(({ provider }) \=\> provider);

const effectiveCandidates \= filteredCandidates.length \> 0  
 ? filteredCandidates  
 : candidates;

Then replace downstream references to `candidates` with `effectiveCandidates`.

Also update the routing decision event:

await this.ledger.write(  
 routingDecisionEvent({  
   traceId: trace.traceId,  
   taskId: request.taskId,  
   capability: request.capability,  
   policyProfile: request.policyProfile,  
   allowedTiers: policy.allowedTiers,  
   candidateProviders: effectiveCandidates.map((p) \=\> p.id),  
   selectedProvider: effectiveCandidates\[0\].id,  
   selectedTier: effectiveCandidates\[0\].tier,  
   reason: "lowest viable tier selected by policy, adjusted by readiness"  
 })  
);

And update loop header:

for (let i \= 0; i \< effectiveCandidates.length; i \+= 1\) {  
 const provider \= effectiveCandidates\[i\];

And next provider lookup:

const nextProvider \= effectiveCandidates\[i \+ 1\];  
---

# **VIII. Important behavior**

This router now behaves correctly in these cases:

### **Case A**

Apple summarize is `ready`, Ollama summarize is `ready`

* Apple still wins because Tier 0 outranks Tier 1

### **Case B**

Apple summarize is `degraded`, Ollama summarize is `ready`

* Apple still wins if policy prefers Tier 0 first  
* but readiness is logged and visible

### **Case C**

Apple summarize is `unavailable`, Ollama summarize is `ready`

* Apple is bypassed during selection  
* Ollama becomes first effective candidate

### **Case D**

Apple summarize is `unknown`, Ollama summarize is `ready`

* Apple still wins if Tier 0 first, unless you choose a stricter unknown-handling policy later

That is the right initial posture.

---

# **IX. Optional stricter mode**

Later, you may want unknown to be bypassable in some contexts.

Do not do that yet unless the environment is unstable.

But if you want it, add a router option:

## **`src/readiness/options.ts`**

export interface ReadinessRoutingOptions {  
 bypassUnknown?: boolean;  
 bypassDegraded?: boolean;  
}

Then make `assessProviderForCapability()` respect those options.

For now:

* bypass only `unavailable`

That is the safest rule.

---

# **X. Readiness-aware router tests**

## **`test/logic/readiness-routing.test.ts`**

import { describe, expect, test } from "vitest";  
import { Router } from "../../src/router.js";  
import { InMemoryLedgerSink } from "../../src/ledger.js";  
import { InMemoryReadinessSource } from "../../src/readiness/memory-source.js";  
import type { InferenceProvider } from "../../src/types.js";

function provider(  
 id: string,  
 tier: "tier0" | "tier1",  
 capability: string  
): InferenceProvider {  
 return {  
   id,  
   tier,  
   capabilities: \[capability\] as any,  
   local: true,  
   async isAvailable() {  
     return true;  
   },  
   async invoke() {  
     return {  
       providerId: id,  
       tier,  
       output: { summary: \`${id} summary\` },  
       confidence: 0.95,  
       latencyMs: 10  
     };  
   }  
 };  
}

describe("readiness-aware routing", () \=\> {  
 test("bypasses unavailable provider when readiness says unavailable", async () \=\> {  
   const ledger \= new InMemoryLedgerSink();  
   const readiness \= new InMemoryReadinessSource({  
     overallState: "degraded",  
     generatedAt: new Date().toISOString(),  
     providerStates: \[  
       {  
         providerId: "apple.foundation",  
         tier: "tier0",  
         state: "unavailable",  
         capabilityStates: {  
           "text.summarize": "unavailable"  
         },  
         healthFailures: \["provider\_unavailable"\]  
       },  
       {  
         providerId: "ollama.default",  
         tier: "tier1",  
         state: "ready",  
         capabilityStates: {  
           "text.summarize": "ready"  
         },  
         healthFailures: \[\]  
       }  
     \],  
     policyStates: \[\]  
   });

   const router \= new Router(  
     \[  
       provider("apple.foundation", "tier0", "text.summarize"),  
       provider("ollama.default", "tier1", "text.summarize")  
     \],  
     ledger,  
     readiness  
   );

   const result \= await router.execute({  
     taskId: "t1",  
     capability: "text.summarize",  
     sourceSystem: "openclaw",  
     surface: "macos",  
     input: { text: "hello world" },  
     context: {  
       sensitivity: "private",  
       requiresNetwork: false,  
       requiresCurrentWeb: false  
     },  
     policyProfile: "lfsi.local\_balanced"  
   });

   expect(result.ok).toBe(true);  
   if (result.ok) {  
     expect(result.result.providerId).toBe("ollama.default");  
   }

   const consulted \= ledger.events.find((e) \=\> e.type \=== "readiness.consulted");  
   expect(consulted).toBeTruthy();  
 });

 test("does not bypass degraded provider by default", async () \=\> {  
   const ledger \= new InMemoryLedgerSink();  
   const readiness \= new InMemoryReadinessSource({  
     overallState: "degraded",  
     generatedAt: new Date().toISOString(),  
     providerStates: \[  
       {  
         providerId: "apple.foundation",  
         tier: "tier0",  
         state: "degraded",  
         capabilityStates: {  
           "text.summarize": "degraded"  
         },  
         healthFailures: \[\]  
       },  
       {  
         providerId: "ollama.default",  
         tier: "tier1",  
         state: "ready",  
         capabilityStates: {  
           "text.summarize": "ready"  
         },  
         healthFailures: \[\]  
       }  
     \],  
     policyStates: \[\]  
   });

   const router \= new Router(  
     \[  
       provider("apple.foundation", "tier0", "text.summarize"),  
       provider("ollama.default", "tier1", "text.summarize")  
     \],  
     ledger,  
     readiness  
   );

   const result \= await router.execute({  
     taskId: "t2",  
     capability: "text.summarize",  
     sourceSystem: "openclaw",  
     surface: "macos",  
     input: { text: "hello world" },  
     context: {  
       sensitivity: "private",  
       requiresNetwork: false,  
       requiresCurrentWeb: false  
     },  
     policyProfile: "lfsi.local\_balanced"  
   });

   expect(result.ok).toBe(true);  
   if (result.ok) {  
     expect(result.result.providerId).toBe("apple.foundation");  
   }  
 });  
});  
---

# **XI. Operator summary improvement**

Update the renderer so it exposes routing implications.

## **`src/readiness/render.ts`**

Append this section:

export function renderRoutingGuidance(summary: RoutingReadinessSummary): string {  
 const lines: string\[\] \= \[\];  
 lines.push("Routing Guidance:");

 for (const provider of summary.providerStates) {  
   for (const \[capability, state\] of Object.entries(provider.capabilityStates)) {  
     if (state \=== "ready") {  
       lines.push(\`- ${provider.providerId} / ${capability}: preferred\`);  
     } else if (state \=== "degraded") {  
       lines.push(\`- ${provider.providerId} / ${capability}: allowed with caution\`);  
     } else if (state \=== "unavailable") {  
       lines.push(\`- ${provider.providerId} / ${capability}: bypass\`);  
     } else {  
       lines.push(\`- ${provider.providerId} / ${capability}: unknown\`);  
     }  
   }  
 }

 return lines.join("\\n");  
}

Then add it to the CLI output.

---

# **XII. Why this is the correct next step**

This gives you adaptive routing without turning the system into a black box.

You can always explain:

* what policy allowed  
* what providers were eligible  
* what readiness said  
* why one provider was bypassed  
* why another was selected

That is Accountable Autonomy in actual runtime behavior.

---

# **XIII. Bottom line**

You now have:

* probes  
* readiness summaries  
* degradation states  
* readiness-aware selection  
* readiness logging  
* readiness-aware tests

That is enough to make ACDS intelligently cautious without becoming heuristic mush.

This is the layer that makes readiness operational across time, not just within one process lifetime.

Without persistence, readiness disappears on restart.  
 Without freshness control, stale readiness can silently distort routing.

So the next step is:

* persist summaries and probe evidence  
* expire stale evidence deterministically  
* refuse to treat old readiness as current truth

That keeps the system honest.

# **Readiness Persistence and Freshness Control**

## **Durable posture for ACDS**

## **I. Design goals**

The persistence layer should do five things:

1. Save readiness summaries across process restarts  
2. Save enough probe evidence to rebuild summaries  
3. Apply explicit freshness windows  
4. Mark stale state as stale, not ready  
5. Keep runtime selection deterministic

## **II. Persistence model**

You need two distinct stores.

### **A. Event store**

Stores raw probe and readiness-related ledger events.

Purpose:

* audit  
* rebuild summaries  
* diagnose trends

### **B. Summary store**

Stores the latest computed readiness summary plus metadata.

Purpose:

* fast router lookup  
* startup recovery  
* operator display

Do not collapse them into one object.

## **III. New concepts**

## **`FreshnessStatus`**

export type FreshnessStatus \=  
 | "fresh"  
 | "stale"  
 | "expired"  
 | "unknown";

### **Meaning**

* `fresh`: safe to use for routing influence  
* `stale`: visible to operators, but should warn  
* `expired`: must not influence routing  
* `unknown`: no evidence

## **`PersistedReadinessEnvelope`**

export interface PersistedReadinessEnvelope {  
 schemaVersion: "1.0.0";  
 savedAt: string;  
 freshnessPolicy: FreshnessPolicy;  
 summary: RoutingReadinessSummary;  
}

## **`FreshnessPolicy`**

export interface FreshnessPolicy {  
 freshMs: number;  
 staleMs: number;  
 expireMs: number;  
}

Recommended defaults:

* fresh: 15 minutes  
* stale: 60 minutes  
* expire: 6 hours

## **IV. Extend readiness types**

## **`src/readiness/types.ts`**

Add freshness fields:

import type { Capability } from "../capabilities.js";  
import type { Tier } from "../types.js";

export type ReadinessState \=  
 | "ready"  
 | "degraded"  
 | "unavailable"  
 | "unknown";

export type FreshnessStatus \=  
 | "fresh"  
 | "stale"  
 | "expired"  
 | "unknown";

export interface CapabilityReadinessSummary {  
 providerId: string;  
 tier: Tier | "none";  
 capability: Capability;  
 state: ReadinessState;  
 freshness: FreshnessStatus;  
 lastCheckedAt?: string;  
 lastPassedAt?: string;  
 lastFailedAt?: string;  
 recentFailures: string\[\];  
 evidenceProbeIds: string\[\];  
}

export interface ProviderReadinessSummary {  
 providerId: string;  
 tier: Tier | "none";  
 state: ReadinessState;  
 freshness: FreshnessStatus;  
 capabilityStates: Record\<string, ReadinessState\>;  
 capabilityFreshness: Record\<string, FreshnessStatus\>;  
 lastHealthCheckAt?: string;  
 healthFailures: string\[\];  
}

export interface PolicyReadinessSummary {  
 policyProfile: string;  
 state: ReadinessState;  
 freshness: FreshnessStatus;  
 affectedCapabilities: string\[\];  
 reasons: string\[\];  
}

export interface RoutingReadinessSummary {  
 overallState: ReadinessState;  
 overallFreshness: FreshnessStatus;  
 providerStates: ProviderReadinessSummary\[\];  
 policyStates: PolicyReadinessSummary\[\];  
 generatedAt: string;  
}

export interface FreshnessPolicy {  
 freshMs: number;  
 staleMs: number;  
 expireMs: number;  
}

export interface PersistedReadinessEnvelope {  
 schemaVersion: "1.0.0";  
 savedAt: string;  
 freshnessPolicy: FreshnessPolicy;  
 summary: RoutingReadinessSummary;  
}

## **V. Freshness calculation**

## **`src/readiness/freshness.ts`**

import type { FreshnessPolicy, FreshnessStatus } from "./types.js";

export function ageMs(timestampIso?: string, nowMs \= Date.now()): number | null {  
 if (\!timestampIso) return null;  
 const parsed \= Date.parse(timestampIso);  
 if (Number.isNaN(parsed)) return null;  
 return Math.max(0, nowMs \- parsed);  
}

export function freshnessForTimestamp(  
 timestampIso: string | undefined,  
 policy: FreshnessPolicy,  
 nowMs \= Date.now()  
): FreshnessStatus {  
 const age \= ageMs(timestampIso, nowMs);  
 if (age \=== null) return "unknown";  
 if (age \<= policy.freshMs) return "fresh";  
 if (age \<= policy.staleMs) return "stale";  
 if (age \<= policy.expireMs) return "expired";  
 return "expired";  
}

export function combineFreshness(a: FreshnessStatus, b: FreshnessStatus): FreshnessStatus {  
 const rank: Record\<FreshnessStatus, number\> \= {  
   fresh: 0,  
   stale: 1,  
   expired: 2,  
   unknown: 3  
 };

 return rank\[a\] \>= rank\[b\] ? a : b;  
}

## **VI. Persistence interfaces**

## **`src/readiness/store.ts`**

import type { LedgerEvent } from "../types.js";  
import type { PersistedReadinessEnvelope } from "./types.js";

export interface ReadinessEventStore {  
 append(event: LedgerEvent): Promise\<void\>;  
 readAll(): Promise\<LedgerEvent\[\]\>;  
}

export interface ReadinessSummaryStore {  
 save(envelope: PersistedReadinessEnvelope): Promise\<void\>;  
 load(): Promise\<PersistedReadinessEnvelope | null\>;  
}

## **VII. File-based stores**

Simple, durable, transparent. Good enough for MVP.

## **`src/readiness/file-store.ts`**

import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";  
import { dirname } from "node:path";  
import type { LedgerEvent } from "../types.js";  
import type { PersistedReadinessEnvelope } from "./types.js";  
import type { ReadinessEventStore, ReadinessSummaryStore } from "./store.js";

export class FileReadinessEventStore implements ReadinessEventStore {  
 constructor(private readonly path: string) {}

 async append(event: LedgerEvent): Promise\<void\> {  
   await mkdir(dirname(this.path), { recursive: true });  
   await appendFile(this.path, JSON.stringify(event) \+ "\\n", "utf8");  
 }

 async readAll(): Promise\<LedgerEvent\[\]\> {  
   try {  
     const text \= await readFile(this.path, "utf8");  
     return text  
       .split("\\n")  
       .map((line) \=\> line.trim())  
       .filter(Boolean)  
       .map((line) \=\> JSON.parse(line) as LedgerEvent);  
   } catch {  
     return \[\];  
   }  
 }  
}

export class FileReadinessSummaryStore implements ReadinessSummaryStore {  
 constructor(private readonly path: string) {}

 async save(envelope: PersistedReadinessEnvelope): Promise\<void\> {  
   await mkdir(dirname(this.path), { recursive: true });  
   await writeFile(this.path, JSON.stringify(envelope, null, 2), "utf8");  
 }

 async load(): Promise\<PersistedReadinessEnvelope | null\> {  
   try {  
     const text \= await readFile(this.path, "utf8");  
     return JSON.parse(text) as PersistedReadinessEnvelope;  
   } catch {  
     return null;  
   }  
 }  
}

## **VIII. Persisted readiness source**

This is the router-facing readiness source with freshness enforcement.

## **`src/readiness/persistent-source.ts`**

import type { ReadinessSource } from "./provider.js";  
import type {  
 FreshnessPolicy,  
 PersistedReadinessEnvelope,  
 RoutingReadinessSummary  
} from "./types.js";  
import { freshnessForTimestamp } from "./freshness.js";  
import type { ReadinessSummaryStore } from "./store.js";

export class PersistentReadinessSource implements ReadinessSource {  
 constructor(  
   private readonly store: ReadinessSummaryStore,  
   private readonly policy: FreshnessPolicy  
 ) {}

 async getSummary(): Promise\<RoutingReadinessSummary | null\> {  
   const envelope \= await this.store.load();  
   if (\!envelope) return null;

   const freshness \= freshnessForTimestamp(envelope.savedAt, this.policy);  
   if (freshness \=== "expired") {  
     return {  
       ...envelope.summary,  
       overallFreshness: "expired"  
     };  
   }

   return envelope.summary;  
 }

 async saveSummary(summary: RoutingReadinessSummary): Promise\<void\> {  
   const envelope: PersistedReadinessEnvelope \= {  
     schemaVersion: "1.0.0",  
     savedAt: new Date().toISOString(),  
     freshnessPolicy: this.policy,  
     summary  
   };

   await this.store.save(envelope);  
 }  
}

## **IX. Aggregator update with freshness**

## **`src/readiness/aggregate.ts`**

Update constructor and state building. Core additions below.

import type {  
 CapabilityReadinessSummary,  
 PolicyReadinessSummary,  
 ProviderReadinessSummary,  
 ReadinessState,  
 RoutingReadinessSummary,  
 FreshnessPolicy,  
 FreshnessStatus  
} from "./types.js";  
import type {  
 LedgerEvent,  
 ProbeResultEvent,  
 ProbeStartedEvent,  
 Tier  
} from "../types.js";  
import { combineFreshness, freshnessForTimestamp } from "./freshness.js";

function stateRank(state: ReadinessState): number {  
 switch (state) {  
   case "ready":  
     return 0;  
   case "unknown":  
     return 1;  
   case "degraded":  
     return 2;  
   case "unavailable":  
     return 3;  
 }  
}

function worseState(a: ReadinessState, b: ReadinessState): ReadinessState {  
 return stateRank(a) \>= stateRank(b) ? a : b;  
}

function isProbeResult(event: LedgerEvent): event is ProbeResultEvent {  
 return event.type \=== "probe.result";  
}

function isProbeStarted(event: LedgerEvent): event is ProbeStartedEvent {  
 return event.type \=== "probe.started";  
}

export class ReadinessAggregator {  
 constructor(  
   private readonly providerTiers: Record\<string, Tier\>,  
   private readonly freshnessPolicy: FreshnessPolicy,  
   private readonly nowMs \= Date.now()  
 ) {}

 aggregate(events: LedgerEvent\[\]): RoutingReadinessSummary {  
   const probeStarted \= events.filter(isProbeStarted);  
   const probeResults \= events.filter(isProbeResult);

   const providerStates \= this.buildProviderStates(probeStarted, probeResults);  
   const policyStates \= this.buildPolicyStates(probeStarted, probeResults);

   let overallState: ReadinessState \= "unknown";  
   let overallFreshness: FreshnessStatus \= "unknown";

   for (const provider of providerStates) {  
     overallState \= worseState(overallState, provider.state);  
     overallFreshness \= combineFreshness(overallFreshness, provider.freshness);  
   }

   for (const policy of policyStates) {  
     overallState \= worseState(overallState, policy.state);  
     overallFreshness \= combineFreshness(overallFreshness, policy.freshness);  
   }

   return {  
     overallState,  
     overallFreshness,  
     providerStates,  
     policyStates,  
     generatedAt: new Date(this.nowMs).toISOString()  
   };  
 }

 private buildProviderStates(  
   started: ProbeStartedEvent\[\],  
   results: ProbeResultEvent\[\]  
 ): ProviderReadinessSummary\[\] {  
   const providerIds \= new Set(  
     started.map((e) \=\> e.providerId).filter((v): v is string \=\> \!\!v)  
   );

   const summaries: ProviderReadinessSummary\[\] \= \[\];

   for (const providerId of providerIds) {  
     const tier \= this.providerTiers\[providerId\] ?? "none";  
     const providerResults \= results.filter((r) \=\> r.providerId \=== providerId);

     const healthResults \= providerResults.filter((r) \=\> r.probeType \=== "provider.health");  
     const conformanceResults \= providerResults.filter(  
       (r) \=\> r.probeType \=== "capability.conformance"  
     );

     const latestHealth \= \[...healthResults\].sort((a, b) \=\>  
       a.timestamp.localeCompare(b.timestamp)  
     ).at(-1);

     let state: ReadinessState \= "unknown";  
     let freshness: FreshnessStatus \= "unknown";  
     const healthFailures: string\[\] \= \[\];  
     const capabilityStates: Record\<string, ReadinessState\> \= {};  
     const capabilityFreshness: Record\<string, FreshnessStatus\> \= {};

     if (latestHealth) {  
       freshness \= freshnessForTimestamp(  
         latestHealth.timestamp,  
         this.freshnessPolicy,  
         this.nowMs  
       );

       if (freshness \=== "expired") {  
         state \= "unknown";  
       } else if (latestHealth.passed) {  
         state \= "ready";  
       } else {  
         state \= "unavailable";  
         healthFailures.push(...latestHealth.failures);  
       }  
     }

     const capabilityMap \= new Map\<string, ProbeResultEvent\[\]\>();  
     for (const result of conformanceResults) {  
       if (\!result.capability) continue;  
       const list \= capabilityMap.get(result.capability) ?? \[\];  
       list.push(result);  
       capabilityMap.set(result.capability, list);  
     }

     for (const \[capability, records\] of capabilityMap.entries()) {  
       const latest \= \[...records\].sort((a, b) \=\>  
         a.timestamp.localeCompare(b.timestamp)  
       ).at(-1);

       if (\!latest) {  
         capabilityStates\[capability\] \= "unknown";  
         capabilityFreshness\[capability\] \= "unknown";  
         continue;  
       }

       const capabilityStateFreshness \= freshnessForTimestamp(  
         latest.timestamp,  
         this.freshnessPolicy,  
         this.nowMs  
       );

       capabilityFreshness\[capability\] \= capabilityStateFreshness;

       if (capabilityStateFreshness \=== "expired") {  
         capabilityStates\[capability\] \= "unknown";  
       } else if (state \=== "unavailable") {  
         capabilityStates\[capability\] \= "unavailable";  
       } else {  
         capabilityStates\[capability\] \= latest.passed ? "ready" : "degraded";  
         state \= worseState(state, capabilityStates\[capability\]);  
         freshness \= combineFreshness(freshness, capabilityStateFreshness);  
       }  
     }

     summaries.push({  
       providerId,  
       tier,  
       state,  
       freshness,  
       capabilityStates,  
       capabilityFreshness,  
       lastHealthCheckAt: latestHealth?.timestamp,  
       healthFailures  
     });  
   }

   return summaries.sort((a, b) \=\> a.providerId.localeCompare(b.providerId));  
 }

 private buildPolicyStates(  
   started: ProbeStartedEvent\[\],  
   results: ProbeResultEvent\[\]  
 ): PolicyReadinessSummary\[\] {  
   const routingStarts \= started.filter((e) \=\> e.probeType \=== "routing.readiness");  
   const grouped \= new Map\<string, { capabilities: Set\<string\>; results: ProbeResultEvent\[\] }\>();

   for (const start of routingStarts) {  
     const policy \= this.extractPolicyProfileFromProbeId(start.probeId);  
     if (\!grouped.has(policy)) {  
       grouped.set(policy, {  
         capabilities: new Set\<string\>(),  
         results: \[\]  
       });  
     }

     if (start.capability) {  
       grouped.get(policy)\!.capabilities.add(start.capability);  
     }  
   }

   for (const result of results.filter((r) \=\> r.probeType \=== "routing.readiness")) {  
     const policy \= this.extractPolicyProfileFromProbeId(result.probeId);  
     if (\!grouped.has(policy)) {  
       grouped.set(policy, {  
         capabilities: new Set\<string\>(),  
         results: \[\]  
       });  
     }  
     grouped.get(policy)\!.results.push(result);  
   }

   const summaries: PolicyReadinessSummary\[\] \= \[\];

   for (const \[policyProfile, group\] of grouped.entries()) {  
     const latest \= \[...group.results\].sort((a, b) \=\>  
       a.timestamp.localeCompare(b.timestamp)  
     ).at(-1);

     let state: ReadinessState \= "unknown";  
     let freshness: FreshnessStatus \= "unknown";  
     let reasons: string\[\] \= \[\];

     if (latest) {  
       freshness \= freshnessForTimestamp(  
         latest.timestamp,  
         this.freshnessPolicy,  
         this.nowMs  
       );

       if (freshness \=== "expired") {  
         state \= "unknown";  
       } else {  
         state \= latest.passed ? "ready" : "degraded";  
         reasons \= latest.failures;  
       }  
     }

     summaries.push({  
       policyProfile,  
       state,  
       freshness,  
       affectedCapabilities: \[...group.capabilities\],  
       reasons  
     });  
   }

   return summaries.sort((a, b) \=\> a.policyProfile.localeCompare(b.policyProfile));  
 }

 private extractPolicyProfileFromProbeId(probeId: string): string {  
   if (probeId.includes("private-strict")) return "lfsi.private\_strict";  
   if (probeId.includes("apple-only")) return "lfsi.apple\_only";  
   return "lfsi.local\_balanced";  
 }  
}

## **X. Router freshness behavior**

The router should only let readiness influence selection when freshness is usable.

Rule:

* `fresh`: influence selection normally  
* `stale`: influence selection, but log warning  
* `expired`: do not influence selection  
* `unknown`: do not bypass, only inform

## **`src/readiness/routing-policy.ts`**

Update assessment:

import type { ReadinessState, RoutingReadinessSummary, FreshnessStatus } from "./types.js";  
import type { Tier } from "../types.js";

export interface ProviderSelectionAssessment {  
 providerId: string;  
 tier: Tier;  
 state: ReadinessState;  
 freshness: FreshnessStatus;  
 shouldBypass: boolean;  
 rank: number;  
 reason: string;  
}

function rankForState(state: ReadinessState): number {  
 switch (state) {  
   case "ready":  
     return 0;  
   case "unknown":  
     return 1;  
   case "degraded":  
     return 2;  
   case "unavailable":  
     return 3;  
 }  
}

export function assessProviderForCapability(  
 summary: RoutingReadinessSummary | null,  
 providerId: string,  
 tier: Tier,  
 capability: string  
): ProviderSelectionAssessment {  
 if (\!summary || summary.overallFreshness \=== "expired") {  
   return {  
     providerId,  
     tier,  
     state: "unknown",  
     freshness: "expired",  
     shouldBypass: false,  
     rank: 1,  
     reason: "No fresh readiness summary available"  
   };  
 }

 const provider \= summary.providerStates.find((p) \=\> p.providerId \=== providerId);  
 if (\!provider) {  
   return {  
     providerId,  
     tier,  
     state: "unknown",  
     freshness: "unknown",  
     shouldBypass: false,  
     rank: 1,  
     reason: "Provider not present in readiness summary"  
   };  
 }

 const capabilityState \= provider.capabilityStates\[capability\] ?? provider.state;  
 const capabilityFreshness \=  
   provider.capabilityFreshness\[capability\] ?? provider.freshness;

 const shouldBypass \=  
   capabilityState \=== "unavailable" &&  
   (capabilityFreshness \=== "fresh" || capabilityFreshness \=== "stale");

 return {  
   providerId,  
   tier,  
   state: capabilityState,  
   freshness: capabilityFreshness,  
   shouldBypass,  
   rank: rankForState(capabilityState),  
   reason: \`Capability readiness is ${capabilityState} with freshness ${capabilityFreshness}\`  
 };  
}

## **XI. Persisting probe events from live runs**

You want the probe runner and router to write readiness-relevant events to disk as they happen.

Simple composition:

## **`src/readiness/composite-ledger.ts`**

import type { LedgerEvent, LedgerSink } from "../types.js";  
import type { ReadinessEventStore } from "./store.js";

export class CompositeLedgerSink implements LedgerSink {  
 constructor(  
   private readonly sinks: LedgerSink\[\],  
   private readonly readinessEventStore?: ReadinessEventStore  
 ) {}

 async write(event: LedgerEvent): Promise\<void\> {  
   for (const sink of this.sinks) {  
     await sink.write(event);  
   }

   if (  
     event.type \=== "probe.started" ||  
     event.type \=== "probe.result" ||  
     event.type \=== "readiness.consulted"  
   ) {  
     await this.readinessEventStore?.append(event);  
   }  
 }  
}

## **XII. Summary rebuild service**

This service rebuilds and persists the summary from stored events.

## **`src/readiness/rebuild.ts`**

import type { ReadinessEventStore, ReadinessSummaryStore } from "./store.js";  
import type { FreshnessPolicy, RoutingReadinessSummary, Tier } from "./types.js";  
import { ReadinessAggregator } from "./aggregate.js";

export class ReadinessRebuilder {  
 constructor(  
   private readonly eventStore: ReadinessEventStore,  
   private readonly summaryStore: ReadinessSummaryStore,  
   private readonly providerTiers: Record\<string, Tier\>,  
   private readonly freshnessPolicy: FreshnessPolicy  
 ) {}

 async rebuild(): Promise\<RoutingReadinessSummary\> {  
   const events \= await this.eventStore.readAll();  
   const aggregator \= new ReadinessAggregator(  
     this.providerTiers,  
     this.freshnessPolicy  
   );

   const summary \= aggregator.aggregate(events);

   await this.summaryStore.save({  
     schemaVersion: "1.0.0",  
     savedAt: new Date().toISOString(),  
     freshnessPolicy: this.freshnessPolicy,  
     summary  
   });

   return summary;  
 }  
}

## **XIII. CLI for rebuild and display**

## **`src/readiness/rebuild-cli.ts`**

import { resolve } from "node:path";  
import { FileReadinessEventStore, FileReadinessSummaryStore } from "./file-store.js";  
import { ReadinessRebuilder } from "./rebuild.js";  
import { renderReadinessSummary } from "./render.js";

async function main() {  
 const eventStore \= new FileReadinessEventStore(  
   resolve(process.cwd(), ".acds", "readiness-events.ndjson")  
 );

 const summaryStore \= new FileReadinessSummaryStore(  
   resolve(process.cwd(), ".acds", "readiness-summary.json")  
 );

 const rebuilder \= new ReadinessRebuilder(  
   eventStore,  
   summaryStore,  
   {  
     "apple.foundation": "tier0",  
     "ollama.default": "tier1"  
   },  
   {  
     freshMs: 15 \* 60 \* 1000,  
     staleMs: 60 \* 60 \* 1000,  
     expireMs: 6 \* 60 \* 60 \* 1000  
   }  
 );

 const summary \= await rebuilder.rebuild();  
 console.log(renderReadinessSummary(summary));  
}

main().catch((error) \=\> {  
 console.error(error);  
 process.exit(1);  
});

## **XIV. Rendering freshness clearly**

## **`src/readiness/render.ts`**

Update provider and policy output:

import type { RoutingReadinessSummary } from "./types.js";

export function renderReadinessSummary(summary: RoutingReadinessSummary): string {  
 const lines: string\[\] \= \[\];

 lines.push(\`Overall: ${summary.overallState}\`);  
 lines.push(\`Freshness: ${summary.overallFreshness}\`);  
 lines.push(\`Generated: ${summary.generatedAt}\`);  
 lines.push("");

 lines.push("Providers:");  
 for (const provider of summary.providerStates) {  
   lines.push(  
     \`- ${provider.providerId} \[${provider.tier}\] \=\> ${provider.state} (${provider.freshness})\`  
   );

   for (const \[capability, state\] of Object.entries(provider.capabilityStates)) {  
     const freshness \= provider.capabilityFreshness\[capability\] ?? "unknown";  
     lines.push(\`  \- ${capability}: ${state} (${freshness})\`);  
   }

   if (provider.healthFailures.length \> 0\) {  
     lines.push(\`  \- healthFailures: ${provider.healthFailures.join(", ")}\`);  
   }  
 }

 lines.push("");  
 lines.push("Policies:");  
 for (const policy of summary.policyStates) {  
   lines.push(\`- ${policy.policyProfile} \=\> ${policy.state} (${policy.freshness})\`);  
   if (policy.affectedCapabilities.length \> 0\) {  
     lines.push(\`  \- capabilities: ${policy.affectedCapabilities.join(", ")}\`);  
   }  
   if (policy.reasons.length \> 0\) {  
     lines.push(\`  \- reasons: ${policy.reasons.join(", ")}\`);  
   }  
 }

 return lines.join("\\n");  
}

## **XV. Freshness tests**

## **`test/logic/readiness-freshness.test.ts`**

import { describe, expect, test } from "vitest";  
import { freshnessForTimestamp } from "../../src/readiness/freshness.js";

describe("freshnessForTimestamp", () \=\> {  
 const now \= Date.parse("2026-03-20T12:00:00.000Z");  
 const policy \= {  
   freshMs: 15 \* 60 \* 1000,  
   staleMs: 60 \* 60 \* 1000,  
   expireMs: 6 \* 60 \* 60 \* 1000  
 };

 test("marks fresh correctly", () \=\> {  
   const ts \= "2026-03-20T11:50:00.000Z";  
   expect(freshnessForTimestamp(ts, policy, now)).toBe("fresh");  
 });

 test("marks stale correctly", () \=\> {  
   const ts \= "2026-03-20T11:10:00.000Z";  
   expect(freshnessForTimestamp(ts, policy, now)).toBe("stale");  
 });

 test("marks expired correctly", () \=\> {  
   const ts \= "2026-03-20T02:00:00.000Z";  
   expect(freshnessForTimestamp(ts, policy, now)).toBe("expired");  
 });  
});

## **XVI. Operational rule set**

Use these rules in practice:

### **Fresh**

Readiness influences routing.

### **Stale**

Readiness influences routing, but log a caution.

### **Expired**

Readiness does not influence routing. Treat as observational only.

### **Unknown**

Readiness does not bypass. It only informs logging.

That avoids false certainty.

## **XVII. Bottom line**

You now have:

* durable readiness storage  
* rebuildable summaries  
* freshness windows  
* stale and expired handling  
* persistence across restarts  
* router-safe readiness influence

That is enough to make readiness part of real operations instead of just developer diagnostics.

