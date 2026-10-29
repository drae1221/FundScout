-- FundScout seed data (spec section 8). Run AFTER schema.sql, in the Supabase SQL Editor.
-- Anything in [PLACEHOLDER: ...] needs real details from the club officers.

delete from activity_log; delete from drafts; delete from opportunities; delete from scans;
delete from funding_library; delete from orgs;

-- ── Demo orgs ────────────────────────────────────────────────────────────────
insert into orgs (name, type, university, member_count, is_registered_student_org, is_501c3,
                  has_nonprofit_partner, mission, activities, funding_goals, target_amount,
                  past_wins, industry_ties, funding_contacts) values
(
  'AI Club', 'student_club', 'CU Boulder', null, true, false, false,
  '[PLACEHOLDER: AI Club mission statement]',
  '[PLACEHOLDER: weekly meetings, workshops, hackathons, speaker events]',
  '[PLACEHOLDER: e.g. host a campus AI hackathon; send members to a conference]',
  null,
  '[PLACEHOLDER: past events, attendance numbers, competition results]',
  '{AI,software}', '{treasurer-aiclub@example.com}'
),
(
  'Leeds Investment & Trading Group', 'student_club', 'CU Boulder', null, true, false, false,
  '[PLACEHOLDER: mission]', '[PLACEHOLDER: activities]', '[PLACEHOLDER: funding goals]', null,
  '[PLACEHOLDER: past wins]',
  '{finance,trading}', '{treasurer-litg@example.com}'
),
(
  'Beta Alpha Psi', 'student_club', 'CU Boulder', null, true, false, false,
  '[PLACEHOLDER: mission]', '[PLACEHOLDER: activities]', '[PLACEHOLDER: funding goals]', null,
  '[PLACEHOLDER: past wins]',
  '{accounting}', '{treasurer-bap@example.com}'
),
(
  -- Fictional test org: used to check that 501(c)(3)-only grants become Apply here but Skip for clubs.
  'Sample Boulder Nonprofit (test)', 'nonprofit', null, null, false, true, false,
  'Fictional small Boulder nonprofit used for testing. Provides after-school STEM tutoring.',
  'After-school tutoring, summer camp, volunteer training',
  'Fund tutoring supplies and one part-time coordinator', 25000,
  'Fictional test data',
  '{education}', '{test-nonprofit@example.com}'
);

-- ── Funding library ──────────────────────────────────────────────────────────
-- Sources: colorado.edu pages listed in each url. Amounts and deadlines change each
-- semester, so re-check every entry on its official page before the demo.
insert into funding_library (name, provider, type, funding_category, eligibility_notes,
                             typical_amount, deadline_notes, url) values
(
  'CUSG SOAC — Event funding', 'CU Student Government (SOAC) / Center for Student Involvement',
  'university', 'events',
  'Registered Student Organization open to all CU Boulder students. Events must engage the broader campus community and be open and free to all CU Boulder students. Submitted through BuffConnect.',
  'Part of the per-year SOAC cap (about $1,000 for new RSOs, $5,000 for established RSOs). Food has its own limit; confirm the current amount.',
  'Priority submission deadlines before each hearing date; listed on the SOAC page and subject to change.',
  'https://www.colorado.edu/cusg/about-us/executive-branch/student-organization-allocations-committee'
),
(
  'CUSG SOAC — Operational funding', 'CU Student Government (SOAC) / Center for Student Involvement',
  'university', 'operational',
  'Registered Student Organization open to all CU Boulder students. Day-to-day needs: recruiting materials (posters, banners, t-shirts), food for member meetings, equipment needed for the org''s purpose. Submitted through BuffConnect.',
  'Part of the per-year SOAC cap (about $1,000 new / $5,000 established).',
  'Priority submission deadlines before each hearing date; listed on the SOAC page and subject to change.',
  'https://www.colorado.edu/cusg/about-us/executive-branch/student-organization-allocations-committee'
),
(
  'CUSG SOAC — Travel funding', 'CU Student Government (SOAC) / Center for Student Involvement',
  'university', 'travel',
  'Off-campus trips over a 60-mile round trip that need an overnight stay. Covers lodging, ground transport, parking, airfare, and conference or competition registration. No international travel and no retreats. Submitted through BuffConnect.',
  'Up to $5,000 per year across all student-fee funding sources.',
  'Deadlines are set by travel month (e.g. early September for Nov/Dec travel); listed on the SOAC page.',
  'https://www.colorado.edu/cusg/about-us/executive-branch/student-organization-allocations-committee'
),
(
  'Arts & Sciences Student Government (ASSG) funding', 'Arts & Sciences Student Government',
  'university', 'general',
  'RSOs registered with the Center for Student Involvement, or clubs affiliated with the College of Arts & Sciences. Must follow ASSG bylaws and student fee rules. Requested through a formal funding hearing.',
  'Up to $1,000 per semester.',
  'ASSG updated its procedures for 2026; see the Student Funding Logistics & Deadlines document on the page.',
  'https://www.colorado.edu/studentgroups/assg/student-funding'
);

-- TODO (spec section 8): add these once confirmed on an official page. Do not seed guesses,
-- because the Scout agent treats this library as trusted.
--   • Leeds School of Business student government / school funding
--   • Department funds relevant to each club
--   • Beta Alpha Psi national chapter awards/funding
--   • Colorado community foundation grants (good 501(c)(3)-only test case)
--   • Corporate sponsors from the CU career fair employer list
--   • Student competitions / conference travel scholarships
-- Starting points: https://www.colorado.edu/involvement/student-organizations/funding-sources
