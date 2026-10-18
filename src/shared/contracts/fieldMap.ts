export type LocatorStrategy =
  | { type: "label"; value: string }
  | { type: "aria-label"; value: string }
  | { type: "name-id"; value: string };

export type ControlType = "text" | "textarea" | "select" | "radio" | "checkbox" | "date";

export type TransformName = "date" | "country" | "phone" | "state" | "notes";

export type FieldEntry = {
  profilePath: string;
  locator: LocatorStrategy;
  control: ControlType;
  transform?: TransformName;
  /** false = synthetic fixture only; not verified against a real ImmiAccount page */
  verified: boolean;
};

export type FieldMap = {
  id: string;
  pageMatcher: RegExp | string;
  fields: FieldEntry[];
  /** false = synthetic fixture only; must be validated against a real ImmiAccount HTML fixture */
  verified: boolean;
};
