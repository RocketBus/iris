# Guia de Leitura — Relatório Organizacional Iris

Você está recebendo um relatório experimental gerado pelo Iris, uma ferramenta de inteligência de engenharia que analisa repositórios Git para identificar padrões de entrega de software.

**O que o Iris faz:** analisa o histórico de commits, pull requests e mudanças de código dos repositórios da organização para distinguir entre atividade de engenharia que gera resultados duráveis (sinal) e atividade que demanda correção ou retrabalho (ruído). O objetivo é tornar visíveis dinâmicas de engenharia que normalmente são invisíveis.

**O que o Iris NÃO faz:** não avalia pessoas. Todas as métricas são sobre repositórios e sistemas, nunca sobre indivíduos. Não mede produtividade, não conta linhas de código, e não ranqueia equipes. Os resultados descrevem padrões observáveis e devem ser lidos como hipóteses para investigação, não como conclusões definitivas.

---

## Como ler o relatório

O relatório tem três seções de inteligência no topo, seguidas por tabelas de dados. Recomendamos ler nesta ordem:

### 1. Trajetória de Entrega

Comece por aqui. Esta seção responde: "para onde a organização está indo?" Ela classifica os repositórios em três grupos com base na tendência de estabilização nos últimos 30 dias comparada aos 90 dias completos:

- **Melhorando** — repositórios onde a proporção de código que permanece estável após ser escrito está aumentando
- **Declinando** — repositórios onde essa proporção está diminuindo (mais retrabalho recente)
- **Estáveis** — sem mudança significativa

Isso dá o panorama geral antes de olhar os detalhes.

### 2. O que Mudou Recentemente

Identifica qual *tipo* de mudança está mais presente na organização. O Iris agrupa as mudanças em quatro dimensões:

- **Estabilidade** — taxa de estabilização e churn (quantos arquivos precisam ser re-editados em pouco tempo)
- **Features** — estabilização especificamente de código classificado como feature
- **Workflow** — tempo de merge de PRs e taxa de aprovação direta (PRs aceitos sem rounds adicionais de review)
- **Composição** — como a distribuição entre features, fixes e configuração está mudando

Esta seção mostra qual dimensão teve mais impacto no período recente e dá exemplos concretos.

### 3. Onde Olhar Primeiro

Os 3-5 repositórios que merecem investigação. Aqui aparecem apenas repositórios com sinais preocupantes — repos que estão melhorando são excluídos. Para cada repo, o relatório mostra:

- Um resumo do padrão identificado (desestabilização, fricção no workflow, mudança de composição)
- As métricas específicas que mudaram, com a magnitude da mudança em pontos percentuais (pp) ou horas (h)
- A classificação da mudança: *notable* (mudança detectável) ou *significant* (mudança expressiva)

---

## Glossário de termos

| Termo | Significado |
|---|---|
| **Estabilização** | Proporção de arquivos que, uma vez modificados, não precisaram ser alterados novamente dentro da janela de análise. Estabilização alta = código que "colou de primeira". |
| **Churn** | Quando um arquivo é modificado mais de uma vez em um curto período. Churn alto pode indicar retrabalho, iteração em requisitos, ou correções em sequência. |
| **Taxa de revert** | Proporção de commits que revertem commits anteriores. |
| **Δ Estab. (Delta)** | A mudança na taxa de estabilização entre a janela completa (90 dias) e a janela recente (30 dias). "+16pp" significa que a estabilização subiu 16 pontos percentuais recentemente. |
| **Tempo de merge de PR** | Tempo mediano entre a abertura de um PR e seu merge. |
| **Taxa de aprovação direta** | Proporção de PRs que foram aprovados e mergeados sem rounds adicionais de review. |
| **Participação Feature/Fix/Config** | Como a atividade de engenharia se distribui entre desenvolvimento de features novas, correções, e mudanças de configuração/infra. |
| **Desestabilizando** | O repo está mostrando queda na estabilização recente — mais código precisando de retrabalho. |
| **Estabilizando** | O repo está melhorando — código mais durável recentemente. |
| **Fricção no workflow** | PRs estão demorando mais para serem mergeados ou precisando de mais rounds de review. |
| **Mudança de composição** | A distribuição entre tipos de mudança (feature, fix, config) mudou significativamente. |
| **Misto** | Sinais em direções opostas — algumas métricas melhorando, outras piorando. |

---

## O que esse relatório NÃO está dizendo

- Um repo com estabilização baixa não é necessariamente "ruim" — pode estar em fase ativa de desenvolvimento com requisitos em evolução
- Churn alto pode refletir experimentação saudável, não incompetência
- Fricção no workflow pode indicar reviews mais rigorosos, que é positivo
- Os números descrevem *o quê* está acontecendo, não *por quê* — o porquê precisa de contexto humano

**Pedimos que você leia o relatório e depois nos conte:** O que fez sentido? O que não fez? Algum insight te surpreendeu? Você faria algo diferente com base nessas informações? Seu feedback vai determinar a direção do produto.
