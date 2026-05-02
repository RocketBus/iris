"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useBrowserTranslation } from "@/hooks/useBrowserTranslation";

const faqKeys = [
  "whatIs",
  "howWorks",
  "aiTools",
  "privacy",
  "individuals",
  "platform",
  "install",
  "price",
  "contribute",
];

export function SaasFAQ() {
  const { t } = useBrowserTranslation();

  return (
    <section className="py-28 lg:py-32">
      <div className="container">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            {t("faqPage.title")}
          </h2>
          <p className="text-muted-foreground text-lg">
            {t("faqPage.subtitle")}
          </p>
        </div>

        <div className="mt-16">
          <Accordion type="single" collapsible className="space-y-4">
            {faqKeys.map((key, index) => (
              <AccordionItem
                key={key}
                value={`item-${index}`}
                className="rounded-lg border px-6"
              >
                <AccordionTrigger className="text-left hover:no-underline">
                  {t(`faqPage.questions.${key}Title`)}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {t(`faqPage.questions.${key}Answer`)}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}
