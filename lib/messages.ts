import type {
  EntityType,
  FieldMapping,
  FillReport,
  FormMapping,
  MappingIndexEntry,
  PersonSummary,
} from '@/lib/schema';

/** Every response crossing a port is a result — never throw across a port. */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/* ── Side panel → service worker ─────────────────────────────────────── */

export type SearchMsg = { kind: 'SEARCH'; type: EntityType; q: string; limit?: number };
export type DetectMsg = { kind: 'DETECT' };
export type PreflightMsg = { kind: 'PREFLIGHT'; type: EntityType; personId: number };
export type FillMsg = { kind: 'FILL'; type: EntityType; personId: number };
export type UndoMsg = { kind: 'UNDO' };
export type EnableSiteMsg = { kind: 'ENABLE_SITE' };
export type RecordModeMsg = { kind: 'RECORD_MODE'; on: boolean };
export type RecordGetMsg = { kind: 'RECORD_GET' };
export type PayloadPathsMsg = { kind: 'PAYLOAD_PATHS' };
export type LoginMsg = { kind: 'LOGIN'; email: string; password: string };
export type LogoutMsg = { kind: 'LOGOUT' };
export type SessionMsg = { kind: 'SESSION' };

/** What the panel may know about a session — never the token (CONTRACTS §10.1). */
export type SessionUser = { id: number; email: string };

export type PanelMessage =
  | SearchMsg
  | DetectMsg
  | PreflightMsg
  | FillMsg
  | UndoMsg
  | EnableSiteMsg
  | RecordModeMsg
  | RecordGetMsg
  | PayloadPathsMsg
  | LoginMsg
  | LogoutMsg
  | SessionMsg;

export interface PanelResponses {
  SEARCH: PersonSummary[];
  DETECT: { formKey: string; mappingVersion: number } | null;
  PREFLIGHT: { formKey: string; missingRequired: string[] } | null;
  FILL: FillReport;
  UNDO: { restored: number };
  ENABLE_SITE: { granted: boolean; origin: string };
  RECORD_MODE: { on: boolean };
  RECORD_GET: FormMapping;
  PAYLOAD_PATHS: string[];
  LOGIN: { user: SessionUser; expiry: string };
  LOGOUT: { ok: true };
  SESSION: { signedIn: boolean; user?: SessionUser; expiry?: string };
}

/* ── Service worker → content script (chrome.tabs.sendMessage) ────────── */

export type DetectPageMsg = { kind: 'DETECT_PAGE'; index: MappingIndexEntry[] };
export type FillPageMsg = { kind: 'FILL_PAGE'; mapping: FormMapping; payload: unknown };
export type UndoPageMsg = { kind: 'UNDO_PAGE' };
export type ContentRecordModeMsg = { kind: 'RECORD_MODE'; on: boolean; paths: string[] };
export type ContentRecordGetMsg = { kind: 'RECORD_GET' };

export type ContentMessage =
  | DetectPageMsg
  | FillPageMsg
  | UndoPageMsg
  | ContentRecordModeMsg
  | ContentRecordGetMsg;

export interface ContentResponses {
  DETECT_PAGE: { formKey: string } | null;
  FILL_PAGE: FillReport;
  UNDO_PAGE: { restored: number };
  RECORD_MODE: { on: boolean };
  RECORD_GET: FieldMapping[];
}

/* ── Content script → side panel (chrome.runtime.sendMessage broadcast) ─ */

export type RecordFieldCapturedMsg = {
  kind: 'RECORD_FIELD_CAPTURED';
  field: FieldMapping;
};

export type AnyMessage = PanelMessage | ContentMessage | RecordFieldCapturedMsg;

export const isMessage = (m: unknown): m is AnyMessage =>
  typeof m === 'object' && m !== null && typeof (m as { kind?: unknown }).kind === 'string';

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });
export const err = (error: string): Result<never> => ({ ok: false, error });
