"use client";

import { Loader2 } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form-controls";
import { type LoginState, signIn } from "./actions";

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, { error: initialError });
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.email} />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required minLength={8} />
      </Field>
      {state.error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        Sign in
      </Button>
    </form>
  );
}
