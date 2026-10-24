-- Sector 57 Community Management System
-- Initial PostgreSQL schema, phase 1 (draft for review)
--
-- Design rules
--   * Every business table carries society_id, so many societies can share one database (product-ready).
--   * The property hierarchy is configurable per society: location_levels defines the levels,
--     locations is one self-referencing tree (sector > block > road > plot > building > storey > unit).
--   * Units (flats, shops, offices) are leaf locations with an extra row in units.
--   * Ownership can sit on any location (plot, building or unit) and keeps history (start/end dates).
--   * Roles and permissions are data, not code; a user's role can be limited to one branch of the tree.
--   * Money is numeric(14,2) in BDT; nothing financial is ever hard-deleted.
--   * Bangla first: display text is stored as *_bn (required) + *_en (optional, falls back to Bangla).
--     Names of people, places and vendors are stored as typed. All text is saved in Unicode NFC form.

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists citext;     -- case-insensitive email
create extension if not exists pg_trgm;    -- fuzzy search on Bangla and English names

-- ============================================================
-- 1. Tenancy (societies) and settings
-- ============================================================

create table societies (
  id            uuid primary key default gen_random_uuid(),
  name_bn       text not null,                 -- 'উত্তরা সেক্টর ৫৭ কল্যাণ সমিতি'
  name_en       text,                          -- 'Uttara Sector 57 Welfare Society'
  slug          text not null unique,          -- used for the public website URL
  logo_url      text,
  address       text,
  phone         text,
  fiscal_year_start_month smallint not null default 7 check (fiscal_year_start_month between 1 and 12),
  status        text not null default 'active' check (status in ('active','suspended')),
  created_at    timestamptz not null default now()
);

-- President-controlled switches (thana sharing, separate funds, owner approval for renters, modules on/off ...)
create table society_settings (
  society_id    uuid not null references societies(id) on delete cascade,
  key           text not null,                 -- 'share_renters_with_thana', 'module.hrm.enabled'
  value         jsonb not null,
  updated_by    uuid,
  updated_at    timestamptz not null default now(),
  primary key (society_id, key)
);

-- ============================================================
-- 2. Property hierarchy
-- ============================================================

-- Levels each society uses, in order: 1 Sector, 2 Block, 3 Road, 4 Plot, 5 Building, 6 Storey, 7 Unit
create table location_levels (
  id            uuid primary key default gen_random_uuid(),
  society_id    uuid not null references societies(id) on delete cascade,
  depth         smallint not null check (depth >= 1),
  name_bn       text not null,                 -- 'ব্লক'
  name_en       text,                          -- 'Block'
  is_unit_level boolean not null default false,  -- true for the level that holds flats/shops
  unique (society_id, depth),
  unique (society_id, name_bn)
);

create table locations (
  id            uuid primary key default gen_random_uuid(),
  society_id    uuid not null references societies(id) on delete cascade,
  parent_id     uuid references locations(id) on delete restrict,
  level_id      uuid not null references location_levels(id),
  name          text not null,                 -- 'Block C', 'Road 9', 'Plot 14', 'Flat 4B'
  code          text,                          -- holding number e.g. '57-C-09-14'
  path          text not null,                 -- materialised path of ids, for fast subtree queries
  attributes    jsonb not null default '{}',   -- land area, storeys, year built ...
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (society_id, parent_id, name)
);
create index locations_parent_idx on locations(parent_id);
create index locations_path_idx   on locations(society_id, path text_pattern_ops);

-- Extra facts for leaf locations that are billable units
create table units (
  location_id   uuid primary key references locations(id) on delete cascade,
  society_id    uuid not null references societies(id) on delete cascade,
  unit_type     text not null check (unit_type in ('residential','shop','office','warehouse','other')),
  size_sqft     numeric(10,2),
  bill_to       text not null default 'owner' check (bill_to in ('owner','renter')),  -- the per-unit checkbox
  occupancy     text not null default 'vacant'
                check (occupancy in ('owner_occupied','rented','vacant'))
);

-- ============================================================
-- 3. People, users, roles and permissions
-- ============================================================

