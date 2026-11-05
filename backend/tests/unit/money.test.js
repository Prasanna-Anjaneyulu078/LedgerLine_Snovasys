import { toPaise, formatRupees, isPositivePaise } from '../../src/utils/money.js';

describe('Financial Money Utilities (Integer Minor Units / Paise)', () => {
  describe('toPaise', () => {
    test('correctly converts whole rupees string to paise BigInt', () => {
      expect(toPaise('100')).toBe(10000n);
      expect(toPaise('1')).toBe(100n);
      expect(toPaise('0')).toBe(0n);
    });

    test('correctly converts decimal rupees string with two decimal places', () => {
      expect(toPaise('150.50')).toBe(15050n);
      expect(toPaise('0.99')).toBe(99n);
      expect(toPaise('0.05')).toBe(5n);
    });

    test('correctly converts single decimal place rupees string', () => {
      expect(toPaise('150.5')).toBe(15050n);
      expect(toPaise('1.1')).toBe(110n);
    });

    test('handles BigInt input directly without mutation', () => {
      expect(toPaise(5000n)).toBe(5000n);
    });

    test('throws error for invalid non-monetary string inputs', () => {
      expect(() => toPaise('abc')).toThrow();
      expect(() => toPaise('12.345')).toThrow();
      expect(() => toPaise('')).toThrow();
    });
  });

  describe('formatRupees', () => {
    test('formats BigInt paise to standard Rupee currency string', () => {
      expect(formatRupees(10000n)).toBe('100.00');
      expect(formatRupees(15050n)).toBe('150.50');
      expect(formatRupees(99n)).toBe('0.99');
      expect(formatRupees(5n)).toBe('0.05');
      expect(formatRupees(0n)).toBe('0.00');
    });

    test('formats negative amounts correctly', () => {
      expect(formatRupees(-5000n)).toBe('-50.00');
    });
  });

  describe('isPositivePaise', () => {
    test('validates strictly positive paise amounts', () => {
      expect(isPositivePaise(100n)).toBe(true);
      expect(isPositivePaise(1n)).toBe(true);
      expect(isPositivePaise(0n)).toBe(false);
      expect(isPositivePaise(-100n)).toBe(false);
    });
  });
});

