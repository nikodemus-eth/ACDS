import { RoutingRequest } from './RoutingRequest.js';

export interface DispatchRunRequest {
  routingRequest: RoutingRequest;
  inputPayload: string;
  inputFormat: 'text' | 'json' | 'markdown';
  requestId?: string;
}
