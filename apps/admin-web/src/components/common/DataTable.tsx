import React, { useState } from 'react';

export interface ColumnDef<T> {
  key: string;
  header: string;
  sortable?: boolean;
  render: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number | boolean | Date | null | undefined;
}

interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  caption?: string;
  loading?: boolean;
  rowLabel?: (row: T) => string;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  emptyMessage = 'No data',
  caption,
  loading,
  rowLabel,
}: DataTableProps<T>) {
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [sortAnnouncement, setSortAnnouncement] = useState('');

  function handleSort(key: string) {
    let newDirection: 'asc' | 'desc';
    if (sortColumn === key) {
      newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      newDirection = 'asc';
    }
    setSortColumn(key);
    setSortDirection(newDirection);

    const col = columns.find((entry) => entry.key === key);
    if (col) {
      const dirLabel = newDirection === 'asc' ? 'ascending' : 'descending';
      setSortAnnouncement(`Sorted by ${col.header}, ${dirLabel}`);
    }
  }

  const sortIndicator = (key: string) => {
    if (sortColumn !== key) return '';
    return sortDirection === 'asc' ? ' \u25B2' : ' \u25BC';
  };

  const sortedData = [...data].sort((left, right) => {
    if (!sortColumn) return 0;

    const column = columns.find((entry) => entry.key === sortColumn);
    if (!column) return 0;

    const leftValue = column.sortValue ? column.sortValue(left) : (left as Record<string, unknown>)[sortColumn];
    const rightValue = column.sortValue ? column.sortValue(right) : (right as Record<string, unknown>)[sortColumn];

    if (leftValue == null && rightValue == null) return 0;
    if (leftValue == null) return 1;
    if (rightValue == null) return -1;

    const normalizedLeft = leftValue instanceof Date ? leftValue.getTime() : leftValue;
    const normalizedRight = rightValue instanceof Date ? rightValue.getTime() : rightValue;

    if (normalizedLeft < normalizedRight) {
      return sortDirection === 'asc' ? -1 : 1;
    }
    if (normalizedLeft > normalizedRight) {
      return sortDirection === 'asc' ? 1 : -1;
    }
    return 0;
  });

  return (
    <div className="table-wrap" role="region" aria-label={caption || 'Data table'} tabIndex={0}>
      <table className="data-table" aria-busy={loading}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="data-table__head">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                aria-sort={
                  col.sortable
                    ? sortColumn === col.key
                      ? sortDirection === 'asc' ? 'ascending' : 'descending'
                      : 'none'
                    : undefined
                }
                onClick={col.sortable ? () => handleSort(col.key) : undefined}
                className={col.sortable ? 'data-table__cell data-table__cell--head data-table__cell--sortable' : 'data-table__cell data-table__cell--head'}
              >
                {col.header}
                {col.sortable && <span aria-hidden="true">{sortIndicator(col.key)}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="data-table__empty" role="status" aria-live="polite">
                Loading...
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="data-table__empty" role="status">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            sortedData.map((row) => (
              <tr
                key={keyExtractor(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={onRowClick ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onRowClick(row);
                  }
                } : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                role={onRowClick ? 'link' : undefined}
                aria-label={onRowClick && rowLabel ? rowLabel(row) : undefined}
                className={onRowClick ? 'data-table__row data-table__row--interactive' : 'data-table__row'}
              >
                {columns.map((col) => (
                  <td key={col.key} className="data-table__cell">
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
      <div className="live-region" aria-live="polite" aria-atomic="true">
        {sortAnnouncement}
      </div>
    </div>
  );
}
