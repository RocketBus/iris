/**
 * Types for AI Tool Comparison — side-by-side quality of code authored with
 * different AI tools (Copilot, Cursor, Claude, etc).
 *
 * All aggregates are org-level across repos. Zero per-person fields.
 */

export interface ToolRow {
  tool: string;
  commits: number;
  /** Line-survival rate (0-1). Null when no durability data. */
  durability: number | null;
  /** Cascade rate (0-1). Null when no cascade data. */
  cascadeRate: number | null;
  /** Revert rate (0-1). Null when no revert data. */
  revertRate: number | null;
  /** PR single-pass rate (0-1). Null when no PR data. */
  singlePassRate: number | null;
  /** True when commits < threshold — UI should mark as low-confidence. */
  belowThreshold: boolean;
}

export interface ToolComparison {
  rows: ToolRow[];
  /** Minimum commit threshold used to flag rows as low-confidence. */
  commitThreshold: number;
  /** Number of tools with enough commits to be meaningful. */
  significantTools: number;
}