-- Everyone is stored once: owners, renters, family members, staff, donors, vendors' contacts
create table persons (
  id            uuid primary key default gen_random_uuid(),
  society_id    uuid not null references societies(id) on delete cascade,
  full_name     text not null,                 -- as typed, usually Bangla
  full_name_en  text,                          -- optional, for English documents
  phone         text,
  email         citext,
  nid           text,
  date_of_birth date,
  gender        text check (gender in ('male','female','other')),
  photo_url     text,
  verified_at   timestamptz,
  created_at    timestamptz not null default now()
);
create unique index persons_phone_uq on persons(society_id, phone) where phone is not null;
create unique index persons_nid_uq   on persons(society_id, nid)   where nid   is not null;
-- fuzzy name search that works for Bangla and English spellings
create index persons_name_trgm on persons using gin (full_name gin_trgm_ops);

-- Organisations that own or rent units (companies, NGOs, shops)
create table organisations (
  id            uuid primary key default gen_random_uuid(),
  society_id    uuid not null references societies(id) on delete cascade,
  name          text not null,
  trade_licence text,
  contact_person_id uuid references persons(id),
  created_at    timestamptz not null default now()
);

-- Login accounts. A user is usually linked to a person.
create table users (
  id            uuid primary key default gen_random_uuid(),
  society_id    uuid not null references societies(id) on delete cascade,
  person_id     uuid references persons(id),
  phone         text not null,
  email         citext,
  password_hash text,
  language      text not null default 'bn' check (language in ('bn','en')),
  status        text not null default 'invited' check (status in ('invited','active','disabled')),
  last_login_at timestamptz,
  created_at    timestamptz not null default now(),
  unique (society_id, phone)
);

-- Catalogue of everything that can be permitted: module x action. Seeded, same for all societies.
create table permissions (
  id            uuid primary key default gen_random_uuid(),
  module        text not null,                 -- 'members', 'billing', 'roles' ...
  action        text not null check (action in ('view','create','edit','approve','delete','export')),
  unique (module, action)
);

-- Roles are created by the super admin or president from the dashboard
create table roles (
  id            uuid primary key default gen_random_uuid(),
  society_id    uuid not null references societies(id) on delete cascade,
  name          text not null,
  description   text,
  is_system     boolean not null default false,  -- only 'Super admin' is protected
  created_at    timestamptz not null default now(),
  unique (society_id, name)
);

