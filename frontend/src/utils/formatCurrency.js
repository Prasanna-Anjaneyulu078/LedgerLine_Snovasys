/**
 * Formats a numeric amount into Indian Rupee (INR) representation with Indian commas.
 * e.g. 150000.5 -> "₹1,50,000.50"
 */
export function formatCurrency(amount, includeSymbol = true) {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return includeSymbol ? '₹0.00' : '0.00';
  }

  const num = Number(amount);
  const formatted = num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return includeSymbol ? `₹${formatted}` : formatted;
}

export default formatCurrency;
