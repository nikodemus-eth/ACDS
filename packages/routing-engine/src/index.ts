// Intake
export { RoutingRequestValidator } from './intake/RoutingRequestValidator.js';
export type { ValidationResult } from './intake/RoutingRequestValidator.js';
export { RoutingRequestNormalizer } from './intake/RoutingRequestNormalizer.js';

// Eligibility
export { EligibleProfilesService } from './eligibility/EligibleProfilesService.js';
export { EligibleTacticsService } from './eligibility/EligibleTacticsService.js';

// Selection
export { DeterministicProfileSelector } from './selection/DeterministicProfileSelector.js';
export { DeterministicTacticSelector } from './selection/DeterministicTacticSelector.js';
export { FallbackChainBuilder } from './selection/FallbackChainBuilder.js';
export { RoutingDecisionResolver } from './selection/RoutingDecisionResolver.js';

// Rationale
export { ExecutionRationaleBuilder } from './rationale/ExecutionRationaleBuilder.js';
export { RationaleFormatter } from './rationale/RationaleFormatter.js';
export type { FormattedRationale } from './rationale/RationaleFormatter.js';

// Resolvers
export { DispatchResolver } from './resolvers/DispatchResolver.js';
export type { DispatchResolverDeps, DispatchResult } from './resolvers/DispatchResolver.js';
