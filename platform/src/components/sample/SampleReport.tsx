"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { motion, useInView } from "motion/react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useBrowserTranslation } from "@/hooks/useBrowserTranslation";
import { cn } from "@/lib/utils";
import { sampleReport } from "@/lib/sample-report-data";
import type { Language } from "@/lib/translations";

type Bilingual = { en: string; pt: string };
const B = (en: string, pt: string): Bilingual => ({ en, pt });
function pick(b: Bilingual, lang: Language): string {
  return lang === "pt-BR" ? b.pt : b.en;
}

const intentColor: Record<string, string> = {
  FEATURE: "var(--color-signal-purple)",
  FIX: "var(--color-signal-yellow)",
  REFACTOR: "var(--color-primary)",
  CONFIG: "var(--muted-foreground)",
  UNKNOWN: "var(--color-signal-gray)",
};

function fmtPct(n: number, digits = 0): string {
  return `${(n * 100).toFixed(digits)}%`;
}
function fmtInt(n: number): string {
  return n.toLocaleString("en-US");
}

function useReveal() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return { ref, inView };
}

function Section({
  children,
  className,
  eyebrow,
  title,
  lang,
}: {
  children: React.ReactNode;
  className?: string;
  eyebrow?: Bilingual;
  title?: Bilingual;
  lang: Language;
}) {
  const { ref, inView } = useReveal();
  return (
    <section ref={ref} className={cn("py-14 sm:py-20", className)}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {(eyebrow || title) && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.4 }}
            className="mb-6"
          >
            {eyebrow && (
              <div className="font-mono text-xs uppercase tracking-[0.2em] text-signal-purple">
                {pick(eyebrow, lang)}
              </div>
            )}
            {title && (
              <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                {pick(title, lang)}
              </h2>
            )}
          </motion.div>
        )}
        {children}
      </div>
    </section>
  );
}

export function SampleReport() {
  const { language } = useBrowserTranslation();
  return (
    <main className="relative">
      <Hero lang={language} />
      <KeyInsight lang={language} />
      <DeliveryTimeline lang={language} />
      <IntentAndPR lang={language} />
      <StabilityMap lang={language} />
      <DurabilityAndCascade lang={language} />
      <TopChurn lang={language} />
      <ClosingCTA lang={language} />
    </main>
  );
}

// ─── Hero ──────────────────────────────────────────────────────────

