-- Local development seed. Runs on `pnpm db:reset`, after the migrations.
-- Local only: the deploy workflow (`supabase db push`) never runs this file.
-- Everything here is made up. No real data.

-- The owner. The id is fixed so DENKORE_OWNER_USER_ID in .env.local stays valid
-- across resets, and the email is the one GitHub sign-in links to.
-- The confirmed email is what lets Supabase Auth link the first GitHub sign-in
-- to this user instead of refusing it (signups are off in config.toml).
-- Token columns are empty strings, not nulls: Auth scans them into plain strings.
insert into auth.users (
  instance_id, id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000',
  'd3c0de00-0000-4000-8000-000000000001',
  'authenticated', 'authenticated',
  'dcps302@gmail.com', now(),
  '{"provider": "email", "providers": ["email"]}', '{}', now(), now(),
  '', '', '', ''
);

insert into auth.identities (
  id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at
) values (
  gen_random_uuid(),
  'd3c0de00-0000-4000-8000-000000000001',
  'd3c0de00-0000-4000-8000-000000000001',
  'email',
  '{"sub": "d3c0de00-0000-4000-8000-000000000001", "email": "dcps302@gmail.com", "email_verified": true}',
  now(), now(), now()
);

-- A project the owner owns. A report with no project is visible only to a user
-- who owns at least one (005's policy), so without this /sites would be empty.
insert into public.projects (id, registry_id, repo, owner_id) values (
  'd3c0de00-0000-4000-8000-000000000002',
  'seed-demo',
  'example-org/seed-demo',
  'd3c0de00-0000-4000-8000-000000000001'
);

-- Two reports for one target, a day apart, so /sites has a diff to show:
-- the description finding is fixed, the title finding is still open, and a
-- broken link is new. Counts match the findings.
insert into public.audit_reports (
  project_id, target, started_at, finished_at, pages_checked,
  info_count, warn_count, fail_count, report
) values (
  null,
  'https://seed-demo.example.test/',
  '2026-11-11T10:00:00Z', '2026-11-11T10:00:09Z', 3,
  1, 2, 0,
  $json${
    "schemaVersion": 1,
    "target": "https://seed-demo.example.test/",
    "startedAt": "2026-11-11T10:00:00.000Z",
    "finishedAt": "2026-11-11T10:00:09.000Z",
    "pagesChecked": 3,
    "findings": [
      {"id": "0a1b2c3d4e5f6071", "check": "page.title", "severity": "warn", "url": "https://seed-demo.example.test/about", "message": "This page's title is too long and may be cut off in search results."},
      {"id": "1b2c3d4e5f607182", "check": "page.description", "severity": "warn", "url": "https://seed-demo.example.test/", "message": "This page has no description. Search engines will pick their own snippet."},
      {"id": "2c3d4e5f60718293", "check": "headers.hsts", "severity": "info", "url": "https://seed-demo.example.test/", "message": "Missing Strict-Transport-Security header."}
    ],
    "counts": {"info": 1, "warn": 2, "fail": 0}
  }$json$::jsonb
), (
  null,
  'https://seed-demo.example.test/',
  '2026-11-12T10:00:00Z', '2026-11-12T10:00:08Z', 3,
  1, 1, 1,
  $json${
    "schemaVersion": 1,
    "target": "https://seed-demo.example.test/",
    "startedAt": "2026-11-12T10:00:00.000Z",
    "finishedAt": "2026-11-12T10:00:08.000Z",
    "pagesChecked": 3,
    "findings": [
      {"id": "0a1b2c3d4e5f6071", "check": "page.title", "severity": "warn", "url": "https://seed-demo.example.test/about", "message": "This page's title is too long and may be cut off in search results."},
      {"id": "2c3d4e5f60718293", "check": "headers.hsts", "severity": "info", "url": "https://seed-demo.example.test/", "message": "Missing Strict-Transport-Security header."},
      {"id": "3d4e5f6071829304", "check": "links.broken", "severity": "fail", "url": "https://seed-demo.example.test/contact", "message": "A link on this page leads to a page that doesn't exist.", "evidence": "/old-pricing returned 404"}
    ],
    "counts": {"info": 1, "warn": 1, "fail": 1}
  }$json$::jsonb
);
