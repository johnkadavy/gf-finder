-- Restaurant data submission flow (PRIORITIES.md item A).
-- Restaurants submit kitchen practices + links through a Tally form reached via
-- a per-restaurant invite link. Nothing reaches a listing or the score until an
-- admin approves it. All new tables are service-role only (RLS on, no policies),
-- same as restaurant_claims / restaurant_feedback.

-- ── Invites ─────────────────────────────────────────────────
-- One row per invite link we send. The token itself is never stored, only its
-- SHA-256 hash. `channel` + `sent_to` record how we reached the restaurant —
-- that's the ownership verification for outbound invites.
create table public.restaurant_invites (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  bigint not null references public.restaurants(id) on delete cascade,
  token_hash     text not null unique,
  channel        text not null check (channel in ('email', 'phone', 'in_person', 'other')),
  sent_to        text,
  price_variant  integer,                -- verified-listing price shown, $/yr
  note           text,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  first_used_at  timestamptz,
  revoked_at     timestamptz
);
create index restaurant_invites_restaurant_id_idx on public.restaurant_invites (restaurant_id);
alter table public.restaurant_invites enable row level security;

-- ── Submissions ─────────────────────────────────────────────
-- Every form response, kept forever: this is the audit log. A newer protocol
-- submission for the same restaurant supersedes older pending ones.
create table public.restaurant_submissions (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   bigint not null references public.restaurants(id) on delete cascade,
  invite_id       uuid references public.restaurant_invites(id) on delete set null,
  form            text not null check (form in ('protocol', 'verified_interest')),
  source          text not null default 'tally',
  external_id     text not null unique,  -- Tally responseId; makes webhook retries idempotent
  schema_version  integer not null,
  answers         jsonb not null,        -- normalized, keyed by our field names
  raw_payload     jsonb not null,        -- untouched webhook body
  status          text not null default 'pending'
                    check (status in ('pending', 'approved', 'rejected', 'superseded')),
  review_note     text,
  reviewed_at     timestamptz,
  reviewed_by     uuid references auth.users(id) on delete set null,
  score_before    smallint,
  score_after     smallint,
  submitted_at    timestamptz not null default now()
);
create index restaurant_submissions_restaurant_id_idx on public.restaurant_submissions (restaurant_id);
create index restaurant_submissions_pending_idx on public.restaurant_submissions (submitted_at)
  where status = 'pending';
alter table public.restaurant_submissions enable row level security;

-- ── Menu sources (Phase 1, minimal) ─────────────────────────
-- Stored artifacts only. No extraction or scoring reads this until Phase 2/4.
create table public.menu_sources (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  bigint not null references public.restaurants(id) on delete cascade,
  submission_id  uuid references public.restaurant_submissions(id) on delete set null,
  source_type    text not null check (source_type in ('web_found', 'restaurant_upload', 'instagram')),
  url            text,
  storage_path   text,
  content_type   text,
  content_hash   text,
  status         text not null default 'received',
  fetched_at     timestamptz,
  created_at     timestamptz not null default now()
);
create index menu_sources_restaurant_id_idx on public.menu_sources (restaurant_id);
alter table public.menu_sources enable row level security;

-- ── Approved, restaurant-reported data on the listing ───────
-- Kept outside `dossier` because the Airtable sync rebuilds dossier,
-- reservation_link and order_links on every refresh.
alter table public.restaurants
  add column reported_protocol jsonb,
  add column reported_links    jsonb,
  add column reported_at       timestamptz;

-- ── Private storage for uploads (menus, certification proof) ─
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'restaurant-uploads', 'restaurant-uploads', false, 15728640,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp']
);
