"use client";

import { useCallback, useState } from "react";
import type { z } from "zod";
import { fieldErrors } from "@/lib/validation";

/**
 * Client-side validation with the same zod schema the server uses.
 * `check(payload)` returns true when valid, otherwise fills `err(path)`.
 */
export function useFormErrors<S extends z.ZodType>(schema: S) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const check = useCallback(
    (payload: unknown) => {
      const r = schema.safeParse(payload);
      if (r.success) {
        setErrors({});
        return true;
      }
      setErrors(fieldErrors(r.error));
      return false;
    },
    [schema],
  );
  const err = useCallback((path: string) => errors[path], [errors]);
  const first = Object.values(errors)[0];
  return { errors, setErrors, check, err, first };
}
