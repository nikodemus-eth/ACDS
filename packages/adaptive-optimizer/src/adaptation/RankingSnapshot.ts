/**
 * RankingSnapshot - Captures a point-in-time snapshot of a family's
 * candidate rankings for rollback and audit purposes.
 */

export interface CandidateRankingEntry {
  /** The candidate identifier. */
  candidateId: string;

  /** The rank position (1 = highest). */
  rank: number;

  /** The composite score at the time of capture. */
  score: number;
}

export interface RankingSnapshot {
  /** The execution family this snapshot belongs to. */
  familyKey: string;

  /** Ordered list of candidate rankings at the time of capture. */
  candidateRankings: CandidateRankingEntry[];

  /** The exploration rate in effect when this snapshot was captured. */
  explorationRate: number;

  /** ISO-8601 timestamp of when this snapshot was captured. */
  capturedAt: string;
}
