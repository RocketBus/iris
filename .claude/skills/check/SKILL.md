---
name: check
description: Verificacao completa de saude do projeto — CLI (Python) e Platform (Next.js). Detecta o que mudou e roda apenas as verificacoes pertinentes. Use antes de abrir PR, apos refactoring, ou quando o usuario pedir para validar o projeto.
argument-hint: Checking...
---

Rode as verificacoes de qualidade pertinentes as alteracoes da branch.

## 1. Detectar o que mudou

Compare a branch atual com `main` (inclui working tree, staged e untracked):

```bash
{ git diff --name-only main...HEAD; git diff --name-only HEAD; git ls-files --others --exclude-standard; } | sort -u
```

Classifique os arquivos:

- **CLI alterado** se ha mudancas em `iris/`, `tests/`, `scripts/`, `pyproject.toml`, ou `.github/workflows/ci.yml` (job `cli`)
- **Platform alterado** se ha mudancas em `platform/`

Os dois escopos sao independentes — rode apenas os blocos cujos arquivos mudaram. Se nada relevante mudou, reporte "nada a verificar" e encerre.

## 2. Verificacoes do CLI (somente se CLI alterado)

Da raiz do repo:

1. `pytest tests/ -q` — suite de testes
2. `iris --help` — smoke test do entry point (valida que imports nao quebraram)
3. `python scripts/check_analysis_chain.py` — garante que todo modulo em `iris/analysis/` esta cabeado no aggregator ou tem opt-out documentado

## 3. Verificacoes da Platform (somente se Platform alterado)

De `platform/`:

1. `npm run lint` — ESLint
2. `npx prettier --check .` — formatacao Prettier (o script `npm run format` escreve, nao checa)
3. `npx tsc --noEmit` — erros de tipo TypeScript
4. `npm run test:coverage` — testes Vitest com cobertura
5. `npm run build` — build Next.js compila

## Output

Apresente apenas as secoes que rodaram. Para cada verificacao: `ok` ou contagem de erros / `falhou`.

```
Mudancas detectadas: CLI | Platform | CLI + Platform | nenhuma

CLI
  pytest:         ok | X falhas
  iris --help:    ok | falhou
  analysis chain: ok | X orfaos

Platform
  Lint:           ok | X erros
  Format:         ok | X arquivos
  TypeScript:     ok | X erros
  Tests:          ok | X falhas
  Build:          ok | falhou
```

Se alguma verificacao falhar, mostre o trecho relevante do erro abaixo do resumo.
