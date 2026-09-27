import type {
  EntityType,
  FieldMapping,
  FieldResult,
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
export type ValuesMsg = { kind: 'VALUES'; type: EntityType; personId: number };
export type PasteMsg = { kind: 'PASTE'; path: string };
export type TargetMsg = { kind: 'TARGET' };

/** The field the agent last focused on the page. Identity, never a value (§11.4). */
export type PasteTarget = { label: string; selector: string };

/** One row in the side panel's value list (CONTRACTS §11.5). */
export type PaletteValue = {
  path: string;
  label: string;
  value: string;
  kind: 'text' | 'email' | 'date';
};

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
  | SessionMsg
  | ValuesMsg
  | PasteMsg
  | TargetMsg;

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
  VALUES: PaletteValue[];
  PASTE: FieldResult;
  TARGET: PasteTarget | null;
}

/* ── Service worker → content script (chrome.tabs.sendMessage) ────────── */

export type DetectPageMsg = { kind: 'DETECT_PAGE'; index: MappingIndexEntry[] };
export type FillPageMsg = { kind: 'FILL_PAGE'; mapping: FormMapping; payload: unknown };
export type UndoPageMsg = { kind: 'UNDO_PAGE' };
export type ContentRecordModeMsg = { kind: 'RECORD_MODE'; on: boolean; paths: string[] };
export type ContentRecordGetMsg = { kind: 'RECORD_GET' };
export type PasteIntoMsg = { kind: 'PASTE_INTO'; value: PaletteValue };
export type GetTargetMsg = { kind: 'GET_TARGET' };

export type ContentMessage =
  | DetectPageMsg
  | FillPageMsg
  | UndoPageMsg
  | ContentRecordModeMsg
  | ContentRecordGetMsg
  | PasteIntoMsg
  | GetTargetMsg;

export interface ContentResponses {
  DETECT_PAGE: { formKey: string } | null;
  FILL_PAGE: FillReport;
  UNDO_PAGE: { restored: number };
  RECORD_MODE: { on: boolean };
  RECORD_GET: FieldMapping[];
  PASTE_INTO: FieldResult;
  GET_TARGET: PasteTarget | null;
}

/* ── Content script → side panel (chrome.runtime.sendMessage broadcast) ─ */

export type RecordFieldCapturedMsg = {
  kind: 'RECORD_FIELD_CAPTURED';
  field: FieldMapping;
};

/**
 * Content → side panel (§11.4). Broadcast whenever the focused field changes,
 * so the panel can name the paste target. Carries identity, never a value.
 */
export type TargetChangedMsg = { kind: 'TARGET_CHANGED'; target: PasteTarget | null };

export type AnyMessage =
  | PanelMessage
  | ContentMessage
  | RecordFieldCapturedMsg
  | TargetChangedMsg;

export const isMessage = (m: unknown): m is AnyMessage =>
  typeof m === 'object' && m !== null && typeof (m as { kind?: unknown }).kind === 'string';

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });
export const err = (error: string): Result<never> => ({ ok: false, error });
