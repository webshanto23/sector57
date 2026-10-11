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
| **Member** | সদস্য | A registered member of the society: applied, approved, can vote and pays the membership fee. Being an owner, renter or resident does not make someone a member. Reserved for Steps 3 + 8; until then the dashboard does not use the word. | Membership form (public site), membership approval |
| **Committee member** | কমিটির সদস্য | Someone holding a committee seat for a term. Always written in full, never just "member". | Committee pages |

## In code

- Internal names stay as they are: the permission module and API route `members`, the `Members` message namespace, `MemberRow`, the `/dashboard/members` URL. Renaming them would touch roles, the seed and tests without changing what anyone sees. Only user-facing text follows this glossary.
- `occupants` rows are residents; `ownerships` rows make owners; `tenancies` rows make renters.
