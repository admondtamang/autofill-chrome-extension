import { describe, it, expect } from 'vitest';
import { maskValue, targetLabel, dropFieldFor } from '@/lib/palette';
import { isUnsafe } from '@/lib/fill-engine/safety';

describe('masking (CONTRACTS §11.2)', () => {
  it('keeps the first 3 characters and bullets the rest', () => {
    expect(maskValue('PA1234567', 'text')).toBe('PA1••••••');
  });
  it('keeps an email domain so the account is recognisable', () => {
    expect(maskValue('asdd@yopmail.com', 'email')).toBe('asd•@yopmail.com');
  });
  it('masks a short value entirely — "first 3" would be all of it', () => {
    expect(maskValue('ab', 'text')).toBe('••');
  });
});

describe('paste target (CONTRACTS §11.4)', () => {
  it('names a field by its label, not its selector', () => {
    document.body.innerHTML =
      '<label for="fam">Family name *</label><input id="fam">';
    const el = document.querySelector('#fam') as HTMLInputElement;
    expect(targetLabel(el)).toBe('Family name');
  });

  it('falls back to the name attribute when there is no label', () => {
    document.body.innerHTML = '<input name="ctl00$txtGiven">';
    const el = document.querySelector('input') as HTMLInputElement;
    expect(targetLabel(el)).toBe('ctl00$txtGiven');
  });
});

describe('a paste is never a bypass (CONTRACTS §11.3)', () => {
  it('refuses a declaration checkbox and a submit control as targets', () => {
    document.body.innerHTML = `
      <form>
        <input type="checkbox" id="declaration">
        <label for="declaration">I declare the information is correct</label>
        <button id="next">Next</button>
        <input type="submit" value="Lodge">
        <input type="text" id="safe">
      </form>`;
    for (const sel of ['#declaration', '#next', 'input[type=submit]']) {
      expect(isUnsafe(document.querySelector(sel)!), sel).toBe(true);
    }
    expect(isUnsafe(document.querySelector('#safe')!)).toBe(false);
  });

  it('formats a date through the target mapping when the field is mapped', () => {
    document.body.innerHTML = '<input id="dob">';
    const el = document.querySelector('#dob') as HTMLInputElement;
    const field = dropFieldFor(
      el,
      { path: 'dob', label: 'Date of birth', value: '1994-03-15', kind: 'date' },
      { path: 'dob', selector: '#dob', type: 'date', format: 'dd/MM/yyyy', required: false },
    );
    expect(field.type).toBe('date');
    expect(field.format).toBe('dd/MM/yyyy');
  });
});
