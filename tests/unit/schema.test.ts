import { describe, expect, it } from 'vitest';
import { ApplicantPayload } from '@/lib/schema';

const valid = {
  personRef: { type: 'lead', id: 1001 },
  name: { given: 'Complete', middle: 'Test', family: 'Applicant' },
  dob: '1994-03-15',
  contact: { email: 'complete.applicant@example.test', phone: '+61400000001' },
  passport: { number: 'PA1234567', issued: '2022-01-10', expires: '2032-01-09' },
  citizenship: { code: 'NPL', label: 'Nepal' },
  currentVisa: { type: 'Student (500)', expires: '2027-02-28' },
  address: { residential: '1 Test Street, Sydney NSW 2000' },
  location: 'Onshore',
  employment: { occupation: 'Software Engineer' },
  education: { highest: 'Bachelor of IT' },
  serviceTypes: ['Visa'],
};

describe('ApplicantPayload', () => {
  it('parses a valid payload and defaults addressHistory', () => {
    const parsed = ApplicantPayload.parse(valid);
    expect(parsed.personRef.id).toBe(1001);
    expect(parsed.addressHistory).toEqual([]);
  });

  it('rejects a bad payload', () => {
    const bad = { ...valid, personRef: { type: 'not-a-type', id: 'x' } };
    expect(ApplicantPayload.safeParse(bad).success).toBe(false);
  });
});
