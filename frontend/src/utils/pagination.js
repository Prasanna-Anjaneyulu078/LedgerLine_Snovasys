/**
 * Global Pagination Configuration and Shared Preferences
 * Standardized across all paginated pages in LedgerLine.
 */

export const DEFAULT_PAGE_SIZE = 15;
export const PAGE_SIZE_OPTIONS = [15, 25, 50];

const STORAGE_KEY = 'ledgerline_page_size';

/**
 * Retrieves the user's preferred page size from localStorage,
 * falling back to DEFAULT_PAGE_SIZE (15).
 */
export const getStoredPageSize = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const parsed = parseInt(stored, 10);
    if (PAGE_SIZE_OPTIONS.includes(parsed)) {
      return parsed;
    }
  } catch {
    // Graceful fallback for non-browser or restricted storage environments
  }
  return DEFAULT_PAGE_SIZE;
};

/**
 * Persists the user's preferred page size to localStorage.
 */
export const setStoredPageSize = (size) => {
  try {
    const num = parseInt(size, 10);
    if (PAGE_SIZE_OPTIONS.includes(num)) {
      localStorage.setItem(STORAGE_KEY, String(num));
    }
  } catch {
    // Graceful fallback
  }
};

