import React, { useState } from 'react';
import { Search } from 'lucide-react';
import './index.css';

const DataTable = ({
  columns,
  data,
  title,
  subtitle,
  actions,
  searchPlaceholder = 'Search records...',
  searchField,
  emptyMessage = 'No records found matching criteria.',
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredData = React.useMemo(() => {
    if (!searchTerm || !data) return data || [];
    const term = searchTerm.toLowerCase();

    return data.filter((row) => {
      if (searchField && row[searchField]) {
        return String(row[searchField]).toLowerCase().includes(term);
      }
      return Object.values(row).some(
        (val) => val && String(val).toLowerCase().includes(term)
      );
    });
  }, [data, searchTerm, searchField]);

  return (
    <div className="data-table-container">
      {(title || actions || searchField) && (
        <div className="data-table-toolbar">
          <div className="data-table-title-area">
            {title && <h3 className="data-table-title">{title}</h3>}
            {subtitle && <p className="data-table-subtitle">{subtitle}</p>}
          </div>

          <div className="data-table-actions">
            {searchField && (
              <div className="data-table-search">
                <Search size={14} className="data-table-search-icon" />
                <input
                  type="text"
                  placeholder={searchPlaceholder}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            )}
            {actions}
          </div>
        </div>
      )}

      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((col, idx) => (
                <th
                  key={idx}
                  className={
                    col.align === 'right'
                      ? 'text-right'
                      : col.align === 'center'
                      ? 'text-center'
                      : 'text-left'
                  }
                  style={{ width: col.width }}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="data-table-empty">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              filteredData.map((row, rowIdx) => (
                <tr key={row.id || rowIdx}>
                  {columns.map((col, colIdx) => (
                    <td
                      key={colIdx}
                      className={`tabular-nums ${
                        col.align === 'right'
                          ? 'text-right'
                          : col.align === 'center'
                          ? 'text-center'
                          : 'text-left'
                      }`}
                    >
                      {col.render ? col.render(row) : row[col.accessor]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DataTable;
