import { beforeEach, describe, expect, it, vi } from 'vitest';
import peopleJson from '@/data/people.json';
import plainMapping from '@/data/mappings/plain.json';
import repeatMapping from '@/data/mappings/repeat.json';
import { fillPage, preflight, restore } from '@/lib/fill-engine';
import { captureValues } from '@/lib/fill-engine/undo';
import { isUnsafe } from '@/lib/fill-engine/safety';
import { verify } from '@/lib/fill-engine/verify';
import { matchOption } from '@/lib/fill-engine/handlers';
import { ApplicantPayload, FormMapping, type FieldStatus } from '@/lib/schema';

const people = peopleJson.map((p) => ApplicantPayload.parse(p));
const complete = people[0]!;
const sparse = people[1]!;

const PLAIN = FormMapping.parse(plainMapping);
const REPEAT = FormMapping.parse(repeatMapping);

const statuses = (results: { path: string; status: FieldStatus }[]) =>
  Object.fromEntries(results.map((r) => [r.path, r.status]));

const el = <T extends Element>(selector: string): T => {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`no element for ${selector}`);
  return found;
};

const PLAIN_HTML = `
  <h1>Plain Personal Details</h1>
  <form id="plain-form" onsubmit="return false">
    <input type="text" id="given" name="given">
    <input type="text" id="family" name="family">
    <input type="text" id="email" name="email">
    <input type="text" id="phone" name="phone">
    <input type="text" id="dob" name="dob">
    <select id="country" name="country">
      <option value="">-- select --</option>
      <option value="c-0041">Australia</option>
      <option value="c-0577">Nepal</option>
    </select>
    <select id="visaType" name="visaType">
      <option value="">-- select --</option>
      <option value="Student (500)">Student visa, subclass 500</option>
    </select>
    <fieldset>
      <legend>Applying from</legend>
      <label><input type="radio" name="applyFrom" value="Onshore"> Onshore</label>
      <label><input type="radio" name="applyFrom" value="Offshore"> Offshore</label>
    </fieldset>
    <label for="usingAgent">Using an agent</label>
    <input type="checkbox" id="usingAgent" name="usingAgent">
    <textarea id="residential" name="residential"></textarea>
  </form>`;

describe('fillPage — every handler type', () => {
  beforeEach(() => {
    document.body.innerHTML = PLAIN_HTML;
  });

  it('fills text, textarea, date, select-by-label, select-by-value, radio and checkbox', async () => {
    const report = await fillPage(PLAIN, complete);

    expect(report.formKey).toBe('fixture-plain');
    expect(report.mappingVersion).toBe(1);
    expect(report.results.every((r) => r.status === 'filled')).toBe(true);

    expect(el<HTMLInputElement>('#given').value).toBe('Complete');
    expect(el<HTMLInputElement>('#family').value).toBe('Applicant');
    expect(el<HTMLInputElement>('#email').value).toBe('complete.applicant@example.test');
    expect(el<HTMLInputElement>('#dob').value).toBe('15/03/1994'); // dd/MM/yyyy
    expect(el<HTMLSelectElement>('#country').value).toBe('c-0577'); // matched by label 'Nepal'
    expect(el<HTMLSelectElement>('#visaType').value).toBe('Student (500)'); // matched by value
    expect(el<HTMLInputElement>('input[name="applyFrom"][value="Onshore"]').checked).toBe(true);
    expect(el<HTMLInputElement>('input[name="applyFrom"][value="Offshore"]').checked).toBe(false);
    expect(el<HTMLInputElement>('#usingAgent').checked).toBe(true); // serviceTypes: ['Visa']
    expect(el<HTMLTextAreaElement>('#residential').value).toBe('1 Test Street, Sydney NSW 2000');
  });

  it('marks absent values missing without writing to them', async () => {
    const report = await fillPage(PLAIN, sparse);
    expect(statuses(report.results)).toEqual({
      'name.given': 'filled',
      'name.family': 'filled',
      'contact.email': 'filled',
      'contact.phone': 'missing',
      dob: 'missing',
      'citizenship.label': 'missing',
      'currentVisa.type': 'missing',
      location: 'missing',
      serviceTypes: 'missing', // empty array
      'address.residential': 'missing',
    });
    expect(el<HTMLInputElement>('#dob').value).toBe('');
    expect(el<HTMLInputElement>('#usingAgent').checked).toBe(false);
    expect(el('#dob').className).toContain('immifill-missing');
  });

  it('reports not_found when neither selector nor label resolves', async () => {
    document.body.innerHTML = '<form></form>';
    const report = await fillPage(PLAIN, complete);
    expect(report.results.every((r) => r.status === 'not_found')).toBe(true);
    expect(report.results[0]?.detail).toBe('selector and label both missed');
  });

  it('injects exactly one style element and highlights by final status', async () => {
    await fillPage(PLAIN, complete);
    await fillPage(PLAIN, complete);
    expect(document.querySelectorAll('#immifill-style')).toHaveLength(1);
    expect(el('#given').className).toContain('immifill-filled');
  });
});

