# Glossary

One word, one meaning, everywhere: menus, page titles, buttons, messages (Bangla and English), docs and reviews. Agreed with Anis on 2026-10-11. When a new screen needs one of these ideas, use these words; when a new idea needs a word, add it here first.

| English | Bangla | Means | Where |
|---|---|---|---|
| **Person** | ব্যক্তি | Anyone the society has a record of, stored once (`persons`). | Every page that shows people |
| **Organisation** | প্রতিষ্ঠান | A company, shop or NGO that owns or rents (`organisations`). | Owner and renter records |
| **Owner** | মালিক | A person or organisation with a current ownership of a plot, building or unit, whether or not they live there. | Unit and map pages |
| **Renter** | ভাড়াটিয়া | The person or organisation of an open tenancy of a unit. | Unit pages |
| **Owners & renters** | মালিক ও ভাড়াটিয়া | The register of everyone with a property record: owners, renters and residents (plus, for whole-society roles, people not linked to a unit yet). | `/dashboard/members` page and its menu item |
| **Resident** | বাসিন্দা | Someone who lives in a unit now (`occupants`, current rows). A renter who is a person becomes one automatically; an owner becomes one when marked "Lives here". An owner who lives elsewhere is not a resident. | Residents list on each unit; the resident directory (later) |
| **Household** | পরিবার | The residents of one unit under one owner or one tenancy ("owner's household", "renter's household"). | Resident rows |
| **Member** | সদস্য | A registered member of the society: applied, approved, can vote and pays the membership fee. Being an owner, renter or resident does not make someone a member. A `memberships` row (numbered, active, lapsed or cancelled), made when the office approves a membership application. | Membership form (public site), membership approval, "Society member · no. N" on a person's page |
| **Application** | আবেদন | A request sent from the public website (membership application, renter registration) that the office reviews: new, in review, approved or rejected. | `/forms` on the site, `/dashboard/forms` |
| **Committee member** | কমিটির সদস্য | Someone holding a committee seat for a term. Always written in full, never just "member". | Committee pages |
| **Staff** | কর্মী | Someone the society employs (guard, cleaner, electrician, office staff): a person plus one `staff` row per stint of work, numbered. Never "employee" or কর্মচারী. Agreed 2026-10-12. | `/dashboard/hrm` |
| **Attendance** | হাজিরা | One staff member's status for one day: present, half day, leave, absent or day off. Agreed 2026-10-12. | The day's roster, the month calendar |

## To agree (Operations, Steps 22–26)

Proposed words for the later Operations steps; final only once Anis agrees, before each step's scope note. Staff and Attendance were agreed with Step 22 and moved to the table above.

| English | Bangla | Means |
|---|---|---|
| **Ticket** | অভিযোগ | A problem reported to the office (street light, garbage, water), tracked until resolved. |
| **Work order** | কাজের আদেশ | A job given to staff or a vendor, from a ticket, an asset or planned maintenance. |
| **Facility** | সুবিধা | A shared place the society runs (hall, mosque, playground, generator room). |
| **Asset** | সম্পদ | A thing the society owns and keeps track of (generator, pump, CCTV, furniture). |
| **Sticker** | স্টিকার | The numbered vehicle sticker issued to a unit's vehicle for a year. |

## In code

- Internal names stay as they are: the permission module and API route `members`, the `Members` message namespace, `MemberRow`, the `/dashboard/members` URL. Renaming them would touch roles, the seed and tests without changing what anyone sees. Only user-facing text follows this glossary.
- `occupants` rows are residents; `ownerships` rows make owners; `tenancies` rows make renters.
