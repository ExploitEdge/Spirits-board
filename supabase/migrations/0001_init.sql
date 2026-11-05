-- ============================================================
-- Spirits-board: initial schema (Phase 1–2)
-- Run this once in the Supabase SQL editor of your new project.
-- Supabase / Postgres
-- ============================================================

create extension if not exists pg_trgm;   -- fuzzy text matching ("Jamesn" ≈ "Jameson")

-- ------------------------------------------------------------
-- Companies (minimal now; verification fields used from Phase 3)
-- ------------------------------------------------------------
create table companies (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  country        char(2),                 -- ISO code: NL, DE, SG...
  vat_number     text,
  excise_number  text,
  verified       boolean not null default false,
  -- Your standing knowledge of this distributor. Every list uploaded for
  -- this company inherits these unless the list itself says otherwise.
  default_incoterm         text,
  default_customs_status   text,
  default_warehouse_city   text,
  default_warehouse_country char(2),
  default_lead_time_text   text,
  default_lead_time_days   int,
  default_currency         char(3),
  notes                    text,
  created_at     timestamptz not null default now(),
  unique (name)
);

-- ------------------------------------------------------------
-- Uploads: one row per file or pasted text
-- Header-level info ("all prices EXW Rotterdam, T1, valid 7 days")
-- is stored here and applied to every line that doesn't override it.
-- ------------------------------------------------------------
create table uploads (
  id                      uuid primary key default gen_random_uuid(),
  company_id              uuid references companies(id),
  side                    text not null check (side in ('offer','request')),
  source_type             text not null check (source_type in ('xlsx','csv','pdf','image','text','email')),
  original_filename       text,
  storage_path            text,           -- original file in Supabase Storage
  raw_text                text,           -- what we sent to the AI (numbered lines)
  status                  text not null default 'processing'
                          check (status in ('processing','review','saved','failed')),
  error                   text,
  model                   text,           -- which Claude model did the extraction
  -- list-wide defaults found in the header / email body
  default_currency        char(3),
  default_incoterm        text,
  default_customs_status  text,
  default_warehouse       text,
  valid_until             date,
  -- How the table's columns were read (AI decides once, code applies to
  -- every row). Re-used for the next list from the same company.
  column_mapping          jsonb,
  row_count               int,
  created_by              uuid references auth.users(id),
  created_at              timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Canonical product catalogue (Phase 2)
-- "Jameson 70cl 40% GBX" and "Jameson Irish Whiskey 0.7L giftbox"
-- both point to the same product row. Size/packaging live on the lot,
-- not the product, so one product covers 70cl, 100cl, GBX, NGBX, etc.
-- ------------------------------------------------------------
create table products (
  id             uuid primary key default gen_random_uuid(),
  brand          text not null,
  name           text not null,           -- e.g. "Irish Whiskey"
  category       text not null check (category in
                   ('whisky','vodka','rum','gin','cognac','brandy','tequila',
                    'mezcal','liqueur','champagne','wine','other')),
  age_statement  text,                    -- "12YO", "NAS"
  edition        text,                    -- "Black Barrel", "Caskmates"
  display_name   text not null,           -- "Jameson Irish Whiskey"
  created_at     timestamptz not null default now(),
  unique (brand, name, age_statement, edition)
);
create index products_display_trgm on products using gin (display_name gin_trgm_ops);

-- Every way a product has been written in the wild. Grows over time,
-- so the AI fallback is needed less and less.
create table product_aliases (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id) on delete cascade,
  alias       text not null unique,       -- stored lowercased
  source      text not null check (source in ('manual','fuzzy','ai')),
  created_at  timestamptz not null default now()
);
create index product_aliases_trgm on product_aliases using gin (alias gin_trgm_ops);

