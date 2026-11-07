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

  const formatted = num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return includeSymbol ? `₹${formatted}` : formatted;
}

export default formatCurrency;
