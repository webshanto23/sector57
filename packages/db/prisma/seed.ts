// Idempotent seed: the Sector 57 society, its location levels, the permission
// catalogue and the starter roles. Safe to run repeatedly; it never deletes rows.
// Users are not seeded here: the first super admin is created separately so no
// password ever lives in source control.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const nfc = (text: string) => text.normalize("NFC");

const SOCIETY = {
  slug: "sector57",
  name_bn: nfc("উত্তরা সেক্টর ৫৭ কল্যাণ সমিতি"),
  name_en: "Uttara Sector 57 Welfare Society",
};

const LEVELS: { depth: number; name_bn: string; name_en: string; is_unit_level?: boolean }[] = [
  { depth: 1, name_bn: "সেক্টর", name_en: "Sector" },
  { depth: 2, name_bn: "ব্লক", name_en: "Block" },
  { depth: 3, name_bn: "রোড", name_en: "Road" },
  { depth: 4, name_bn: "প্লট", name_en: "Plot" },
  { depth: 5, name_bn: "ভবন", name_en: "Building" },
  { depth: 6, name_bn: "তলা", name_en: "Storey" },
  { depth: 7, name_bn: "ইউনিট", name_en: "Unit", is_unit_level: true },
];

// Same for every society. Actions must match the check constraint on permissions.action.
const ACTIONS = ["view", "create", "edit", "approve", "delete", "export"] as const;
const MODULES = [
  "settings",
  "users",
  "roles",
  "locations",
  "units",
  "members",
  "ownerships",
  "tenancies",
  "committee",
  "notices",
  "documents",
  "forms",
  "site",
  "gallery",
  "billing",
  "payments",
  "donations",
  "expenses",
  "budgets",
  "ledger",
  "audit",
] as const;

type Grant = "all" | { module: (typeof MODULES)[number]; actions: (typeof ACTIONS)[number][] }[];

// Starting points only: the super admin and president edit these from the dashboard.
const ROLES: { name: string; description: string; is_system: boolean; grants: Grant }[] = [
  { name: nfc("সুপার অ্যাডমিন"), description: "Full access; protected system role", is_system: true, grants: "all" },
  { name: nfc("সভাপতি"), description: "President", is_system: false, grants: "all" },
  {
    name: nfc("সদস্য"),
    description: "Resident member",
    is_system: false,
    grants: [
      { module: "notices", actions: ["view"] },
      { module: "documents", actions: ["view"] },
      { module: "gallery", actions: ["view"] },
      { module: "forms", actions: ["create"] },
    ],
  },
];

const SETTINGS: Record<string, unknown> = {
  share_renters_with_thana: false,
  separate_facility_funds: false,
};

async function main() {
  const society = await prisma.societies.upsert({
    where: { slug: SOCIETY.slug },
    update: {},
    create: SOCIETY,
  });

  for (const level of LEVELS) {
    await prisma.location_levels.upsert({
      where: { society_id_depth: { society_id: society.id, depth: level.depth } },
      update: {},
      create: { ...level, name_bn: nfc(level.name_bn), society_id: society.id },
    });
  }

  for (const [key, value] of Object.entries(SETTINGS)) {
    await prisma.society_settings.upsert({
      where: { society_id_key: { society_id: society.id, key } },
      update: {},
      create: { society_id: society.id, key, value: value as never },
    });
  }

  await prisma.permissions.createMany({
    data: MODULES.flatMap((module) => ACTIONS.map((action) => ({ module, action }))),
    skipDuplicates: true,
  });
  const permissions = await prisma.permissions.findMany();
  const permissionId = new Map(permissions.map((p) => [`${p.module}:${p.action}`, p.id]));

  for (const role of ROLES) {
    const row = await prisma.roles.upsert({
      where: { society_id_name: { society_id: society.id, name: role.name } },
      update: {},
      create: {
        society_id: society.id,
        name: role.name,
        description: role.description,
        is_system: role.is_system,
      },
    });

    const ids =
      role.grants === "all"
        ? permissions.map((p) => p.id)
        : role.grants.flatMap((g) => g.actions.map((a) => permissionId.get(`${g.module}:${a}`)!));

    await prisma.role_permissions.createMany({
      data: ids.map((permission_id) => ({ role_id: row.id, permission_id })),
      skipDuplicates: true,
    });
  }

  console.log(`Seeded society "${society.slug}" with ${permissions.length} permissions and ${ROLES.length} roles.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
