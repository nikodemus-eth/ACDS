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
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  emptyMessage = 'No data',
}: DataTableProps<T>) {
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  function handleSort(key: string) {
    if (sortColumn === key) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(key);
      setSortDirection('asc');
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
    <div className="table-wrap">
      <table className="data-table">
        <thead className="data-table__head">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                onClick={col.sortable ? () => handleSort(col.key) : undefined}
                className={col.sortable ? 'data-table__cell data-table__cell--head data-table__cell--sortable' : 'data-table__cell data-table__cell--head'}
              >
                {col.header}
                {col.sortable ? sortIndicator(col.key) : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="data-table__empty">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            sortedData.map((row) => (
              <tr
                key={keyExtractor(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
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
    </div>
  );
}
