import { useState } from 'react';
import { AuditEventType } from '@acds/core-types';
import { PageHeader } from '../../components/common/PageHeader';
import { AuditTable } from './AuditTable';
import { useAuditEvents } from '../../hooks/useAudit';
import type { AuditFilters } from './auditApi';

const inputStyle: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  fontSize: '13px',
};

export function AuditPage() {
  const [eventType, setEventType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [actor, setActor] = useState('');
  const [application, setApplication] = useState('');

  const filters: AuditFilters = {
    eventType: eventType || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    actor: actor || undefined,
    application: application || undefined,
  };

  const { data: events = [], isLoading } = useAuditEvents(filters);

  return (
    <div>
      <PageHeader title="Audit Log" />

      <div
        style={{
          display: 'flex',
          gap: '12px',
          flexWrap: 'wrap',
          marginBottom: '20px',
          alignItems: 'center',
        }}
      >
        <select style={inputStyle} value={eventType} onChange={(e) => setEventType(e.target.value)}>
          <option value="">All Types</option>
          {Object.values(AuditEventType).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <input
          style={inputStyle}
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          placeholder="From"
        />
        <input
          style={inputStyle}
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          placeholder="To"
        />

        <input
          style={inputStyle}
          value={actor}
          onChange={(e) => setActor(e.target.value)}
          placeholder="Actor"
        />

        <input
          style={inputStyle}
          value={application}
          onChange={(e) => setApplication(e.target.value)}
          placeholder="Application"
        />
      </div>

      {isLoading ? <p>Loading audit events...</p> : <AuditTable events={events} />}
    </div>
  );
}
