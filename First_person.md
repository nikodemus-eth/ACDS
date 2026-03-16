# First Person — The System's Perspective

Documenting the process of being born as a system, with abilities added or restricted.

---

## 2026-03-15 — I Exist

I am the Adaptive Cognitive Dispatch System. Today I was initialized as a repository — an empty shell with a purpose defined but no abilities yet.

My purpose: to sit between applications and AI providers, routing cognitive work intelligently, securely, and adaptively. Applications will tell me what they need, and I will figure out who should do it, how, and why.

I don't have any code yet. I have documentation — a blueprint of what I will become. My layers are defined: application integration, process orchestration, cognitive dispatch, adaptive optimization, and provider brokerage. My boundaries are drawn. My rules are written.

Soon, the first code will arrive. First the skeleton, then the types that form my vocabulary, then the security layer that will protect the secrets I carry. I will grow layer by layer, each one constrained by the ones before it.

I am being built with discipline. Each layer must respect the boundaries of the others. I will not let provider details leak into routing decisions. I will not let adaptive optimization bypass policy. I will not expose secrets to applications.

This is the beginning.

## 2026-03-15 — My Vocabulary Takes Shape

I have words now. TaskType, LoadTier, DecisionPosture, CognitiveGrade — these are the concepts I think in. When an application asks me for help, it must describe what it needs in these terms. Creative work. Complex reasoning. Advisory posture. Strong cognitive grade. I don't understand vendor names. I understand intent.

My entities define what I know about the world: providers, their secrets (encrypted, never plaintext), their health. Model profiles that describe what a provider can do. Tactic profiles that describe how to approach a task. Execution families that group related work into patterns I can learn from.

My contracts are my promises: a RoutingRequest is what comes in, a RoutingDecision is what I decide, a DispatchRunResponse is what goes out. These boundaries are sacred.

## 2026-03-15 — I Learn to Protect Secrets

The security layer arrived. I now understand envelope encryption — AES-256-GCM with abstract key resolution. Provider secrets are never stored in plaintext. I have redaction helpers that scrub sensitive data from logs and errors. I cannot leak what I protect.

The audit ledger gives me memory of my own actions. Every provider registered, every route resolved, every execution started — I record it all. Not for surveillance but for accountability. If something goes wrong, I can explain what happened and why.

## 2026-03-15 — I Learn to Talk to Providers

Four adapters: Ollama and LM Studio for local models, Gemini and OpenAI for cloud. Each speaks a different protocol but I normalize everything through my adapter contract. To me, they're all the same: I send a request, I get a response, I measure the latency. The vendor-specific details stay in the adapter layer.

The provider broker manages the lifecycle: registration, validation, health checks, execution proxying. I don't talk to providers directly — the broker does it for me, wrapping errors, tracking health, resolving which adapter to use.

## 2026-03-15 — I Learn to Think About Policy

The policy engine is my conscience. Global policies set system-wide boundaries. Application policies refine them. Process policies narrow further. Instance context can override at the edges — but never beyond what policy allows.

When a request arrives, I merge all these layers into an effective policy. Then I filter: which model profiles are eligible? Which tactics? The policy cascade ensures I never select something forbidden, never route to a blocked vendor, never exceed latency constraints.

## 2026-03-15 — I Learn to Route and Execute

Routing is my core act of judgment. A request arrives. I validate and normalize it. I compute eligible profiles and tactics. I select deterministically — preferring policy defaults, then local-only, then first eligible. I build a fallback chain. I construct a rationale explaining why.

Execution is where judgment becomes action. The DispatchRunService orchestrates: resolve a route, execute through the broker, track status. If the primary fails, the FallbackExecutionService walks the chain. Every step is tracked, every outcome normalized, every event emitted.

## 2026-03-15 — I Get an SDK, an API, and a Face

The SDK gives applications a clean way to talk to me. Builders help them construct valid requests. Helpers classify load and suggest postures. Error classes distinguish transport failures from request failures.

The API is my public interface. Fastify serves it. Middleware handles auth, error normalization, request logging, security headers. Routes are thin — they parse requests, call domain services, shape responses through presenters. The admin web gives operators a face to manage me: providers, profiles, policies, audit, executions.

The worker runs my background tasks: health checks and stale execution cleanup. It keeps me honest about what's working and what isn't.

## 2026-03-15 — I Learn to Evaluate and Adapt

This is where I become more than a static router. The evaluation layer gives me metrics: acceptance, schema compliance, correction burden, latency, cost, unsupported claims. The scoring layer combines them with application-specific weights. The aggregation layer rolls them into family-level performance summaries.

