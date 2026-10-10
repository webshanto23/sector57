// Idempotent seed: the Sector 57 society, its location levels, the permission
// catalogue, the starter roles and the public website pages (plus demo notices,
// committee, developments and gallery outside production). Safe to run
// repeatedly; it never deletes rows.
// Users are not seeded here: the first super admin is created separately so no
// password ever lives in source control.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { DEMO_ALBUMS, DEMO_COMMITTEE, DEMO_DEVELOPMENTS_PAGE, demoNotices, SITE_PAGES } from "./seed-site.ts";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const nfc = (text: string) => text.normalize("NFC");

/** NFC for every string inside seeded JSON and rows. */
function nfcDeep<T>(value: T): T {
  if (typeof value === "string") return nfc(value) as T;
  if (Array.isArray(value)) return value.map(nfcDeep) as T;
  if (value instanceof Date || value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, nfcDeep(v)])) as T;
}

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
// Keep both lists equal to PERMISSION_ACTIONS / PERMISSION_MODULES in @s57/shared
// (the API's permissions e2e test fails when they drift apart).
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

  // Starting content only: never overwrite what the committee has edited since.
  for (const page of SITE_PAGES) {
    await prisma.site_pages.upsert({
      where: { society_id_slug: { society_id: society.id, slug: page.slug } },
      update: {},
      create: { ...nfcDeep(page), society_id: society.id, is_published: true },
    });
  }

  console.log(`Seeded society "${society.slug}" with ${permissions.length} permissions, ${ROLES.length} roles and ${SITE_PAGES.length} site pages.`);

  // Demo content never reaches a production database. Everything is matched by a
  // natural key (title, name, slug), so reruns add nothing.
  if (process.env["NODE_ENV"] !== "production") {
    console.log(`Demo content: ${JSON.stringify(await seedDemo(society.id))} new rows.`);
  }
}

async function seedDemo(societyId: string) {
  const added = { notices: 0, committee: 0, albums: 0 };

  for (const notice of demoNotices().map(nfcDeep)) {
    const exists = await prisma.notices.findFirst({
      where: { society_id: societyId, title_bn: notice.title_bn },
      select: { id: true },
    });
    if (!exists) {
      await prisma.notices.create({ data: { ...notice, society_id: societyId } });
      added.notices++;
    }
  }

  const page = nfcDeep(DEMO_DEVELOPMENTS_PAGE);
  await prisma.site_pages.upsert({
    where: { society_id_slug: { society_id: societyId, slug: page.slug } },
    update: {},
    create: { ...page, society_id: societyId, is_published: true },
  });

  for (const [index, member] of DEMO_COMMITTEE.members.map(nfcDeep).entries()) {
    const person =
      (await prisma.persons.findFirst({ where: { society_id: societyId, full_name: member.full_name } })) ??
      (await prisma.persons.create({
        data: { society_id: societyId, full_name: member.full_name, full_name_en: member.full_name_en },
      }));
    const seat = await prisma.committee_members.findFirst({
      where: { society_id: societyId, person_id: person.id, position: member.position },
      select: { id: true },
    });
    if (!seat) {
      await prisma.committee_members.create({
        data: {
          society_id: societyId,
          person_id: person.id,
          position: member.position,
          sort_order: index,
          term_start: DEMO_COMMITTEE.term_start,
          term_end: DEMO_COMMITTEE.term_end,
        },
      });
      added.committee++;
    }
  }

  for (const { photos, ...album } of DEMO_ALBUMS.map(nfcDeep)) {
    const exists = await prisma.gallery_albums.findFirst({
      where: { society_id: societyId, title_bn: album.title_bn },
      select: { id: true },
    });
    if (!exists) {
      await prisma.gallery_albums.create({
        data: { ...album, society_id: societyId, gallery_photos: { create: photos } },
      });
      added.albums++;
    }
  }

  return added;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
