# Jinni Research — Executive Summary

Scope: Zepto static analysis (Zomato deferred per your instruction) + Jinni repository
audit, to inform Jinni's grocery-commerce architecture. All findings are read-only;
nothing in Jinni was modified.

## What was actually done
1. Zepto APK manifest + native-layer analysis (permissions, payment SDKs, auth SDKs,
   analytics/observability stack)
2. Zepto JS bundle identified as Hermes bytecode (v96); no disassembler available this
   session, so string-table-level evidence only (screen names, API hosts, feature flags,
   analytics events) — NOT verified code structure
3. Zepto screen inventory (~58 identifiers) and workflow mapping, both identifier-level
4. Jinni repo structural audit: module layout, then code-level verification of the
   grocery cart/checkout flow specifically, then architecture (state, API, navigation)
5. A first-pass gap analysis, corrected after code verification (two items originally
   flagged as "absent" turned out to be implemented)

## Confidence levels — read this before acting on anything below
- **Zepto findings: INFERRED**, not OBSERVED-and-verified. They're real strings pulled
  from compiled bytecode, but without a disassembler there's no confirmation of which
  screens actually call which APIs, what the real navigation graph looks like, or
  whether a feature is live vs. deprecated-but-still-referenced in the bundle.
- **Jinni findings: OBSERVED and code-verified** for grocery cart/checkout, cartStore,
  api.ts, useStore.ts, moduleRegistry.ts, and RootNavigator.tsx specifically. Other
  modules (food, cab, salon, orders detail, admin) were only verified at file-listing
  depth, not code-content depth — treat findings about them as directional only.

## Top findings that should actually change decisions

1. **Jinni's checkout is more complete than a surface scan suggested.** Coupons and a
   payment-method picker (COD/UPI with server-side verification) both already work.
   Don't rebuild these — the real gaps are narrower: serviceability pre-checking and
   structured OOS/substitution handling (currently a free-text note to the store).

2. **Jinni's order model is architecturally different from Zepto's, on purpose.**
   Zepto pre-resolves a single dark store by location before checkout. Jinni broadcasts
   orders to nearby stores to accept (race-to-accept). This isn't a gap to close — it's
   a different design that changes what "is this address serviceable" even means here.
   Any serviceability-check feature needs to be designed for Jinni's model, not copied
   from Zepto's.

3. **Jinni is one codebase serving five roles** (customer/admin/store/partner-shared),
   routed at the root navigator by user role and status. Zepto is consumer-only; its
   store/delivery-partner experiences are separate products. This is a real tradeoff
   (unified maintenance vs. bundle size and permission surface) worth being deliberate
   about as the app grows, not something to reassess by accident later.

4. **Cab and salon are live, not scaffolding.** `enabled: true` in the module registry,
   right now. If your near-term focus is genuinely grocery+food, worth an explicit
   decision about whether cab/salon get resourced too or stay parked — the code doesn't
   currently signal which.

5. **Zepto carries features outside grocery scope** (pharmacy with prescription
   upload/consent, electronics trade-in, festival campaign UI) — explicitly NOT
   recommended to replicate per your own instruction to design original architecture,
   not copy Zepto feature-for-feature.

## Remaining work (not yet done)
- Zomato analysis — deferred per your instruction, pick up later
- Deeper Jinni code verification for food/cab/salon modules (currently file-listing
  depth only)
- Phase 6 (Zepto-vs-Zomato comparison matrix) — blocked until Zomato is in scope
- Phase 8 remaining deliverables: jinni-proposed-architecture.md,
  jinni-data-models-and-api-proposals.md, implementation-roadmap.md,
  evidence-and-unknowns.md (a consolidated list of every UNKNOWN acronym/term —
  ZIC, NZS, POIA, OBD, PTP — flagged across the Zepto docs)

## Files produced this session (E:\work\super\research\reverse-engineering\)
- zepto-js-bundle-findings.md (Phase 2)
- zepto-screen-inventory.md (Phase 3)
- zepto-workflow-mapping.md (Phase 4)
- jinni-feature-gap-analysis.md (Phase 7, corrected after code verification)
- jinni-technical-architecture.md (Phase 5)
- executive-summary.md (this file)

Also on your local machine (not in the repo): zepto_bundle_strings*.json,
zepto_screen_events.json under C:\Users\Ankit\Downloads\jinni_plan\ — raw extraction
data behind the Zepto findings, kept outside the repo since it's Zepto's bytecode-derived
data, not Jinni's own content.
