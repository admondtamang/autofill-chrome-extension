import { useState, useMemo } from "react";
import type { ApplicantProfile } from "@/shared/types/applicantProfile";
import type { RecordType } from "@/shared/contracts/recordType";
import type { FillReport } from "@/shared/contracts/fillReport";
import type { AiSettings } from "../hooks/useAiSettings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Sparkles } from "lucide-react";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { FieldRow, DragInstructions } from "@/components/FieldRow";
import { FillReportSheet } from "./FillReportSheet";

const RECORD_TYPE_LABELS: Record<RecordType, string> = {
  visaApplicant: "Visa Applicant",
  student: "Student",
  lead: "Lead",
};

type FieldEntry = {
  profilePath: string;
  label: string;
  value: string;
  verify?: boolean;
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

function isNonEmpty(value: string | undefined | null): boolean {
  if (value === undefined || value === null) return false;
  return value.trim().length > 0;
}

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
  const [overwrite, setOverwrite] = useState(false);
  const [autoFill, setAutoFill] = useState(false);
  const [showEmpty, setShowEmpty] = useState(false);
  const [filterQ, setFilterQ] = useState("");
  const [reportOpen, setReportOpen] = useState(false);

  const clientName = [
    profile.personal?.givenNames,
    profile.personal?.familyName,
  ]
    .filter(Boolean)
    .join(" ") || "Unknown Client";

  // Collect filled paths from fillReport
  const filledPaths = useMemo(
    () => new Set(fillReport?.filled ?? []),
    [fillReport],
  );

  const filterField = (entry: FieldEntry): boolean => {
    if (!showEmpty && !isNonEmpty(entry.value)) return false;
    if (filterQ.trim().length === 0) return true;
    const q = filterQ.toLowerCase();
    return (
      entry.label.toLowerCase().includes(q) ||
      entry.value.toLowerCase().includes(q)
    );
  };

  // Build field lists per section
  const personalFields: FieldEntry[] = [
    {
      profilePath: "personal.familyName",
      label: "Family Name",
      value: profile.personal?.familyName ?? "",
    },
    {
      profilePath: "personal.givenNames",
      label: "Given Names",
      value: profile.personal?.givenNames ?? "",
    },
    {
      profilePath: "personal.dateOfBirth",
      label: "Date of Birth",
      value: profile.personal?.dateOfBirth ?? "",
    },
  ];

  const passportFields: FieldEntry[] = [
    {
      profilePath: "passport.number",
      label: "Passport Number",
      value: profile.passport?.number ?? "",
    },
    {
      profilePath: "passport.dateOfIssue",
      label: "Date of Issue",
      value: profile.passport?.dateOfIssue ?? "",
    },
    {
      profilePath: "passport.dateOfExpiry",
      label: "Date of Expiry",
      value: profile.passport?.dateOfExpiry ?? "",
    },
    {
      profilePath: "passport.country",
      label: "Country",
      value: profile.passport?.country ?? "",
    },
  ];

  const contactFields: FieldEntry[] = [
    {
      profilePath: "contact.email",
      label: "Email",
      value: profile.contact?.email ?? "",
    },
    {
      profilePath: "contact.mobile",
      label: "Mobile",
      value: profile.contact?.mobile ?? "",
    },
    {
      profilePath: "address.state",
      label: "State",
      value: profile.address?.state ?? "",
    },
  ];

  const visaFields: FieldEntry[] = [
    {
      profilePath: "visa.inAustralia",
      label: "In Australia",
      value: profile.visa?.inAustralia ?? "",
    },
    {
      profilePath: "visa.currentVisa",
      label: "Current Visa",
      value: profile.visa?.currentVisa ?? "",
    },
    {
      profilePath: "visa.currentVisaExpiry",
      label: "Current Visa Expiry",
      value: profile.visa?.currentVisaExpiry ?? "",
    },
    {
      profilePath: "visa.proposed",
      label: "Proposed Visa",
      value: profile.visa?.proposed ?? "",
    },
    {
      profilePath: "visa.stream",
      label: "Stream",
      value: profile.visa?.stream ?? "",
    },
    {
      profilePath: "visa.submitted",
      label: "Submitted",
      value: profile.visa?.submitted ?? "",
    },
    {
      profilePath: "visa.granted",
      label: "Granted",
      value: profile.visa?.granted ?? "",
    },
  ];

  const occupationFields: FieldEntry[] = [
    {
      profilePath: "employment.nominatedOccupation",
      label: "Nominated Occupation",
      value: profile.employment?.nominatedOccupation ?? "",
    },
    {
      profilePath: "employment.anzscoCode",
      label: "ANZSCO Code",
      value: profile.employment?.anzscoCode ?? "",
    },
  ];

  const sponsorFields: FieldEntry[] = [
    {
      profilePath: "sponsor.name",
      label: "Sponsor Name",
      value: profile.sponsor?.name ?? "",
    },
    {
      profilePath: "sponsor.email",
      label: "Sponsor Email",
      value: profile.sponsor?.email ?? "",
    },
    {
      profilePath: "sponsor.phone",
      label: "Sponsor Phone",
      value: profile.sponsor?.phone ?? "",
    },
    {
      profilePath: "nomination.lodged",
      label: "Nomination Lodged",
      value: profile.nomination?.lodged ?? "",
    },
    {
      profilePath: "nomination.decision",
      label: "Nomination Decision",
      value: profile.nomination?.decision ?? "",
    },
    {
      profilePath: "nomination.status",
      label: "Nomination Status",
      value: profile.nomination?.status ?? "",
    },
  ];

  const skillsFields: FieldEntry[] = [
    {
      profilePath: "skillsAssessment.status",
      label: "SA Status",
      value: profile.skillsAssessment?.status ?? "",
    },
    {
      profilePath: "skillsAssessment.submitted",
      label: "SA Submitted",
      value: profile.skillsAssessment?.submitted ?? "",
    },
    {
      profilePath: "skillsAssessment.decision",
      label: "SA Decision",
      value: profile.skillsAssessment?.decision ?? "",
    },
  ];

  const crmFields: FieldEntry[] = [
    {
      profilePath: "crm.status",
      label: "CRM Status",
      value: profile.crm?.status ?? "",
    },
    {
      profilePath: "crm.csaStatus",
      label: "CSA Status",
      value: profile.crm?.csaStatus ?? "",
    },
    {
      profilePath: "crm.assignedDate",
      label: "Assigned Date",
      value: profile.crm?.assignedDate ?? "",
    },
    {
      profilePath: "crm.requestedDate",
      label: "Requested Date",
      value: profile.crm?.requestedDate ?? "",
    },
    {
      profilePath: "crm.dueDate",
      label: "Due Date",
      value: profile.crm?.dueDate ?? "",
    },
  ];

  const extrasFields: FieldEntry[] = (profile.extras ?? []).map((e) => ({
    profilePath: e.path,
    label: e.label,
    value: e.value,
  }));

  const renderFields = (fields: FieldEntry[]) => {
    const visible = fields.filter(filterField);
    if (visible.length === 0) return null;
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

  const hasVisibleNotes =
    showEmpty ||
    isNonEmpty(profile.notes?.remarks) ||
    isNonEmpty(profile.notes?.visaNote) ||
    isNonEmpty(profile.notes?.miscNote);

  const hasVisibleFiles =
    showEmpty || (profile.files !== undefined && profile.files.length > 0);

  const handleFillAll = async () => {
    await onFillAll(overwrite);
    setReportOpen(true);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm flex-1 min-w-0 truncate">
            {clientName}
          </span>
          <Badge variant="secondary" className="flex-shrink-0 text-xs">
            {RECORD_TYPE_LABELS[recordType]}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            className="flex-shrink-0"
            onClick={onChangeClient}
            aria-label="Change client"
          >
            Change
          </Button>
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            onClick={handleFillAll}
            disabled={filling}
            aria-busy={filling}
            aria-label="Fill all fields on current page"
          >
            {filling ? "Filling…" : "Fill all"}
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => void onAiFill(profile, aiSettings)}
            disabled={aiFilling || filling}
            aria-busy={aiFilling}
            aria-label="Fill form using AI"
            className="gap-1.5"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {aiFilling ? "AI filling…" : "AI Fill"}
          </Button>

          <div className="flex items-center gap-1.5">
            <Switch
              id="overwrite-switch"
              checked={overwrite}
              onCheckedChange={setOverwrite}
              aria-label="Overwrite existing values"
            />
            <Label htmlFor="overwrite-switch" className="text-xs">
              Overwrite
            </Label>
          </div>

          <div className="flex items-center gap-1.5">
            <Switch
              id="autofill-switch"
              checked={autoFill}
              onCheckedChange={(enabled) => {
                setAutoFill(enabled);
                onAutoFillChange?.(enabled);
              }}
              disabled={!onAutoFillChange}
              title={!onAutoFillChange ? "Coming soon" : undefined}
              aria-label="Auto-fill each ImmiAccount page"
            />
            <Label htmlFor="autofill-switch" className="text-xs">
              Auto-fill
            </Label>
          </div>
        </div>

        {/* AI error */}
        {aiError && (
          <p className="text-xs text-destructive" role="alert">{aiError}</p>
        )}

        {/* In-panel filter */}
        <div className="flex items-center gap-2">
          <Input
            type="search"
            aria-label="Filter fields by label or value"
            placeholder="Filter fields…"
            value={filterQ}
            onChange={(e) => setFilterQ(e.target.value)}
            className="h-8 text-xs"
          />
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Switch
              id="show-empty-switch"
              checked={showEmpty}
              onCheckedChange={setShowEmpty}
              aria-label="Show empty fields"
            />
            <Label htmlFor="show-empty-switch" className="text-xs whitespace-nowrap">
              Show empty
            </Label>
          </div>
        </div>
      </div>

      {/* aria-live region for fill announcements */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {fillReport
          ? `Fill complete: ${fillReport.filled.length} filled, ${fillReport.skipped.length} skipped, ${fillReport.notFound.length} not found, ${fillReport.failed.length} failed.`
          : ""}
      </div>

      {/* Single drag instructions element for all FieldRows */}
      <DragInstructions />

      {/* Accordion sections */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        <Accordion type="multiple" defaultValue={["personal", "passport", "contact", "visa"]}>
          <AccordionItem value="personal">
            <AccordionTrigger className="text-sm font-medium">Personal</AccordionTrigger>
            <AccordionContent>
              {renderFields(personalFields)}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="passport">
            <AccordionTrigger className="text-sm font-medium">Passport</AccordionTrigger>
            <AccordionContent>
              {renderFields(passportFields)}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="contact">
            <AccordionTrigger className="text-sm font-medium">Contact</AccordionTrigger>
            <AccordionContent>
              {renderFields(contactFields)}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="visa">
            <AccordionTrigger className="text-sm font-medium">Visa</AccordionTrigger>
            <AccordionContent>
              {renderFields(visaFields)}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="occupation">
            <AccordionTrigger className="text-sm font-medium">Occupation</AccordionTrigger>
            <AccordionContent>
              {renderFields(occupationFields)}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="sponsor">
            <AccordionTrigger className="text-sm font-medium">Sponsor &amp; Nomination</AccordionTrigger>
            <AccordionContent>
              {renderFields(sponsorFields)}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="skills">
            <AccordionTrigger className="text-sm font-medium">Skills Assessment</AccordionTrigger>
            <AccordionContent>
              {renderFields(skillsFields)}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="crm">
            <AccordionTrigger className="text-sm font-medium">CRM Status</AccordionTrigger>
            <AccordionContent>
              {renderFields(crmFields)}
            </AccordionContent>
          </AccordionItem>

          {/* Notes — display/copy only */}
          {hasVisibleNotes && (
            <AccordionItem value="notes">
              <AccordionTrigger className="text-sm font-medium">Notes</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2">
                  {[
                    { key: "remarks", label: "Remarks", value: profile.notes?.remarks },
                    { key: "visaNote", label: "Visa Note", value: profile.notes?.visaNote },
                    { key: "miscNote", label: "Misc Note", value: profile.notes?.miscNote },
                  ]
                    .filter((n) => showEmpty || isNonEmpty(n.value))
                    .map((note) => (
                      <NoteRow
                        key={note.key}
                        label={note.label}
                        value={note.value ?? ""}
                      />
                    ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Files — links only */}
          {hasVisibleFiles && (
            <AccordionItem value="files">
              <AccordionTrigger className="text-sm font-medium">Files</AccordionTrigger>
              <AccordionContent>
                {profile.files && profile.files.length > 0 ? (
                  <ul className="space-y-1">
                    {profile.files.map((file) => (
                      <li key={file.url} className="text-xs">
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {file.name}
                        </a>
                        <span className="text-muted-foreground ml-1">
                          ({formatBytes(file.size)})
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">No files.</p>
                )}
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Other / Extras */}
          {extrasFields.length > 0 && (
            <AccordionItem value="other">
              <AccordionTrigger className="text-sm font-medium">Other</AccordionTrigger>
              <AccordionContent>
                {renderFields(extrasFields)}
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      </div>

      {/* Fill report sheet */}
      {fillReport && (
        <FillReportSheet
          fillReport={fillReport}
          open={reportOpen}
          onOpenChange={setReportOpen}
        />
      )}

      {/* Open report button if there's a report and sheet is closed */}
      {fillReport && !reportOpen && (
        <div className="p-2 border-t">
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={() => setReportOpen(true)}
            aria-label="View fill report"
          >
            View fill report ({fillReport.filled.length} filled)
          </Button>
        </div>
      )}
    </div>
  );
}

type NoteRowProps = {
  label: string;
  value: string;
};

function NoteRow({ label, value }: NoteRowProps) {
  const handleCopy = () => {
    navigator.clipboard.writeText(value).catch(() => {
      // Silently ignore
    });
  };

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs"
          aria-label={`Copy ${label}`}
          onClick={handleCopy}
        >
          Copy
        </Button>
      </div>
      <p className="text-xs whitespace-pre-wrap break-words">{value}</p>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