describe('select matching', () => {
  it('matches UPPERCASE option text case-insensitively (immi-saved style)', () => {
    document.body.innerHTML = `<select id="s">
        <option value="">-- select --</option>
        <option value="NPL">NEPAL</option>
        <option value="AUS">AUSTRALIA</option>
      </select>`;
    const select = el<HTMLSelectElement>('#s');
    expect(matchOption(select, 'Nepal')?.value).toBe('NPL');
    expect(matchOption(select, '  nepal ')?.value).toBe('NPL');
    expect(matchOption(select, 'AUS')?.value).toBe('AUS'); // exact value wins
    expect(matchOption(select, 'Nowhere')).toBeNull();
  });

  it('reports rejected with a value-free detail when no option matches', async () => {
    document.body.innerHTML = `<select id="s"><option value="AUS">Australia</option></select>`;
    const mapping = FormMapping.parse({
      formKey: 'k',
      version: 1,
      pageMatch: { host: 'h', urlIncludes: '', headingText: '' },
      fields: [{ path: 'citizenship.label', selector: '#s', type: 'select' }],
    });
    const report = await fillPage(mapping, complete);
    expect(report.results[0]).toEqual({
      path: 'citizenship.label',
      status: 'rejected',
      detail: 'no matching option',
    });
    expect(report.results[0]?.detail).not.toContain('Nepal');
  });
});

describe('verify', () => {
  it('returns false for a field that reformats on blur', () => {
    document.body.innerHTML = '<input type="text" id="phone">';
    const input = el<HTMLInputElement>('#phone');
    input.addEventListener('blur', () => {
      input.value = input.value.replace(/[\s+]/g, '');
    });
    const field = { path: 'contact.phone', selector: '#phone', type: 'text', required: false } as const;
    input.value = '+61 400 000 001';
    input.dispatchEvent(new Event('blur'));
    expect(verify(input, field, '+61 400 000 001')).toBe(false);
    expect(verify(input, field, '61400000001')).toBe(true);
  });
});

describe('undo', () => {
  beforeEach(() => {
    document.body.innerHTML = PLAIN_HTML;
  });

  it('round-trips: snapshot before the fill restores the prior values', async () => {
    el<HTMLInputElement>('#given').value = 'Prior';
    el<HTMLSelectElement>('#country').value = 'c-0041';
    el<HTMLInputElement>('#usingAgent').checked = true;

    const report = await fillPage(PLAIN, complete);
    expect(el<HTMLInputElement>('#given').value).toBe('Complete');

    const restored = restore(report.snapshot);
    expect(restored).toBeGreaterThan(0);
    expect(el<HTMLInputElement>('#given').value).toBe('Prior');
    expect(el<HTMLSelectElement>('#country').value).toBe('c-0041');
    expect(el<HTMLInputElement>('#usingAgent').checked).toBe(true);
    expect(el<HTMLTextAreaElement>('#residential').value).toBe('');
  });

  it('restores every member of a radio group, not just the first', async () => {
    const offshore = el<HTMLInputElement>('input[name="applyFrom"][value="Offshore"]');
    offshore.checked = true;

    const report = await fillPage(PLAIN, complete); // location: 'Onshore'
    expect(el<HTMLInputElement>('input[name="applyFrom"][value="Onshore"]').checked).toBe(true);
    expect(offshore.checked).toBe(false);

    restore(report.snapshot);
    expect(offshore.checked).toBe(true);
    expect(el<HTMLInputElement>('input[name="applyFrom"][value="Onshore"]').checked).toBe(false);
  });

  it('snapshots each radio under its own selector and counts what it restored', () => {
    const snap = captureValues(PLAIN);
    const radios = snap.filter((s) => s.selector.startsWith('[name="applyFrom"]'));
    expect(radios.map((s) => s.selector)).toEqual([
      '[name="applyFrom"][value="Onshore"]',
      '[name="applyFrom"][value="Offshore"]',
    ]);
    expect(restore(snap)).toBe(snap.length);
  });

  it('captures values before the first write', () => {
    el<HTMLInputElement>('#given').value = 'Prior';
    const snap = captureValues(PLAIN);
    expect(snap.find((s) => s.selector === '#given')).toEqual({
      selector: '#given',
      kind: 'value',
      value: 'Prior',
    });
    expect(snap.find((s) => s.selector === '#usingAgent')?.kind).toBe('checked');
  });
});

