# Competitive Landscape — Engineering Intelligence Platforms

**Última atualização:** 2026-03-06

---

## Proposta de diferenciação (1 frase)

**"O Iris é diferente porque mede a durabilidade do código — quanto do que é produzido sobrevive ao tempo — que nenhuma ferramenta do mercado captura como sinal primário, e isso importa porque na era de AI-assisted development, a pergunta deixou de ser 'quão rápido entregamos' e passou a ser 'quanto do que entregamos é durável'."**

---

## Tabela Comparativa

| | LinearB | Jellyfish | DX | Swarmia | Flow (Appfire) | Haystack | GitClear | **Iris** |
|---|---|---|---|---|---|---|---|---|
| **Foco** | DORA + cycle time | Business alignment + FinOps | Developer experience (surveys) | DORA + working agreements | Git analytics + activity | DORA + delivery pipeline | Code quality + provenance | **Durabilidade do código** |
| **Métricas core** | DORA, cycle time breakdown, PR flow | Allocation, investment mix, DORA | DXI (survey index), DORA | DORA, SPACE, investment balance | Churn, impact, efficiency, DORA | DORA, throughput, risk | Diff Delta, code provenance, churn | **Stabilization, churn, revert, signal vs noise** |
| **Coleta** | GitHub/GitLab API | 25+ integrations + HR/payroll | Surveys + system metrics | GitHub/GitLab + Jira/Linear | Git repos + Jira | GitHub/GitLab + Jira | Git repos | **Git log + GitHub CLI (local)** |
| **Persona** | VP Eng / EM | VP Eng / CTO / CFO | VP Eng / Platform Eng | VP Eng / EM | CTO / VP Eng | EM / Dir Eng | EM / Tech Lead | **EM / Tech Lead / VP Eng** |
| **Preço** | $420-549/dev/ano | ~$95K ACV | ~$52K ACV | €39/dev/mês | $38-50/dev/mês | ~$20/dev/mês | $9-16/dev/mês | **Grátis (CLI local)** |
| **Deploy** | SaaS | SaaS | SaaS | SaaS | SaaS | SaaS | SaaS | **CLI local, zero cloud** |

### O que cada um mede vs não mede

| Capacidade | LinearB | Jellyfish | DX | Swarmia | Flow | Haystack | GitClear | **Iris** |
|---|---|---|---|---|---|---|---|---|
| DORA metrics | Sim | Sim | Sim | Sim | Sim | Sim (core) | Parcial | Não |
| Code durability / stabilization | Não¹ | Não | Não | Não | Não | Não | **Parcial²** | **Core** |
| Code churn (temporal) | Rework ratio (21d) | Parcial | Listado | Rejeitado | Core | De-enfatizado | Sim | **Core** |
| New code churn rate | Não | Não | Não | Não | Não | Não | Parcial | **Core (2w/4w)** |
| Revert detection | Não é métrica | Não | Contagem simples | DORA only | Básico | Básico | Sim | **Core** |
| Duplicate block detection | Não | Não | Não | Não | Não | Não | **Sim** | **Sim** |
| Code movement / refactoring | Não | Não | Não | Não | Não | Não | **Sim** | **Sim** |
| Code provenance (age of revised) | Não | Não | Não | Não | Não | Não | **Core** | **Sim** |
| Operation classification | Não | Não | Não | Não | Não | Não | **Core (7 types)** | **Sim (5 types)** |
| Temporal dynamics | Não | Não | Não | Não | Não | Não | **Parcial** | **Core** |
| AI attribution | Heurístico³ | Self-report | CLI daemon⁴ | PR-level | Não | Não | Sim | Potencial |
| AI quality correlation | Não | Não | "Coming soon" | Não | Não | Não | **Sim⁵** | **Sim** |
| Developer surveys | Não | Sim (DevEx) | Core | Alfa | Não | Sim | Não | Não |
| Investment allocation | Não | Core | Parcial | Sim | Não | Parcial | Não | Não |
| Indivíduo vs sistema | Indivíduo | Indivíduo | Survey individual | Time | **Indivíduo** | Time | Indivíduo | **Sistema** |

