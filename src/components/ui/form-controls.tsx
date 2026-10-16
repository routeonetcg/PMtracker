import type * as React from "react";
import { cn } from "@/lib/utils";

const fieldBase =
  "w-full min-w-0 rounded-lg border border-input bg-card px-3 text-base shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm";

export function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return <input type={type} data-slot="input" className={cn(fieldBase, "h-10 py-1", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={cn(fieldBase, "min-h-20 py-2", className)} {...props} />;
}

/** Native select: best experience on iPhone (system picker). */
export function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        fieldBase,
        "h-10 appearance-none bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat pr-8",
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2393a0bb' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label data-slot="label" className={cn("text-sm font-medium leading-none", className)} {...props} />;
}

export function Checkbox({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <input
      type="checkbox"
      className={cn("size-5 shrink-0 cursor-pointer rounded border-input accent-[var(--primary)]", className)}
      {...props}
    />
  );
}

/** Label + control + error message, stacked. */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  className,
  children,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  error?: string;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** Money input with a $ prefix. Value is the dollar string the user types. */
export function MoneyInput({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">$</span>
      <Input inputMode="decimal" autoComplete="off" placeholder="0.00" className={cn("pl-7 num", className)} {...props} />
    </div>
  );
}