const REPEAT_HTML = `
  <h1>Address History Rows</h1>
  <form id="repeat-form" onsubmit="return false">
    <div id="addresses"></div>
    <button type="button" id="add-address">Add another address</button>
  </form>`;

/** Mirrors fixtures/repeat.html: each click appends one index-named row. */
function wireAddButton(): () => number {
  const host = el('#addresses');
  const button = el<HTMLButtonElement>('#add-address');
  let n = 0;
  const clicks = { count: 0 };
  button.addEventListener('click', () => {
    clicks.count += 1;
    const idx = n++;
    const row = document.createElement('div');
    row.className = 'address-row';
    for (const key of ['street', 'city', 'country', 'from', 'to']) {
      const input = document.createElement('input');
      input.type = 'text';
      input.id = `addr_${idx}_${key}`;
      input.name = `addr[${idx}].${key}`;
      row.appendChild(input);
    }
    host.appendChild(row);
  });
  return () => clicks.count;
}

describe('repeat groups (CONTRACTS §9.1)', () => {
  beforeEach(() => {
    document.body.innerHTML = REPEAT_HTML;
  });

  it('0 items: every group field is missing and the add button is never clicked', async () => {
    const clicks = wireAddButton();
    const report = await fillPage(REPEAT, sparse);
    expect(clicks()).toBe(0);
    expect(document.querySelectorAll('.address-row')).toHaveLength(0);
    expect(report.results.map((r) => r.path)).toEqual([
      'addressHistory[].street',
      'addressHistory[].city',
      'addressHistory[].country',
      'addressHistory[].from',
      'addressHistory[].to',
    ]);
    expect(report.results.every((r) => r.status === 'missing')).toBe(true);
  });

  it('1 item: one click, one row, paths carry the literal index', async () => {
    const clicks = wireAddButton();
    const oneRow = ApplicantPayload.parse({ ...complete, addressHistory: [complete.addressHistory[0]] });
    const report = await fillPage(REPEAT, oneRow);

    expect(clicks()).toBe(1);
    expect(document.querySelectorAll('.address-row')).toHaveLength(1);
    expect(statuses(report.results)).toEqual({
      'addressHistory[0].street': 'filled',
      'addressHistory[0].city': 'filled',
      'addressHistory[0].country': 'filled',
      'addressHistory[0].from': 'filled',
      'addressHistory[0].to': 'filled',
    });
    expect(el<HTMLInputElement>('[name="addr[0].street"]').value).toBe('1 Test Street');
    expect(el<HTMLInputElement>('[name="addr[0].from"]').value).toBe('2021-06-01');
  });

  it('2 items: exactly two clicks, values scoped per row', async () => {
    const clicks = wireAddButton();
    const report = await fillPage(REPEAT, complete);

    expect(clicks()).toBe(2);
    expect(document.querySelectorAll('.address-row')).toHaveLength(2);
    expect(report.results).toHaveLength(10);
    expect(report.results.every((r) => r.status === 'filled')).toBe(true);
    expect(el<HTMLInputElement>('[name="addr[0].city"]').value).toBe('Sydney');
    expect(el<HTMLInputElement>('[name="addr[1].city"]').value).toBe('Kathmandu');
    expect(el<HTMLInputElement>('[name="addr[1].street"]').value).toBe('42 Example Road');
  });

  it('refuses an add button with submit semantics', async () => {
    document.body.innerHTML = `
      <form><div id="addresses"></div><button type="submit" id="add-address">Next</button></form>`;
    const spy = vi.fn();
    el('#add-address').addEventListener('click', spy);
    const report = await fillPage(REPEAT, complete);
    expect(spy).not.toHaveBeenCalled();
    expect(report.results.every((r) => r.status === 'not_found')).toBe(true);
  });
});

