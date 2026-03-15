# Prompt Reference Index

## Foundation (Prompts 1-10)
1. Root monorepo files (package.json, pnpm-workspace, tsconfig, .gitignore, .env.example, README)
2. Empty folder scaffold (apps, packages, infra, docs, tests directories)
3. Core enums (TaskType, LoadTier, DecisionPosture, CognitiveGrade, ProviderVendor, AuthType, AuditEventType)
4. Core entities (Provider, ProviderSecret, ProviderHealth, ModelProfile, TacticProfile, ExecutionFamily, ExecutionRecord)
5. Contracts (RoutingRequest, RoutingDecision, DispatchRunRequest, DispatchRunResponse, ExecutionRationale)
6. Runtime schemas (Zod schemas for provider, modelProfile, tacticProfile, routingRequest)
7. Security crypto layer (cipherTypes, keyResolver, encrypt, decrypt)
8. Security secret abstractions (SecretCipherStore, SecretRotationService, SecretRedactor, redaction helpers)
9. Audit ledger foundation (writers, event builders, formatters)
10. Base provider adapter contract (ProviderAdapter interface, AdapterTypes, AdapterError, normalize helpers)

## Provider & Policy (Prompts 11-20)
11. Provider broker registry layer (ProviderRepository, ProviderRegistryService, ProviderValidationService)
12. Provider broker execution layer (AdapterResolver, ProviderConnectionTester, ProviderExecutionProxy)
13. Provider broker health layer (ProviderHealthRepository, ProviderHealthService, ProviderHealthScheduler)
14. Ollama adapter (OllamaConfig, OllamaMapper, OllamaAdapter + test)
15. LM Studio adapter (LMStudioConfig, LMStudioMapper, LMStudioAdapter + test)
16. Gemini adapter (GeminiConfig, GeminiMapper, GeminiAdapter + test)
17. OpenAI adapter (OpenAIConfig, OpenAIMapper, OpenAIAdapter + test)
18. Policy model files (GlobalPolicy, ApplicationPolicy, ProcessPolicy, InstanceContextNormalizer, InstancePolicyOverlay)
19. Policy resolvers and validation (PolicyMergeResolver, eligibility resolvers, PolicyValidator, PolicyConflictDetector)
20. Routing intake layer (RoutingRequestValidator, RoutingRequestNormalizer)

## Routing & Execution (Prompts 21-30)
21. Routing eligibility layer (EligibleProfilesService, EligibleTacticsService)
22. Routing deterministic selection (DeterministicProfileSelector, DeterministicTacticSelector, FallbackChainBuilder, RoutingDecisionResolver)
23. Routing rationale layer (ExecutionRationaleBuilder, RationaleFormatter, DispatchResolver)
24. Execution orchestrator run layer (DispatchRunService, ExecutionRecordService, ExecutionStatusTracker)
25. Execution orchestrator fallback layer (FallbackExecutionService, FallbackDecisionTracker, result normalizers, event emitter/logger)
26. SDK client layer (ApiTransport, DispatchClientConfig, DispatchClient)
27. SDK builder layer (RoutingRequestBuilder, ExecutionFamilyBuilder, ProcessContextBuilder, helpers, errors)
28. API bootstrap layer (main.ts, app.ts, config, register routes/middleware/plugins)
29. API middleware layer (auth, error, logging, security headers middleware)
30. Providers and health routes/controllers (providersRoutes, healthRoutes, ProvidersController, HealthController, ProviderPresenter)

## App Surfaces (Prompts 31-40)
31. Dispatch and executions routes/controllers
32. Audit routes/controllers read surface
33. Admin web app shell
34. Admin web providers screens
35. Admin web profiles screens
36. Admin web policies screens
37. Admin web audit and executions screens
38. Worker bootstrap and health job
39. Database migrations
40. Seed files

## MVP Stabilization (Prompts 41-45)
41. Critical documentation
42. Integration tests
43. Scenario tests
44. Compile-fix pass for core packages
45. Compile-fix pass for applications

## Adaptive Layer (Prompts 46-60)
46. Evaluation metrics layer
47. Evaluation scoring layer
48. Evaluation aggregation layer
49. Adaptive optimizer state layer
50. Adaptive ranking layer
51. Adaptive selection service
52. Plateau detection layer
53. Adaptation event and ledger layer
54. Routing engine adaptive integration layer
55. Execution outcome feedback layer
56. Worker adaptive jobs
57. Adaptive API read surface
58. Adaptive admin UI read screens
59. Adaptive integration tests
60. Adaptive compile-fix pass

## Adaptive Control (Prompts 61-70)
61. Adaptation approval workflow
62. Low-risk auto-apply mode
63. Adaptation rollback tooling
64. Staged escalation tuning integration
65. Adaptive operator documentation
66. Adaptive admin approval screens
67. Adaptive admin rollback screens
68. Adaptive control integration tests
69. Adaptive control compile-fix pass
70. Adaptive release readiness checklist
