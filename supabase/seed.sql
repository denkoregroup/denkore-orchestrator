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

-- Two reports for one made-up prospect (no project), a day apart, so the report page has a diff to
-- show: the missing description is fixed, the long title and the missing HSTS setting are still open,
-- and a broken link is new. A third report is for a site linked to the project above, so a registered
-- site shows up too. Check ids, severities and wording are the auditor's own (lib/audits/checks), and
-- each finding id is the auditor's fingerprint of its check, page and key. Counts match the findings.
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
      {"id": "123a7f5972a269f5", "check": "page.title", "severity": "warn", "url": "https://seed-demo.example.test/about", "message": "This page's title is long (72 characters), so Google will cut it off. Keep it to 60 characters or fewer.", "evidence": "About Seed Demo Co: family-run plumbing, heating and drain cleaning since 1994"},
      {"id": "4fa92b82543be881", "check": "page.description", "severity": "warn", "url": "https://seed-demo.example.test/", "message": "This page has no description. Google often shows the description under your link in search results, so write one or two sentences about the page."},
      {"id": "83eea488dbb241f6", "check": "site.security-headers", "severity": "info", "url": "https://seed-demo.example.test/", "message": "Your server doesn't tell browsers to always use the secure version of your site (the HSTS setting). Your web host can turn this on."}
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
      {"id": "41d646d36c847326", "check": "page.broken-link", "severity": "fail", "url": "https://seed-demo.example.test/old-pricing", "message": "A link on your site goes to a page that doesn't work (status 404). Fix or remove the link.", "evidence": "Linked from: https://seed-demo.example.test/contact"},
      {"id": "123a7f5972a269f5", "check": "page.title", "severity": "warn", "url": "https://seed-demo.example.test/about", "message": "This page's title is long (72 characters), so Google will cut it off. Keep it to 60 characters or fewer.", "evidence": "About Seed Demo Co: family-run plumbing, heating and drain cleaning since 1994"},
      {"id": "83eea488dbb241f6", "check": "site.security-headers", "severity": "info", "url": "https://seed-demo.example.test/", "message": "Your server doesn't tell browsers to always use the secure version of your site (the HSTS setting). Your web host can turn this on."}
    ],
    "counts": {"info": 1, "warn": 1, "fail": 1}
  }$json$::jsonb
), (
  'd3c0de00-0000-4000-8000-000000000002',
  'https://seed-site.example.test/',
  '2026-11-12T11:00:00Z', '2026-11-12T11:00:07Z', 2,
  1, 2, 0,
  $json${
    "schemaVersion": 1,
    "target": "https://seed-site.example.test/",
    "startedAt": "2026-11-12T11:00:00.000Z",
    "finishedAt": "2026-11-12T11:00:07.000Z",
    "pagesChecked": 2,
    "findings": [
      {"id": "f5dd1f6bbc1361e5", "check": "page.description", "severity": "warn", "url": "https://seed-site.example.test/", "message": "This page has no description. Google often shows the description under your link in search results, so write one or two sentences about the page."},
      {"id": "4c65c1a2b4f9bcf0", "check": "page.title", "severity": "warn", "url": "https://seed-site.example.test/contact", "message": "This page's title is very short (4 characters). Describe the page in 10 to 60 characters, for example your business name and what the page is about.", "evidence": "Home"},
      {"id": "b375820e9c4bee66", "check": "site.security-headers", "severity": "info", "url": "https://seed-site.example.test/", "message": "Your server doesn't tell browsers to always use the secure version of your site (the HSTS setting). Your web host can turn this on."}
    ],
    "counts": {"info": 1, "warn": 2, "fail": 0}
  }$json$::jsonb
);