describe('safety (CONTRACTS §8)', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <form id="f">
        <input type="text" id="safe" name="safe">
        <label><input type="checkbox" id="declaration" name="declaration"> I declare this is correct.</label>
        <label><input type="checkbox" id="bare"> I declare the information is complete.</label>
        <button type="submit" id="next">Next</button>
        <input type="submit" id="pay" value="Pay">
        <button type="button" id="continueBtn">Continue</button>
      </form>`;
  });

  it('isUnsafe refuses submit, next, pay, continue, declarations and forms', () => {
    for (const sel of ['#declaration', '#bare', '#next', '#pay', '#continueBtn', '#f']) {
      expect(isUnsafe(el(sel))).toBe(true);
    }
    expect(isUnsafe(el('#safe'))).toBe(false);
  });

  it('refuses submit-shaped elements regardless of their wording (H1 structural gate)', () => {
    document.body.innerHTML = `
      <form id="f2">
        <button id="defaulted">Zebra</button>
        <input type="image" id="img" src="x.png" alt="Zebra">
        <input type="submit" id="sub" value="Zebra">
        <button type="submit" id="btnsub">Zebra</button>
        <button type="button" id="fa" formaction="/lodge">Zebra</button>
        <input type="text" id="fm" formmethod="post">
        <input type="text" id="harmless" name="givenName">
      </form>
      <button id="loose">Zebra</button>`;
    for (const sel of ['#f2', '#defaulted', '#img', '#sub', '#btnsub', '#fa', '#fm', '#loose']) {
      expect(isUnsafe(el(sel)), sel).toBe(true);
    }
    expect(isUnsafe(el('#harmless'))).toBe(false);
  });

  it('refuses the wider submit/consent vocabulary (H1), ImmiAccount "Lodge" included', () => {
    const words = [
      'Lodge application',
      'Confirm',
      'I agree to the terms',
      'Accept',
      'Proceed',
      'Acknowledge',
      'Finish',
      'Complete',
      'OK',
      'Send',
      'Save',
      'Apply',
      'Consent',
    ];
    document.body.innerHTML = words
      .map((w, i) => `<button type="button" id="w${i}">${w}</button>`)
      .join('');
    words.forEach((w, i) => expect(isUnsafe(el(`#w${i}`)), w).toBe(true));

    // Word-boundary matching: ordinary field wording must still be fillable.
    document.body.innerHTML = `
      <label id="l1">Applicant given name<input type="text" id="ok1"></label>
      <label id="l2">Bangkok<input type="text" id="ok2"></label>`;
    expect(isUnsafe(el('#ok1'))).toBe(false);
    expect(isUnsafe(el('#ok2'))).toBe(false);
  });

  it('never writes to a declaration checkbox even when a mapping points at one', async () => {
    const spy = vi.fn();
    el('#next').addEventListener('click', spy);
    el('#pay').addEventListener('click', spy);

    const mapping = FormMapping.parse({
      formKey: 'hostile',
      version: 1,
      pageMatch: { host: 'h', urlIncludes: '', headingText: '' },
      fields: [
        { path: 'serviceTypes', selector: '#declaration', type: 'checkbox' },
        { path: 'name.given', selector: '#safe', type: 'text' },
      ],
    });
    const report = await fillPage(mapping, complete);

    expect(el<HTMLInputElement>('#declaration').checked).toBe(false);
    expect(statuses(report.results)).toEqual({ serviceTypes: 'not_found', 'name.given': 'filled' });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('preflight', () => {
  it('lists required paths with no usable value', () => {
    expect(preflight(PLAIN, complete)).toEqual([]);
    expect(preflight(PLAIN, sparse)).toEqual(['dob', 'citizenship.label']);
  });

  it('flags an empty repeat group once per field and indexes rows otherwise', () => {
    expect(preflight(REPEAT, sparse)).toEqual(['addressHistory[].street']);
    expect(preflight(REPEAT, complete)).toEqual([]);

    const holed = ApplicantPayload.parse({
      ...complete,
      addressHistory: [{ street: null, city: 'Sydney', country: 'Australia', from: null, to: null }],
    });
    expect(preflight(REPEAT, holed)).toEqual(['addressHistory[0].street']);
  });
});
