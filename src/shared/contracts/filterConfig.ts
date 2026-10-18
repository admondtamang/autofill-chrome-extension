export type FilterConfig = {
  param: string;
  label: string;
  type: "select" | "multiselect" | "date-range" | "text";
  options?: Array<{ value: string; label: string }>;
};

/** Filter bar is hidden while this array is empty */
export const FILTER_CONFIG: FilterConfig[] = [];
