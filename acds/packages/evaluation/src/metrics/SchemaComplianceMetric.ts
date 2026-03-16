/**
 * SchemaComplianceMetric - Evaluates whether structured output matches
 * the expected schema.
 */

import type { MetricResult } from './AcceptanceMetric.js';

export type ComplianceLevel = 'compliant' | 'partial' | 'non-compliant';

export interface SchemaComplianceRecord {
  /** The structured output to evaluate. */
  structuredOutput: Record<string, unknown> | null;
  /** The expected schema definition (field names to expected types). */
  expectedSchema: Record<string, string>;
}

/**
 * Checks if a value loosely matches an expected type string.
 */
function matchesType(value: unknown, expectedType: string): boolean {
  if (expectedType === 'any') return true;
  if (expectedType === 'array') return Array.isArray(value);
  if (expectedType === 'null') return value === null;
  return typeof value === expectedType;
}

/**
 * Evaluates schema compliance of structured output against an expected schema.
 *
 * @param record - A record containing structuredOutput and expectedSchema.
 * @returns A MetricResult with score: 1.0 (compliant), 0.5 (partial), or 0.0 (non-compliant).
 */
export function evaluateSchemaCompliance(record: SchemaComplianceRecord): MetricResult {
  if (!record.structuredOutput) {
    return {
      score: 0.0,
      label: 'schema-compliance',
      details: {
        level: 'non-compliant' as ComplianceLevel,
        reason: 'No structured output provided',
        matchedFields: 0,
        totalExpectedFields: Object.keys(record.expectedSchema).length,
      },
    };
  }

  const expectedFields = Object.keys(record.expectedSchema);
  if (expectedFields.length === 0) {
    return {
      score: 1.0,
      label: 'schema-compliance',
      details: {
        level: 'compliant' as ComplianceLevel,
        reason: 'No schema fields to validate',
        matchedFields: 0,
        totalExpectedFields: 0,
      },
    };
  }

  let matchedCount = 0;
  const missingFields: string[] = [];
  const typeMismatches: string[] = [];

  for (const field of expectedFields) {
    if (!(field in record.structuredOutput)) {
      missingFields.push(field);
      continue;
    }
    const value = record.structuredOutput[field];
    const expectedType = record.expectedSchema[field];
    if (matchesType(value, expectedType)) {
      matchedCount++;
    } else {
      typeMismatches.push(field);
    }
  }

  const ratio = matchedCount / expectedFields.length;
  let level: ComplianceLevel;
  let score: number;

  if (ratio === 1.0) {
    level = 'compliant';
    score = 1.0;
  } else if (ratio >= 0.5) {
    level = 'partial';
    score = 0.5;
  } else {
    level = 'non-compliant';
    score = 0.0;
  }

  return {
    score,
    label: 'schema-compliance',
    details: {
      level,
      matchedFields: matchedCount,
      totalExpectedFields: expectedFields.length,
      missingFields,
      typeMismatches,
    },
  };
}
