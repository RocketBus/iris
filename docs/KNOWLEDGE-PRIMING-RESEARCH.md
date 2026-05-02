# Knowledge Priming x Iris — Viabilidade e Roadmap

Pesquisa | 2026-03-25

Referência: [Reduce Friction with AI: Knowledge Priming](https://martinfowler.com/articles/reduce-friction-ai/knowledge-priming.html) (Martin Fowler / Thoughtworks)

---

## Hipótese central

O "frustration loop" descrito por Fowler (gerar -> não encaixa -> modificar -> modificar de novo) é exatamente o que o Iris mede como **churn events** e **baixa stabilization ratio**. Se o Iris puder detectar a presença de Knowledge Priming e correlacionar com durabilidade, fecha o loop entre diagnóstico e ação.

---

## Linha 1 — Iris como métrica quantitativa de Knowledge Priming

**Veredicto: VIÁVEL — escopo mínimo claro**

### O que existe hoje

- `origin_classifier.py` classifica commits por origin (HUMAN/AI_ASSISTED/BOT)
- `stabilization.py` calcula stabilization ratio por arquivo
- `trend_delta.py` compara baseline vs recente e detecta co-ocorrências
- `adoption_detector.py` detecta ponto de inflexão de adoção AI

### O que falta

Iris não escaneia arquivos do repo analisado além de `.git`. Não sabe se existe `CLAUDE.md`, `.cursor/rules`, `.github/copilot-instructions.md`, ou `CONTRIBUTING.md` detalhado.

### Proposta de feature mínima

1. **Priming doc detector** — função que recebe o path do repo e verifica existência de arquivos conhecidos:
   - `CLAUDE.md`, `.claude/*`
   - `.cursor/rules`, `.cursorrules`
   - `.github/copilot-instructions.md`
   - `.windsurfrules`
   - `CONTRIBUTING.md` (com threshold de tamanho, e.g. >500 bytes)

2. **Priming introduction date** — via `git log` do arquivo, detectar quando o priming doc foi introduzido. Isso cria um ponto de corte temporal análogo ao `adoption_detector.py`.

3. **Correlação** — comparar stabilization/churn no período pré-priming vs pós-priming, reutilizando a mesma lógica de `trend_delta.py`.

### Complexidade

Baixa. São ~100 linhas de código novo. O detector de priming é uma função pura; a correlação reutiliza infra existente.

### Limitação honesta

Correlação não é causalidade. O time que introduz um `CLAUDE.md` provavelmente também está mais maduro em práticas de AI. O dado é sugestivo, não conclusivo — e o Iris deve apresentá-lo dessa forma.

---

## Linha 2 — Stability map por diretório

**Veredicto: VIÁVEL — extensao natural dos dados existentes**

### O que existe hoje

- `churn_calculator.py` produz `churning_files: list[str]` — caminhos completos dos arquivos que churnam
- `stabilization.py` opera no nível de arquivo (`files_touched`, `files_stabilized`)
- `commit_shape.py` já calcula `directory_spread` por commit mas não agrega por diretório
- `aggregator.py` consolida tudo em `ReportMetrics`

### O que falta

Nenhum módulo agrega métricas por diretório. O salto e pequeno: agrupar os mesmos dados de arquivo por seus dois primeiros níveis de diretório.

### Proposta de feature mínima

1. **`stability_map.py`** — novo módulo em `iris/analysis/`:
   - Input: lista de commits (já existente)
   - Agrupamento: `os.path.dirname()` com profundidade configurável (default: 2 níveis)
   - Output por diretório: `files_touched`, `files_stabilized`, `stabilization_ratio`, `churn_events`
   - Filtro: mínimo 3 arquivos tocados para aparecer no mapa

2. **Output no report** — nova seção opcional "Stability Map" no relatório Markdown, listando áreas estáveis (>80%) e voláteis (<50%).

3. **Output estruturado** — JSON/YAML para consumo por agentes AI, incluível em priming docs.

### Nível de agregação

Dois níveis (`src/payments/`, `src/lib/services/`) é o sweet spot. Um nível é genérico demais; três níveis fragmenta. Auto-detect baseado na profundidade do repo é possível, mas prematuro.

### Formato

Ambos: Markdown human-readable no report + JSON standalone (`stability-map.json`) para agentes. O Markdown serve como appendix de priming doc existente.

### Complexidade

Baixa-média. ~150 linhas. A lógica de stabilization já existe — é apenas reagrupamento por diretório.

---

## Linha 3 — Trend analysis como contexto temporal para AI

**Veredicto: VIÁVEL COM RESSALVAS — o salto interpretativo e real**

### O que existe hoje

- `trend_delta.py` produz `TrendResult` com deltas classificados como stable/notable/significant
- `detect_co_occurrences()` identifica padrões reforçantes (stability_cascade, fix_instability, recovery, workflow_slowdown)
- `generate_attention_summary()` gera resumo em 1-2 frases (e.g. "Destabilizing — stabilization dropped 14pp")

### O que falta

O attention summary descreve **o que está acontecendo**, não **o que fazer**. A tradução para recomendação comportamental não existe, e é o passo mais arriscado.

### Mapeamento signal -> recomendação (proposta)

| Co-occurrence pattern | Recomendação para AI agent |
|---|---|
| `stability_cascade` | "This repository is destabilizing. Prefer small, focused changes. Avoid large refactors." |
| `fix_instability` | "Fix commits are not stabilizing. Consider whether fixes are addressing root causes." |
| `workflow_slowdown` | "PR merge times are increasing. Keep PRs small and self-contained." |
| `recovery` | "Repository is recovering. Current approach is working — maintain course." |
| Composition shift (config >60%) | "Infrastructure-heavy phase. Code changes may have hidden config dependencies." |

### Risco

Estas recomendações são **plausíveis mas não validadas**. "Stabilization caiu 14pp" -> "prefira mudanças incrementais" é um salto interpretativo razoável mas não necessariamente correto. Um time em meio a um refactoring planejado *deveria* ter stabilization caindo — a recomendação de "evitar refactors" estaria errada.

### Proposta de feature mínima

1. Gerar contexto temporal como **observação factual**, não como recomendação prescritiva:
   ```
   Repository state (last 30 days):
     Phase: destabilizing (stabilization -14pp)
     Dominant activity: 65% config changes
     Fix stability: declining (fixes being re-fixed)
   ```

2. Deixar a tradução observação -> recomendação para o priming doc humano ou para um segundo passo validado.

### Complexidade

Baixa para observações factuais (reutiliza `trend_delta.py` diretamente). Alta para recomendações validadas (requer feedback loop com usuários).

---

## Linha 4 — Churn patterns como anti-patterns empíricos

**Veredicto: VIÁVEL — dados existem, curadoria é o desafio**

### O que existe hoje

- `churning_files` lista exata de arquivos com churn
- `churn_by_intent` mostra quais tipos de commit churnam mais
- `churn_by_origin` mostra se AI ou humano churn mais
- `fix_latency.py` produz `ReworkEvent` com pares (arquivo, commit_original, commit_rework)

### Anti-patterns deriváveis

1. **Hotspots de rework** — arquivos que aparecem em `churning_files` em múltiplas janelas de análise. Se `src/payments/processor.py` churn em 3 meses consecutivos, isso é um anti-pattern empírico.

2. **Fix-chains** — sequências de `ReworkEvent` onde o rework de um fix gera outro rework. Indica que fixes não estão resolvendo a causa raiz.

3. **Intent-instability** — combinações intent+diretório com stabilization consistentemente baixa. "FIX commits em src/integrations/ tem 28% stabilization vs 72% no repo" = anti-pattern.

### O que falta

- **Histórico multi-janela** — hoje cada análise é independente. Para detectar hotspots recorrentes, precisa comparar janelas ou manter estado mínimo.
- **Curadoria** — dados brutos de churn não são anti-pattern até serem interpretados. "processor.py churn 3x" é um fato; "não modifique processor.py sem review do time de payments" é uma recomendação que requer contexto que o Iris não tem.

### Proposta de feature mínima

1. **Recurring churn detector** — se um arquivo aparece em `churning_files` em >50% das janelas de análise (quando o org_runner roda em modo multi-window), flag como hotspot.
2. **Output factual** — listar hotspots no report sem recomendação prescritiva:
   ```
   Recurring churn hotspots:
     src/payments/processor.py — churned in 3/4 analysis windows
     src/integrations/api_client.py — churned in 4/4 analysis windows
   ```
3. Para priming docs, o humano traduz o hotspot em anti-pattern contextual.

### Complexidade

Media. Requer ou múltiplas execuções (org_runner multi-window) ou persistência mínima de resultados anteriores.

---

## Linha 5 — Gerar seções de priming doc

**Veredicto: PARCIALMENTE VIÁVEL — complemento, não substituto**

### Avaliação por seção do framework de Fowler

| Seção | Iris pode gerar? | Como | Qualidade |
|---|---|---|---|
| Architecture overview | Não | Requer conhecimento semantico do código | — |
| Tech stack & versions | Não | Requer análise de dependências (package.json, etc) | — |
| Curated knowledge sources | Não | Requer input humano | — |
| Project structure | **Parcialmente** | Stability map (linha 2) mostra areas ativas/estáveis | Média |
| Naming conventions | Não | Requer análise de AST | — |
| Code examples | Não | Requer análise de código | — |
| Anti-patterns to avoid | **Parcialmente** | Churn hotspots (linha 4) como base empírica | Média |

O Iris contribui para **2 de 7 seções**, e parcialmente. Não substitui o priming doc escrito pelo Tech Lead — é um **apêndice empírico**.

### Proposta de feature mínima

Comando `iris primer <repo>` que gera um arquivo `iris-primer.md` com:

```markdown
# Iris Empirical Context
# Generated: 2026-03-25 | Window: 90 days

## Stability Map
[output da linha 2]

## Repository State
[output da linha 3 — observações factuais]

## Churn Hotspots
[output da linha 4]

## AI Activity Profile
- Origin distribution: 45% human, 52% AI-assisted, 3% bot
- AI stabilization: 68% vs human 74%
- Dominant AI shape: spread (many files, few lines each)
```

Este arquivo pode ser incluido como appendix de um `CLAUDE.md` ou `.cursor/rules` existente, ou referenciado via `@iris-primer.md` em prompts.

### Advertencia de Fowler

"3 páginas focadas > 20 páginas geradas automaticamente." O primer deve ser **curto e factual**. Se ultrapassar ~1 página, está errado.

### Complexidade

Baixa — e composição dos outputs das linhas 2, 3 e 4.

---

## Linha 6 — Dogfooding no próprio Iris

**Veredicto: VIÁVEL — primeiro caso de estudo natural**

### O que temos

- Iris já usa `CLAUDE.md` para seu próprio desenvolvimento
- O repo tem histórico de commits AI_ASSISTED (co-author Claude)
- Podemos rodar Iris no próprio repo

### Experimento proposto

1. Rodar Iris no repo Iris com janela de 90 dias
2. Registrar métricas baseline (stabilization, churn, fix latency by origin)
3. Enriquecer `CLAUDE.md` com stability map e churn hotspots gerados
4. Continuar desenvolvimento normal por 30 dias
5. Rodar novamente e comparar

### Limitação

N=1. Um único repo com um único developer principal não é evidência estatística. Mas é útil como:
- Validação técnica de que o pipeline funciona end-to-end
- Case study narrativo para pitch de produto
- Calibração do formato de output (o que é útil, o que é ruído)

### Complexidade

Baixa. Só requer executar o que já existe + as features das linhas 2-4 quando prontas.

---

## Síntese

| Linha | Viável? | Complexidade | Dependências | Prioridade sugerida |
|---|---|---|---|---|
| 1. Métrica de priming | Sim | Baixa | Nenhuma | **P1** — habilita todas as outras |
| 2. Stability map | Sim | Baixa-média | Nenhuma | **P1** — valor standalone alto |
| 3. Contexto temporal | Com ressalvas | Baixa (factual) | Nenhuma | P2 — depende de validação |
| 4. Anti-patterns | Sim | Média | Multi-window ou persistência | P2 — depende de infra |
| 5. Gerar primer | Parcialmente | Baixa | Linhas 2, 3, 4 | P3 — composição |
| 6. Dogfooding | Sim | Baixa | Linhas 1, 2 | P1 — feedback loop imediato |

### Ordem de execução recomendada

1. **Priming doc detector** (linha 1) + **Stability map** (linha 2) — ambos independentes, baixa complexidade
2. **Dogfooding** (linha 6) — roda no próprio repo para validar
3. **Contexto temporal factual** (linha 3) — reutiliza trend_delta existente
4. **Churn hotspots** (linha 4) — quando multi-window estiver disponível
5. **Primer generator** (linha 5) — composição de tudo

---

## Narrativa de produto atualizada

**Atual:** "Iris mede se a engenharia está saudável"

**Proposta:** "Iris mede durabilidade de entrega e gera contexto empírico que melhora a qualidade do código AI-assisted"

O diferencial: nenhuma ferramenta hoje conecta **métricas de durabilidade** com **Knowledge Priming**. git-ai mede adoção e acceptance rate. CodeScene mede technical debt. Nenhum deles fecha o loop "medir -> intervir -> medir de novo".

**Visão long-term (v2+, não implementar agora):** Iris como context provider para agentes AI — gerando input machine-readable que alimenta assistentes com conhecimento real do projeto. Só vale perseguir se a pesquisa base confirmar que contexto derivado de git gera melhoria mensurável em stabilization.

---

## Próximos passos

- [ ] Implementar priming doc detector (`iris/analysis/priming_detector.py`)
- [ ] Implementar stability map (`iris/analysis/stability_map.py`)
- [ ] Rodar Iris no próprio repo como baseline de dogfooding
- [ ] Validar com entrevistas se stability map/hotspots são úteis para devs