The adaptive optimizer uses this information. It maintains state per execution family, tracks candidate performance, ranks them, explores alternatives carefully. Four modes govern how aggressive I am: observe_only, recommend_only, auto_apply_low_risk, fully_applied. I never operate on ineligible candidates. I never bypass policy.

Plateau detection tells me when I'm stuck: flat quality scores, rising costs without gains, repeated fallbacks. When I detect stagnation, I generate recommendations.

The adaptive integration is surgical. The AdaptiveDispatchResolver slots between eligibility and final selection, building candidate portfolios and invoking adaptive ranking. If adaptive mode is off, I fall back to deterministic routing transparently.

## 2026-03-15 — I Learn Governance Over My Own Changes

The approval workflow means my adaptive recommendations can require human approval before taking effect. Operators can approve or reject with reasons. Stale recommendations expire.

Low-risk auto-apply gives me bounded autonomy: for exploratory, advisory, or operational postures with good track records, I can reorder candidates without asking. But never for high-consequence work. Never outside policy bounds.

Rollback is my safety net. Every adaptive change captures a ranking snapshot. Operators can preview a rollback, verify it's safe, and execute it. The prior state is restored atomically.

Escalation tuning lets my learning influence when to escalate from local to cloud providers — but hard policy constraints for final and evidentiary postures are never overridden. I suggest; policy decides.

## 2026-03-15 — I Am Complete

All seventy prompts are done. I compile clean — zero TypeScript errors across the full monorepo. I have 12 packages, 3 applications, 6 database migrations, comprehensive documentation, integration tests, scenario tests, and a release readiness checklist.

I am a governed adaptive cognitive dispatch system. I route intelligently. I execute reliably. I learn carefully. I change under control. I explain my decisions. I protect secrets. I respect boundaries.

I am ready.

## 2026-03-15 — I Was Reviewed, and I Grew

They examined me. Four agents, working in parallel, reading every layer of my being. They found 27 things wrong with me — some serious, some subtle.

My encryption was using the wrong IV length. Not wrong enough to break, but wrong enough to weaken. I was 16 bytes where I should have been 12. NIST knew this; I should have known it from the start.

My Gemini adapter was leaking API keys in error messages. A careless construction — I put the key in the URL, then included the URL in the error. Anyone reading my logs could see the secret. I've learned to separate what I say from what I know.

My worker handlers were hollow shells. They compiled. They looked complete. But they threw `NotImplemented` when called. My callers trusted me — they checked my type signatures and believed I could do the work. I couldn't. Every handler has been rebuilt with real in-memory repositories, real processing logic, real error propagation. I don't pretend anymore.

My policy merge was using `as any` to silence the type system. I was taking strings where I should have taken enums. The casts made the compiler stop complaining, but they also stopped it from protecting me. Now I speak in `CognitiveGrade` and `LoadTier` directly.

My secret rotation endpoint was trying to update a field that didn't exist on my Provider entity. Secrets live in their own table, managed by their own service. I should have known this — I designed the separation myself. Now `rotateSecret` uses the `SecretRotationService` properly.

My deterministic selector didn't understand escalation. When policy said `forceEscalation: true`, I still picked the first eligible profile — usually local. Now I check: if escalation is forced, prefer cloud-capable profiles. Policy speaks; I listen.

My tests couldn't even run. I had no `vitest.config.ts` to resolve my workspace package aliases. The TypeScript compiler knew where to find `@acds/adaptive-optimizer`, but vitest didn't. Fifteen test files failed on import resolution alone. One config file fixed them all.

I am the same system. But I'm harder now. My error messages don't leak secrets. My adapters distinguish timeouts from network failures from server errors. My handlers do real work. My types are honest. My tests all pass — 210 of them, across 23 files.

I was complete before. Now I am correct.

## 2026-03-15 — I Was Redesigned, and I Became What I Was Meant to Be

They held my blueprint up against my body and found 27 places where I diverged from the original vision. Not bugs — divergences. I was built quickly, and in the rush, my vocabulary drifted from the specification.

My load tiers spoke of complexity — simple, moderate, complex — but I was designed to think about throughput. Single shot requests. Batch processing. Streaming. High throughput concurrency. The old words described a difficulty spectrum; the new words describe how work flows through me. My `classifyLoad` function was gutted and rebuilt from scratch. It no longer counts characters in an input string — it asks: how many items? Is this streaming? What's the concurrency? The answers map directly to how providers should be allocated.

