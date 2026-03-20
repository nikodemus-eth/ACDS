import type { ExecutionRecord } from '@acds/core-types';

export interface ExecutionRecordFilters {
  status?: ExecutionRecord['status'];
  application?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export interface ExecutionRecordRepository {
  create(record: Omit<ExecutionRecord, 'id'> & { id?: string }): Promise<ExecutionRecord>;
  findById(id: string): Promise<ExecutionRecord | null>;
  findByFamily(familyKey: string, limit?: number): Promise<ExecutionRecord[]>;
  findRecent(limit?: number): Promise<ExecutionRecord[]>;
  findFiltered(filters: ExecutionRecordFilters): Promise<ExecutionRecord[]>;
  update(id: string, updates: Partial<ExecutionRecord>): Promise<ExecutionRecord>;
  reapStaleExecutions?(thresholdMs?: number): Promise<ExecutionRecord[]>;
}

export class ExecutionRecordService {
  constructor(private readonly repository: ExecutionRecordRepository) {}

  async create(record: Omit<ExecutionRecord, 'id'>): Promise<ExecutionRecord> {
    return this.repository.create(record);
  }

  async getById(id: string): Promise<ExecutionRecord | null> {
    return this.repository.findById(id);
  }

  async getByFamily(familyKey: string, limit = 50): Promise<ExecutionRecord[]> {
    return this.repository.findByFamily(familyKey, limit);
  }

  async getRecent(limit = 50): Promise<ExecutionRecord[]> {
    return this.repository.findRecent(limit);
  }

  async getFiltered(filters: ExecutionRecordFilters): Promise<ExecutionRecord[]> {
    return this.repository.findFiltered(filters);
  }

  async updateStatus(id: string, updates: Partial<ExecutionRecord>): Promise<ExecutionRecord> {
    return this.repository.update(id, updates);
  }
}
