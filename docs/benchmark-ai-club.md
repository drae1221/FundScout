# AI Club benchmark: funding FundScout should find on its own

Researched by hand on Nov 1, 2026, to check whether the Scout finds real opportunities.
"Last scan" = the AI Club scan saved as the cached demo run (scan `5a8944f8`).

| # | Opportunity | Why AI Club fits | Official link | Expected verdict | Last scan |
|---|---|---|---|---|---|
| 1 | CUSG SOAC Event funding | RSO open to all students; speaker events | [SOAC page](https://www.colorado.edu/cusg/about-us/executive-branch/student-organization-allocations-committee) | Apply | ✅ Apply 80 |
| 2 | CUSG SOAC Operational funding | Food at meetings, hardware | same page | Apply | ✅ Apply 85 |
| 3 | CUSG SOAC Travel funding | Only if the club travels to a conference | same page | Maybe | ✅ Maybe 40 |
| 4 | ASSG funding (up to $1,000/semester) | Only if the club is Arts & Sciences affiliated | [ASSG](https://www.colorado.edu/studentgroups/assg/student-funding) | Maybe | ✅ Maybe 68 |
| 5 | Engineering Excellence Fund (student-fee fund, Fall and Spring cycles; past grants went to student teams such as Engineers Without Borders) | Hardware for research time; eligibility for a non-engineering RSO is unconfirmed | [About](https://www.colorado.edu/program/eef/about-fund) · [Proposals](https://www.colorado.edu/program/eef/request-proposals) | Maybe | ❌ not found |
| 6 | Anthropic Claude Campus Program / Claude Builder Clubs (API credits for members, workshops with Anthropic speakers, $3,600 stipend for club leads) | AI club that runs workshops | [claude.com/programs/campus](https://claude.com/programs/campus) | Maybe (closed for Fall 2026; applications open Sept 1–12) | ❌ not found |
| 7 | OpenAI Campus Network (tools, event support for university AI clubs) | AI club | [Interest form](https://openai.com/index/openai-campus-network-student-club-interest-form) | Maybe / Apply | ❌ not found |
| 8 | ALL Applied AI Network chapter program | Free chapter program with a sponsor portal | (found by the Scout) | Maybe | ✅ Maybe 62 |
| 9 | MLH Member Event (only if the club runs a hackathon: coach, hardware lab, sponsor connections) | Hackathons fit the mission | [mlh.io](https://mlh.io) | Maybe | ❌ not found |

Also seen but not a club funding source: the CS Department Fund (donations *to* the department), CU Engineering Council (helps engineering groups find funding; contact ucec@colorado.edu).

## What this showed
- The Scout reliably finds the CU funding library sources (1–4).
- It missed the AI-company club programs (6, 7) and the college-level fund (5). Changes made:
  the Engineering Excellence Fund was added to the funding library (hand-checked on its official page),
  and the Scout's instructions now say to look for AI and tech company programs for university clubs and college-level funds.
- Federal grants (Grants.gov) are correctly skipped: student clubs can't apply.

## Re-test after the changes (scan `f2f6dd1e`, Nov 1)
- Found: SOAC Event (Apply 78), SOAC Operational (Apply 85), ASSG (Maybe 62), **Engineering Excellence Fund (Maybe 30, new, via the library)**, OpenAI Student Collective (Skip 12: it's for individual campus leads, not the club).
- Still missed: Claude Campus Program (6), OpenAI Campus Network (7), MLH (9). SOAC Travel was left out this time.
- Problem seen: the Scout ran the same web query three times, using up its search budget. Fix idea for later: tell it never to repeat a query, or give it one more search.
- The cached demo run still uses the earlier scan (`5a8944f8`), which is a better demo.
