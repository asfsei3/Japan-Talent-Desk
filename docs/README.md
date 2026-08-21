# JTD Internal Docs

This folder keeps Japan Talent Desk operating knowledge separate from the public site files.

## Current intent

- `strategy/`: current JTD (B2B) positioning, wording rules, and source-of-truth summaries
- `strategy/jfi/`: Japan Football Intelligence (the free, Japanese-first `/intel` product) —
  architecture, data model, source strategy, API costs, cost model, and automation plan
- `outbound/`: outbound sequencing, CTA rules, CRM notes, and attachment logic
- `newsletter/`: Japan Market Weekly notes, editorial rules, and Brevo operating details
- `reports/`: sample note structure, report principles, and PDF/export workflow
- `travel/`: Travel Decision Engine architecture and limitations

## Travel Decision Engine

A separate product from the Japan Talent Desk recruitment service, developed in this repository
and served at `/travel/`. Its strategy documents sit at the docs root because the product spec
names those paths explicitly:

- `data-sources.md`: source audit and acquisition rules — read before any integration
- `cost-model.md`: infrastructure and API spend, and what is deliberately not bought
- `competitive-analysis.md`: market positioning and honest risks
- `travel/engine.md`: pipeline, scoring model, and known limitations

## Boundary rule

Use FSL as internal operating logic only.

Public-facing JTD copy should stay in JTD language:

- Japan-side context
- role-specific screen
- deal realism
- availability to verify
- next-step recruitment support
