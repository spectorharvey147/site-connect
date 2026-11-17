# Vendor, GST and Approval Identity

## What this adds

Accounting Setup now has Vendor GL and GST GL tabs. Vendor records are entered by Accounts/Admin after checking the account in SAP. Records are deactivated rather than deleted, account codes remain unique, and active vendor names cannot be duplicated. The three Input GST GL codes are configurable and no GST account numbers are assumed.

Accounts verification records tax invoice details per expense row. A tax invoice requires an attached invoice/receipt. If the SAP vendor is available, Accounts selects an active vendor and the full approved amount is debited to the saved vendor account code. Otherwise, Accounts enters taxable value and invoice tax values. Taxable value plus GST must equal the approved row amount; IGST cannot be mixed with CGST/SGST. Normal rows keep the existing mapping. All scenarios credit the employee GL for the full approved amount.

The OJDT and JDT1 column layouts, normal expense GL mappings, project and location fields, journal sequence and export batch snapshots remain in the existing export flow. The journal builder adds debit lines for the saved vendor or configured Input GST accounts as needed.

Approval transitions captured by the database now create immutable event rows with the actor, stage, action, timestamp, remarks, signature URL snapshot and browser/device details when the request User-Agent is available. Existing approval workflow and RPC remain in use.

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

The additive migrations are `supabase/migrations/20261117054647_vendor_gst_approval_identity.sql` and `supabase/migrations/20261117055612_claim_duplicate_self_approval.sql`. The first creates the two accounting master tables and approval event table, adds tax fields to `expense_items`, and installs session-checked master and accounting verification RPCs. The second installs manager self-approval routing and database duplicate-expense enforcement. They do not seed/invent vendors or GST account numbers and do not modify historical SAP exports.

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

IP address is intentionally stored as NULL by the current database trigger. This application has no `claim-approval` Edge Function and its current decision paths call database RPCs directly. The browser cannot provide trustworthy IP evidence by submitting a form field, so the timeline and voucher show **Not Available** instead of claiming an IP. A trusted server-side Edge Function must be added and made the only approval entry point before IP capture can be considered reliable.

Browser and device are derived from the request User-Agent where available. User-Agent and IP are supporting audit evidence, not proof of physical identity. VPNs, mobile networks and shared Wi-Fi can affect observed IPs. The event keeps the approval-time signature URL reference; if the backing signature object is replaced or its URL expires, immutable private storage snapshots are still needed for guaranteed historical rendering.

## Verification

Run `npm install`, `npm run lint`, `npm run build`, and `npm test` from the project root. SAP journal unit tests cover the legacy treatment, vendor-available treatment, CGST/SGST, IGST, and missing or unbalanced tax data. Supabase migration and Edge Function checks require the Supabase CLI/local database and Deno respectively.

## Rollback guidance

Prefer a forward fix migration. If rollback is required before any new records are entered, restore the pre-deployment database backup and redeploy the prior frontend. Do not drop the additive tables or columns after vendors, tax verification records or approval evidence have been written; that would remove audit history. No automated destructive rollback is provided.

## Known limitations requiring completion before production acceptance

- The trusted approval Edge Function and reliable server-observed IP capture are not implemented in this repository; no `claim-approval` function exists here. Approval events currently show IP as Not Available.
- Approval signatures are snapshotted by URL reference, not copied into immutable private storage.
- This workspace currently has no `.git` metadata or Git remote. `npm` is unavailable here, so dependencies were installed with `pnpm`; the app build and tests ran. Branch creation, commit and GitHub upload require the intended full Git checkout.
- No linked Supabase project reference is configured in the CLI workspace. Confirm the intended project and backup before using the remote preview/apply commands.
