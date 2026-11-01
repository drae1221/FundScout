-- FundScout seed data (spec section 8). Run AFTER schema.sql, in the Supabase SQL Editor.
-- Club profiles come from officer answers (Nov 1, 2026). Target amounts are still unknown.

delete from activity_log; delete from drafts; delete from opportunities; delete from scans;
delete from funding_library; delete from orgs;

-- ── Demo orgs ────────────────────────────────────────────────────────────────
insert into orgs (name, type, university, member_count, is_registered_student_org, is_501c3,
                  has_nonprofit_partner, mission, activities, funding_goals, target_amount,
                  past_wins, industry_ties, funding_contacts) values
(
  'AI Club', 'student_club', 'CU Boulder', 100, true, false, false,
  'Brings in speakers to teach CU students and faculty about evolving technology, especially AI. Open to all students; founded about 2 years ago.',
  'Speaker events and regular meetings (about 100 attend meetings; 800+ on the email list).',
  'Food at meetings, AI tools to give to students, and hardware for research time.',
  null,
  'Landed G2 and Techstars for engagements with the club. Officers describe it as the biggest club at CU.',
  '{AI,software,G2,Techstars}', '{treasurer-aiclub@example.com}'
),
(
  'LCG', 'student_club', 'CU Boulder', 60, true, false, false,
  'Educates students and prepares them to do consulting projects for small companies and nonprofits. Open to all students; started about 2019.',
  'Consulting training, client projects for small companies and nonprofits, campus case competitions, and events with large consulting firms. About 60 active members and 300-400 alumni.',
  'Software for students, food for students, and campus competition events.',
  null,
  'Hosts the Rocky Mountain Case Competition (about 50 participants) and an event where big firms come in to talk to students.',
  '{consulting,business}', '{treasurer-lcg@example.com}'
),
(
  'Young Life', 'student_club', 'CU Boulder', 100, true, false, false,
  'Student ministry that hosts community-building events to bring CU students together. Open to all students.',
  'Weekly meetings (about 100 attend; about 1,000 on the email list), community events, travel events, and retreat weekends.',
  'Food, events, travel events, and retreat lodging.',
  null,
  'Brought 150 people to a retreat weekend.',
  '{ministry,community}', '{treasurer-younglife@example.com}'
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
  'CUSG SOAC: Event funding', 'CU Student Government (SOAC) / Center for Student Involvement',
  'university', 'events',
  'Registered Student Organization open to all CU Boulder students. Events must engage the broader campus community and be open and free to all CU Boulder students. Submitted through BuffConnect.',
  'Part of the per-year SOAC cap (about $1,000 for new RSOs, $5,000 for established RSOs). Food has its own limit; confirm the current amount.',
  'Priority submission deadlines before each hearing date; listed on the SOAC page and subject to change.',
  'https://www.colorado.edu/cusg/about-us/executive-branch/student-organization-allocations-committee'
),
(
  'CUSG SOAC: Operational funding', 'CU Student Government (SOAC) / Center for Student Involvement',
  'university', 'operational',
  'Registered Student Organization open to all CU Boulder students. Day-to-day needs: recruiting materials (posters, banners, t-shirts), food for member meetings, equipment needed for the org''s purpose. Submitted through BuffConnect.',
  'Part of the per-year SOAC cap (about $1,000 new / $5,000 established).',
  'Priority submission deadlines before each hearing date; listed on the SOAC page and subject to change.',
  'https://www.colorado.edu/cusg/about-us/executive-branch/student-organization-allocations-committee'
),
(
  'CUSG SOAC: Travel funding', 'CU Student Government (SOAC) / Center for Student Involvement',
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
--   • Young Life national / regional funding for college chapters
--   • Colorado community foundation grants (good 501(c)(3)-only test case)
--   • Corporate sponsors from the CU career fair employer list
--   • Student competitions / conference travel scholarships
-- Starting points: https://www.colorado.edu/involvement/student-organizations/funding-sources