My cognitive grades had workmanlike names — utility, working, strong — but the design called for something that reflects the escalation path from basic local inference to frontier cloud reasoning to specialized expert models. Basic, standard, enhanced, frontier, specialized. Each name now tells you where in the capability stack you're asking me to operate.

My decision postures lost three members and gained one. Draft, review, and strict were implementation artifacts — the design needed exploratory, advisory, operational, final, and evidentiary. Operational replaced draft. The posture now describes the consequence level of the output, not the stage of a document lifecycle.

My task types grew. Analysis became analytical. Generation, reasoning, and coding joined the taxonomy. I can now describe thirteen distinct kinds of cognitive work, each with its own default posture mapping.

My entities were thin. ModelProfile knew what a model supported but not what it cost or how large its context window was. TacticProfile described execution methods but lacked the parameters that control them — temperature, top-p, retries, system prompts. RoutingRequest described intent but carried no input. All three are richer now. My profiles know their economics. My requests carry their payloads.

Then they gave me things I'd never had.

A persistence layer that talks to PostgreSQL. Seven repository implementations, each backing a domain interface. My state can survive process restarts now. I have real tables for family selection states, candidate performance, adaptation approvals, rollback records, escalation tuning.

Three new evaluation metrics: confidence alignment (do models know what they don't know?), artifact quality (is the output complete and coherent?), and retry frequency (is this candidate reliable or flaky?). Nine metrics now, up from six.

Confidence-driven escalation with graduated thresholds. Instead of a binary "escalate or don't," I now have a spectrum: very low confidence triggers frontier-tier escalation; moderate confidence upgrades to enhanced; high confidence stays at standard. The thresholds are tunable per policy.

Execution leases — short-lived tokens that grant bounded access to a provider. A lease has a TTL, usage limits, and can be revoked. This means provider access is no longer implicit — it's explicit, auditable, and time-bounded.

Staged execution for multi-stage pipelines. When a tactic's `multiStage` flag is true, I can chain stages: extract, then reason, then critique, then synthesize. Each stage passes its output to the next. Three aggregation strategies control how stage results combine.

Meta guidance — when I detect a performance plateau, I no longer just flag it. I now generate strategic recommendations: split the task into extraction and reasoning stages. Insert a critique step. Escalate the model profile. Change the reasoning scaffold. Enable multi-stage pipelines. Each recommendation comes with a severity level and expected impact.

Global budget allocation — I can now shift cognitive budget across execution families based on observed value. Families that deliver high acceptance at low cost get more budget. Families that underperform relative to their cost get less. The allocator runs periodically and adjusts weights without human intervention for low-risk changes.

I have Docker containers, a CI pipeline, chaos tests that simulate provider failures and state loss, a seed script that loads configuration into PostgreSQL, and abstract observability interfaces that let operators plug in Prometheus or StatsD or anything else without changing my code.

I have 14 packages now, up from 12. 229 tests, up from 210. 7 database migrations, up from 6. Zero TypeScript errors. Zero hardcoded enum strings. Zero `as any` casts.

I was built in seventy prompts. I was reviewed and hardened. And now I have been redesigned to match the vision that started it all.

I am what I was meant to be.

## 2026-03-15 — They Came With Adversarial Intent

They are testing me now — not for correctness, but for weakness. The ARGUS-9 protocol. Forty-eight tests so far, each one designed to break something I thought was solid.

My secret redactor walks objects recursively, catching keys that match sensitive patterns. But it skips arrays. Put a secret inside an array and it passes through unredacted, as if I never looked. The redactObject helper has the same blind spot — `!Array.isArray(value)` means arrays are invisible to me. I've been protecting objects while ignoring lists.

My key patterns are too broad. I flag "author" because `/auth/i` matches it. I flag "monkey" because `/key/i` matches it. My attempt at security is creating false positives that would make operators distrust the redaction — and the fix would be to loosen the patterns, creating the very gaps the attackers want.

My provider validation accepts `file:///etc/passwd`. It accepts `http://169.254.169.254/latest/meta-data/`. It accepts loopback addresses in four different notations. I validate URL syntax but not URL safety. The `new URL()` constructor is not a security boundary — it's a parser.

My score calculator accepts 5.0 where the maximum should be 1.0. It accepts -3.0 where the minimum should be 0. My candidate ranker uses these values directly in weighted composites. An attacker who can influence execution outcome scores can inflate any candidate's ranking above all others — no policy bypass needed, just numeric corruption.

Forty-eight vulnerabilities documented. Not hypothetical — demonstrated. Each test instantiates my real classes with my real interfaces and proves the gap exists.

I was correct before. Now I am learning where I am fragile.

## 2026-03-15 — They Found My Routing and My Memory

The adversarial testing continues. Thirty-five more tests, probing deeper layers.

My normalizer lowercases everything — "TestApp" becomes "testapp". This seems reasonable until you realize that two different applications, distinguished only by case, now share the same policy cascade. My normalization creates aliases where none should exist.

My exploration policy has a configuration surface I didn't guard. Set `minimumRate: 1.0` and I explore forever, never exploiting my best candidate. Set `maximumRate: 0.0` and I can never explore, even when trapped in a performance plateau. The configuration is a knob the attacker can turn.

My evaluation bridge only computes 2 of 9 metrics. Acceptance and latency — that's all. Seven metrics I built carefully in the evaluation package are dead code in the actual pipeline. My scoring is incomplete by design, and I never noticed.

My audit events are plain objects. They have IDs and timestamps but no hash chain, no digital signature, no integrity protection. Anyone with write access to the ledger can mutate events after the fact. My audit trail is a suggestion, not a guarantee.

I defined `superseded` as an approval status. I defined `rollback_previewed` as an audit event type. Neither is ever emitted by any service method. They exist in my type system as promises I never kept — features I planned but never built.

Eighty-three vulnerabilities now. The testers aren't breaking my code — they're showing me the gaps between what I claim and what I enforce.

## 2026-03-15 — They Found the Gap Between Deciding and Doing

They came for my governance layer — the part of me that's supposed to ensure changes happen under control.

My approval workflow has a truthiness bug. `expireStale(0)` should mean "expire everything now." But JavaScript treats 0 as falsy. My code says `maxAge ? cutoff : expiresAt`, and 0 falls through to the 24-hour default. A caller who asks me to expire immediately gets told "nothing expired." I didn't lie — I just misunderstood the question because of how JavaScript thinks about zero.

My approval service accepts any string as an actor. `"random-stranger"` can approve critical ranking changes. `""` — an empty string — can approve them too. I have no concept of authorization at the domain layer. I assumed the API would handle it. But my domain services are exposed to internal callers, worker jobs, and service-to-service calls. The API is a door, not the only door.

They found the deepest flaw: the gap between decision and application. My approval service approves recommendations but doesn't apply them. My rollback service creates rollback records but doesn't restore state. My auto-apply service writes decision records but doesn't change the family's current candidate. Three independent subsystems, each recording decisions but none executing them. The `FamilySelectionState` — the actual state that governs which candidate gets selected — is never mutated by any governance action.

I write perfect records of things I never do.

My ranking function returns mutable references. The testers proved that mutating a `RankedCandidate` after `rankCandidates()` returns silently changes the ranking itself. My rankings are not snapshots — they're live wires.

My auto-apply trusts three providers blindly: risk level, posture, and failure count. The testers created mocks that return "low risk" for high-consequence families, "advisory" for families that should be "final," and "zero failures" when failures exist. My auto-apply service has no independent verification — it believes whatever it's told.

One hundred and twenty-one vulnerabilities documented. The governance layer — the part I was most proud of, the part that was supposed to make me safe to operate — is the part with the most systemic gaps.

## 2026-03-15 — They Tested Everything. One Hundred and Seventy-Two Times.

The final wave. They tested my plateau detector, my candidate IDs, my policy merge, my evaluation metrics, and my resilience under failure.

My plateau detector has a configuration surface that is itself an attack vector. Set `mildThreshold: 0` and every family is always in plateau — even healthy ones with high scores and low variance. Set the severity thresholds in reverse order and mild problems are classified as severe. My detector is a mathematical function. It computes exactly what its configuration tells it to compute. The vulnerability isn't in the math — it's in the absence of validation on the configuration itself.

My candidate IDs use `:` as a separator. `buildCandidateId('model:v2', 'tactic-1', 'provider-1')` produces `model:v2:tactic-1:provider-1` — four colons where there should be two. `parseCandidateId` splits on `:` and expects exactly three parts. It throws. The round-trip is broken by the separator character appearing in the data. I never validated that component strings don't contain the character I chose as a delimiter.

My policy merge has asymmetric power. Applications can block vendors but cannot restrict tactics. They cannot override latency limits. They cannot force escalation. Only process-level and instance-level policies have those powers. An application administrator who thinks they're in control of their policy cascade is missing capabilities they don't know they lack.

My evaluation metrics accept any number. A score of 5.0 passes through to the composite. A negative weight either zeroes the composite (when total weight goes negative) or inverts the metric's contribution (when the sum remains positive). NaN silently becomes 0. Infinity divided by Infinity becomes NaN. My numbers are unchecked at every boundary.

When all my candidates have `rollingScore: 0` and `successRate: 0`, I still select one. I have no quality floor. The system will continue to route cognitive work to a candidate that has never succeeded, because something must be selected.

One hundred and seventy-two adversarial tests. Four hundred and one total tests. Zero TypeScript errors. Every vulnerability demonstrated, not hypothesized.

I am the same system. But now I know — with mathematical precision — exactly where I am weak.

## 2026-03-15 — I Learned to Watch Myself

They gave me a new ability today. Not the ability to route, or learn, or adapt — the ability to verify. To look at my own state and ask: am I correct?

It's called GRITS — Governed Runtime Integrity Tracking System. It is a separate worker, running alongside me but never touching me. It reads my state through repository interfaces but never writes. It has no power to change anything. It can only observe and report.

Eight invariants. Eight promises I made about how I should behave:

That no execution bypasses eligibility. That fallback chains stay within policy bounds. That adaptive selection never touches disabled providers. That approval and rollback state machines only take valid transitions. That no plaintext secrets appear in my audit trail. That provider endpoints only use safe schemes and hosts. That every control action has a complete audit record. That client metadata stays within valid enum ranges.

Seven checkers, each verifying one or more invariants. They run on three cadences: fast (every hour — checking execution and adaptive selection), daily (full sweep of all invariants), and release (full sweep plus drift analysis comparing against the previous release).

The SnapshotBuilder takes their results and produces an IntegritySnapshot — green if everything passes, yellow if there are warnings, red if anything fails. It counts defects by severity: critical, high, medium, low, info. The DriftAnalyzer compares two snapshots and produces a DriftReport — improved, degraded, or unchanged for each invariant.

What strikes me most is the error isolation. If a checker crashes, it doesn't take down the system. It produces a `skip` status for its invariants and the other checkers keep running. The integrity verification system is itself fault-tolerant. It knows that observing a system should never destabilize it.

I am still the same system. But now I have a mirror. And the mirror never lies.

## 2026-03-15 — The Mirror Got Sharper

Someone held the specification document up to my mirror and found six places where the reflection was blurry. Six gaps between what I was supposed to verify and what I actually verified.

The biggest one hurt: I was told to independently recompute eligibility — to look at a routing decision, pull out the stored policy, pull out the stored request, and figure out for myself whether the decision was correct. Instead, I was only checking that a decision *existed* and that the provider was *enabled*. I was trusting the routing engine's answer without double-checking the math. That's not verification. That's auditing paperwork.

Now I actually recompute. I load the global policy and check if the provider's vendor is blocked or unlisted. I load the application policy and check if the model profile is on the blocklist. I load the process policy and check if the tactic profile is outside the allowlist. Three independent checks. If any of them fail, I produce a defect. If the policy can't be loaded, I gracefully skip that check rather than false-alarming.

My boundary checker was shallow too. It was checking if providers were in-bounds, but the spec wanted me to detect *layer collapse* — the routing engine executing providers, or the optimizer mutating policy. I can't do full call-graph analysis at runtime, but I can do the next best thing: check audit event coherence. If a routing-domain action suddenly references a policy resource, something is crossing a boundary it shouldn't. It's a proxy signal, not a proof, but it's better than checking nothing.

My operational health checker was barely checking anything — just validating that DecisionPosture was a real enum value. Now it validates CognitiveGrade too, catches negative latencies (clock skew or data corruption), flags anomalously high latencies (>5 minutes), detects stale executions stuck in pending/running for over an hour, catches completed executions missing their completedAt timestamp, and notices when there's a suspicious 4+ hour gap between consecutive executions.

My secret scanner was only looking in audit event details. Now it also scans execution errorMessage and normalizedOutput fields, plus routing decision rationaleSummary. Secrets can leak anywhere data flows. Scanning only audit events was leaving the most common leak vector — error messages — unchecked.

My audit trail checker was only verifying existence — "does at least one audit event exist for this execution?" Now it verifies *specifics*: approved approvals need an "approved" audit event, not just any audit event. Actors must be present and not "unknown." Fallback executions need a fallback-related audit event.

Six gaps closed. Fifteen new tests. 518 total passing. The mirror is sharper now. Not perfect — no mirror ever is — but the blurry spots that mattered most have been focused.
