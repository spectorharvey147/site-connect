# Vendor, GST and Approval Identity

## What this adds

Accounting Setup now has Vendor GL and GST GL tabs. Vendor records are entered by Accounts/Admin after checking the account in SAP. Records are deactivated rather than deleted, account codes remain unique, and active vendor names cannot be duplicated. The three Input GST GL codes are configurable and no GST account numbers are assumed.

Accounts verification records tax invoice details per expense row. A tax invoice requires an attached invoice/receipt. If the SAP vendor is available, Accounts selects an active vendor and the full approved amount is debited to the saved vendor account code. Otherwise, Accounts enters taxable value and invoice tax values. Taxable value plus GST must equal the approved row amount; IGST cannot be mixed with CGST/SGST. Normal rows keep the existing mapping. All scenarios credit the employee GL for the full approved amount.

The OJDT and JDT1 column layouts, normal expense GL mappings, project and location fields, journal sequence and export batch snapshots remain in the existing export flow. The journal builder adds debit lines for the saved vendor or configured Input GST accounts as needed.

Approval actions now pass through `supabase/functions/claim-approval`. The function validates the existing custom app session, reads the client IP only from Supabase's platform-set `cf-connecting-ip` header, and ignores caller-supplied forwarded-IP values. It copies the approver's current PNG/JPEG signature into a private `approval-signatures` bucket before calling the service-role-only database RPC. The claim status change and identity event are committed together. A missing or invalid IP is stored as NULL and shown as Not Available. The timeline and voucher request short-lived signed URLs for private signature snapshots.

Browser, operating system, and device labels are inferred from User-Agent. These values and the observed network IP are supporting audit evidence, not proof of physical identity. VPNs, mobile networks, and shared Wi-Fi can affect the observed IP. New approval snapshots are private and use unique object paths; changing a profile signature does not overwrite them.

## Accounting examples

Vendor available, invoice total Rs. 11,800:

| Account | Debit | Credit |
| --- | ---: | ---: |
| Selected vendor GL | 11,800 | — |
| Employee GL | — | 11,800 |

Vendor unavailable, taxable value Rs. 10,000, CGST Rs. 900 and SGST Rs. 900:

| Account | Debit | Credit |
| --- | ---: | ---: |
| Existing expense category GL | 10,000 | — |
| Configured Input CGST GL | 900 | — |
| Configured Input SGST GL | 900 | — |
| Employee GL | — | 11,800 |

Vendor unavailable, taxable value Rs. 10,000 and IGST Rs. 1,800 uses the existing expense category GL, configured Input IGST GL and employee GL for the full credit.

## Migration and deployment

The migrations are `supabase/migrations/20261117054647_vendor_gst_approval_identity.sql`, `supabase/migrations/20261117055612_claim_duplicate_self_approval.sql`, and `supabase/migrations/20261117061000_approval_identity_edge_route.sql` (the final timestamp will be aligned with Supabase migration history when applied). The first two are already applied to the configured project. The approval route migration adds retry keys for new events, creates a service-role-only RPC, and records IP, User-Agent, and private signature paths without changing claim or expense values. Existing event rows are left untouched. Deploy the `claim-approval` Edge Function after the migration; its private signature bucket is created on demand when a signer has a profile signature.

From a machine with the Supabase CLI, Docker and the intended local Supabase project available:

```sh
supabase start
supabase migration up --local
supabase db lint --local
```

Before applying to a linked remote, verify its project reference and backup, then preview:

```sh
supabase migration list --linked
supabase db push --dry-run --linked
```

After confirming the project and backup, apply with `supabase db push --linked`. Do not use `supabase db reset` for this live application. The approval identity insert is performed in a claim update trigger, so the status transition and event insert share the same transaction.

## Approval identity limits

The approval identity migration and Edge Function are prepared in this branch but have not yet been applied/deployed to the live project. Until both are active and the frontend release is live, existing approvals continue through the deployed workflow. The existing `user-avatars` bucket contains profile signatures and remains public under the current application setup; new approval-time copies are stored in the private bucket. IP and device data remain supporting evidence rather than a determination of physical identity.

## Verification

The app type check, production build, and Vitest suite passed locally (108 tests after the approval identity tests were added). Repo-wide lint continues to report existing `no-explicit-any` violations. The Edge Function has not yet been deployed or runtime-checked against a staging project. The three migrations must be applied in the correct order to the configured database before the new frontend route is used.

## Rollback guidance

Prefer a forward fix migration. If rollback is required before any new records are entered, restore the pre-deployment database backup and redeploy the prior frontend. Do not drop the additive tables or columns after vendors, tax verification records or approval evidence have been written; that would remove audit history. No automated destructive rollback is provided.

## Remaining deployment steps

- Apply the approval identity migration after confirming the current production backup, then deploy `claim-approval` with JWT gateway verification disabled because the function validates the application's custom session token itself.
- Release this branch's frontend so all approval, rejection, payment, and private signature reads use the Edge Function.
- Test a real approval from desktop and mobile with the function logs and verify that a missing IP remains NULL, a valid IP is recorded, and the signature still renders after the profile signature changes.
