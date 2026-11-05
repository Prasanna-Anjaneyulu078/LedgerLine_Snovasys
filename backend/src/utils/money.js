/**
 * Financial Money Utilities for LedgerLine
 * Handles minor units (Paise for INR: 1 INR = 100 Paise)
 * Prevents IEEE 754 floating point arithmetic errors by utilizing BigInt exclusively.
 */

export const PAISE_PER_RUPEE = 100n;

/**
 * Converts a rupee representation (string or number like "150.50" or 150) to integer paise (BigInt)
 * @param {string|number|BigInt} val
 * @returns {BigInt}
 */
export function toPaise(val) {
  if (typeof val === 'bigint') {
    return val;
  }

  if (typeof val === 'number') {
    if (!Number.isFinite(val)) {
      throw new TypeError('Amount must be a finite number');
    }
    val = val.toFixed(2);
  }

  if (typeof val !== 'string') {
    throw new TypeError('Amount must be a string, number, or BigInt');
  }

  const clean = val.trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(clean)) {
    throw new Error(`Invalid monetary format: "${val}". Expected integer or decimal with up to 2 decimal places.`);
  }

  const isNegative = clean.startsWith('-');
  const unsigned = isNegative ? clean.slice(1) : clean;

  const parts = unsigned.split('.');
  const wholePart = BigInt(parts[0]);
  let fractionPart = 0n;

  if (parts.length === 2) {
    const fractionStr = parts[1].padEnd(2, '0').slice(0, 2);
    fractionPart = BigInt(fractionStr);
  }

  const totalPaise = wholePart * PAISE_PER_RUPEE + fractionPart;
  return isNegative ? -totalPaise : totalPaise;
}

/**
 * Formats integer paise (BigInt) to standard Rupee string representation (e.g. 15000n -> "150.00")
 * @param {BigInt|string|number} paise
 * @returns {string}
 */
export function formatRupees(paise) {
  const bPaise = typeof paise === 'bigint' ? paise : BigInt(paise);
  const isNegative = bPaise < 0n;
  const abs = isNegative ? -bPaise : bPaise;

  const whole = abs / PAISE_PER_RUPEE;
  const fraction = abs % PAISE_PER_RUPEE;
  const fractionFormatted = fraction.toString().padStart(2, '0');

  return `${isNegative ? '-' : ''}${whole.toString()}.${fractionFormatted}`;
}

/**
 * Validates that an amount in paise is strictly positive (> 0)
 * @param {BigInt|string|number} paise
 * @returns {boolean}
 */
export function isPositivePaise(paise) {
  try {
    const b = typeof paise === 'bigint' ? paise : BigInt(paise);
    return b > 0n;
  } catch {
    return false;
  }
}

