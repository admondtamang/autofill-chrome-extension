import { z } from "zod";

export const fillReportSchema = z.object({
  filled: z.array(z.string()),
  skipped: z.array(z.string()),
  notFound: z.array(z.string()),
  failed: z.array(z.object({ field: z.string(), reason: z.string() })),
});

export type FillReport = z.infer<typeof fillReportSchema>;

export const emptyFillReport = (): FillReport => ({
  filled: [],
  skipped: [],
  notFound: [],
  failed: [],
});
