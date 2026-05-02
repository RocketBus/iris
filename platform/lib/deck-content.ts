/**
 * Iris public deck — slide content.
 *
 * Source of truth: docs/METRICS.md. Every metric slide maps to one section
 * of that document. Kept in a dedicated file (not translations.ts) because
 * slide data is structured (field, unit, example) and will iterate faster
 * without polluting the global translation tree.
 *
 * When adding a slide, keep copy tight:
 *   headline:  ≤ 8 words
 *   lede:      1 sentence
 *   what/why:  ~40 words each
 */

export type Bilingual = { en: string; pt: string };

export type SlideKind = "cover" | "chapter" | "metric" | "closing";

export type SlideVisual =
  | { type: "code"; field: string; unit: string; example: string }
  | { type: "stat"; value: string; unit: Bilingual; caption: Bilingual }
  | { type: "bar"; label: Bilingual; ratio: number; scale: Bilingual }
  | { type: "quote"; text: Bilingual; source: string }
  | {
      type: "principles";
      items: Array<{ title: Bilingual; body: Bilingual }>;
    };

export type Slide = {
  id: string;
  kind: SlideKind;
  eyebrow?: Bilingual;
  headline: Bilingual;
  lede?: Bilingual;
  what?: Bilingual;
  why?: Bilingual;
  visual?: SlideVisual;
};

const EB = (en: string, pt: string): Bilingual => ({ en, pt });

