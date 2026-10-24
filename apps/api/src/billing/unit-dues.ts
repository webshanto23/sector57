import type { Prisma } from '@s57/db';

/** What is still owed on a unit's bills, whoever they are billed to. */
export async function unitDues(client: Prisma.TransactionClient, societyId: string, unitId: string): Promise<{ owed: string; bills: number }> {
  const [row] = await client.$queryRaw<{ owed: string; bills: number }[]>`
    SELECT coalesce(sum(total - paid), 0)::numeric(16,2)::text AS owed, count(*)::int AS bills
    FROM invoices WHERE society_id = ${societyId}::uuid AND unit_id = ${unitId}::uuid AND status IN ('unpaid', 'partial')`;
  return row!;
}
