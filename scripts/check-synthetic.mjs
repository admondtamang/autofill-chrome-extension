#!/usr/bin/env node
// Fails the build if data/people.json looks like it holds real client data.
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
const walk = (node, path) => {
  if (typeof node === 'string') return check(node, path);
  if (Array.isArray(node)) return node.forEach((v, i) => walk(v, `${path}[${i}]`));
  if (node && typeof node === 'object')
    return Object.entries(node).forEach(([k, v]) => walk(v, path ? `${path}.${k}` : k));
};

const EMAIL = /^[^\s@]+@[^\s@]+$/;
// Passport-ish: 6-12 chars, all caps letters/digits, contains a digit.
const PASSPORTISH = /^(?=.*\d)[A-Z0-9]{6,12}$/;

const check = (s, path) => {
  if (EMAIL.test(s) && !s.endsWith('@example.test'))
    problems.push(`${path}: email not @example.test — ${s}`);
  if (PASSPORTISH.test(s) && !/^(PA|TEST)/.test(s))
    problems.push(`${path}: passport-like value not prefixed PA/TEST — ${s}`);
};

walk(JSON.parse(raw), '');

if (problems.length) {
  console.error('check:synthetic FAILED — data/people.json must hold synthetic data only');
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log('check:synthetic OK');