function Hero({ lang }: { lang: Language }) {
  const s = sampleReport;
  const stats = [
    {
      label: B("Stabilization", "Estabilização"),
      value: fmtPct(s.headline.stabilizationRatio, 1),
      hint: B(
        `${s.headline.filesStabilized} of ${s.headline.filesTouched} files`,
        `${s.headline.filesStabilized} de ${s.headline.filesTouched} arquivos`,
      ),
      tone: "warning",
    },
    {
      label: B("Velocity trend", "Tendência de velocidade"),
      value: `+${(s.velocity.trendChangePct * 100).toFixed(0)}%`,
      hint: B("accelerating", "acelerando"),
      tone: "success",
    },
    {
      label: B("Single-pass PRs", "PRs de primeira"),
      value: fmtPct(s.pr.singlePassRate),
      hint: B(
        `${s.pr.merged} PRs merged`,
        `${s.pr.merged} PRs merged`,
      ),
      tone: "success",
    },
    {
      label: B("Cascade rate", "Taxa de cascata"),
      value: fmtPct(s.cascade.rate),
      hint: B(
        `depth ${s.cascade.medianDepth.toFixed(1)}`,
        `profundidade ${s.cascade.medianDepth.toFixed(1).replace(".", ",")}`,
      ),
      tone: "warning",
    },
  ];

  return (
    <section className="relative overflow-hidden pt-28 pb-12 sm:pt-36 sm:pb-16 noise-bg scanlines">
      <div className="grid-dots absolute inset-0" />
      <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <span className="block font-mono text-xs uppercase tracking-[0.2em] text-signal-purple">
            {pick(
              B(
                "Sample engineering impact report",
                "Exemplo de relatório de impacto de engenharia",
              ),
              lang,
            )}
          </span>
          <span className="mt-3 block break-all font-mono text-2xl font-bold tracking-tight text-glow sm:break-normal sm:text-4xl lg:text-5xl">
            {sampleReport.repo}
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base"
        >
          {pick(
            B(
              `${s.windowDays}-day window · ${s.churnDays}-day churn · ${s.headline.commitsTotal} commits analyzed`,
              `Janela de ${s.windowDays} dias · churn de ${s.churnDays} dias · ${s.headline.commitsTotal} commits analisados`,
            ),
            lang,
          )}
        </motion.p>

        <div className="mt-8 grid grid-cols-2 gap-3 sm:mt-10 md:grid-cols-4 md:gap-4">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label.en}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 + i * 0.06 }}
            >
              <Card
                className={cn(
                  "h-full border-border/50 bg-card/40 backdrop-blur-sm",
                  stat.tone === "success" && "hover:border-signal-purple/40",
                  stat.tone === "warning" && "hover:border-signal-yellow/40",
                )}
              >
                <CardContent className="p-4 sm:p-5">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {pick(stat.label, lang)}
                  </div>
                  <div
                    className={cn(
                      "mt-2 text-2xl sm:text-3xl font-bold tabular-nums",
                      stat.tone === "success" && "text-signal-purple text-glow",
                      stat.tone === "warning" && "text-signal-yellow",
                    )}
                  >
                    {stat.value}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {pick(stat.hint, lang)}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Key Insight callout ───────────────────────────────────────────

function KeyInsight({ lang }: { lang: Language }) {
  const { ref, inView } = useReveal();
  return (
    <section ref={ref} className="py-10 sm:py-14">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="rounded-lg border-2 border-signal-yellow/40 bg-signal-yellow/5 p-6 sm:p-8"
        >
          <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-signal-yellow">
            {pick(
              B("Headline finding", "Achado principal"),
              lang,
            )}
          </div>
          <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
            {pick(
              B(
                "Faster delivery, less stable code",
                "Entrega mais rápida, código menos estável",
              ),
              lang,
            )}
          </h2>
          <p className="mt-4 max-w-3xl text-muted-foreground sm:text-lg leading-relaxed">
            {pick(
              B(
                "Commit velocity accelerated 132% across the window while the stabilization ratio dropped. Single-pass PRs at 94% means code clears review easily, but 61% of touched files needed rework within 14 days. The review bar isn't catching what the churn is measuring.",
                "A velocidade de commits acelerou 132% no período enquanto a taxa de estabilização caiu. PRs que passam de primeira a 94% mostram que o código passa fácil no review, mas 61% dos arquivos tocados precisaram de retrabalho em 14 dias. O review não está pegando o que o churn está medindo.",
              ),
              lang,
            )}
          </p>
        </motion.div>
      </div>
    </section>
  );
}

// ─── Delivery Timeline chart ───────────────────────────────────────

