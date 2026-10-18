# Record endpoints: Success CRM

Base URL: `https://api.successedu.com.au/success-crm`

Every endpoint returns the same envelope:

```ts
{ count: number /* total matches */, rows: Row[] }
```

## Record types

| Registry id     | Label          | Endpoint              |
|-----------------|----------------|-----------------------|
| `visaApplicant` | Visa Applicant | `GET /visaApplicant`  |
| `student`       | Student        | `GET /student`        |
| `lead`          | Lead           | `GET /lead`           |

Default record type in the UI: `visaApplicant`.

## Query params

| Param   | Status     | Notes |
|---------|------------|-------|
| `limit` | Confirmed  | Use 25. |
| `q`     | Confirmed  | Free-text search. Which fields it matches is decided server-side. |
| page    | ASSUMPTION | `page` (1-based). Keep the param name and base in ONE constant (`PAGINATION`). `hasMore = loadedRows < count`. |
| filters | TODO       | Names and allowed values not yet provided. Until they are, the filter config is empty and the filter bar is hidden. Do not invent filters. |

## Detail endpoint

None. Search rows contain the full record, so `getDetail(type, id)` resolves from a cache of rows returned by search (keyed by `type:id`).

## Row schemas

- `visaApplicant`: see `samples/visa-applicant.json`.
- `student`, `lead`: **ASSUMPTION:** same fields as `visaApplicant` until samples are added as `samples/student.json` and `samples/lead.json`.
- Every field is nullable. Build zod schemas with every field `.nullable().optional()` and `.passthrough()`. Fields not mapped into ApplicantProfile go to `extras` (see field-map.md).

### Field reference (from the visaApplicant sample)

- **Identity:** `firstName`, `middleName`, `lastName`, `dob`
- **Passport:** `passport` (passport number), `issueDate`, `expiryDate`, `country`
- **Contact:** `email`, `phone` (E.164, e.g. `+61432111111`)
- **Visa:** `currentVisa`, `visaExpiry`, `proposedVisa`, `visaStream`, `location` (`Onshore` / `Offshore`), `visaSubmitted`, `visaGranted`
- **Occupation:** `occupation`, `anzsco`
- **Sponsor / nomination:** `sponsorName`, `sponsorEmail`, `sponsorPhone`, `nominationLodged`, `nominationDecision`, `nominationStatus`
- **Skills assessment:** `sbsStatus`, `sbsSubmissionDate`, `sbsDecisionDate`
- **CRM workflow (display only):** `status`, `statusDate`, `csaStatus`, `requestedDate`, `dueDate`, `assignedDate`
- **Notes (HTML strings):** `remarks`, `visaNote`, `miscNote`
- **Files:** `files: { url, name, size, addedDate }[] | null`
- **Internal (never shown):** `id`, `userId`, `updatedBy`, `branchId`, `sourceId`, `createdAt`, `updatedAt`, `deletedAt`, `invoiceNumber`, `payment`, `paymentStatus`

`id` is still used internally as the record key, but never displayed or filled.
