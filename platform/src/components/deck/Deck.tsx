"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Slide } from "@/components/deck/Slide";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useBrowserTranslation } from "@/hooks/useBrowserTranslation";
import { slides } from "@/lib/deck-content";
import { cn } from "@/lib/utils";

export function Deck() {
  const { language } = useBrowserTranslation();
  const [active, setActive] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const total = slides.length;

  const goto = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(slides.length - 1, index));
    const el = document.getElementById(`slide-${clamped + 1}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActive(clamped);
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", `#slide-${clamped + 1}`);
      }
    }
  }, []);

  // Track active slide via IntersectionObserver so dots follow scroll.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const container = containerRef.current;
    if (!container) return;
    const sections =
      container.querySelectorAll<HTMLElement>("[data-slide-index]");
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) {
          const idx = Number(
            (visible[0].target as HTMLElement).dataset.slideIndex ?? 0,
          );
          setActive(idx);
        }
      },
      { threshold: [0.35, 0.6, 0.85] },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  // Keyboard navigation.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") {
        e.preventDefault();
        goto(active + 1);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        goto(active - 1);
      } else if (e.key === "Home") {
        e.preventDefault();
        goto(0);
      } else if (e.key === "End") {
        e.preventDefault();
        goto(slides.length - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, goto]);

  // Honor URL hash on first load.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    const match = /^#slide-(\d+)$/.exec(hash);
    if (match) {
      const idx = Number(match[1]) - 1;
      if (idx >= 0 && idx < slides.length) {
        // Defer to ensure sections are mounted.
        requestAnimationFrame(() => goto(idx));
      }
    }
  }, [goto]);

  const navLabel = language === "pt-BR" ? "slides" : "slides";
  const prevLabel = language === "pt-BR" ? "Anterior" : "Previous";
  const nextLabel = language === "pt-BR" ? "Próximo" : "Next";

  return (
    <div className="relative">
      {/* Deck top bar — sits above content but below floating navbar. */}
      <div className="fixed top-5 right-5 z-40 flex items-center gap-2 lg:top-12">
        <LanguageToggle />
      </div>

      {/* Progress rail on desktop (right side). */}
      <nav
        aria-label={navLabel}
        className="fixed right-4 top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-2 md:flex"
      >
        {slides.map((s, i) => {
          const isActive = i === active;
          return (
            <button
              key={s.id}
              type="button"
              aria-label={`Go to slide ${i + 1}`}
              aria-current={isActive ? "true" : undefined}
              onClick={() => goto(i)}
              className={cn(
                "h-2.5 w-2.5 rounded-full border transition-all",
                isActive
                  ? "bg-signal-purple border-signal-purple glow-primary-sm scale-110"
                  : "border-muted-foreground/40 hover:border-signal-purple/60",
              )}
            />
          );
        })}
      </nav>

      {/* Bottom controls — prev / counter / next. */}
      <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border/60 bg-background/80 px-2 py-1.5 backdrop-blur-md">
        <button
          type="button"
          onClick={() => goto(active - 1)}
          disabled={active === 0}
          aria-label={prevLabel}
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="font-mono text-xs text-muted-foreground tabular-nums select-none">
          {String(active + 1).padStart(2, "0")} /{" "}
          {String(total).padStart(2, "0")}
        </span>
        <button
          type="button"
          onClick={() => goto(active + 1)}
          disabled={active === slides.length - 1}
          aria-label={nextLabel}
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div
        ref={containerRef}
        className="h-screen overflow-y-auto snap-y snap-mandatory scroll-smooth"
      >
        {slides.map((slide, i) => (
          <Slide
            key={slide.id}
            slide={slide}
            index={i}
            total={total}
            lang={language}
            active={i === active}
          />
        ))}
      </div>
    </div>
  );
}