function DeliveryTimeline({ lang }: { lang: Language }) {
  const data = sampleReport.weeks.map((w) => ({
    week: w.weekStart,
    commits: w.commits,
    stab: w.stabilization != null ? Math.round(w.stabilization * 100) : null,
  }));

  return (
    <Section
      lang={lang}
      className="bg-card/30"
      eyebrow={B("Delivery timeline", "Linha do tempo da entrega")}
      title={B(
        "Every week tells a story",
        "Cada semana conta uma história",
      )}
    >
      <Card className="border-border/50 bg-card/40">
        <CardContent className="p-4 sm:p-6">
          <div className="h-[300px] sm:h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={data}
                margin={{ top: 20, right: 20, bottom: 0, left: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="week"
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  yAxisId="commits"
                  orientation="left"
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  width={34}
                />
                <YAxis
                  yAxisId="stab"
                  orientation="right"
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.5rem",
                    fontSize: 12,
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, paddingTop: 10 }}
                  iconType="square"
                />
                <Bar
                  yAxisId="commits"
                  dataKey="commits"
                  name={pick(B("Commits / week", "Commits / semana"), lang)}
                  fill="var(--color-primary)"
                  fillOpacity={0.6}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={36}
                />
                <Line
                  yAxisId="stab"
                  type="monotone"
                  dataKey="stab"
                  name={pick(
                    B("Stabilization %", "Estabilização %"),
                    lang,
                  )}
                  stroke="var(--color-signal-yellow)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "var(--color-signal-yellow)" }}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            {pick(
              B(
                "Stabilization dropped to 39% in the most recent week after a 54-commit burst. The volume spike shows in the bars; the durability drop shows in the line.",
                "A estabilização caiu para 39% na semana mais recente depois de uma rajada de 54 commits. O pico de volume aparece nas barras; a queda de durabilidade aparece na linha.",
              ),
              lang,
            )}
          </p>
        </CardContent>
      </Card>
    </Section>
  );
}

// ─── Intent distribution + PR lifecycle ────────────────────────────