export const slides: Slide[] = [
  // ─── COVER ──────────────────────────────────────────────────────
  {
    id: "cover",
    kind: "cover",
    eyebrow: EB("IRIS · METRICS DECK", "IRIS · DECK DE MÉTRICAS"),
    headline: EB(
      "The metrics behind AI-era engineering",
      "As métricas por trás da engenharia na era da IA",
    ),
    lede: EB(
      "Twenty-five signals that separate durable delivery from expensive motion.",
      "Vinte e cinco sinais que separam entrega durável de movimento caro.",
    ),
    what: EB(
      "Your team ships more with AI. The real question is whether that code survives. Iris analyzes your Git history and PR data to tell you.",
      "Seu time entrega mais com IA. A pergunta real é se esse código sobrevive. O Iris analisa o histórico do Git e dos PRs para te dizer.",
    ),
    why: EB(
      "Traditional velocity metrics were built for a world where humans wrote all the code. This deck walks you through what we built to replace them.",
      "As métricas tradicionais de velocidade foram feitas para um mundo onde humanos escreviam todo o código. Esse deck mostra o que construímos para substituí-las.",
    ),
  },

  // ─── PRINCIPLES (pre-chapter) ───────────────────────────────────
  {
    id: "principles",
    kind: "metric",
    eyebrow: EB("PRINCIPLES · BUILT IN", "PRINCÍPIOS · NO DNA"),
    headline: EB(
      "What Iris will never do",
      "O que o Iris nunca faz",
    ),
    lede: EB(
      "Ten product principles guard the engineering analytics we build. These four matter most at the pitch.",
      "Dez princípios de produto guiam o que construímos. Esses quatro pesam mais no pitch.",
    ),
    visual: {
      type: "principles",
      items: [
        {
          title: EB(
            "Systems, never individuals",
            "Sistemas, nunca pessoas",
          ),
          body: EB(
            "Iris never ranks or scores developers. Every metric describes repositories, teams, and dynamics — never who wrote what fastest.",
            "O Iris não rankeia nem pontua pessoas. Toda métrica descreve repositórios, times e dinâmicas — nunca quem escreveu o quê mais rápido.",
          ),
        },
        {
          title: EB(
            "Vendor-agnostic intelligence",
            "Inteligência agnóstica de fornecedor",
          ),
          body: EB(
            "No IDE plugin, no proprietary telemetry, no vendor lock-in. We read your Git history and PR data — that's it.",
            "Sem plugin de IDE, sem telemetria proprietária, sem lock-in. Lemos seu histórico Git e dados de PR — só isso.",
          ),
        },
        {
          title: EB(
            "Explainable, or it doesn't ship",
            "Explicável, ou não vai pra produção",
          ),
          body: EB(
            "Every metric must hold up in plain language. If an engineering leader can't understand why a score exists, the score doesn't exist.",
            "Toda métrica precisa caber numa explicação simples. Se uma liderança não entende por que um número existe, o número não existe.",
          ),
        },
        {
          title: EB(
            "Trust is a product feature",
            "Confiança é feature de produto",
          ),
          body: EB(
            "Engineering analytics can easily become surveillance. Iris must be safe for teams to adopt. If a feature reduces trust, it doesn't ship.",
            "Analytics de engenharia vira vigilância fácil. O Iris precisa ser seguro para times adotarem. Se uma feature diminui confiança, ela não existe.",
          ),
        },
      ],
    },
  },

  // ─── CHAPTER 1: FOUNDATIONS ─────────────────────────────────────
  {
    id: "chapter-foundations",
    kind: "chapter",
    eyebrow: EB("PART 1", "PARTE 1"),
    headline: EB("Foundations — signal vs noise", "Fundamentos — sinal vs ruído"),
    lede: EB(
      "Four metrics always present in every Iris run. The baseline.",
      "Quatro métricas sempre presentes em toda análise do Iris. A linha de base.",
    ),
  },

  {
    id: "stabilization-ratio",
    kind: "metric",
    eyebrow: EB("FOUNDATIONS · STABILIZATION", "FUNDAMENTOS · ESTABILIZAÇÃO"),
    headline: EB(
      "Does your code survive its first week?",
      "Seu código sobrevive à primeira semana?",
    ),
    lede: EB(
      "The single most important number in Iris.",
      "O número mais importante do Iris.",
    ),
    what: EB(
      "Of every file your team touched, the fraction that was NOT modified again within the churn window. Files touched once count as stabilized.",
      "Dos arquivos que seu time tocou, a fração que NÃO foi modificada de novo dentro da janela de churn. Arquivos tocados uma vez contam como estabilizados.",
    ),
    why: EB(
      "A stabilization ratio near 1.0 means changes persist — real work. Near 0.0 means rework dressed up as delivery. This is signal vs noise in one number.",
      "Estabilização próxima de 1.0 significa mudanças que persistem — trabalho real. Próxima de 0.0 é retrabalho disfarçado de entrega. É sinal vs ruído em um número só.",
    ),
    visual: {
      type: "code",
      field: "stabilization_ratio",
      unit: "float 0.0–1.0",
      example: "0.83",
    },
  },

  {
    id: "churn-events",
    kind: "metric",
    eyebrow: EB("FOUNDATIONS · CHURN", "FUNDAMENTOS · CHURN"),
    headline: EB(
      "The cost of incomplete first tries",
      "O custo de primeiras tentativas incompletas",
    ),
    lede: EB(
      "Count and weight of files that needed rapid re-editing.",
      "Contagem e peso dos arquivos que precisaram ser re-editados rapidamente.",
    ),
    what: EB(
      "Files modified 2+ times where a consecutive pair of edits falls inside the churn window. Plus the total lines touched across those re-edits.",
      "Arquivos modificados 2+ vezes onde um par consecutivo de edições cai dentro da janela de churn. Mais o total de linhas tocadas nessas re-edições.",
    ),
    why: EB(
      "Churn is the tax your team pays on shaky first implementations. Unlike velocity, it goes up when things go wrong — and it's visible per file.",
      "Churn é o imposto que seu time paga por implementações iniciais frágeis. Diferente de velocidade, ele sobe quando as coisas dão errado — e é visível por arquivo.",
    ),
    visual: {
      type: "code",
      field: "churn_events · churn_lines_affected",
      unit: "int · int",
      example: "42 · 3 120",
    },
  },

  {
    id: "revert-rate",
    kind: "metric",
    eyebrow: EB("FOUNDATIONS · REVERT", "FUNDAMENTOS · REVERT"),
    headline: EB(
      "The bluntest signal something broke",
      "O sinal mais direto de que algo quebrou",
    ),
    lede: EB(
      "How often does your team un-ship what it shipped?",
      "Com que frequência seu time desfaz o que entregou?",
    ),
    what: EB(
      "Commits matching revert patterns, as a fraction of total. Attribution credits the ORIGIN of the reverted code — not who wrote the revert.",
      "Commits que batem com padrões de revert, como fração do total. A atribuição vai para a ORIGEM do código revertido — não para quem escreveu o revert.",
    ),
    why: EB(
      "Reverts are rare but unambiguous. Segmented by origin and AI tool, they answer: which tool's code gets rolled back? That comparison is hard to argue with.",
      "Reverts são raros mas inequívocos. Segmentados por origem e ferramenta de IA, respondem: qual ferramenta tem código revertido? Essa comparação é difícil de contestar.",
    ),
    visual: {
      type: "code",
      field: "revert_rate · revert_by_tool",
      unit: "float · Record",
      example: '0.024 · { claude: 3, copilot: 7 }',
    },
  },

  // ─── CHAPTER 2: CLASSIFICATION ──────────────────────────────────
  {
    id: "chapter-classification",
    kind: "chapter",
    eyebrow: EB("PART 2", "PARTE 2"),
    headline: EB(
      "Classification — intent & origin",
      "Classificação — intenção e origem",
    ),
    lede: EB(
      "Before you can compare, you have to separate. We separate by what each commit was for, and who wrote it.",
      "Antes de comparar, é preciso separar. Separamos pelo que cada commit foi feito, e por quem o escreveu.",
    ),
  },

  {
    id: "intent-distribution",
    kind: "metric",
    eyebrow: EB("CLASSIFICATION · INTENT", "CLASSIFICAÇÃO · INTENÇÃO"),
    headline: EB(
      "Feature, fix, refactor, config",
      "Feature, fix, refactor, config",
    ),
    lede: EB(
      "Every commit classified. Deterministically. No ML.",
      "Todo commit classificado. De forma determinística. Sem ML.",
    ),
    what: EB(
      "Conventional Commit prefixes first, keywords second, file-type heuristic third. Every commit gets an intent: FEATURE, FIX, REFACTOR, CONFIG, or UNKNOWN.",
      "Prefixos de Conventional Commits primeiro, palavras-chave depois, heurística por tipo de arquivo por último. Todo commit recebe uma intenção: FEATURE, FIX, REFACTOR, CONFIG ou UNKNOWN.",
    ),
    why: EB(
      "\"We're shipping fast\" means nothing if 60% is FIX. Intent distribution turns a flat commit count into a picture of what the team is actually spending time on.",
      "\"Estamos entregando rápido\" não significa nada se 60% é FIX. A distribuição de intenção transforma uma contagem de commits em um retrato do que o time está realmente fazendo.",
    ),
    visual: {
      type: "code",
      field: "commit_intent_distribution",
      unit: "Record<intent, count>",
      example: '{ FEATURE: 45, FIX: 32, REFACTOR: 12, CONFIG: 8 }',
    },
  },

  {
    id: "origin-distribution",
    kind: "metric",
    eyebrow: EB("CLASSIFICATION · ORIGIN", "CLASSIFICAÇÃO · ORIGEM"),
    headline: EB(
      "Human, AI-assisted, or bot",
      "Humano, assistido por IA ou bot",
    ),
    lede: EB(
      "No guessing. We read co-author tags and author patterns.",
      "Sem chute. Lemos co-author tags e padrões de autor.",
    ),
    what: EB(
      "Co-author matches Copilot, Claude, Cursor, Codeium, Tabnine, Amazon Q, Gemini, or Windsurf → AI_ASSISTED. Known bot names → BOT. Everything else → HUMAN.",
      "Co-author bate com Copilot, Claude, Cursor, Codeium, Tabnine, Amazon Q, Gemini ou Windsurf → AI_ASSISTED. Nomes de bot conhecidos → BOT. O resto → HUMAN.",
    ),
    why: EB(
      "Every single other metric in Iris can be segmented by origin. This is the dimension that unlocks AI impact analysis — without surveys, without self-report.",
      "Todas as outras métricas do Iris podem ser segmentadas por origem. Essa é a dimensão que destrava análise de impacto de IA — sem pesquisas, sem autorrelato.",
    ),
    visual: {
      type: "code",
      field: "commit_origin_distribution",
      unit: "Record<origin, count>",
      example: '{ HUMAN: 210, AI_ASSISTED: 140, BOT: 28 }',
    },
  },

  {
    id: "ai-detection-coverage",
    kind: "metric",
    eyebrow: EB("CLASSIFICATION · COVERAGE", "CLASSIFICAÇÃO · COBERTURA"),
    headline: EB(
      "How much AI work is already visible",
      "Quanto do trabalho com IA já é visível",
    ),
    lede: EB(
      "The other half of this number is your attribution gap.",
      "A outra metade desse número é o seu gap de atribuição.",
    ),
    what: EB(
      "AI-attributed commits as a percentage of all non-bot commits. A proxy for how much of the actual AI usage is declared in the git metadata.",
      "Commits atribuídos a IA como porcentagem de todos os commits não-bot. Um proxy de quanto do uso real de IA está declarado no metadado do git.",
    ),
    why: EB(
      "Compliance officers, AI governance leads, and skeptical CTOs all ask the same thing: how much AI is in our code? This is the answer you can defend in a meeting.",
      "Compliance, liderança de governança de IA e CTOs céticos fazem a mesma pergunta: quanto de IA tem no nosso código? Essa é a resposta que você consegue defender em reunião.",
    ),
    visual: {
      type: "stat",
      value: "62.4",
      unit: EB("% of non-bot commits", "% dos commits não-bot"),
      caption: EB(
        "attributed to AI tools",
        "atribuídos a ferramentas de IA",
      ),
    },
  },

  // ─── CHAPTER 3: QUALITY & DURABILITY ────────────────────────────
  {
    id: "chapter-quality",
    kind: "chapter",
    eyebrow: EB("PART 3", "PARTE 3"),
    headline: EB(
      "Quality & durability — does it last?",
      "Qualidade e durabilidade — o código dura?",
    ),
    lede: EB(
      "From commit shape to line survival. How code actually ages.",
      "Do formato do commit à sobrevivência das linhas. Como o código realmente envelhece.",
    ),
  },

  {
    id: "commit-shape",
    kind: "metric",
    eyebrow: EB("QUALITY · SHAPE", "QUALIDADE · FORMATO"),
    headline: EB("AI code has a shape. See it.", "Código de IA tem um formato. Veja."),
    lede: EB(
      "Focused, spread, bulk, or surgical — by origin.",
      "Focado, espalhado, em bloco ou cirúrgico — por origem.",
    ),
    what: EB(
      "Median files, lines per file, and directory spread per commit, grouped by origin. Each origin's typical shape emerges: deep, wide, thin, or broad.",
      "Mediana de arquivos, linhas por arquivo e espalhamento por diretório por commit, agrupados por origem. O formato típico de cada origem emerge: profundo, largo, fino ou amplo.",
    ),
    why: EB(
      "AI-generated commits tend to be wide & shallow (spread) — scaffolding, boilerplate. Human commits lean surgical or focused. This pattern is measurable, not anecdotal.",
      "Commits gerados por IA tendem a ser largos e rasos (spread) — scaffolding, boilerplate. Commits humanos tendem a ser cirúrgicos ou focados. O padrão é mensurável, não anedótico.",
    ),
    visual: {
      type: "code",
      field: "commit_shape_dominant",
      unit: "enum",
      example: '"spread" | "focused" | "bulk" | "surgical"',
    },
  },

  {
    id: "fix-latency",
    kind: "metric",
    eyebrow: EB("QUALITY · FIX LATENCY", "QUALIDADE · LATÊNCIA DE FIX"),
    headline: EB(
      "Does AI code break faster?",
      "O código de IA quebra mais rápido?",
    ),
    lede: EB(
      "Measured in hours — from first commit to rework.",
      "Medido em horas — do primeiro commit ao retrabalho.",
    ),
    what: EB(
      "Median time between consecutive modifications of the same file within the churn window. Attribution credits the ORIGINAL commit, not the fix.",
      "Mediana de tempo entre modificações consecutivas do mesmo arquivo na janela de churn. A atribuição vai para o commit ORIGINAL, não para o fix.",
    ),
    why: EB(
      "Buckets: fast < 72h (probably obvious bugs), medium 72–168h (caught in review/prod), slow > 168h (subtle). Compare AI vs human fast-rework rates side by side.",
      "Faixas: rápido < 72h (bugs óbvios), médio 72–168h (pego em review/prod), lento > 168h (sutil). Compare taxas de retrabalho rápido entre IA e humano lado a lado.",
    ),
    visual: {
      type: "code",
      field: "fix_latency_median_hours",
      unit: "float hours",
      example: "28.4",
    },
  },

  {
    id: "correction-cascades",
    kind: "metric",
    eyebrow: EB("QUALITY · CASCADES", "QUALIDADE · CASCATAS"),
    headline: EB(
      "One bad commit, three follow-ups",
      "Um commit ruim, três follow-ups",
    ),
    lede: EB(
      "Blast radius of code that doesn't quite land.",
      "Raio de impacto de código que não se assenta.",
    ),
    what: EB(
      "A trigger commit followed by 1+ FIX commits on shared files within the churn window. Depth = number of follow-up fixes. Attribution credits the trigger's origin.",
      "Um commit gatilho seguido por 1+ commits FIX em arquivos compartilhados na janela de churn. Profundidade = número de fixes. A atribuição vai para a origem do gatilho.",
    ),
    why: EB(
      "A 30% cascade rate means almost a third of your trigger commits break something. Segmented by AI tool, this tells you which tool's output carries the highest cleanup cost.",
      "Uma taxa de 30% de cascata significa que quase um terço dos commits gatilho quebra algo. Segmentado por ferramenta de IA, mostra qual ferramenta tem o maior custo de limpeza.",
    ),
    visual: {
      type: "code",
      field: "cascade_rate · cascade_median_depth",
      unit: "float · float",
      example: "0.18 · 2.0",
    },
  },

  {
    id: "code-durability",
    kind: "metric",
    eyebrow: EB("QUALITY · DURABILITY", "QUALIDADE · DURABILIDADE"),
    headline: EB(
      "How much AI code survives the quarter",
      "Quanto do código de IA sobrevive ao trimestre",
    ),
    lede: EB(
      "Git blame at HEAD. The ultimate survival test.",
      "Git blame no HEAD. O teste de sobrevivência definitivo.",
    ),
    what: EB(
      "For each origin and each AI tool: lines introduced vs lines still present at HEAD. Survival rate. Median age of surviving lines in days.",
      "Para cada origem e cada ferramenta de IA: linhas introduzidas vs linhas ainda presentes no HEAD. Taxa de sobrevivência. Idade mediana das linhas que sobreviveram.",
    ),
    why: EB(
      "Our internal benchmark found AI-attributed lines survive at 79% vs human 64% — on primed repos. Durability is the counter-intuitive headline: AI code may last longer when attributed properly.",
      "Nosso benchmark interno encontrou linhas atribuídas a IA sobrevivem a 79% vs humano 64% — em repos primados. Durabilidade é a manchete contra-intuitiva: código de IA pode durar mais quando bem atribuído.",
    ),
    visual: {
      type: "bar",
      label: EB("survival_rate (AI_ASSISTED)", "survival_rate (AI_ASSISTED)"),
      ratio: 0.79,
      scale: EB("0.0 never survives · 1.0 all survives", "0.0 nunca sobrevive · 1.0 tudo sobrevive"),
    },
  },

  {
    id: "acceptance-rate",
    kind: "metric",
    eyebrow: EB("QUALITY · ACCEPTANCE", "QUALIDADE · ACEITAÇÃO"),
    headline: EB(
      "Does AI code pass review?",
      "Código de IA passa no review?",
    ),
    lede: EB(
      "Single-pass PRs vs rounds of changes-requested.",
      "PRs que passam de primeira vs rodadas de changes-requested.",
    ),
    what: EB(
      "Per origin and per AI tool: fraction of commits that landed via a PR; of those, fraction merged with zero CHANGES_REQUESTED; median review rounds.",
      "Por origem e por ferramenta de IA: fração de commits que passaram por um PR; desses, fração fundida com zero CHANGES_REQUESTED; mediana de rodadas de review.",
    ),
    why: EB(
      "Two different AI tools can produce code that reviews very differently. Acceptance rate quantifies that — it's the missing link between \"AI productivity\" claims and peer-reviewed outcomes.",
      "Duas ferramentas de IA podem produzir código que se comporta muito diferente no review. A taxa de aceitação quantifica isso — é o elo que falta entre promessas de \"produtividade IA\" e resultados revisados por pares.",
    ),
    visual: {
      type: "code",
      field: "acceptance_by_origin.AI_ASSISTED.single_pass_rate",
      unit: "float 0.0–1.0",
      example: "0.71",
    },
  },

  {
    id: "origin-funnel",
    kind: "metric",
    eyebrow: EB("QUALITY · FUNNEL", "QUALIDADE · FUNIL"),
    headline: EB(
      "The full journey, per origin",
      "A jornada completa, por origem",
    ),
    lede: EB(
      "Committed → In PR → Stabilized → Still alive.",
      "Commitado → Em PR → Estabilizado → Ainda vivo.",
    ),
    what: EB(
      "Four-stage delivery funnel computed per origin, with conversion rates between each step. Composes origin distribution, acceptance, stabilization, and durability.",
      "Funil de entrega de quatro estágios computado por origem, com taxas de conversão entre cada passo. Compõe distribuição de origem, aceitação, estabilização e durabilidade.",
    ),
    why: EB(
      "AI might crush commits and pass review — and still drop off at stabilization. The funnel reveals exactly where each origin wins and where it leaks. One chart, full story.",
      "IA pode esmagar commits e passar no review — e ainda cair na estabilização. O funil mostra exatamente onde cada origem ganha e onde vaza. Um gráfico, a história toda.",
    ),
    visual: {
      type: "code",
      field: "origin_funnel.AI_ASSISTED",
      unit: "FunnelStage[]",
      example: "[Committed → InPR → Stabilized → Surviving]",
    },
  },

  // ─── CHAPTER 4: DETECTION & ATTRIBUTION ─────────────────────────
  {
    id: "chapter-detection",
    kind: "chapter",
    eyebrow: EB("PART 4", "PARTE 4"),
    headline: EB(
      "Detection — what's hiding in plain sight",
      "Detecção — o que está escondido à vista",
    ),
    lede: EB(
      "Patterns you can't see until you look for them.",
      "Padrões que você não enxerga até procurar.",
    ),
  },

  {
    id: "attribution-gap",
    kind: "metric",
    eyebrow: EB("DETECTION · ATTRIBUTION", "DETECÇÃO · ATRIBUIÇÃO"),
    headline: EB(
      "The AI work nobody tagged",
      "O trabalho com IA que ninguém marcou",
    ),
    lede: EB(
      "Human-classified commits with AI-shaped velocity patterns.",
      "Commits marcados como humanos com velocidade em formato de IA.",
    ),
    what: EB(
      "Flags HUMAN commits hitting 2+ of: 3 commits in 2h, 100+ LOC, < 30min since prev, 5+ files. We never call it AI — we surface the gap for review.",
      "Marca commits HUMAN que batem 2+ de: 3 commits em 2h, 100+ LOC, < 30min desde o anterior, 5+ arquivos. Nunca chamamos de IA — só mostramos o gap para investigação.",
    ),
    why: EB(
      "If ai_detection_coverage says 40% and attribution gap flags another 30% of human commits as suspect, your real AI footprint is double what your governance dashboard shows.",
      "Se ai_detection_coverage diz 40% e o gap de atribuição marca outros 30% de commits como suspeitos, sua pegada real de IA é o dobro do que o painel de governança mostra.",
    ),
    visual: {
      type: "code",
      field: "attribution_gap.flagged_pct",
      unit: "float 0.0–100.0",
      example: "28.6",
    },
  },

  {
    id: "duplicate-blocks",
    kind: "metric",
    eyebrow: EB("DETECTION · DUPLICATES", "DETECÇÃO · DUPLICATAS"),
    headline: EB("Copy-paste went 8× since AI", "Copy-paste cresceu 8× com IA"),
    lede: EB(
      "GitClear 2025. Measured. Now check yours.",
      "GitClear 2025. Medido. Agora confira o seu.",
    ),
    what: EB(
      "Commits containing 5+ contiguous identical non-trivial lines across multiple files. Rate per commit, median block size, segmented by origin and by AI tool.",
      "Commits com 5+ linhas idênticas contíguas não-triviais em múltiplos arquivos. Taxa por commit, tamanho mediano do bloco, segmentado por origem e por ferramenta de IA.",
    ),
    why: EB(
      "Copy-paste is the fast lane to entropy: the same bug, in five places, forever. A rising duplicate rate is the leading indicator of debt you haven't paid yet.",
      "Copy-paste é o atalho para a entropia: o mesmo bug, em cinco lugares, pra sempre. Uma taxa crescente de duplicatas é o indicador antecipado de dívida que ainda não foi paga.",
    ),
    visual: {
      type: "code",
      field: "duplicate_block_rate",
      unit: "float 0.0–1.0",
      example: "0.14",
    },
  },

  {
    id: "moved-code",
    kind: "metric",
    eyebrow: EB("DETECTION · MOVES", "DETECÇÃO · MOVIMENTAÇÕES"),
    headline: EB(
      "Real refactors look different",
      "Refatorações de verdade parecem diferentes",
    ),
    lede: EB(
      "And we can tell the difference at the diff level.",
      "E conseguimos distinguir no nível do diff.",
    ),
    what: EB(
      "Percentage of changed lines that were moved between files in the same commit. Refactoring ratio = moved / (moved + duplicated) — a code-health index.",
      "Porcentagem das linhas mudadas que foram movidas entre arquivos no mesmo commit. Razão de refatoração = movido / (movido + duplicado) — um índice de saúde.",
    ),
    why: EB(
      "Moved code dropped from 24% to 9.5% post-AI in industry data. When your refactoring ratio rises, the team is actually extracting and organizing — not just generating more.",
      "Código movido caiu de 24% para 9.5% após IA nos dados da indústria. Quando sua razão de refatoração sobe, o time está de fato extraindo e organizando — não só gerando mais.",
    ),
    visual: {
      type: "code",
      field: "refactoring_ratio",
      unit: "float 0.0–1.0",
      example: "0.62",
    },
  },

  {
    id: "code-provenance",
    kind: "metric",
    eyebrow: EB("DETECTION · PROVENANCE", "DETECÇÃO · PROVENIÊNCIA"),
    headline: EB(
      "Improving mature code, or churning this month's?",
      "Melhorando código maduro, ou retrabalhando o do mês?",
    ),
    lede: EB(
      "The age of the lines your team is rewriting.",
      "A idade das linhas que seu time está reescrevendo.",
    ),
    what: EB(
      "Git-blame buckets the age of each line being modified: under 2 weeks, 2–4 weeks, 1–12 months, 1–2 years, 2+ years. Plus percentage revising new code vs mature code.",
      "O git-blame coloca a idade de cada linha modificada em faixas: < 2 semanas, 2–4 semanas, 1–12 meses, 1–2 anos, 2+ anos. Mais porcentagem mexendo em código novo vs maduro.",
    ),
    why: EB(
      "GitClear found 79% of revised lines in 2024 were less than a month old. If most of your team's effort is re-churning fresh code, you're not improving the codebase — you're spinning.",
      "A GitClear encontrou que 79% das linhas revisadas em 2024 tinham menos de um mês. Se a maior parte do esforço do time é re-mexer em código novo, não está melhorando o codebase — está girando.",
    ),
    visual: {
      type: "stat",
      value: "79",
      unit: EB("% of revisions", "% das revisões"),
      caption: EB(
        "on code < 1 month old — industry 2024",
        "em código com < 1 mês — indústria 2024",
      ),
    },
  },

  {
    id: "new-code-churn",
    kind: "metric",
    eyebrow: EB("DETECTION · NEW-CODE CHURN", "DETECÇÃO · CHURN DE CÓDIGO NOVO"),
    headline: EB(
      "The 14-day canary",
      "O canário de 14 dias",
    ),
    lede: EB(
      "Code that gets re-edited inside two weeks.",
      "Código que é re-editado em menos de duas semanas.",
    ),
    what: EB(
      "Files that received new code and were modified again within 14 or 28 days. Segmented by origin and by AI tool, attributed to the INTRODUCING commit.",
      "Arquivos que receberam código novo e foram modificados de novo em 14 ou 28 dias. Segmentado por origem e ferramenta de IA, atribuído ao commit INTRODUTOR.",
    ),
    why: EB(
      "Fresh code that gets re-touched within two weeks usually means the first try missed. A 2-week rate trending up is the earliest quality alarm you can wire to a dashboard.",
      "Código novo que volta a ser tocado em duas semanas normalmente significa que a primeira tentativa errou. Uma taxa de 2 semanas em alta é o alarme de qualidade mais cedo que dá para ligar.",
    ),
    visual: {
      type: "code",
      field: "new_code_churn_rate_2w",
      unit: "float 0.0–1.0",
      example: "0.31",
    },
  },

  {
    id: "fix-targeting",
    kind: "metric",
    eyebrow: EB("DETECTION · FIX TARGETING", "DETECÇÃO · ALVO DOS FIXES"),
    headline: EB(
      "Whose code attracts the bugs?",
      "De quem é o código que atrai bugs?",
    ),
    lede: EB(
      "Fair share vs disproportionate share.",
      "Parcela justa vs parcela desproporcional.",
    ),
    what: EB(
      "For each FIX commit's target files, credit the origin of the last non-fix commit. Compute code share vs fix share vs disproportionality (fix/code).",
      "Para cada arquivo-alvo de um commit FIX, creditar a origem do último commit não-fix. Calcular parcela do código vs parcela dos fixes vs desproporção (fix/code).",
    ),
    why: EB(
      "If AI wrote 30% of commits but attracts 50% of fixes, disproportionality = 1.67 — the clearest signal that AI-written code costs more to maintain than it first appears.",
      "Se a IA escreveu 30% dos commits mas atrai 50% dos fixes, a desproporção = 1.67 — o sinal mais claro de que o código de IA custa mais para manter do que parece.",
    ),
    visual: {
      type: "code",
      field: "fix_target_by_origin.AI_ASSISTED.disproportionality",
      unit: "float (1.0 = fair share)",
      example: "1.67",
    },
  },

  // ─── CHAPTER 5: TIME & STRUCTURE ────────────────────────────────
  {
    id: "chapter-time",
    kind: "chapter",
    eyebrow: EB("PART 5", "PARTE 5"),
    headline: EB(
      "Time & structure — where and when",
      "Tempo e estrutura — onde e quando",
    ),
    lede: EB(
      "Your repo has zones. Your year has turning points. We map both.",
      "Seu repo tem zonas. Seu ano tem pontos de virada. Mapeamos os dois.",
    ),
  },

  {
    id: "stability-map",
    kind: "metric",
    eyebrow: EB("STRUCTURE · STABILITY MAP", "ESTRUTURA · MAPA DE ESTABILIDADE"),
    headline: EB(
      "Your repo has zones",
      "Seu repo tem zonas",
    ),
    lede: EB(
      "Some stable. Some on fire. Name them.",
      "Umas estáveis. Outras em chamas. Nomeie-as.",
    ),
    what: EB(
      "Per-directory rollup (depth 2 by default) of files touched, stabilized, churn events, and stabilization ratio. Directories classified stable ≥ 0.80, volatile < 0.50.",
      "Consolidado por diretório (profundidade 2 por padrão) de arquivos tocados, estabilizados, eventos de churn e taxa de estabilização. Diretórios classificados estáveis ≥ 0.80, voláteis < 0.50.",
    ),
    why: EB(
      "\"The backend is a mess\" is a feeling. Stability map turns it into `src/payments/` at 0.41 vs `src/shared/` at 0.92. That's something you can fix, staff, or document.",
      "\"O backend é uma bagunça\" é uma sensação. O mapa de estabilidade transforma isso em `src/payments/` 0.41 vs `src/shared/` 0.92. É algo que dá para corrigir, alocar time ou documentar.",
    ),
    visual: {
      type: "code",
      field: "stability_map[]",
      unit: "DirectoryMetrics[]",
      example: 'src/payments/ — 0.41 · src/shared/ — 0.92',
    },
  },

  {
    id: "churn-detail",
    kind: "metric",
    eyebrow: EB("STRUCTURE · CHURN DETAIL", "ESTRUTURA · CHURN EM DETALHE"),
    headline: EB(
      "Name the files that cost you",
      "Nomeie os arquivos que estão custando caro",
    ),
    lede: EB(
      "Top churning files with their chain. And the pairs that move together.",
      "Top arquivos em churn com a cadeia. E os pares que se mexem juntos.",
    ),
    what: EB(
      "Top 10 churning files with their full chain (e.g., feat → fix → fix → refactor). Plus file couplings: pairs that co-occur in commits with high coupling rate.",
      "Top 10 arquivos em churn com a cadeia completa (ex.: feat → fix → fix → refactor). Mais acoplamento de arquivos: pares que co-ocorrem em commits com alta taxa de acoplamento.",
    ),
    why: EB(
      "Aggregate numbers tell you something is wrong. Churn detail tells you which file, what pattern, and what else changes with it. Now you can fix the root cause, not the symptom.",
      "Números agregados dizem que algo está errado. O churn em detalhe diz qual arquivo, qual padrão e o que mais muda junto. Agora dá para atacar a causa raiz, não o sintoma.",
    ),
    visual: {
      type: "code",
      field: "churn_top_files[0].chain",
      unit: "string",
      example: '"feat→fix→fix→fix"',
    },
  },

  {
    id: "activity-timeline",
    kind: "metric",
    eyebrow: EB("TIME · TIMELINE", "TEMPO · LINHA DO TEMPO"),
    headline: EB(
      "Every week tells a story",
      "Cada semana conta uma história",
    ),
    lede: EB(
      "Weekly breakdown + four pattern detectors.",
      "Visão semanal + quatro detectores de padrão.",
    ),
    what: EB(
      "ISO-week rollup: commits, LOC, intent mix, origin mix, stabilization, churn, PRs merged. Patterns auto-detected: burst_then_fix, quiet_period, ai_ramp, intent_shift.",
      "Consolidado por semana ISO: commits, LOC, mix de intenção, mix de origem, estabilização, churn, PRs. Padrões auto-detectados: burst_then_fix, quiet_period, ai_ramp, intent_shift.",
    ),
    why: EB(
      "When a metric jumped, you need to know why. The timeline + patterns layer gives you an annotated story — not just numbers, but the moments that made them.",
      "Quando uma métrica mexe, você precisa saber por quê. A linha do tempo + padrões dá uma história anotada — não só números, mas os momentos que os geraram.",
    ),
    visual: {
      type: "code",
      field: "activity_patterns[].pattern",
      unit: "enum",
      example: '"ai_ramp" · week 10/14',
    },
  },

  {
    id: "pr-lifecycle",
    kind: "metric",
    eyebrow: EB("TIME · PR LIFECYCLE", "TEMPO · CICLO DE PR"),
    headline: EB(
      "Quantify review friction",
      "Quantifique a fricção no review",
    ),
    lede: EB(
      "Before it becomes a complaint in the retro.",
      "Antes que vire uma reclamação na retro.",
    ),
    what: EB(
      "Median time-to-merge, median PR size (files and lines), median review rounds, and single-pass rate — the fraction of PRs merged without a CHANGES_REQUESTED review.",
      "Tempo mediano até o merge, tamanho mediano do PR (arquivos e linhas), mediana de rodadas de review e taxa de primeira passada — a fração de PRs fundidos sem CHANGES_REQUESTED.",
    ),
    why: EB(
      "Single-pass rate is the PR metric that correlates most with team satisfaction. Combined with time-to-merge, it tells you whether review is a gate or a bottleneck.",
      "A taxa de primeira passada é a métrica de PR que mais se correlaciona com a satisfação do time. Junto com o tempo até o merge, diz se o review é porta ou gargalo.",
    ),
    visual: {
      type: "code",
      field: "pr_single_pass_rate · pr_median_time_to_merge_hours",
      unit: "float · float",
      example: "0.64 · 18.2",
    },
  },

  {
    id: "operation-classification",
    kind: "metric",
    eyebrow: EB("STRUCTURE · OPERATIONS", "ESTRUTURA · OPERAÇÕES"),
    headline: EB(
      "The mix of how your team writes",
      "O mix de como seu time escreve",
    ),
    lede: EB(
      "Added, deleted, updated, moved, duplicated.",
      "Adicionadas, removidas, atualizadas, movidas, duplicadas.",
    ),
    what: EB(
      "Lightweight five-bucket taxonomy of line operations per commit, built from diff content plus duplicate and move detectors. Overall plus per-origin breakdown.",
      "Taxonomia leve de cinco baldes para operações de linha por commit, a partir do diff mais detectores de duplicata e movimento. Visão geral mais breakdown por origem.",
    ),
    why: EB(
      "A team dominated by `added` is growing fast; by `updated`, iterating; by `moved`, refactoring; by `duplicated`, accumulating debt. Shape of work, in one chart.",
      "Um time dominado por `added` está crescendo rápido; por `updated`, iterando; por `moved`, refatorando; por `duplicated`, acumulando dívida. O formato do trabalho em um gráfico.",
    ),
    visual: {
      type: "code",
      field: "operation_dominant",
      unit: "enum",
      example: '"updated"',
    },
  },

  // ─── CHAPTER 6: MOTION ──────────────────────────────────────────
  {
    id: "chapter-motion",
    kind: "chapter",
    eyebrow: EB("PART 6", "PARTE 6"),
    headline: EB(
      "Motion — velocity without blindness",
      "Movimento — velocidade sem ser cego",
    ),
    lede: EB(
      "How fast is the team — and is that speed paid for in durability?",
      "Quão rápido é o time — e essa velocidade está paga em durabilidade?",
    ),
  },

  {
    id: "velocity",
    kind: "metric",
    eyebrow: EB("MOTION · VELOCITY", "MOVIMENTO · VELOCIDADE"),
    headline: EB(
      "Speed means nothing if durability drops",
      "Velocidade não significa nada se a durabilidade cai",
    ),
    lede: EB(
      "Commits/week, lines/week, and the correlation with quality.",
      "Commits/semana, linhas/semana e a correlação com qualidade.",
    ),
    what: EB(
      "14-day windows of commits/week and lines/week. Trend classified accelerating, stable, decelerating. Correlated with per-window stabilization — the durability connection.",
      "Janelas de 14 dias de commits/semana e linhas/semana. Tendência classificada como acelerando, estável, desacelerando. Correlacionado com estabilização por janela — a conexão com durabilidade.",
    ),
    why: EB(
      "Accelerating with durability steady = real progress. Accelerating while stabilization drops = you are shipping noise faster. Velocity alone lies. Velocity + durability tells the truth.",
      "Acelerando com durabilidade estável = progresso real. Acelerando enquanto estabilização cai = você está entregando ruído mais rápido. Velocidade sozinha mente. Velocidade + durabilidade diz a verdade.",
    ),
    visual: {
      type: "code",
      field: "velocity.trend · velocity.durability_correlation",
      unit: "enum · enum",
      example: '"accelerating" · "decoupled"',
    },
  },

  {
    id: "adoption-timeline",
    kind: "metric",
    eyebrow: EB("MOTION · ADOPTION", "MOVIMENTO · ADOÇÃO"),
    headline: EB(
      "The day AI changed your metrics",
      "O dia em que a IA mudou suas métricas",
    ),
    lede: EB(
      "Detected automatically. Pre vs post, side by side.",
      "Detectado automaticamente. Antes vs depois, lado a lado.",
    ),
    what: EB(
      "Finds the inflection point where AI-attributed commits began appearing. Splits history into pre-adoption and post-adoption, each with a full ReportMetrics snapshot.",
      "Encontra o ponto de inflexão onde os commits atribuídos à IA começaram. Separa o histórico em pré-adoção e pós-adoção, cada um com um snapshot completo de ReportMetrics.",
    ),
    why: EB(
      "Before-and-after proof. Stabilization went from 0.71 to 0.84 since the Copilot rollout? That's a number you can put on a slide. Reversed? That's a number you need to look at fast.",
      "Prova antes-e-depois. A estabilização foi de 0.71 para 0.84 desde o rollout do Copilot? É um número para um slide. Inverteu? É um número para olhar rápido.",
    ),
    visual: {
      type: "code",
      field: "adoption_timeline.adoption_confidence",
      unit: "enum",
      example: '"clear" · pre 0.71 → post 0.84',
    },
  },

  // ─── CLOSING ────────────────────────────────────────────────────
  {
    id: "closing",
    kind: "closing",
    eyebrow: EB("NEXT", "PRÓXIMO"),
    headline: EB(
      "See your own numbers",
      "Veja seus próprios números",
    ),
    lede: EB(
      "One CLI command. No servers. No SaaS telemetry on private code.",
      "Um comando de CLI. Sem servidores. Sem telemetria SaaS em código privado.",
    ),
    what: EB(
      "Iris runs locally against your Git history and GitHub PRs, produces a report in minutes, and optionally pushes the metrics to your tenant for cross-repo views.",
      "O Iris roda localmente contra seu histórico Git e PRs do GitHub, gera um relatório em minutos e opcionalmente envia as métricas para seu tenant para visões cross-repo.",
    ),
    why: EB(
      "Everything in this deck is open and auditable. Read the methodology, run it on your own repo, and decide for yourself whether the signal is real.",
      "Tudo nesse deck é aberto e auditável. Leia a metodologia, rode no seu próprio repo e decida se o sinal é real.",
    ),
  },
];
