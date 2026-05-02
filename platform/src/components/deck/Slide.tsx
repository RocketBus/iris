"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Bilingual, Slide as SlideType } from "@/lib/deck-content";
import type { Language } from "@/lib/translations";

function pick(b: Bilingual, lang: Language): string {
  return lang === "pt-BR" ? b.pt : b.en;
}

export function Slide({
  slide,
  index,
  total,
  lang,
  active,
}: {
  slide: SlideType;
  index: number;
  total: number;
  lang: Language;
  active: boolean;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: false, margin: "-20% 0px -20% 0px" });
  const show = inView || active;

  const eyebrow = slide.eyebrow ? pick(slide.eyebrow, lang) : "";
  const headline = pick(slide.headline, lang);
  const lede = slide.lede ? pick(slide.lede, lang) : "";
  const what = slide.what ? pick(slide.what, lang) : "";
  const why = slide.why ? pick(slide.why, lang) : "";

  const WHAT_LABEL = lang === "pt-BR" ? "O que mede" : "What it measures";
  const WHY_LABEL = lang === "pt-BR" ? "Por que importa" : "Why it matters";

  return (
    <section
      ref={ref}
      id={`slide-${index + 1}`}
      data-slide-index={index}
      className={cn(
        "relative min-h-screen w-full snap-start flex items-center justify-center py-28 sm:py-32",
        slide.kind === "chapter" && "bg-card/30",
        slide.kind === "cover" && "noise-bg scanlines",
      )}
    >
      {slide.kind === "cover" && <div className="grid-dots absolute inset-0" />}

      <div className="relative z-10 mx-auto w-full max-w-6xl px-6 sm:px-8">
        {eyebrow && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={show ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
            transition={{ duration: 0.4 }}
            className="font-mono text-xs uppercase tracking-[0.2em] text-signal-purple"
          >
            {eyebrow}
          </motion.div>
        )}

        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={show ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          className={cn(
            "mt-4 font-bold tracking-tight",
            slide.kind === "cover"
              ? "text-4xl sm:text-5xl lg:text-6xl text-glow"
              : slide.kind === "chapter"
                ? "text-3xl sm:text-5xl lg:text-6xl"
                : "text-3xl sm:text-4xl lg:text-5xl",
          )}
        >
          {headline}
        </motion.h2>

        {lede && (
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={show ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className={cn(
              "mt-5 max-w-3xl text-muted-foreground",
              slide.kind === "cover" || slide.kind === "chapter"
                ? "text-lg sm:text-xl"
                : "text-base sm:text-lg",
            )}
          >
            {lede}
          </motion.p>
        )}

        {(what || why) && (
          <div className="mt-10 grid gap-4 lg:grid-cols-2">
            {what && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={show ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                transition={{ duration: 0.5, delay: 0.15 }}
              >
                <Card className="h-full border-border/50 bg-card/30">
                  <CardContent className="p-6">
                    <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-signal-purple">
                      {WHAT_LABEL}
                    </div>
                    <p className="mt-3 text-sm sm:text-base leading-relaxed">
                      {what}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            )}
            {why && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={show ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                <Card className="h-full border-border/50 bg-card/30 hover:border-signal-purple/30 transition-colors">
                  <CardContent className="p-6">
                    <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-signal-yellow">
                      {WHY_LABEL}
                    </div>
                    <p className="mt-3 text-sm sm:text-base leading-relaxed">
                      {why}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>
        )}

        {slide.visual && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={show ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="mt-8"
          >
            <SlideVisual visual={slide.visual} lang={lang} />
          </motion.div>
        )}

        <div
          aria-hidden
          className="mt-10 font-mono text-[10px] tracking-widest text-muted-foreground/60"
        >
          {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </div>
      </div>
    </section>
  );
}

function SlideVisual({
  visual,
  lang,
}: {
  visual: NonNullable<SlideType["visual"]>;
  lang: Language;
}) {
  if (visual.type === "code") {
    return (
      <div className="rounded-lg border border-signal-purple/20 bg-card/50 px-5 py-4 font-mono text-sm glow-primary-sm">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <span className="text-signal-purple">&gt;</span>
          <span className="text-foreground font-medium">{visual.field}</span>
          <span className="text-muted-foreground text-xs">· {visual.unit}</span>
        </div>
        <div className="mt-2 text-xs sm:text-sm text-muted-foreground">
          {lang === "pt-BR" ? "exemplo" : "example"}:{" "}
          <span className="text-foreground">{visual.example}</span>
        </div>
      </div>
    );
  }
  if (visual.type === "stat") {
    return (
      <div className="flex flex-wrap items-baseline gap-4 rounded-lg border border-border/50 bg-card/30 px-6 py-5">
        <span className="text-5xl sm:text-6xl font-bold text-signal-purple text-glow">
          {visual.value}
        </span>
        <span className="font-mono text-sm text-muted-foreground">
          {pick(visual.unit, lang)}
        </span>
        <span className="w-full text-xs text-muted-foreground">
          {pick(visual.caption, lang)}
        </span>
      </div>
    );
  }
  if (visual.type === "bar") {
    const pct = Math.max(0, Math.min(1, visual.ratio)) * 100;
    return (
      <div className="rounded-lg border border-border/50 bg-card/30 px-5 py-4">
        <div className="flex justify-between font-mono text-xs text-muted-foreground">
          <span>{pick(visual.label, lang)}</span>
          <span className="text-signal-purple">{visual.ratio.toFixed(2)}</span>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-border/50">
          <div
            className="h-full rounded-full bg-signal-purple glow-primary-sm transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-3 font-mono text-[10px] text-muted-foreground/70">
          {pick(visual.scale, lang)}
        </div>
      </div>
    );
  }
  if (visual.type === "quote") {
    return (
      <blockquote className="border-l-2 border-signal-purple/50 pl-4 py-1">
        <p className="italic text-muted-foreground">
          "{pick(visual.text, lang)}"
        </p>
        <footer className="mt-2 font-mono text-xs text-muted-foreground/70">
          — {visual.source}
        </footer>
      </blockquote>
    );
  }
  if (visual.type === "principles") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {visual.items.map((item, i) => (
          <div
            key={i}
            className="rounded-lg border border-border/50 bg-card/30 p-5 hover:border-signal-purple/30 transition-colors"
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 font-mono text-signal-purple/70 text-sm leading-none">
                ×
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-mono text-sm font-medium text-foreground">
                  {pick(item.title, lang)}
                </div>
                <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  {pick(item.body, lang)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }
  return null;
}
