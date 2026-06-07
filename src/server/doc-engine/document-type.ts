/**
 * The Doc Engine's `DocumentType` seam (AR-13, Story 5.1). Invoice is the only type in v1.
 *
 * This is a LIGHT, code-level seam, NOT a registry/plugin system (YAGNI — there is exactly one
 * type). The seam is the `doc-engine/` namespace + the doc-type-agnostic `money.ts` helpers. A
 * future "proposal"/"contract" adds to this union, gets its own sibling table + repository, and
 * REUSES `money.ts` — without re-typing shared Engagement/Client data (FR-17).
 */
export type DocumentType = "invoice";
