// Client-safe re-exports for the buy form's live preview (same math as the server).
export { parseDollars, parsePercentToBps, splitLot } from "@/lib/money";
import type { ConditionDraft } from "@/components/card-fields";

export function conditionLabelSafe(c: ConditionDraft): string {
  if (c.conditionType === "graded") return [c.grader, c.grade, c.gradeLabel].filter(Boolean).join(" ");
  return c.rawCondition;
}
