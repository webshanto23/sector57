/** A unique constraint failed (Prisma `P2002`). */
export function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'P2002';
}

/** A foreign key refused the change (Prisma `P2003`): other rows still point at this one. */
export function isForeignKeyViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'P2003';
}
