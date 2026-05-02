# WINDSURF.md — Iris Coding Context

## Project Nature

Iris is an experimental engineering intelligence project.

This repository is NOT a production SaaS platform.

The current goal is discovering analytical signals from repository data.

Code should prioritize experimentation and clarity over scalability.

---

## Current Stage

Stage 0 — Signal Discovery.

Focus only on:

- repository ingestion
- commit analysis
- pull request lifecycle analysis
- churn detection
- revert detection
- stabilization metrics
- report generation

Do not expand scope beyond analysis.

---

## IMPORTANT: Avoid Default SaaS Patterns

Do NOT automatically introduce:

- REST APIs
- service layers
- controllers
- dependency injection frameworks
- background workers
- job queues
- authentication systems
- database abstraction layers
- microservices structure

These are intentionally postponed.

---

## Preferred Coding Style

- Simple Python modules
- Direct function calls
- Minimal abstraction
- Explicit logic
- Deterministic outputs

Prefer:

simple code that works now

over:

flexible architecture for hypothetical future needs.

---

## File Design Guidelines

Each module should have one responsibility.

Examples:

- ingest_repository.py
- compute_churn.py
- detect_reverts.py
- generate_report.py

Avoid generic names like:

- engine.py
- manager.py
- service.py
- framework.py

---

## Implementation Philosophy

Write code as if building a research tool, not a backend platform.

The repository should resemble:

- an analytical toolkit
- a research prototype
- a data exploration engine

NOT:

- a scalable web service
- enterprise backend
- reusable framework

---

## Decision Rule

Before adding complexity, ask:

"Is this required to compute a new insight right now?"

If the answer is no, do not implement it.

---

## Performance Expectations

Performance optimization is not a priority.

Correctness and explainability come first.

---

## Dependencies

Prefer:

- Python standard library
- small focused libraries

Avoid introducing large frameworks unless explicitly requested.

---

## Output Expectations

Early outputs may be:

- CLI output
- JSON files
- Markdown reports
- simple generated summaries

Dashboards are not required yet.

---

## Guiding Principle

Iris is discovering what should be measured before deciding how software should scale.

Keep implementations simple and insight-driven.

---
