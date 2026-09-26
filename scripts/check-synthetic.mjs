#!/usr/bin/env node
// Fails the build if data/people.json looks like it holds real client data.
//
// WHAT THIS PROTECTS AGAINST: someone pasting a real CRM record into the repo "just to
// test". Identity-bearing fields (names, phones, addresses) are checked against an
// ALLOW-LIST of the five synthetic people, so anything unrecognised fails loudly.
// Emails and passport numbers are checked by shape.
//
// WHAT IT DOES NOT PROTECT AGAINST: real data placed anywhere other than
// data/people.json (mappings, fixtures, test files, logs, git history); a real record
// laundered into the allowed synthetic values; free-text fields not listed in ALLOW
// (occupation, education, visa type) — a regex cannot tell a real job title from a fake
// one. It is a tripwire, not a guarantee.
import { readFile } from 'node:fs/promises';

const FILE = new URL('../data/people.json', import.meta.url);

const raw = await readFile(FILE, 'utf8').catch((e) => {
  if (e.code === 'ENOENT') return null;
  throw e;
});
if (raw == null) {
  console.log('check:synthetic — data/people.json absent, skipping');
  process.exit(0);
}

const problems = [];

// Walk every string in the tree; JSON shape may change, the rules do not.
// Arrays are recursed too, so addressHistory[] entries are covered.
const walk = (node, path) => {
  if (typeof node === 'string') return check(node, path);
  if (Array.isArray(node)) return node.forEach((v, i) => walk(v, `${path}[${i}]`));
  if (node && typeof node === 'object')
    return Object.entries(node).forEach(([k, v]) => walk(v, path ? `${path}.${k}` : k));
};

const EMAIL = /^[^\s@]+@[^\s@]+$/;
// Passport-ish: 6-20 alphanumerics containing a digit, any case. Must be PA/TEST-prefixed.
const PASSPORTISH = /^(?=.*\d)[A-Za-z0-9]{6,20}$/;
const SYNTHETIC_PASSPORT = /^(PA|TEST)\d{5,9}$/;

// The five synthetic people are a fixed, known set. Anything outside it is treated as a
// potential real-client value. To add a synthetic person: add their values here in the
// same commit as the data/people.json change — do not disable this check.
const ALLOW = {
  given: ['Complete', 'Sparse', 'Long', 'Zoé', 'Invalid'],
  middle: ['Test', 'Maria Josephine Anne', 'आदित्य', 'Passport'],
  family: ['Applicant', "O'Connor-Fitzwilliam-Abernathy-Testington", 'Núñez-श्रेष्ठ'],
  phone: ['+61400000001', '+61400000003', '+9779800000004', '+61400000005'],
  residential: [
    '1 Test Street, Sydney NSW 2000',
    'Unit 12B, 900 Example Parade, Melbourne VIC 3000',
    'काठमाडौं, Ward 5, Kathmandu',
    '7 Expired Lane, Brisbane QLD 4000',
  ],
  street: ['1 Test Street', '42 Example Road', '900 Example Parade', 'Ward 5 Marg', '7 Expired Lane'],
  city: ['Sydney', 'Kathmandu', 'Melbourne', 'काठमाडौं', 'Brisbane'],
};

const leafKey = (path) => path.split('.').pop()?.replace(/\[\d+\]$/, '') ?? '';

const check = (s, path) => {
  if (EMAIL.test(s) && !s.endsWith('@example.test'))
    problems.push(`${path}: email not @example.test — ${s}`);

  const key = leafKey(path);
  if (key === 'number' && path.includes('passport') && !SYNTHETIC_PASSPORT.test(s))
    problems.push(`${path}: passport number must match PA/TEST + 5-9 digits — ${s}`);
  else if (PASSPORTISH.test(s) && !SYNTHETIC_PASSPORT.test(s) && !/^(PA|TEST)/.test(s))
    problems.push(`${path}: passport-like value not prefixed PA/TEST — ${s}`);

  const allowed = ALLOW[key];
  if (allowed && !allowed.includes(s))
    problems.push(`${path}: "${s}" is not one of the known synthetic values for "${key}"`);
};

walk(JSON.parse(raw), '');

if (problems.length) {
  console.error('check:synthetic FAILED — data/people.json must hold synthetic data only');
  for (const p of problems) console.error('  ' + p);
  console.error(
    '\nIf this is a NEW synthetic person and not real client data, add their name, phone\n' +
      'and address values to the ALLOW list at the top of scripts/check-synthetic.mjs in\n' +
      'the same commit. Emails must end @example.test; passports must be PA/TEST + digits.\n' +
      'Do not disable this check — it is the only thing standing between a pasted CRM\n' +
      'record and a public repo.',
  );
  process.exit(1);
}
console.log('check:synthetic OK');
