**Review Findings**

1. **Tracked database dump is the biggest issue**
   [local.dump](D:/Sector57/local.dump) is tracked in Git. That is risky because dumps often contain private data, credentials, or seed state. `.gitignore` ignores env/build/media artifacts but not dumps: [.gitignore](D:/Sector57/.gitignore:13).  
   Recommendation: add `*.dump` or `local.dump` to `.gitignore`, then remove it from Git tracking when you are ready.

2. **Some API services are getting too large**
   A few services are already in “hard to review cheaply” territory:
   - [payments.service.ts](D:/Sector57/apps/api/src/payments/payments.service.ts:100) around 667 lines
   - [billing-runs.service.ts](D:/Sector57/apps/api/src/billing/billing-runs.service.ts:85) around 608 lines
   - `expenses.service.ts`, `invoices.service.ts`, `staff.service.ts` are also large

   The logic is not obviously bad, but these files mix permissions, queries, transactions, audit, mapping, and business rules. That is probably where Claude is burning tokens. Future work should extract pure policy/planning functions instead of expanding these service files.

3. **Large frontend client component**
   [people-panel.tsx](D:/Sector57/apps/web/src/components/members/people-panel.tsx:1) is a 600+ line client component containing owners, transfers, renters, occupants, forms, state, and rendering. It works as a vertical slice, but it will become expensive to change. Split by section when touched next.

4. **Repeated web API auth helper**
   `authHeaders()` is duplicated across many files, for example [admin.ts](D:/Sector57/apps/web/src/lib/api/admin.ts:15). I found the same pattern in about 16 API wrapper files. This is small duplication, but it adds noise and makes every frontend data change bigger than needed.

5. **Session proxy code deserves tests**
   [session-proxy.ts](D:/Sector57/apps/web/src/lib/session-proxy.ts:24) contains important auth freshness, cookie parsing, and refresh behavior. This code is business-critical for login/session loops, but I did not see focused tests for it. Not urgent if manual checks pass, but it is a good future target.

6. **Documents module is a coupling hotspot**
   [documents.service.ts](D:/Sector57/apps/api/src/documents/documents.service.ts:66) injects several modules and centralizes cross-module rights logic around [documents.service.ts](D:/Sector57/apps/api/src/documents/documents.service.ts:211). The current approach is understandable, but if documents expand, move that access logic into a dedicated policy/resolver.

7. **Members controller is bundled heavily**
   [members.controller.ts](D:/Sector57/apps/api/src/members/members.controller.ts:61) contains many controllers/classes in one file. It is organized enough for now, but it increases merge conflicts and review cost. Split by resource later, not as a big standalone refactor.

**What Looks Good**

The overall architecture is strong. Folder ownership is clear: `apps/api`, `apps/web`, `packages/db`, and `packages/shared` each have a sane role.

The security/business foundation looks solid: default-deny auth/permissions in [app.module.ts](D:/Sector57/apps/api/src/app.module.ts:87), CSRF protection, strict env validation, audited private document access, exact money handling, and transaction-safe finance numbering.

The Bengali-first model is also a good direction. I do not see it creating future conflict as long as `*_bn` stays required where Bangla is the canonical product language and `*_en` remains optional/supportive.

**Overengineering Verdict**

Claude has not overengineered the domain model itself. Audit, permissions, finance immutability, exact money, and society scoping are justified for this product.

The overengineering risk is in implementation size per step: big service files, broad e2e coverage, and repeated wrappers. Ask Claude for smaller slices: one feature, one policy, one API path, one UI path, limited tests.

**Recommended Next Moves**

1. Remove `local.dump` from Git tracking and ignore dumps.
2. Tell Claude: no new service should grow past roughly 300-350 lines without extracting pure helpers.
3. Create one shared web API auth/header helper.
4. Add focused tests for `session-proxy.ts` when web tests are introduced.
5. Split large files only when touching them for real feature work. No mega-refactor yet.

I did not run build, test, check, or migrations, per your instruction.
