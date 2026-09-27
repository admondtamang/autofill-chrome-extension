import { describe, it, expect } from 'vitest';
import { toApplicantPayload, toIsoDate, unmappedKeys } from '@/lib/data/crm-map';

describe('CRM record -> ApplicantPayload', () => {
  it('an empty record parses instead of throwing (the reported bug)', () => {
    const p = toApplicantPayload('lead', 42, {});
    expect(p.personRef).toEqual({ type: 'lead', id: 42 });
    expect(p.dob).toBeNull();
    expect(p.passport.number).toBeNull();
    expect(p.serviceTypes).toEqual([]);
  });

  it('maps a realistic snake_case CRM row', () => {
    const p = toApplicantPayload('lead', 7, {
      id: 7, first_name: 'Asha', last_name: 'Gurung',
      date_of_birth: '1994-03-15T00:00:00.000Z',
      email: 'a@example.test', mobile: '+61400000001',
      passport_number: 'PA1234567', passport_expiry_date: '09/01/2032',
      nationality: 'Nepal', visa_type: 'Student (500)',
      residential_address: '1 Test St, Sydney',
    });
    expect(p.name).toEqual({ given: 'Asha', middle: null, family: 'Gurung' });
    expect(p.dob).toBe('1994-03-15');
    expect(p.passport.expires).toBe('2032-01-09'); // day-first slash date
    expect(p.citizenship.label).toBe('Nepal');
    expect(p.contact.phone).toBe('+61400000001');
  });

  it('looks through a `data` wrapper', () => {
    const p = toApplicantPayload('student', 9, { data: { firstName: 'Zoé' } });
    expect(p.name.given).toBe('Zoé');
  });

  it('reports unmapped keys by name only', () => {
    expect(unmappedKeys({ first_name: 'x', weird_column: 'y' })).toEqual(['weird_column']);
  });

  it('normalises dates the engine can parse', () => {
    expect(toIsoDate('15/03/1994')).toBe('1994-03-15');
    expect(toIsoDate('1994-03-15')).toBe('1994-03-15');
    expect(toIsoDate('not a date')).toBeNull();
    expect(toIsoDate(null)).toBeNull();
  });
});
