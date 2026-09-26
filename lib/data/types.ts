import type {
  ApplicantPayload,
  EntityType,
  FillAudit,
  FormMapping,
  MappingIndexEntry,
  PersonSummary,
} from '@/lib/schema';

export type { EntityType };

/** Phase 2 only. */
export interface Session {
  token: string;
  expiry: string; // ISO timestamp
  user: { id: number; email: string };
}

export interface SearchOpts {
  order?: 'asc' | 'desc';
  orderBy?: string;
  limit?: number;
}

export interface DataSource {
  login?(email: string, password: string): Promise<Session>; // Phase 2 only
  search(type: EntityType, q: string, opts?: SearchOpts): Promise<PersonSummary[]>;
  getPayload(type: EntityType, id: number): Promise<ApplicantPayload>;
  listMappings(): Promise<MappingIndexEntry[]>;
  getMapping(formKey: string): Promise<FormMapping>;
  audit(entry: FillAudit): Promise<void>;
}