-- ------------------------------------------------------------
-- Lots: one extracted line. Offers AND requests share this table
-- (side column), which makes matching in Phase 4 a simple self-join.
-- ------------------------------------------------------------
create table lots (
  id                    uuid primary key default gen_random_uuid(),
  side                  text not null check (side in ('offer','request')),
  upload_id             uuid references uploads(id) on delete cascade,
  company_id            uuid references companies(id),
  product_id            uuid references products(id),   -- filled in Phase 2
  line_no               int,
  raw_line              text not null,                  -- the original line, always kept

  -- product as written on the list
  brand                 text,
  product_name          text,
  category              text,
  age_statement         text,
  edition               text,

  -- specs
  bottle_size_cl        numeric(6,1),     -- normalised: 0.7L -> 70, 1L -> 100
  abv                   numeric(4,1),
  bottles_per_case      int,
  cases_per_pallet      int,
  packaging             text check (packaging in ('GBX','NGBX','TIN','OTHER')),
  is_coded              boolean,          -- null = not stated
  is_refillable         boolean,
  market_spec           text,             -- EU, UK, US, TR, ASIA...

  -- trade terms
  -- B2B only: all goods are duty-suspended, so only T1/T2 is tracked
  customs_status        text check (customs_status in ('T1','T2')),
  warehouse_city        text,
  warehouse_country     char(2),
  -- "Ex-works", "ex works", "EXW" -> EXW; "C&F", "CFR", "CNF" -> CNF
  incoterm              text check (incoterm in ('EXW','FCA','FAS','FOB','CNF','CIF','CPT','CIP','DAP','DPU','DDP')),

  -- price as written + normalised for comparison
  price                 numeric(12,2),
  price_unit            text check (price_unit in ('bottle','case')),
  currency              char(3),
  price_per_bottle_eur  numeric(12,4),    -- computed by code at save time
  price_per_case_eur    numeric(12,2),

  -- quantity (for requests: desired quantity)
  quantity              numeric(12,2),
  quantity_unit         text check (quantity_unit in ('bottles','cases','pallets','ftl')),
  moq                   numeric(12,2),
  moq_unit              text check (moq_unit in ('bottles','cases','pallets','ftl')),

  -- availability (for requests: max acceptable lead time)
  lead_time_text        text,             -- "prompt", "2-3 wks"
  lead_time_days        int,              -- 0 = ex-stock / prompt
  valid_until           date,
  remarks               text,

  -- request-only
  target_price_min      numeric(12,2),
  target_price_max      numeric(12,2),
  target_price_hidden   boolean not null default false,

  -- extraction metadata
  confidence            numeric(3,2),     -- 0.00–1.00, overall for the line
  field_confidence      jsonb,            -- {"price":0.95,"incoterm":0.4,...}
  status                text not null default 'draft'
                        check (status in ('draft','live','expired','withdrawn')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
-- When a new list is saved for a company, its previous live offers are
-- set to 'expired' and point to the upload that replaced them. Old prices
-- stay in the table, which later gives you price history.
alter table lots add column replaced_by_upload uuid references uploads(id);

create index lots_board_idx   on lots (side, status, product_id);
create index lots_company_idx on lots (company_id, side, status);
create index lots_valid_idx   on lots (valid_until);
create index lots_brand_trgm  on lots using gin ((coalesce(brand,'') || ' ' || coalesce(product_name,'')) gin_trgm_ops);

-- ------------------------------------------------------------
-- Exchange rates for one-currency comparison (Phase 2)
-- Refreshed daily from a free ECB feed.
-- ------------------------------------------------------------
create table fx_rates (
  currency     char(3) primary key,
  rate_to_eur  numeric(12,6) not null,
  updated_at   timestamptz not null default now()
);

-- Row Level Security is switched on for every table from day one.
-- There are deliberately NO policies yet: the browser can read nothing,
-- and only the server (using the secret service-role key) can read/write.
-- Per-company rules come in Phase 3.
alter table companies       enable row level security;
alter table uploads         enable row level security;
alter table products        enable row level security;
alter table product_aliases enable row level security;
alter table lots            enable row level security;
alter table fx_rates        enable row level security;

-- Private storage bucket for the original uploaded files
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', false)
on conflict (id) do nothing;