function IntentAndPR({ lang }: { lang: Language }) {
  const s = sampleReport;
  const totalCommits = s.intents.reduce((a, i) => a + i.commits, 0);

  const prStats = [
    {
      label: B("Median time to merge", "Tempo mediano até merge"),
      value: `${s.pr.medianTimeToMergeHours.toFixed(1)}h`,
    },
    {
      label: B("Median PR size", "Tamanho mediano de PR"),
      value: pick(
        B(`${s.pr.medianSizeFiles} files · ${fmtInt(s.pr.medianSizeLines)} lines`, `${s.pr.medianSizeFiles} arquivos · ${fmtInt(s.pr.medianSizeLines)} linhas`),
        lang,
      ),
    },
    {
      label: B("Single-pass rate", "Taxa de primeira"),
      value: fmtPct(s.pr.singlePassRate),
    },
    {
      label: B("Median review rounds", "Mediana de rodadas de review"),
      value: s.pr.medianReviewRounds.toFixed(1),
    },
  ];

  return (
    <Section
      lang={lang}
      eyebrow={B("What and how it shipped", "O que e como foi entregue")}
      title={B(
        "Composition of the work",
        "Composição do trabalho",
      )}
    >
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Intent distribution bar */}
        <Card className="border-border/50 bg-card/40 lg:col-span-3">
          <CardContent className="p-5 sm:p-6">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {pick(B("Commit intent", "Intenção dos commits"), lang)}
            </div>
            <div className="mt-1 text-xl font-bold">
              {pick(
                B(
                  `${totalCommits} commits across 5 intents`,
                  `${totalCommits} commits em 5 intenções`,
                ),
                lang,
              )}
            </div>

            {/* Horizontal stacked bar */}
            <div className="mt-6 flex h-4 w-full overflow-hidden rounded-full bg-border/50">
              {s.intents.map((row) => {
                const pct = (row.commits / totalCommits) * 100;
                return (
                  <div
                    key={row.intent}
                    style={{
                      width: `${pct}%`,
                      backgroundColor: intentColor[row.intent],
                    }}
                    title={`${row.intent} · ${row.commits} · ${pct.toFixed(0)}%`}
                  />
                );
              })}
            </div>

            {/* Legend + detail */}
            <div className="mt-5 space-y-2">
              {s.intents.map((row) => {
                const pct = (row.commits / totalCommits) * 100;
                return (
                  <div
                    key={row.intent}
                    className="flex items-center gap-3 text-xs sm:text-sm"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: intentColor[row.intent] }}
                    />
                    <span className="font-mono text-muted-foreground w-20">
                      {row.intent}
                    </span>
                    <span className="w-10 tabular-nums">{row.commits}</span>
                    <span className="w-12 tabular-nums text-muted-foreground">
                      {pct.toFixed(0)}%
                    </span>
                    <span className="hidden sm:inline text-muted-foreground text-xs">
                      · {pick(
                        B(
                          `${fmtPct(row.stabilization)} stabilized`,
                          `${fmtPct(row.stabilization)} estabilizado`,
                        ),
                        lang,
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* PR lifecycle stats */}
        <Card className="border-border/50 bg-card/40 lg:col-span-2">
          <CardContent className="p-5 sm:p-6">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {pick(B("PR lifecycle", "Ciclo de PR"), lang)}
            </div>
            <div className="mt-1 text-xl font-bold">
              {pick(
                B(`${s.pr.merged} PRs merged`, `${s.pr.merged} PRs fundidos`),
                lang,
              )}
            </div>
            <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {prStats.map((stat) => (
                <div
                  key={stat.label.en}
                  className="rounded-md border border-border/40 bg-background/40 p-3"
                >
                  <dt className="text-xs text-muted-foreground">
                    {pick(stat.label, lang)}
                  </dt>
                  <dd className="mt-1 font-mono text-base font-medium tabular-nums">
                    {stat.value}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>
    </Section>
  );
}

// ─── Stability Map ─────────────────────────────────────────────────

function StabilityMap({ lang }: { lang: Language }) {
  const volatile = sampleReport.stabilityMap
    .filter((d) => d.ratio < 0.50)
    .sort((a, b) => a.ratio - b.ratio)
    .slice(0, 6);
  const stable = sampleReport.stabilityMap
    .filter((d) => d.ratio >= 0.67)
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 6);

  return (
    <Section
      lang={lang}
      className="bg-card/30"
      eyebrow={B("Stability map", "Mapa de estabilidade")}
      title={B(
        "Your repo has zones",
        "Seu repo tem zonas",
      )}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <DirList
          lang={lang}
          heading={B("Most volatile", "Mais voláteis")}
          rows={volatile}
          tone="warning"
        />
        <DirList
          lang={lang}
          heading={B("Most stable", "Mais estáveis")}
          rows={stable}
          tone="success"
        />
      </div>
      <p className="mt-5 text-xs text-muted-foreground">
        {pick(
          B(
            "Directories with at least 3 files touched. Aggregation depth: 2.",
            "Diretórios com ao menos 3 arquivos tocados. Profundidade da agregação: 2.",
          ),
          lang,
        )}
      </p>
    </Section>
  );
}

function DirList({
  heading,
  rows,
  tone,
  lang,
}: {
  heading: Bilingual;
  rows: typeof sampleReport.stabilityMap[number][];
  tone: "success" | "warning";
  lang: Language;
}) {
  return (
    <Card className="border-border/50 bg-card/40">
      <CardContent className="p-5 sm:p-6">
        <div
          className={cn(
            "font-mono text-[10px] uppercase tracking-widest",
            tone === "success" ? "text-signal-purple" : "text-signal-yellow",
          )}
        >
          {pick(heading, lang)}
        </div>
        <ul className="mt-4 space-y-2.5">
          {rows.map((row) => {
            const pct = Math.round(row.ratio * 100);
            return (
              <li key={row.directory} className="text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-mono text-xs sm:text-sm truncate">
                    {row.directory}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-xs tabular-nums",
                      tone === "success"
                        ? "text-signal-purple"
                        : "text-signal-yellow",
                    )}
                  >
                    {pct}%
                  </span>
                </div>
                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-border/50">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      tone === "success" ? "bg-signal-purple" : "bg-signal-yellow",
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground/70 font-mono">
                  {pick(
                    B(
                      `${row.files} files · ${row.churn} churn`,
                      `${row.files} arquivos · ${row.churn} churn`,
                    ),
                    lang,
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

// ─── Durability & Cascade ──────────────────────────────────────────

function DurabilityAndCascade({ lang }: { lang: Language }) {
  const s = sampleReport;
  return (
    <Section
      lang={lang}
      eyebrow={B("How the code aged", "Como o código envelheceu")}
      title={B(
        "Durability & correction cascades",
        "Durabilidade e cascatas de correção",
      )}
    >
      <div className="grid gap-4 md:grid-cols-2">
        {/* Durability card */}
        <Card className="border-border/50 bg-card/40">
          <CardContent className="p-5 sm:p-6">
            <div className="font-mono text-[10px] uppercase tracking-widest text-signal-purple">
              {pick(B("Line survival rate", "Taxa de sobrevivência de linhas"), lang)}
            </div>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="text-4xl font-bold text-signal-purple text-glow tabular-nums">
                {fmtPct(s.durability.survivalRate)}
              </span>
              <span className="text-sm text-muted-foreground">
                {pick(
                  B(
                    `median age ${s.durability.medianAgeDays}d`,
                    `idade mediana ${s.durability.medianAgeDays}d`,
                  ),
                  lang,
                )}
              </span>
            </div>
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-border/50">
              <div
                className="h-full rounded-full bg-signal-purple glow-primary-sm"
                style={{ width: `${s.durability.survivalRate * 100}%` }}
              />
            </div>
            <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
              {pick(
                B(
                  `${fmtInt(s.durability.linesSurviving)} of ${fmtInt(s.durability.linesIntroduced)} lines introduced in this window still exist at HEAD. Git blame at HEAD attributes lines back to the commits that wrote them.`,
                  `${fmtInt(s.durability.linesSurviving)} de ${fmtInt(s.durability.linesIntroduced)} linhas introduzidas nessa janela ainda existem no HEAD. O git blame no HEAD atribui linhas aos commits que as escreveram.`,
                ),
                lang,
              )}
            </p>
          </CardContent>
        </Card>

        {/* Cascade card */}
        <Card className="border-border/50 bg-card/40">
          <CardContent className="p-5 sm:p-6">
            <div className="font-mono text-[10px] uppercase tracking-widest text-signal-yellow">
              {pick(B("Correction cascade rate", "Taxa de cascata de correção"), lang)}
            </div>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="text-4xl font-bold text-signal-yellow tabular-nums">
                {fmtPct(s.cascade.rate)}
              </span>
              <span className="text-sm text-muted-foreground">
                {pick(
                  B(
                    `depth ${s.cascade.medianDepth.toFixed(1)}`,
                    `profundidade ${s.cascade.medianDepth.toFixed(1).replace(".", ",")}`,
                  ),
                  lang,
                )}
              </span>
            </div>
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-border/50">
              <div
                className="h-full rounded-full bg-signal-yellow"
                style={{ width: `${s.cascade.rate * 100}%` }}
              />
            </div>
            <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
              {pick(
                B(
                  `${s.cascade.cascades} of ${s.cascade.commits} trigger commits were followed by at least one FIX on shared files within 7 days. Almost a third of delivered work needed a follow-up.`,
                  `${s.cascade.cascades} de ${s.cascade.commits} commits gatilho foram seguidos por ao menos um FIX em arquivos compartilhados em 7 dias. Quase um terço da entrega precisou de follow-up.`,
                ),
                lang,
              )}
            </p>
          </CardContent>
        </Card>
      </div>
    </Section>
  );
}

// ─── Top churning files ────────────────────────────────────────────

function TopChurn({ lang }: { lang: Language }) {
  const rows = sampleReport.topChurningFiles;
  return (
    <Section
      lang={lang}
      className="bg-card/30"
      eyebrow={B("Churn investigation", "Investigação de churn")}
      title={B(
        "Name the files that cost you",
        "Nomeie os arquivos que estão custando caro",
      )}
    >
      <Card className="border-border/50 bg-card/40 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 text-left text-xs font-mono uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3 font-medium">
                  {pick(B("File", "Arquivo"), lang)}
                </th>
                <th className="px-3 py-3 font-medium text-right">
                  {pick(B("Touches", "Toques"), lang)}
                </th>
                <th className="px-3 py-3 font-medium text-right">
                  {pick(B("Lines", "Linhas"), lang)}
                </th>
                <th className="px-5 py-3 font-medium text-right">
                  {pick(B("Fixes", "Fixes"), lang)}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.path}
                  className={cn(
                    "border-b border-border/30 last:border-b-0 hover:bg-card/60 transition-colors",
                    i % 2 === 1 && "bg-card/20",
                  )}
                >
                  <td className="px-5 py-3 font-mono text-xs sm:text-sm truncate max-w-[320px] sm:max-w-none">
                    {r.path}
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">
                    {r.touches}
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums text-muted-foreground">
                    {fmtInt(r.lines)}
                  </td>
                  <td
                    className={cn(
                      "px-5 py-3 text-right font-mono tabular-nums",
                      r.fixes > 0 ? "text-signal-yellow" : "text-muted-foreground",
                    )}
                  >
                    {r.fixes}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="mt-4 text-xs text-muted-foreground">
        {pick(
          B(
            "Ranked by touches within the analysis window. Fixes count = FIX-intent commits on the same file.",
            "Ranqueado por toques na janela de análise. Contagem de fixes = commits com intenção FIX no mesmo arquivo.",
          ),
          lang,
        )}
      </p>
    </Section>
  );
}

// ─── Closing CTA ───────────────────────────────────────────────────

function ClosingCTA({ lang }: { lang: Language }) {
  const { ref, inView } = useReveal();
  const [copied, setCopied] = useState(false);
  const installCmd = "curl -fsSL https://iris.clickbus.com/install.sh | sh";

  function handleCopy() {
    navigator.clipboard.writeText(installCmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section ref={ref} className="relative overflow-hidden py-20 sm:py-28">
      <div className="grid-dots absolute inset-0 opacity-60" />
      <div className="relative z-10 mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          <div className="font-mono text-xs uppercase tracking-[0.25em] text-signal-purple">
            {pick(B("Run it yourself", "Rode você mesmo"), lang)}
          </div>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl text-glow">
            {pick(
              B(
                "See your own numbers",
                "Veja seus próprios números",
              ),
              lang,
            )}
          </h2>
          <p className="mt-4 max-w-2xl mx-auto text-muted-foreground sm:text-lg">
            {pick(
              B(
                "Everything on this page came from a real Iris run. Point the CLI at your repo and get the same report in minutes — local, reproducible, no servers.",
                "Tudo nessa página veio de uma análise real do Iris. Aponte a CLI para seu repo e receba o mesmo relatório em minutos — local, reprodutível, sem servidores.",
              ),
              lang,
            )}
          </p>
          <div className="mt-8 mx-auto flex max-w-xl items-center gap-2 rounded-lg border border-signal-purple/30 bg-zinc-950 p-3 glow-primary">
            <code className="flex-1 text-left font-mono text-xs sm:text-sm text-zinc-100 overflow-x-auto whitespace-nowrap">
              <span className="text-signal-purple">$</span> {installCmd}
            </code>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="shrink-0 font-mono text-xs hover:text-signal-purple"
            >
              {copied
                ? pick(B("Copied!", "Copiado!"), lang)
                : pick(B("Copy", "Copiar"), lang)}
            </Button>
          </div>
          <p className="mt-3 font-mono text-xs text-muted-foreground">
            {pick(
              B(
                "Python 3.11+ · Git · Zero dependencies",
                "Python 3.11+ · Git · Zero dependências",
              ),
              lang,
            )}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link href="/auth/signup">
              <Button size="lg" className="w-full sm:w-auto glow-pulse">
                {pick(B("Get started", "Começar"), lang)}
              </Button>
            </Link>
            <Link href="/deck">
              <Button
                variant="outline"
                size="lg"
                className="w-full sm:w-auto border-border/50"
              >
                {pick(B("Explore the metrics", "Explore as métricas"), lang)}
              </Button>
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
