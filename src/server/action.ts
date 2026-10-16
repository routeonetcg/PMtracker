import "server-only";
import { z } from "zod";
import { type ActionResult, fieldErrors } from "@/lib/validation";
import { UserError } from "./inventory";

/**
 * Wrap a server action: validate input with a zod schema, run the body, and
 * turn expected failures into friendly messages instead of crashes.
 */
export async function runAction<S extends z.ZodType, T>(
  schema: S,
  input: unknown,
  body: (data: z.output<S>) => Promise<T>,
): Promise<ActionResult<T>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const errors = fieldErrors(parsed.error);
    return { ok: false, error: Object.values(errors)[0] ?? "Check the form", fieldErrors: errors };
  }
  try {
    return { ok: true, data: await body(parsed.data) };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    // Postgres check constraints / RLS → readable message.
    const cause = e instanceof Error && e.cause instanceof Error ? e.cause.message : "";
    const msg = `${e instanceof Error ? e.message : String(e)} ${cause}`;
    if (/row-level security/i.test(msg)) return { ok: false, error: "You don't have access to do that." };
    if (/violates check constraint/i.test(msg)) return { ok: false, error: "Some values aren't allowed. Check the form." };
    console.error(e);
    return { ok: false, error: "Something went wrong saving that. Please try again." };
  }
}
