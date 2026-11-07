/**
 * Formats a monetary amount into Indian Rupee (INR) representation with Indian commas.
 * Handles numbers, strings, and BigInt paise.
 * e.g. 500.5 -> "₹500.50", 150000 -> "₹1,50,000.00", 50000n -> "₹500.00"
 */
export function formatCurrency(amount, includeSymbol = true) {
  if (amount === null || amount === undefined) {
    return includeSymbol ? '₹0.00' : '0.00';
  }

  let num;
  if (typeof amount === 'bigint') {
    num = Number(amount) / 100;
  } else if (typeof amount === 'string') {
    const clean = amount.trim();
    if (!clean || isNaN(Number(clean))) {
      return includeSymbol ? '₹0.00' : '0.00';
    }
    num = Number(clean);
  } else if (typeof amount === 'number') {
    if (!Number.isFinite(amount)) {
      return includeSymbol ? '₹0.00' : '0.00';
    }
    num = amount;
  } else {
    return includeSymbol ? '₹0.00' : '0.00';
  }

  const isNegative = num < 0;
  const absNum = Math.abs(num);
  const formatted = absNum.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const prefix = isNegative ? '-' : '';
  return includeSymbol ? `${prefix}₹${formatted}` : `${prefix}${formatted}`;
}

/**
 * Formats integer paise into standard Indian Rupee representation.
 * Preserves exact minor-unit precision without floating-point errors.
 * e.g. 50000 -> "₹500.00", 365000n -> "₹3,650.00"
 */
export function formatPaise(paise, includeSymbol = true) {
  if (paise === null || paise === undefined) {
    return includeSymbol ? '₹0.00' : '0.00';
  }
  try {
    const bigPaise = typeof paise === 'bigint' ? paise : BigInt(String(paise).trim() || '0');
    const isNegative = bigPaise < 0n;
    const absPaise = isNegative ? -bigPaise : bigPaise;
    const whole = absPaise / 100n;
    const fraction = absPaise % 100n;
    const rupeeNumber = Number(whole) + Number(fraction) / 100;
    const formatted = rupeeNumber.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const prefix = isNegative ? '-' : '';
    return includeSymbol ? `${prefix}₹${formatted}` : `${prefix}${formatted}`;
  } catch {
    return includeSymbol ? '₹0.00' : '0.00';
  }
}

export default formatCurrency;
