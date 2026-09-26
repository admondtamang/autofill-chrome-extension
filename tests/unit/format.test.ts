import { describe, expect, it } from 'vitest';
import { formatValue, getPath, isTruthy } from '@/lib/fill-engine/format';
import { FieldMapping } from '@/lib/schema';

const field = (over: Partial<FieldMapping> = {}): FieldMapping =>
  FieldMapping.parse({ path: 'dob', selector: '#x', type: 'text', ...over });

describe('getPath', () => {
  it('reads nested dot paths and yields undefined for unknown ones', () => {
    const data = { name: { given: 'Complete' }, addressHistory: [{ street: '1 Test Street' }] };
    expect(getPath(data, 'name.given')).toBe('Complete');
    expect(getPath(data, 'name.middle')).toBeUndefined();
    expect(getPath(data, 'nope.deep.deeper')).toBeUndefined();
    expect(getPath(data, 'addressHistory')).toHaveLength(1);
  });
});

describe('formatValue dates', () => {
  it('renders the mapping pattern', () => {
    expect(formatValue('1994-03-15', field({ type: 'date', format: 'dd/MM/yyyy' }))).toBe('15/03/1994');
    expect(formatValue('1994-03-15', field({ type: 'date', format: 'dd MMM yyyy' }))).toBe('15 Mar 1994');
    expect(formatValue('1994-03-15', field({ type: 'date', format: 'yyyy-MM-dd' }))).toBe('1994-03-15');
    expect(formatValue('1994-03-15', field({ type: 'date', format: 'MM/dd/yy' }))).toBe('03/15/94');
  });

  it('defaults to dd MMM yyyy when the mapping omits a format', () => {
    expect(formatValue('2032-01-09', field({ type: 'date' }))).toBe('09 Jan 2032');
  });

  it('never emits "Invalid Date" — unparseable dates are null', () => {
    for (const bad of ['not-a-date', '15/03/1994', '', '2024-13-45']) {
      expect(formatValue(bad, field({ type: 'date', format: 'dd/MM/yyyy' }))).toBeNull();
    }
  });
});

describe('formatValue scalars', () => {
  it('maps null, undefined and empty string to null', () => {
    expect(formatValue(null, field())).toBeNull();
    expect(formatValue(undefined, field())).toBeNull();
    expect(formatValue('', field())).toBeNull();
  });

  it('joins non-empty arrays and nulls empty ones', () => {
    expect(formatValue(['Education', 'Visa'], field({ type: 'checkbox' }))).toBe('Education, Visa');
    expect(formatValue([], field({ type: 'checkbox' }))).toBeNull();
  });

  it('stringifies booleans and numbers', () => {
    expect(formatValue(true, field({ type: 'checkbox' }))).toBe('true');
    expect(formatValue(false, field({ type: 'checkbox' }))).toBe('false');
    expect(formatValue(42, field())).toBe('42');
  });
});

describe('isTruthy', () => {
  it('follows the CONTRACTS §5 checkbox rule', () => {
    for (const v of ['true', 'yes', '1', 'Visa', 'Education, Visa']) expect(isTruthy(v)).toBe(true);
    for (const v of ['', 'false', 'no', '0', 'OFF']) expect(isTruthy(v)).toBe(false);
  });
});
