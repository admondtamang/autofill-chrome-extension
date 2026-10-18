import * as React from "react";
import {
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";

type SectionAccordionProps = {
  value: string;
  title: string;
  children: React.ReactNode;
};

export function SectionAccordion({
  value,
  title,
  children,
}: SectionAccordionProps) {
  return (
    <AccordionItem value={value}>
      <AccordionTrigger className="text-sm font-medium">
        {title}
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-1">{children}</div>
      </AccordionContent>
    </AccordionItem>
  );
}