¹ LinearB tem "Rework Ratio" (código re-escrito em 21 dias) — binário, não contínuo
² GitClear mede "code provenance" (tempo entre escrita e modificação) e "Diff Delta" (mudança durável)
³ LinearB depende de co-author tags, labels manuais, e GitHub Copilot API
⁴ DX usa CLI daemon para atribuição line-level, mas correlação com qualidade é "coming soon"
⁵ GitClear publicou pesquisa mostrando correlação entre código AI-generated e aumento de churn

---

## Whitespace — O que ninguém faz bem

### 1. Durabilidade como sinal primário

Nenhuma ferramenta trata "quanto do código sobrevive" como a métrica central. LinearB tem Rework Ratio (janela fixa de 21 dias, binário). GitClear tem Diff Delta (o mais próximo). Mas nenhuma oferece:
- **Curva de estabilização** ao longo do tempo
- **Stabilization ratio** como indicador de saúde do sistema
- **Dinâmica temporal**: como o código evolui de instável para durável

### 2. Sistema > Indivíduo

A maioria das ferramentas mede (ou pode ser configurada para medir) no nível individual. Isso gera resistência de devs, gaming de métricas, e cultura de vigilância. Iris mede o sistema — repositórios, não pessoas.

### 3. Análise sem dependência de cloud

Todas as alternativas são SaaS que requerem enviar dados de código para servidores externos. Iris roda local, zero dados na nuvem. Para empresas com restrições de compliance/segurança, isso é um diferenciador real.

### 4. Narrativa > Dashboard

A maioria entrega dashboards com dezenas de métricas e pouca orientação sobre o que fazer. Reclamação #1 em reviews de Jellyfish, LinearB e Haystack: "não sei o que fazer com esses dados." Iris gera relatório narrativo com "Where to Look First" — diz onde investigar, não apenas mostra números.

### 5. AI code quality — a pergunta que importa

Todos estão correndo para medir adoção de AI (quantos devs usam Copilot?). Ninguém responde a pergunta que importa: **"código gerado por AI é mais frágil?"** GitClear publicou pesquisa sugerindo que sim. Iris tem a infraestrutura para investigar isso com stabilization_by_intent.

---

## Análise por Competidor

### LinearB — O mais direto

**Força:** DORA metrics mais completo. 8.1M PRs de benchmark. Cycle time breakdown em 4 fases. Automação de PR workflow (gitStream).

**Fraqueza fatal:** Dados imprecisos. Reclamação mais citada em G2/Capterra: "data accuracy issues which customer support was unable to understand." Se os números não são confiáveis, a ferramenta vira shelfware.

**Diferença para Iris:** LinearB mede quão rápido código passa pelo pipeline. Iris mede quão durável é o resultado. São perguntas ortogonais. Não competimos diretamente.

### Jellyfish — O mais caro

**Força:** Único que conecta eng metrics com finance (R&D capitalization, tax credits). "Patented Work Allocation algorithm." Persona CFO é diferenciadora.

**Fraqueza fatal:** ~$95K ACV exclui SMBs. UI complexa. Sem API para exportar dados. Adoção demorada (semanas de onboarding).

**Diferença para Iris:** Jellyfish pergunta "onde está indo o investimento de engenharia?" Iris pergunta "o investimento está gerando resultado durável?" Complementares, não concorrentes.

### DX — O mais acadêmico

**Força:** Fundada por Nicole Forsgren (DORA) e Margaret-Anne Storey (SPACE). Framework DX Core 4 é bem fundamentado. Adquirida pela Atlassian por $1B (Sep 2025) — vai ser embeddado no Jira.

**Fraqueza fatal:** Dependência de surveys. Response bias cultural (scores sistematicamente mais altos na Índia/APAC). DXI é caixa-preta proprietária. Implementação leva meses.

**Diferença para Iris:** DX mede como devs *se sentem* sobre o trabalho. Iris mede o que o *código revela* sobre os resultados. Percepção vs evidência comportamental.

### Swarmia — O mais "developer-friendly"

**Força:** Rejeita explicitamente métricas individuais e code churn. Working agreements são conceito interessante. Free tier para <10 devs.

**Fraqueza fatal:** Ao rejeitar code churn, joga fora um sinal importante. A posição ideológica limita o que podem oferecer.

**Diferença para Iris:** Swarmia evita olhar para o código em detalhe. Iris faz exatamente isso — mas no nível do sistema, não do indivíduo.

### Pluralsight Flow (Appfire) — O mais controverso

