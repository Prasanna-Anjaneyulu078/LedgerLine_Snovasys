import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, setStoredPageSize } from '../../utils/pagination.js';
import './index.css';

/**
 * Standardized Database-Backed Pagination Component
 * Adheres to LedgerLine design system and accessibility guidelines.
 */
const Pagination = ({
  currentPage = 1,
  pageSize = DEFAULT_PAGE_SIZE,
  totalRecords = 0,
  totalPages = 1,
  onPageChange,
  onPageSizeChange,
  disabled = false,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
}) => {
  const safeTotalPages = Math.max(1, totalPages);
  const safeCurrentPage = Math.min(Math.max(1, currentPage), safeTotalPages);

  const startRecord = totalRecords === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const endRecord = Math.min(safeCurrentPage * pageSize, totalRecords);

  const handlePageChange = (page) => {
    if (page < 1 || page > safeTotalPages || page === safeCurrentPage || disabled) return;
    if (onPageChange) {
      onPageChange(page);
    }
  };

  const handlePageSizeChange = (e) => {
    const newSize = parseInt(e.target.value, 10);
    setStoredPageSize(newSize);
    if (onPageSizeChange) {
      onPageSizeChange(newSize);
    }
  };

  /**
   * Generates page number sequence with smart ellipses
   * e.g. [1, 2, 3, 4, 5, '...', 9] or [1, '...', 4, 5, 6, '...', 12]
   */
  const getPageNumbers = () => {
    if (safeTotalPages <= 7) {
      return Array.from({ length: safeTotalPages }, (_, i) => i + 1);
    }

    if (safeCurrentPage <= 4) {
      return [1, 2, 3, 4, 5, '...', safeTotalPages];
    }

    if (safeCurrentPage >= safeTotalPages - 3) {
      return [1, '...', safeTotalPages - 4, safeTotalPages - 3, safeTotalPages - 2, safeTotalPages - 1, safeTotalPages];
    }

    return [1, '...', safeCurrentPage - 1, safeCurrentPage, safeCurrentPage + 1, '...', safeTotalPages];
  };

  const pageNumbers = getPageNumbers();

  return (
    <div className="pagination-container" aria-label="Table pagination navigation">
      {/* Range and Total Display */}
      <div className="pagination-info-group">
        <span className="pagination-range-text">
          {totalRecords === 0 ? (
            'Showing 0 records'
          ) : (
            <>
              Showing <strong>{startRecord}–{endRecord}</strong> of <strong>{totalRecords}</strong>
            </>
          )}
        </span>

        <span className="pagination-page-indicator">
          Page <strong>{safeCurrentPage}</strong> of <strong>{safeTotalPages}</strong>
        </span>

        {/* Page Size Selector */}
        {pageSizeOptions && pageSizeOptions.length > 0 && onPageSizeChange && (
          <div className="pagination-size-selector">
            <label htmlFor="pagination-page-size" className="pagination-size-label">
              Rows:
            </label>
            <select
              id="pagination-page-size"
              className="pagination-size-select"
              value={pageSize}
              onChange={handlePageSizeChange}
              disabled={disabled}
              aria-label="Records per page"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      <div className="pagination-controls">
        {/* Previous Button */}
        <button
          type="button"
          className="pagination-nav-btn"
          onClick={() => handlePageChange(safeCurrentPage - 1)}
          disabled={safeCurrentPage <= 1 || disabled}
          aria-label="Previous Page"
        >
          <ChevronLeft size={15} />
          <span>Previous</span>
        </button>

        {/* Number Buttons & Ellipses */}
        <div className="pagination-pages" role="navigation" aria-label="Page navigation">
          {pageNumbers.map((item, idx) => {
            if (item === '...') {
              return (
                <span key={`ellipsis-${idx}`} className="pagination-ellipsis" aria-hidden="true">
                  &hellip;
                </span>
              );
            }

            const isCurrent = item === safeCurrentPage;
            return (
              <button
                key={`page-${item}`}
                type="button"
                className={`pagination-page-btn ${isCurrent ? 'active' : ''}`}
                onClick={() => handlePageChange(item)}
                disabled={disabled}
                aria-current={isCurrent ? 'page' : undefined}
                aria-label={`Page ${item}`}
              >
                {item}
              </button>
            );
          })}
        </div>

        {/* Next Button */}
        <button
          type="button"
          className="pagination-nav-btn"
          onClick={() => handlePageChange(safeCurrentPage + 1)}
          disabled={safeCurrentPage >= safeTotalPages || totalRecords === 0 || disabled}
          aria-label="Next Page"
        >
          <span>Next</span>
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
};

export default Pagination;

