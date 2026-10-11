import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import type { z } from "zod";

/**
 * Puts zod issues (from a shared schema in the browser, or a 400 `validation_failed`
 * body from the API) on the matching form fields. `rename` maps a payload path to the
 * form field that holds it. Returns false when there were no issues.
 */
export function setIssues<T extends FieldValues>(
  setError: UseFormSetError<T>,
  issues: { path: string | PropertyKey[]; message: string }[],
  rename: Record<string, string> = {},
): boolean {
  for (const issue of issues) {
    const path = Array.isArray(issue.path) ? issue.path.map(String).join(".") : String(issue.path);
    setError((rename[path] ?? path) as Path<T>, { type: "validate", message: issue.message });
  }
  return issues.length > 0;
}

/** The issues of a failed `safeParse`, in the shape `setIssues` takes. */
export const zodIssues = (error: z.ZodError) => error.issues.map((issue) => ({ path: issue.path, message: issue.message }));

/** The issues list of a 400 `validation_failed` API body, or []. */
export function apiIssues(error: unknown): { path: string; message: string }[] {
  const issues = (error as { issues?: unknown } | undefined)?.issues;
  return Array.isArray(issues) ? (issues as { path: string; message: string }[]) : [];
}
