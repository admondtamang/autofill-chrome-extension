import { describe, it, expect } from 'vitest';
import {
  extraValues,
  parseServiceTypes,
  splitCountry,
  toApplicantPayload,
  toIsoDate,
} from '@/lib/data/crm-map';

// Records copied from the live CRM (2026-09-27). Field names verified, values
// are the CRM's own lorem-ipsum test data — no real client information.
const LEAD_35 = {
  id: 35, firstName: 'Duis', middleName: null, lastName: 'dolorem et exer',
  dob: null, passport: null, issueDate: null, expiryDate: null,
  email: 'rubukejis@yopmail.com', phone: '+16575761893', status: 'New',
  serviceType: '["Tribunal Service"]', country: null, visa: null, visaExpiry: null,
  address: null, location: null, occupation: null, anzsco: null, qualification: null,
};

const LEAD_32 = {
  id: 32, firstName: 'Leila', middleName: 'Sierra Bell', lastName: 'Hampton',
  dob: '09/01/2026', email: 'honojih@yopmail.com', phone: '+11413382693',
  passport: 'Quasi quisquam eu et',
  issueDate: '2026-08-01T18:15:00.000Z', expiryDate: '2026-11-29T18:15:00.000Z',
  status: 'Converted', serviceType: '[]', country: 'AUT', visa: 'AAT Hearing',
  visaExpiry: '2026-09-29T18:15:00.000Z', address: 'Vero cumque deserunt',
  location: 'Onshore', occupation: 'Chief Executive or Managing Director',
  qualification: 'Ex eius accusamus su',
};

describe('real CRM lead -> ApplicantPayload', () => {
  it('a mostly-null lead parses; absent values become null, not an error', () => {
    const p = toApplicantPayload('lead', 35, LEAD_35);
    expect(p.name).toEqual({ given: 'Duis', middle: null, family: 'dolorem et exer' });
    expect(p.contact.email).toBe('rubukejis@yopmail.com');
    expect(p.dob).toBeNull();
    expect(p.passport.number).toBeNull();
    expect(p.serviceTypes).toEqual(['Tribunal Service']);
  });

  it('a populated lead maps every field the CRM actually has', () => {
    const p = toApplicantPayload('lead', 32, LEAD_32);
    expect(p.name.middle).toBe('Sierra Bell');
    expect(p.passport.number).toBe('Quasi quisquam eu et');
    expect(p.passport.issued).toBe('2026-08-01');   // ISO datetime -> date
    expect(p.passport.expires).toBe('2026-11-29');
    expect(p.citizenship).toEqual({ code: 'AUT', label: null }); // ISO-3 code
    expect(p.currentVisa).toEqual({ type: 'AAT Hearing', expires: '2026-09-29' });
    expect(p.employment.occupation).toBe('Chief Executive or Managing Director');
    expect(p.education.highest).toBe('Ex eius accusamus su');
    expect(p.location).toBe('Onshore');
    expect(p.serviceTypes).toEqual([]);
  });

  it('reads dob MONTH-first, as the CRM stores it', () => {
    // "07/13/2026" is the proof: 13 cannot be a month.
    expect(toIsoDate('07/13/2026')).toBe('2026-07-13');
    expect(toIsoDate('09/01/2026')).toBe('2026-09-01'); // 1 Sept, not 9 Jan
    expect(toIsoDate('08/22/2026')).toBe('2026-08-22');
    // ...but a value that cannot be month-first is still read day-first.
    expect(toIsoDate('25/12/2026')).toBe('2026-12-25');
    expect(toIsoDate('13/13/2026')).toBeNull();
  });

  it('parses serviceType, which arrives as a JSON string', () => {
    expect(parseServiceTypes('["Education","Skill Assessment"]')).toEqual(['Education', 'Skill Assessment']);
    expect(parseServiceTypes('[]')).toEqual([]);
    expect(parseServiceTypes(null)).toEqual([]);
    expect(parseServiceTypes('Visa')).toEqual(['Visa']); // not JSON: one service
  });

  it('tells an ISO country code from a country name', () => {
    expect(splitCountry('NPL')).toEqual({ code: 'NPL', label: null });
    expect(splitCountry('Nepal')).toEqual({ code: null, label: 'Nepal' });
    expect(splitCountry(null)).toEqual({ code: null, label: null });
  });
});

describe('extra CRM values (§11.6)', () => {
  it('offers fields ApplicantPayload has no slot for', () => {
    const extras = extraValues(LEAD_35);
    const paths = extras.map((e) => e.path);
    expect(paths).toContain('crm.status'); // "New" — useful to paste, never mapped
    // ...but never the mapped ones, which the payload already lists.
    expect(paths).not.toContain('crm.firstName');
    expect(paths).not.toContain('crm.email');
  });

  it('skips ids, audit timestamps and nested structures', () => {
    const extras = extraValues({
      id: 35, userId: 1, updatedBy: 1, createdAt: 'x', updatedAt: 'x', deletedAt: null,
      files: [{ name: 'a.pdf' }], clientIds: { studentId: [] }, user: { firstName: 'Super' },
      remarks: 'call back',
    });
    expect(extras.map((e) => e.path)).toEqual(['crm.remarks']);
  });

  it('humanises the label', () => {
    const [only] = extraValues({ leadStage: 'Contacted' });
    expect(only?.label).toBe('Lead stage');
  });
});
