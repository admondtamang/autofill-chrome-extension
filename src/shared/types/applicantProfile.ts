export type ApplicantProfile = {
  personal?: {
    familyName?: string;
    givenNames?: string;
    dateOfBirth?: string;
  };
  passport?: {
    number?: string;
    dateOfIssue?: string;
    dateOfExpiry?: string;
    country?: string;
  };
  contact?: {
    email?: string;
    mobile?: string;
  };
  address?: {
    state?: string;
  };
  visa?: {
    inAustralia?: "Yes" | "No";
    currentVisa?: string;
    currentVisaExpiry?: string;
    proposed?: string;
    stream?: string;
    submitted?: string;
    granted?: string;
  };
  employment?: {
    nominatedOccupation?: string;
    anzscoCode?: string;
  };
  sponsor?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  nomination?: {
    lodged?: string;
    decision?: string;
    status?: string;
  };
  skillsAssessment?: {
    status?: string;
    submitted?: string;
    decision?: string;
  };
  crm?: {
    status?: string;
    csaStatus?: string;
    assignedDate?: string;
    requestedDate?: string;
    dueDate?: string;
  };
  /** Plain text only — HTML stripped. Display/copy only; never filled. */
  notes?: {
    remarks?: string;
    visaNote?: string;
    miscNote?: string;
  };
  files?: Array<{
    url: string;
    name: string;
    size: number;
    addedDate: string;
  }>;
  /** Any remaining visible, non-internal raw fields */
  extras?: Array<{
    path: string;
    label: string;
    value: string;
  }>;
};