create table role_permissions (
  role_id       uuid not null references roles(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

-- A user can hold several roles; each assignment can be limited to one branch of the tree
create table user_roles (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  role_id       uuid not null references roles(id) on delete cascade,
  scope_location_id uuid references locations(id),  -- null = whole society; else that block/road/building
  granted_by    uuid references users(id),
  granted_at    timestamptz not null default now(),
  unique nulls not distinct (user_id, role_id, scope_location_id)
);

-- ============================================================
-- 4. Ownership, tenancy and occupants
-- ============================================================

-- Owner of a plot, building or unit; co-owners get one row each with their share
create table ownerships (
  id            uuid primary key default gen_random_uuid(),
  society_id    uuid not null references societies(id) on delete cascade,
  location_id   uuid not null references locations(id),
  person_id     uuid references persons(id),
  organisation_id uuid references organisations(id),
  share_percent numeric(5,2) not null default 100 check (share_percent > 0 and share_percent <= 100),
  start_date    date not null,
  end_date      date,                          -- set on transfer; history is kept
  document_id   uuid,                          -- deed, see documents
  check ((person_id is null) <> (organisation_id is null)),
  check (end_date is null or end_date >= start_date)
);
create index ownerships_location_idx on ownerships(location_id) where end_date is null;
create index ownerships_person_idx   on ownerships(person_id)   where end_date is null;

-- One tenancy = one renting household, mess or company in one unit for a period
create table tenancies (
  id            uuid primary key default gen_random_uuid(),
  society_id    uuid not null references societies(id) on delete cascade,
  unit_id       uuid not null references units(location_id),
  renter_type   text not null check (renter_type in ('family','bachelor','office','warehouse','shop','other')),
  primary_person_id uuid references persons(id),
  organisation_id   uuid references organisations(id),
  start_date    date not null,
  end_date      date,
  monthly_rent  numeric(14,2),                 -- optional, for the police tenant form
  police_form_submitted boolean not null default false,
  owner_approved_at timestamptz,
  status        text not null default 'pending'
                check (status in ('pending','active','moving_out','ended')),
  created_at    timestamptz not null default now()
);
create index tenancies_unit_idx on tenancies(unit_id) where status in ('pending','active','moving_out');

-- Who lives or works in a unit: owner's family, renters, domestic help
create table occupants (
  id            uuid primary key default gen_random_uuid(),
  society_id    uuid not null references societies(id) on delete cascade,
  unit_id       uuid not null references units(location_id),
  person_id     uuid not null references persons(id),
  tenancy_id    uuid references tenancies(id),  -- null when it is the owner's household
  relation      text not null,                  -- 'head','spouse','child','parent','co-renter','domestic help','driver'
  start_date    date not null,
  end_date      date
);
create index occupants_unit_idx on occupants(unit_id) where end_date is null;

-- Move-in / move-out checklist steps
create table move_events (
  id            uuid primary key default gen_random_uuid(),
  society_id    uuid not null references societies(id) on delete cascade,
  tenancy_id    uuid not null references tenancies(id),
  kind          text not null check (kind in ('move_in','move_out')),
  planned_date  date,
  dues_cleared  boolean not null default false,
  checklist     jsonb not null default '{}',   -- {"nid":true,"agreement":true,"police_form":false}
  completed_at  timestamptz,
  created_by    uuid references users(id)
);

-- Managing committee, shown on the public website
create table committee_members (
  id            uuid primary key default gen_random_uuid(),
  society_id    uuid not null references societies(id) on delete cascade,
  person_id     uuid not null references persons(id),
  position      text not null,                 -- 'President', 'Treasurer'
  sort_order    smallint not null default 0,
  term_start    date not null,
  term_end      date
);

-- ============================================================
-- 5. Finance
-- ============================================================

-- Main society fund plus optional separate funds (mosque, gym) when the president turns that on
create table funds (
  id            uuid primary key default gen_random_uuid(),
  society_id    uuid not null references societies(id) on delete cascade,
  name_bn       text not null,
  name_en       text,
  location_id   uuid references locations(id),  -- facility the fund belongs to, if any
  is_default    boolean not null default false,
  unique (society_id, name_bn)
);

-- What can be charged: service charge, generator fee, membership fee, donation ...
create table charge_types (
  id            uuid primary key default gen_random_uuid(),
  society_id    uuid not null references societies(id) on delete cascade,
  name_bn       text not null,
  name_en       text,
  kind          text not null check (kind in ('due','fee','fine','donation')),
  fund_id       uuid not null references funds(id),
  default_amount numeric(14,2),
  unique (society_id, name_bn)
);

-- Recurring or one-off schedules: monthly, 3, 6, 12 months; generated automatically or manually
create table charge_schedules (
  id            uuid primary key default gen_random_uuid(),
  society_id    uuid not null references societies(id) on delete cascade,
  charge_type_id uuid not null references charge_types(id),
  amount        numeric(14,2) not null check (amount >= 0),
  frequency_months smallint check (frequency_months in (1,3,6,12)),  -- null = one-off
  generation    text not null default 'auto' check (generation in ('auto','manual')),
  scope_location_id uuid references locations(id),  -- null = whole society; else a block/road/building
  unit_types    text[],                        -- e.g. {residential} or {shop,office}; null = all
  starts_on     date not null,
  ends_on       date,
  next_run_on   date,
  status        text not null default 'active' check (status in ('active','paused','ended')),
  created_by    uuid references users(id),
  created_at    timestamptz not null default now()
);

create table invoices (
  id            uuid primary key default gen_random_uuid(),
  society_id    uuid not null references societies(id) on delete cascade,
  invoice_no    text not null,                 -- 'INV-2611-0412'
  unit_id       uuid references units(location_id),  -- null for e.g. a donor invoice
  bill_to_person_id uuid references persons(id),
  bill_to_organisation_id uuid references organisations(id),
  period_start  date,
  period_end    date,
  issue_date    date not null default current_date,
  due_date      date not null,
  total         numeric(14,2) not null default 0,
  paid          numeric(14,2) not null default 0,
  status        text not null default 'unpaid'
                check (status in ('draft','unpaid','partial','paid','void')),
  created_by    uuid references users(id),       -- null when generated by a schedule
  created_at    timestamptz not null default now(),
  unique (society_id, invoice_no),
  check (paid <= total)
);
create index invoices_unit_idx   on invoices(unit_id, status);
create index invoices_status_idx on invoices(society_id, status, due_date);

create table invoice_lines (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references invoices(id) on delete cascade,
  charge_type_id uuid not null references charge_types(id),
  schedule_id   uuid references charge_schedules(id),
  unit_id       uuid references units(location_id),  -- copied from the invoice for the guard below
  period_start  date,                          -- billing period this line covers
  description   text not null,
  amount        numeric(14,2) not null check (amount >= 0)
);
-- A schedule never bills the same unit twice for the same period, even if the job runs twice
create unique index invoice_lines_once_uq on invoice_lines(schedule_id, unit_id, period_start) where schedule_id is not null;

-- Cash received at the office; one payment can settle several invoices
create table payments (
  id            uuid primary key default gen_random_uuid(),
  society_id    uuid not null references societies(id) on delete cascade,
  receipt_no    text not null,                 -- 'RC-08812'
  payer_person_id uuid references persons(id),
  payer_organisation_id uuid references organisations(id),
  amount        numeric(14,2) not null check (amount > 0),
  method        text not null default 'cash' check (method in ('cash','bank','mobile')),
  received_by   uuid not null references users(id),
  received_at   timestamptz not null default now(),
  handed_over_at timestamptz,                  -- when the collector hands cash to the treasurer
  void_reason   text,
  unique (society_id, receipt_no)
);

create table payment_allocations (
  payment_id    uuid not null references payments(id),
  invoice_id    uuid not null references invoices(id),
  amount        numeric(14,2) not null check (amount > 0),
  primary key (payment_id, invoice_id)
);

create table donations (
  id            uuid primary key default gen_random_uuid(),
  society_id    uuid not null references societies(id) on delete cascade,
  donor_person_id uuid references persons(id),          -- null = anonymous
  donor_organisation_id uuid references organisations(id),
  fund_id       uuid not null references funds(id),
  purpose       text,
  amount        numeric(14,2) not null check (amount > 0),
  payment_id    uuid references payments(id),
  received_at   timestamptz not null default now()
);

create table expense_heads (
  id            uuid primary key default gen_random_uuid(),
  society_id    uuid not null references societies(id) on delete cascade,
  name_bn       text not null,                 -- 'কর্মচারী বেতন', 'মেরামত'
  name_en       text,                          -- 'Staff salaries', 'Repairs'
  unique (society_id, name_bn)
);

create table vendors (
  id            uuid primary key default gen_random_uuid(),
  society_id    uuid not null references societies(id) on delete cascade,
  name          text not null,
  phone         text,
  service       text
);

create table expenses (
  id            uuid primary key default gen_random_uuid(),
  society_id    uuid not null references societies(id) on delete cascade,
  expense_head_id uuid not null references expense_heads(id),
  fund_id       uuid not null references funds(id),
  vendor_id     uuid references vendors(id),
  description   text not null,
  amount        numeric(14,2) not null check (amount > 0),
  spent_on      date not null,
  status        text not null default 'pending' check (status in ('pending','approved','rejected','paid')),
  requested_by  uuid references users(id),
  approved_by   uuid references users(id),
  approved_at   timestamptz
);

create table budgets (
  id            uuid primary key default gen_random_uuid(),
  society_id    uuid not null references societies(id) on delete cascade,
  fiscal_year   text not null,                 -- '2026-27'
  expense_head_id uuid not null references expense_heads(id),
  amount        numeric(14,2) not null check (amount >= 0),
  unique (society_id, fiscal_year, expense_head_id)
);

-- Double-entry style money movements per fund, written by the app for every payment, donation and expense
create table ledger_entries (
  id            bigint generated always as identity primary key,
  society_id    uuid not null references societies(id) on delete cascade,
  fund_id       uuid not null references funds(id),
  entry_date    date not null,
  direction     text not null check (direction in ('in','out')),
  amount        numeric(14,2) not null check (amount > 0),
  source_type   text not null check (source_type in ('payment','donation','expense','transfer','adjustment')),
  source_id     uuid not null,
  memo          text,
  created_at    timestamptz not null default now()
);
create index ledger_fund_date_idx on ledger_entries(fund_id, entry_date);

-- ============================================================
-- 6. Communication, documents, website, audit
-- ============================================================

create table notices (
  id            uuid primary key default gen_random_uuid(),
  society_id    uuid not null references societies(id) on delete cascade,
  title_bn      text not null,
  title_en      text,
  body_bn       text not null,
  body_en       text,
  category      text,                          -- 'Billing', 'Maintenance', 'AGM'
  audience_location_id uuid references locations(id),  -- null = everyone
  send_sms      boolean not null default false,
  is_public     boolean not null default false,  -- shown on the public website
  publish_at    timestamptz not null default now(),
  created_by    uuid references users(id)
);

-- Any file attached to any record (deed, NID, agreement, minutes, receipt photo)
create table documents (
  id            uuid primary key default gen_random_uuid(),
  society_id    uuid not null references societies(id) on delete cascade,
  entity_type   text not null,                 -- 'location','person','tenancy','expense','notice' ...
  entity_id     uuid not null,
  doc_type      text not null,                 -- 'deed','nid','tenancy_agreement','minutes','trade_licence'
  file_url      text not null,                 -- DigitalOcean Spaces key
  file_name     text not null,
  visibility    text not null default 'office' check (visibility in ('office','committee','owner','members','public')),
  uploaded_by   uuid references users(id),
  uploaded_at   timestamptz not null default now()
);
create index documents_entity_idx on documents(entity_type, entity_id);

-- Requests from the public website forms (membership, renter registration, sticker, NOC ...)
create table form_submissions (
  id            uuid primary key default gen_random_uuid(),
  society_id    uuid not null references societies(id) on delete cascade,
  form_key      text not null,                 -- 'membership','renter_registration'
  data          jsonb not null,
  status        text not null default 'new' check (status in ('new','in_review','approved','rejected')),
  reviewed_by   uuid references users(id),
  submitted_at  timestamptz not null default now()
);

-- Editable public website pages and gallery
create table site_pages (
  id            uuid primary key default gen_random_uuid(),
  society_id    uuid not null references societies(id) on delete cascade,
  slug          text not null,                 -- 'home','developments','contact'
  title_bn      text not null,
  title_en      text,
  content       jsonb not null default '{}',   -- {"bn": {...}, "en": {...}}
  is_published  boolean not null default false,
  updated_at    timestamptz not null default now(),
  unique (society_id, slug)
);

create table gallery_albums (
  id            uuid primary key default gen_random_uuid(),
  society_id    uuid not null references societies(id) on delete cascade,
  title_bn      text not null,
  title_en      text,
  event_date    date,
  is_published  boolean not null default false
);

create table gallery_photos (
  id            uuid primary key default gen_random_uuid(),
  album_id      uuid not null references gallery_albums(id) on delete cascade,
  file_url      text not null,
  caption_bn    text,
  caption_en    text,
  sort_order    int not null default 0
);

-- Every change, who made it and when
create table audit_logs (
  id            bigint generated always as identity primary key,
  society_id    uuid not null references societies(id) on delete cascade,
  user_id       uuid references users(id),
  action        text not null,                 -- 'create','update','delete','approve','login'
  entity_type   text not null,
  entity_id     uuid,
  before_data   jsonb,
  after_data    jsonb,
  ip_address    inet,
  created_at    timestamptz not null default now()
);
create index audit_entity_idx on audit_logs(entity_type, entity_id);
create index audit_time_idx   on audit_logs(society_id, created_at desc);

-- Late foreign key (documents is defined after ownerships)
alter table ownerships add constraint ownerships_document_fk foreign key (document_id) references documents(id);

-- ============================================================
-- Phase 2 tables (not created yet): staff, attendance, payroll, facilities, assets,
-- work_orders, tickets, vehicles, stickers, parking_slots, events, event_rsvps,
-- votes, ballots, certificates, board_posts, sms_messages, notifications
-- ============================================================
