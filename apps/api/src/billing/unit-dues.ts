import type { Prisma } from '@s57/db';

/** What is still owed on a unit's bills, whoever they are billed to. */
export async function unitDues(client: Prisma.TransactionClient, societyId: string, unitId: string): Promise<{ owed: string; bills: number }> {
  const [row] = await client.$queryRaw<{ owed: string; bills: number }[]>`
    SELECT coalesce(sum(total - paid), 0)::numeric(16,2)::text AS owed, count(*)::int AS bills
    FROM invoices WHERE society_id = ${societyId}::uuid AND unit_id = ${unitId}::uuid AND status IN ('unpaid', 'partial')`;
  return row!;
}

/** `unitDues` for several units at once: owed and bill count by unit (units with nothing owed are left out). */
export async function unitsDues(
  client: Prisma.TransactionClient,
  societyId: string,
  unitIds: string[],
): Promise<Map<string, { owed: Prisma.Decimal; bills: number }>> {
  if (unitIds.length === 0) return new Map();
  const rows = await client.invoices.groupBy({
    by: ['unit_id'],
    where: { society_id: societyId, unit_id: { in: unitIds }, status: { in: ['unpaid', 'partial'] } },
    _sum: { total: true, paid: true },
    _count: { _all: true },
  });
  return new Map(
    rows.map((row) => [row.unit_id!, { owed: row._sum.total!.minus(row._sum.paid!), bills: row._count._all }]),
  );
}
