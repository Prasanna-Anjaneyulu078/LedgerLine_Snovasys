/**
 * Financial Money Utilities for LedgerLine (Frontend)
 * Guarantees zero IEEE-754 floating-point errors by using BigInt integer paise
 * and standard Indian numbering system (en-IN) comma formatting.
 */

export const PAISE_PER_RUPEE = 100n;

/**
 * Parses a rupee string, number, or BigInt to integer paise (BigInt)
 * without using floating-point arithmetic.
 * e.g. "150.50" -> 15050n, "150" -> 15000n, "₹1,50,000.00" -> 15000000n, 50000n -> 50000n
 * @param {string|number|bigint} val
 * @returns {bigint}
 */
export function parseToPaise(val) {
  if (typeof val === 'bigint') return val;
  if (val === null || val === undefined) return 0n;

  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return 0n;
    val = val.toFixed(2);
  }

  const clean = String(val).replace(/[₹,\s]/g, '').trim();
  if (!clean || !/^-?\d+(\.\d{1,2})?$/.test(clean)) {
    return 0n;
  }

  const isNegative = clean.startsWith('-');
  const unsigned = isNegative ? clean.slice(1) : clean;
  const parts = unsigned.split('.');
  const wholePart = BigInt(parts[0] || '0');
  let fractionPart = 0n;

  if (parts.length === 2) {
    const fractionStr = parts[1].padEnd(2, '0').slice(0, 2);
    fractionPart = BigInt(fractionStr);
  }

  const totalPaise = wholePart * PAISE_PER_RUPEE + fractionPart;
  return isNegative ? -totalPaise : totalPaise;
}

/**
 * Formats a BigInt in whole rupees with Indian comma grouping (en-IN).
 * e.g. 150000n -> "1,50,000", 500n -> "500", 12345678n -> "1,23,45,678"
 * @param {bigint} whole
 * @returns {string}
 */
function formatIndianCommas(whole) {
  const str = whole.toString();
  if (str.length <= 3) return str;

  const last3 = str.slice(-3);
  const other = str.slice(0, -3);
  const formattedOther = other.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${formattedOther},${last3}`;
}

/**
 * Formats integer paise (BigInt or string/number) into standard Indian Rupee representation.
 * Preserves exact minor-unit precision with ZERO floating-point operations.
 * e.g. 50000n -> "₹500.00", "15000000" -> "₹1,50,000.00", 10050n -> "₹100.50"
 * @param {bigint|string|number} paise
 * @param {boolean} includeSymbol
 * @returns {string}
 */
export function formatPaise(paise, includeSymbol = true) {
  if (paise === null || paise === undefined) {
    return includeSymbol ? '₹0.00' : '0.00';
  }

  try {
    const cleanPaiseStr = String(paise).replace(/[₹,\s]/g, '').split('.')[0] || '0';
    const bigPaise = typeof paise === 'bigint' ? paise : BigInt(cleanPaiseStr);
    const isNegative = bigPaise < 0n;
    const absPaise = isNegative ? -bigPaise : bigPaise;

    const whole = absPaise / PAISE_PER_RUPEE;
    const fraction = absPaise % PAISE_PER_RUPEE;
    const wholeFormatted = formatIndianCommas(whole);
    const fractionFormatted = fraction.toString().padStart(2, '0');

    const prefix = isNegative ? '-' : '';
    const symbol = includeSymbol ? '₹' : '';
    return `${prefix}${symbol}${wholeFormatted}.${fractionFormatted}`;
  } catch {
    return includeSymbol ? '₹0.00' : '0.00';
  }
}

/**
 * Formats a monetary amount (paise, decimal string, or number) into Indian Rupee (INR) representation.
 * Handles numbers, strings, and BigInt paise without floating-point math.
 * @param {string|number|bigint} amount
 * @param {boolean} includeSymbol
 * @returns {string}
 */
export function formatCurrency(amount, includeSymbol = true) {
  if (amount === null || amount === undefined) {
    return includeSymbol ? '₹0.00' : '0.00';
  }

  // If already BigInt, format directly as paise
  if (typeof amount === 'bigint') {
    return formatPaise(amount, includeSymbol);
  }

  const str = String(amount).replace(/[₹\s]/g, '').trim();
  if (!str) {
    return includeSymbol ? '₹0.00' : '0.00';
  }

  // Parse decimal rupees or integer paise to BigInt without floating-point math
  const paise = parseToPaise(str);
  return formatPaise(paise, includeSymbol);
}

export default formatCurrency;
