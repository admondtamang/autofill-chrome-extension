import { useState, useMemo } from "react";
import type { ApplicantProfile } from "@/shared/types/applicantProfile";
import type { RecordType } from "@/shared/contracts/recordType";
import type { FillReport } from "@/shared/contracts/fillReport";
import type { AiSettings } from "../hooks/useAiSettings";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Sparkles, Zap, ArrowLeft, Search, X,
  User, BookOpen, Phone, Plane, Briefcase,
  Building2, Award, BarChart2, StickyNote, Paperclip,
  Package, Copy, Check, AlertCircle,
} from "lucide-react";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { FieldRow, DragInstructions } from "@/components/FieldRow";
import { FillReportSheet } from "./FillReportSheet";
import { cn } from "@/lib/utils";
import * as React from "react";

// ── Constants ─────────────────────────────────────────────────────────────────

const RECORD_TYPE_CONFIG: Record<RecordType, { label: string; color: string; bg: string }> = {
  lead:          { label: "Lead",          color: "text-violet-700", bg: "bg-violet-100" },
  visaApplicant: { label: "Visa Applicant", color: "text-blue-700",   bg: "bg-blue-100"   },
  student:       { label: "Student",        color: "text-emerald-700", bg: "bg-emerald-100" },
};

// ── Types ─────────────────────────────────────────────────────────────────────

type FieldEntry = {
  profilePath: string;
  label: string;
  value: string;
  verify?: boolean;
};

type SectionDef = {
  key: string;
  label: string;
  icon: React.ReactNode;
  fields: FieldEntry[];
};

type UserDataScreenProps = {
  profile: ApplicantProfile;
  recordType: RecordType;
  fillReport: FillReport | null;
  filling: boolean;
  onFillAll: (overwrite: boolean) => Promise<void>;
  onClickToFill: (profilePath: string, value: string) => void;
  onDragStart: (profilePath: string, value: string) => void;
  onChangeClient: () => void;
  onAutoFillChange?: (enabled: boolean) => void;
  aiSettings: AiSettings;
  aiFilling: boolean;
  aiError: string | null;
  onAiFill: (profile: ApplicantProfile, settings: AiSettings) => Promise<FillReport | null>;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function isNonEmpty(v: string | undefined | null): boolean {
  return !!v && v.trim().length > 0;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0] ?? "")
    .join("")
    .toUpperCase() || "?";
}

// ── NoteRow ───────────────────────────────────────────────────────────────────

function NoteRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = React.useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(value).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="space-y-1 py-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="text-xs whitespace-pre-wrap break-words text-foreground">{value}</p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function UserDataScreen({
  profile,
  recordType,
  fillReport,
  filling,
  onFillAll,
  onClickToFill,
  onDragStart,
  onChangeClient,
  onAutoFillChange,
  aiSettings,
  aiFilling,
  aiError,
  onAiFill,
}: UserDataScreenProps) {
  const [overwrite, setOverwrite]     = useState(false);
  const [autoFill, setAutoFill]       = useState(false);
  const [showEmpty, setShowEmpty]     = useState(false);
  const [filterQ, setFilterQ]         = useState("");
  const [filterFocused, setFilterFocused] = useState(false);
  const [reportOpen, setReportOpen]   = useState(false);
  const [aiReport, setAiReport]       = useState<FillReport | null>(null);
  const [aiReportOpen, setAiReportOpen] = useState(false);

  const cfg = RECORD_TYPE_CONFIG[recordType];

  const clientName = [profile.personal?.givenNames, profile.personal?.familyName]
    .filter(Boolean).join(" ") || "Unknown Client";

  const filledPaths = useMemo(
    () => new Set(fillReport?.filled ?? []),
    [fillReport],
  );

  const filterField = (f: FieldEntry): boolean => {
    if (!showEmpty && !isNonEmpty(f.value)) return false;
    if (!filterQ.trim()) return true;
    const q = filterQ.toLowerCase();
    return f.label.toLowerCase().includes(q) || f.value.toLowerCase().includes(q);
  };

  // ── Field data ──────────────────────────────────────────────────────────────

  const sections: SectionDef[] = [
    {
      key: "personal", label: "Personal",
      icon: <User className="h-3.5 w-3.5" />,
      fields: [
        { profilePath: "personal.familyName",  label: "Family Name",  value: profile.personal?.familyName ?? "" },
        { profilePath: "personal.givenNames",  label: "Given Names",  value: profile.personal?.givenNames ?? "" },
        { profilePath: "personal.dateOfBirth", label: "Date of Birth", value: profile.personal?.dateOfBirth ?? "" },
      ],
    },
    {
      key: "passport", label: "Passport",
      icon: <BookOpen className="h-3.5 w-3.5" />,
      fields: [
        { profilePath: "passport.number",       label: "Number",        value: profile.passport?.number ?? "" },
        { profilePath: "passport.dateOfIssue",  label: "Date of Issue", value: profile.passport?.dateOfIssue ?? "" },
        { profilePath: "passport.dateOfExpiry", label: "Date of Expiry", value: profile.passport?.dateOfExpiry ?? "" },
        { profilePath: "passport.country",      label: "Country",       value: profile.passport?.country ?? "" },
      ],
    },
    {
      key: "contact", label: "Contact",
      icon: <Phone className="h-3.5 w-3.5" />,
      fields: [
        { profilePath: "contact.email",  label: "Email",  value: profile.contact?.email ?? "" },
        { profilePath: "contact.mobile", label: "Mobile", value: profile.contact?.mobile ?? "" },
        { profilePath: "address.state",  label: "State",  value: profile.address?.state ?? "" },
      ],
    },
    {
      key: "visa", label: "Visa",
      icon: <Plane className="h-3.5 w-3.5" />,
      fields: [
        { profilePath: "visa.inAustralia",       label: "In Australia",        value: profile.visa?.inAustralia ?? "" },
        { profilePath: "visa.currentVisa",       label: "Current Visa",        value: profile.visa?.currentVisa ?? "" },
        { profilePath: "visa.currentVisaExpiry", label: "Visa Expiry",         value: profile.visa?.currentVisaExpiry ?? "" },
        { profilePath: "visa.proposed",          label: "Proposed",            value: profile.visa?.proposed ?? "" },
        { profilePath: "visa.stream",            label: "Stream",              value: profile.visa?.stream ?? "" },
        { profilePath: "visa.submitted",         label: "Submitted",           value: profile.visa?.submitted ?? "" },
        { profilePath: "visa.granted",           label: "Granted",             value: profile.visa?.granted ?? "" },
      ],
    },
    {
      key: "occupation", label: "Occupation",
      icon: <Briefcase className="h-3.5 w-3.5" />,
      fields: [
        { profilePath: "employment.nominatedOccupation", label: "Occupation", value: profile.employment?.nominatedOccupation ?? "" },
        { profilePath: "employment.anzscoCode",          label: "ANZSCO Code", value: profile.employment?.anzscoCode ?? "" },
      ],
    },
    {
      key: "sponsor", label: "Sponsor & Nomination",
      icon: <Building2 className="h-3.5 w-3.5" />,
      fields: [
        { profilePath: "sponsor.name",           label: "Sponsor Name",       value: profile.sponsor?.name ?? "" },
        { profilePath: "sponsor.email",          label: "Sponsor Email",      value: profile.sponsor?.email ?? "" },
        { profilePath: "sponsor.phone",          label: "Sponsor Phone",      value: profile.sponsor?.phone ?? "" },
        { profilePath: "nomination.lodged",      label: "Nom. Lodged",        value: profile.nomination?.lodged ?? "" },
        { profilePath: "nomination.decision",    label: "Nom. Decision",      value: profile.nomination?.decision ?? "" },
        { profilePath: "nomination.status",      label: "Nom. Status",        value: profile.nomination?.status ?? "" },
      ],
    },
    {
      key: "skills", label: "Skills Assessment",
      icon: <Award className="h-3.5 w-3.5" />,
      fields: [
        { profilePath: "skillsAssessment.status",    label: "Status",    value: profile.skillsAssessment?.status ?? "" },
        { profilePath: "skillsAssessment.submitted", label: "Submitted", value: profile.skillsAssessment?.submitted ?? "" },
        { profilePath: "skillsAssessment.decision",  label: "Decision",  value: profile.skillsAssessment?.decision ?? "" },
      ],
    },
    {
      key: "crm", label: "CRM Status",
      icon: <BarChart2 className="h-3.5 w-3.5" />,
      fields: [
        { profilePath: "crm.status",        label: "Status",         value: profile.crm?.status ?? "" },
        { profilePath: "crm.csaStatus",     label: "CSA Status",     value: profile.crm?.csaStatus ?? "" },
        { profilePath: "crm.assignedDate",  label: "Assigned",       value: profile.crm?.assignedDate ?? "" },
        { profilePath: "crm.requestedDate", label: "Requested",      value: profile.crm?.requestedDate ?? "" },
        { profilePath: "crm.dueDate",       label: "Due Date",       value: profile.crm?.dueDate ?? "" },
      ],
    },
  ];

  const hasVisibleNotes =
    showEmpty || isNonEmpty(profile.notes?.remarks) ||
    isNonEmpty(profile.notes?.visaNote) || isNonEmpty(profile.notes?.miscNote);

  const hasVisibleFiles = showEmpty || (profile.files?.length ?? 0) > 0;
  const extrasFields: FieldEntry[] = (profile.extras ?? []).map((e) => ({
    profilePath: e.path, label: e.label, value: e.value,
  }));

  const renderFields = (fields: FieldEntry[]) => {
    const visible = fields.filter(filterField);
    if (visible.length === 0) return (
      <p className="text-xs text-muted-foreground py-1 px-2">No data</p>
    );
    return (
      <div role="list" className="space-y-0.5">
        {visible.map((f) => (
          <FieldRow
            key={f.profilePath}
            profilePath={f.profilePath}
            label={f.label}
            value={f.value}
            verify={f.verify}
            filled={filledPaths.has(f.profilePath)}
            onClickToFill={onClickToFill}
            onDragStart={onDragStart}
          />
        ))}
      </div>
    );
  };

  const handleFillAll = async () => {
    await onFillAll(overwrite);
    setReportOpen(true);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-background">

      {/* ── Client header ─────────────────────────────────────────────────── */}
      <div className="px-3 pt-3 pb-2.5 border-b bg-background space-y-3">

        {/* Back + client identity */}
        <div className="flex items-center gap-2">
          <button
            onClick={onChangeClient}
            aria-label="Back to search"
            className="flex-shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          {/* Avatar */}
          <div className={cn(
            "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold",
            cfg.bg, cfg.color,
          )}>
            {getInitials(clientName)}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{clientName}</p>
            <span className={cn(
              "inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full",
              cfg.bg, cfg.color,
            )}>
              {cfg.label}
            </span>
          </div>
        </div>

        {/* ── Action buttons ──────────────────────────────────────────────── */}
        <div className="flex gap-1.5">
          <Button
            size="sm"
            className="flex-1 gap-1.5 h-8 text-xs"
            onClick={handleFillAll}
            disabled={filling}
            aria-busy={filling}
          >
            <Zap className="h-3.5 w-3.5" />
            {filling ? "Filling…" : "Fill All"}
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="flex-1 gap-1.5 h-8 text-xs"
            onClick={() => {
              void onAiFill(profile, aiSettings).then((report) => {
                if (report) { setAiReport(report); setAiReportOpen(true); }
              });
            }}
            disabled={aiFilling || filling}
            aria-busy={aiFilling}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {aiFilling ? "AI filling…" : "AI Fill"}
          </Button>
        </div>

        {/* AI error */}
        {aiError && (
          <div className="flex items-start gap-1.5 text-xs text-destructive" role="alert">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            <span>{aiError}</span>
          </div>
        )}

        {/* ── Toggles row ─────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Switch id="overwrite-switch" checked={overwrite} onCheckedChange={setOverwrite} />
            <Label htmlFor="overwrite-switch" className="text-xs cursor-pointer">Overwrite</Label>
          </div>
          <div className="flex items-center gap-1.5">
            <Switch
              id="autofill-switch"
              checked={autoFill}
              onCheckedChange={(v) => { setAutoFill(v); onAutoFillChange?.(v); }}
              disabled={!onAutoFillChange}
            />
            <Label
              htmlFor="autofill-switch"
              className={cn("text-xs cursor-pointer", !onAutoFillChange && "opacity-40")}
            >
              Auto-fill
            </Label>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <Switch id="show-empty-switch" checked={showEmpty} onCheckedChange={setShowEmpty} />
            <Label htmlFor="show-empty-switch" className="text-xs cursor-pointer whitespace-nowrap">
              Show empty
            </Label>
          </div>
        </div>

        {/* ── Field filter ────────────────────────────────────────────────── */}
        <div className={cn(
          "flex items-center gap-2 px-2.5 h-8 rounded-md border bg-muted/40 transition-all duration-150",
          filterFocused && "border-primary ring-1 ring-primary bg-background",
        )}>
          <Search className="h-3 w-3 text-muted-foreground flex-shrink-0" />
          <input
            type="search"
            placeholder="Filter fields…"
            value={filterQ}
            onChange={(e) => setFilterQ(e.target.value)}
            onFocus={() => setFilterFocused(true)}
            onBlur={() => setFilterFocused(false)}
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/60 [&::-webkit-search-cancel-button]:hidden"
            aria-label="Filter fields"
          />
          {filterQ && (
            <button onClick={() => setFilterQ("")} className="text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* ── Accordion sections ────────────────────────────────────────────── */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {fillReport
          ? `Fill complete: ${fillReport.filled.length} filled, ${fillReport.skipped.length} skipped.`
          : ""}
      </div>

      <DragInstructions />

      <div className="flex-1 overflow-y-auto px-2 py-1">
        <Accordion type="multiple" defaultValue={["personal", "passport", "contact", "visa"]}>
          {sections.map(({ key, label, icon, fields }) => (
            <AccordionItem key={key} value={key}>
              <AccordionTrigger className="text-xs font-semibold py-2 hover:no-underline">
                <span className="flex items-center gap-2 text-muted-foreground">
                  {icon}
                  <span className="text-foreground">{label}</span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-1">
                {renderFields(fields)}
              </AccordionContent>
            </AccordionItem>
          ))}

          {/* Notes */}
          {hasVisibleNotes && (
            <AccordionItem value="notes">
              <AccordionTrigger className="text-xs font-semibold py-2 hover:no-underline">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <StickyNote className="h-3.5 w-3.5" />
                  <span className="text-foreground">Notes</span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-1">
                <div className="space-y-2 px-2">
                  {[
                    { key: "remarks",  label: "Remarks",   value: profile.notes?.remarks },
                    { key: "visaNote", label: "Visa Note", value: profile.notes?.visaNote },
                    { key: "miscNote", label: "Misc Note", value: profile.notes?.miscNote },
                  ]
                    .filter((n) => showEmpty || isNonEmpty(n.value))
                    .map((note) => (
                      <NoteRow key={note.key} label={note.label} value={note.value ?? ""} />
                    ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Files */}
          {hasVisibleFiles && (
            <AccordionItem value="files">
              <AccordionTrigger className="text-xs font-semibold py-2 hover:no-underline">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Paperclip className="h-3.5 w-3.5" />
                  <span className="text-foreground">Files</span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-1">
                {profile.files && profile.files.length > 0 ? (
                  <ul className="space-y-1 px-2">
                    {profile.files.map((file) => (
                      <li key={file.url} className="text-xs flex items-center gap-1.5">
                        <Paperclip className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary underline underline-offset-2 truncate"
                        >
                          {file.name}
                        </a>
                        <span className="text-muted-foreground flex-shrink-0">
                          ({formatBytes(file.size)})
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground px-2 py-1">No files.</p>
                )}
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Extras */}
          {extrasFields.length > 0 && (
            <AccordionItem value="other">
              <AccordionTrigger className="text-xs font-semibold py-2 hover:no-underline">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Package className="h-3.5 w-3.5" />
                  <span className="text-foreground">Other</span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-1">
                {renderFields(extrasFields)}
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      </div>

      {/* ── Fill report sheets ────────────────────────────────────────────── */}
      {fillReport && (
        <FillReportSheet fillReport={fillReport} open={reportOpen} onOpenChange={setReportOpen} />
      )}
      {aiReport && (
        <FillReportSheet fillReport={aiReport} open={aiReportOpen} onOpenChange={setAiReportOpen} />
      )}

      {/* Report re-open bar */}
      {((fillReport && !reportOpen) || (aiReport && !aiReportOpen)) && (
        <div className="p-2 border-t flex gap-2">
          {fillReport && !reportOpen && (
            <Button
              variant="outline" size="sm"
              className="flex-1 text-xs gap-1.5 h-7"
              onClick={() => setReportOpen(true)}
            >
              <Zap className="h-3 w-3" />
              Fill report ({fillReport.filled.length} filled)
            </Button>
          )}
          {aiReport && !aiReportOpen && (
            <Button
              variant="outline" size="sm"
              className="flex-1 text-xs gap-1.5 h-7"
              onClick={() => setAiReportOpen(true)}
            >
              <Sparkles className="h-3 w-3" />
              AI report ({aiReport.filled.length} filled)
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
