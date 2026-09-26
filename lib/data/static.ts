import { z } from 'zod';
import peopleJson from '@/data/people.json';
import {
  ApplicantPayload,
  FillAudit,
  FormMapping,
  MappingIndexEntry,
  type EntityType,
  type PersonSummary,
} from '@/lib/schema';
import type { DataSource, SearchOpts } from '@/lib/data/types';
import { NotFoundError } from '@/lib/data/errors';

// Parsed once at module load: a drifted people.json fails the whole bundle
// loudly instead of surfacing as an undefined field mid-fill.
const people = z.array(ApplicantPayload).parse(peopleJson);

// Alias base is the project root ('@' -> repo root, set by WXT/Vitest), so the
// pattern is stable no matter where this module sits. Verified by the test that
// asserts all six mappings load — a broken base silently yields {}.
const mappings: FormMapping[] = Object.values(
  import.meta.glob('@/data/mappings/*.json', { eager: true, import: 'default' }),
).map((m) => FormMapping.parse(m));

/**
 * `orderBy` alias table. The UI speaks flat field names; the payload is nested.
 *   'firstName' -> name.given   (default)
 *   'lastName'  -> name.family
 *   'email'     -> contact.email
 * Anything else falls back to the default.
 */
const ORDER_KEYS = {
  firstName: (p: ApplicantPayload) => p.name.given,
  lastName: (p: ApplicantPayload) => p.name.family,
  email: (p: ApplicantPayload) => p.contact.email ?? '',
} as const;

function orderKey(orderBy: string): (p: ApplicantPayload) => string {
  return ORDER_KEYS[orderBy as keyof typeof ORDER_KEYS] ?? ORDER_KEYS.firstName;
}

function toSummary(p: ApplicantPayload): PersonSummary {
  const middle = p.name.middle ? ` ${p.name.middle}` : '';
  return {
    personRef: p.personRef,
    displayName: `${p.name.given}${middle} ${p.name.family}`,
    email: p.contact.email,
    subtitle: p.currentVisa.type ?? p.citizenship.label,
  };
}

export class StaticDataSource implements DataSource {
  async search(
    type: EntityType,
    q: string,
    { order = 'asc', orderBy = 'firstName', limit = 25 }: SearchOpts = {},
  ): Promise<PersonSummary[]> {
    const needle = q.trim().toLowerCase();
    const key = orderKey(orderBy);
    const dir = order === 'asc' ? 1 : -1;
    return people
      .filter((p) => p.personRef.type === type)
      .filter(
        (p) =>
          !needle ||
          `${p.name.given} ${p.name.family} ${p.contact.email ?? ''}`
            .toLowerCase()
            .includes(needle),
      )
      .sort((a, b) => key(a).localeCompare(key(b)) * dir)
      .slice(0, limit)
      .map(toSummary);
  }

  async getPayload(type: EntityType, id: number): Promise<ApplicantPayload> {
    const p = people.find((x) => x.personRef.type === type && x.personRef.id === id);
    if (!p) throw new NotFoundError(`no ${type} with id ${id}`);
    return ApplicantPayload.parse(structuredClone(p)); // same Zod validation as Phase 2
  }

  async listMappings(): Promise<MappingIndexEntry[]> {
    return mappings.map((m) => MappingIndexEntry.parse(m));
  }

  async getMapping(formKey: string): Promise<FormMapping> {
    const m = mappings.find((x) => x.formKey === formKey);
    if (!m) throw new NotFoundError(`no mapping for ${formKey}`);
    return FormMapping.parse(m); // fresh copy: callers never mutate the bundle
  }

  async audit(entry: FillAudit): Promise<void> {
    // FillAudit.parse is the guard, not decoration: it proves the entry carries
    // counts only (CONTRACTS §8.1) before anything reaches the console.
    console.info('[immifill audit]', FillAudit.parse(entry));
  }
}