**Força:** Análise de código mais profunda do mercado incumbente. Mede churn como métrica core. "Efficiency ratio" (código produtivo vs rework).

**Fraqueza fatal:** Percepção de vigilância. Leaderboard de devs. Adquirido 2x (GitPrime → Pluralsight → Appfire) — direção incerta.

**Diferença para Iris:** Flow mede churn mas não mede durabilidade. Churn é o sintoma negativo; stabilization é o indicador positivo. E Flow mede indivíduos; Iris mede sistemas.

### Haystack — O mais acessível

**Força:** Preço baixo (~$20/dev/mês). DORA-focused, simples. YC-backed, em crescimento.

**Fraqueza fatal:** "Data feels abstract" — reclamação #1. Zero visibilidade em AI tools. Sem integração Slack.

**Diferença para Iris:** Haystack é DORA simplificado. Iris complementa DORA com uma dimensão que DORA não cobre (durabilidade).

### GitClear — O mais próximo ⚠️

**Força:** Único que mede algo parecido com durabilidade ("code provenance", "Diff Delta"). Publicou pesquisa sobre impacto de AI em code quality. Preço acessível ($9-16/dev/mês).

**Fraqueza fatal:** Ainda é SaaS. Foco em métricas individuais. Sem narrativa — entrega dashboards como os outros.

**Diferença para Iris:** GitClear mede Diff Delta (mudança durável) mas não oferece: curva de estabilização temporal, análise cross-repo, narrativa automatizada, co-occurrence patterns, ou attention signals. Iris agora cobre os sinais core do GitClear (duplicate detection, code movement, provenance, operation classification) mas os integra num sistema analítico completo com segmentação por origin, refactoring ratio, new code churn rate, e narrativa contextualizada. Além disso, Iris roda local — zero dados na nuvem.

---

## Riscos de Posicionamento

### 1. "Feature de plataforma, não produto"
Risco: LinearB ou Jellyfish adicionam "stabilization metric" como mais uma feature. Mitigação: stabilization isolada é uma métrica; Iris oferece um sistema analítico (trends, co-occurrences, attention signals, narrativa). Difícil de copiar como feature bolt-on.

### 2. "Atlassian já comprou DX"
Risco: Jira embeds engineering metrics. Mitigação: DX é survey-first, complementar. Mas a distribuição do Jira é imbatível. Iris precisa se posicionar como complemento (roda sobre qualquer stack), não como substituto.

### 3. "GitClear já faz isso"
Risco: GitClear tem head start em code provenance e AI quality research. Mitigação: Iris agora implementa os mesmos sinais core (duplicates, moves, provenance, operations) mas num contexto system-level, local-first, narrativo, e cross-repo. GitClear tem taxonomia de 7 operações; Iris tem 5 com segmentação por origin e refactoring ratio. A pergunta é diferente: GitClear pergunta "este dev escreve código durável?" Iris pergunta "este sistema está estabilizando?"

### 4. "Sem DORA, sem credibilidade"
Risco: Compradores esperam DORA como baseline. Iris não mede DORA. Mitigação: Posicionar como "o que DORA não cobre" — DORA mede velocidade e confiabilidade de delivery; Iris mede durabilidade do resultado. Complementar, não substituto.

### 5. "Sem surveys, sem experiência do dev"
Risco: Trend de mercado é holístico (quantitativo + qualitativo). Iris é code-only. Mitigação: Manter foco. Code-only é o diferenciador. Surveys introduzem bias e overhead. O código não mente.

---

## Mapa de Posicionamento

```
                    Velocidade (DORA, cycle time)
                              ↑
                              |
          LinearB ●           |          ● Haystack
                              |
    Jellyfish ●               |     ● Swarmia
                              |
         ──────────── Individual ────────────── Sistema ──
                              |
              Flow ●          |
                              |
            GitClear ●        |          ● Iris
                              |
              DX ●            |
                              ↓
                    Durabilidade (stabilization, churn)
```

Iris ocupa o quadrante **Sistema + Durabilidade** — vazio no mercado atual. GitClear é o vizinho mais próximo mas no lado Individual.

---

*Pesquisa baseada em sites oficiais, G2 reviews, Gartner Peer Insights, Capterra, Vendr buyer guides, e artigos de análise. Março 2026.*
