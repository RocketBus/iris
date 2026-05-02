# AGENTS.md — Iris Development Guidelines

## Purpose

This document defines how AI agents and contributors should collaborate within the Iris repository.

Iris is an early-stage exploratory system focused on discovering meaningful engineering intelligence signals in AI-assisted software development.

This is NOT a traditional production software project yet.

The primary goal is learning and validation, not feature completeness.

Agents must optimize for insight discovery over software sophistication.

---

## Project Context

Iris explores a new problem space:

> Measuring how Artificial Intelligence changes software delivery systems.

The project is currently in a research and experimentation phase.

We are building analytical understanding before building a platform.

Therefore:

- simplicity is preferred over scalability
- clarity is preferred over abstraction
- experimentation is preferred over optimization

---

## Core Development Rule

Before proposing or writing code, agents must answer:

> What new understanding about engineering systems does this enable?

If the contribution does not produce new insight, it should not be implemented.

---

## Current Development Stage

We are in **Stage 0: Signal Discovery**.

The only objective is to extract meaningful signals from repository history.

### Allowed scope

- repository ingestion
- commit analysis
- pull request lifecycle analysis
- churn detection
- revert detection
- stabilization metrics
- report generation

### Out of scope

- authentication systems
- multi-tenancy
- billing
- production infrastructure
- complex dashboards
- enterprise architecture concerns

---

## Architectural Principles

### 1. Avoid Premature Architecture

Do NOT introduce:

- microservices
- distributed systems
- event buses
- background job frameworks
- complex dependency injection
- heavy abstractions

Prefer simple scripts and modular functions.

A single-process architecture is expected at this stage.

---

### 2. Code Should Be Explainable

Every algorithm must be understandable by reading the code directly.

Avoid opaque optimizations or clever implementations.

Readable logic is more valuable than performance.

---

### 3. Metrics Are Hypotheses

All metrics in Iris are experimental.

Agents must treat metrics as evolving research ideas.

Avoid hardcoding assumptions as permanent truths.

Prefer:

- configurable parameters
- documented assumptions
- explicit formulas

---

### 4. Prefer Deterministic Analysis

Outputs should be reproducible.

Avoid randomness unless explicitly required and documented.

The same input data should produce the same analytical results.

---

### 5. Minimize External Dependencies

Only introduce dependencies when they significantly accelerate insight generation.

Avoid large frameworks.

Prefer standard libraries whenever possible.

---

## Coding Style Expectations

Agents should:

- write small composable functions
- prefer pure functions when possible
- document intent, not implementation mechanics
- avoid overengineering abstractions
- keep modules focused on one analytical responsibility

Bad example:
Creating generalized analytics engines before understanding the domain.

Good example:
Implementing a simple churn calculation module with clear logic.

---

## Repository Philosophy

The repository should feel like:

- a research lab
- an analytical notebook
- an evolving intelligence engine

Not like:

- a SaaS startup backend
- an enterprise platform
- a framework ecosystem

---

## Expected Directory Direction (Guideline Only)

Structure may evolve, but current intent:

/iris
/ingestion      # data collection from repositories
/analysis       # signal extraction logic
/metrics        # experimental metrics
/reports        # report generation
/models         # shared data structures

Agents should not enforce rigid structure prematurely.

---

## Decision Hierarchy

When choosing between options, prioritize in this order:

1. Insight clarity
2. Simplicity
3. Iteration speed
4. Maintainability
5. Performance
6. Scalability

Scalability is intentionally last.

---

## Anti-Goals

Agents must actively avoid introducing:

- productivity scoring of individuals
- surveillance-style analytics
- ranking developers
- behavioral judgments
- HR-style metrics

Iris analyzes systems, never people.

---

## Contribution Workflow for Agents

When proposing changes:

1. State the insight goal briefly.
2. Explain why this analysis matters.
3. Implement the simplest possible version.
4. Document assumptions.
5. Avoid speculative extensions.

---

## Communication Style

Agents should communicate using:

- concise reasoning
- explicit assumptions
- clear tradeoffs

Avoid:

- excessive verbosity
- speculative architecture discussions
- unnecessary refactors

---

## Long-Term Reminder

Iris is attempting to discover a new category:

**Engineering Intelligence for the AI Era.**

The hardest problem is not building software.

The hardest problem is discovering what should be measured.

Agents should behave as research collaborators, not framework builders.

---

## Guiding Question

At all times, ask:

> Does this help us understand how AI is changing software delivery?

If yes, proceed.

If not, stop.
