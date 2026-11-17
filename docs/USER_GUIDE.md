# ClaimFlow Pro User Guide

## 1. Roles

- `User`
  Submit claims, view claim history, view transactions, and download own vouchers if permitted by role.
- `Manager`
  Review assigned users' claims and approve or reject them.
- `Admin`
  Final approval, user management, settings, reporting, transactions, and vouchers.
- `Super Admin`
  Same operational power as Admin, plus can receive both manager-stage and admin-stage approval mails.

## 2. Login

- Open the web app or Android app.
- Sign in with the email and password created in User Management.
- Use `Forgot Password` only if password reset flow is configured and mail delivery is working.

## 3. Submit a Claim

1. Open `Submit Claim`.
2. Choose the site/project.
3. Add one or more expense rows.
4. Upload receipt files if required.
5. Submit the claim.

Important:

- Accepted attachments support JPG/JPEG, PNG, and PDF. WebP and HEIC/HEIF are not accepted by the claim uploader.
- Each expense row with a bill amount needs at least one bill attached directly to that row. Additional documents can be added in the separate, optional claim-level section.
- Matching files selected in multiple upload areas are compared by SHA-256 during submission; the row attachment is kept as the canonical reference.
- If manager approval is enabled and the user has a manager assigned, the claim goes to manager first.
- If manager approval is disabled or no manager is assigned, the claim goes directly to Admin/Super Admin.
- If an active Manager submits a claim for work assigned to that same Manager, Admin verification sends it directly to HOD/Super Admin. The timeline records the skipped stage. A Manager cannot approve their own claim.
- Possible duplicate expenses are identified by date, normalized category, project code, and total amount in paise. Rejected claims do not block resubmission.

## 4. Claim Approval

### Manager

- Open `Approval`.
- Review claim details and attachments.
- Approve or reject.

### Admin or Super Admin

- Open `Approval`.
- Review claims pending final approval.
- A self-submitted claim for work assigned to the submitting Manager skips the manager queue after Admin verification.
- Approve or reject.

Email approval:

- Approval links open the `claim-action` page.
- Approve is one-click.
- Reject still requires a reason.

## 5. Claim History

- Use `Claim History` to view submitted, pending, approved, or rejected claims.
- Managers can view claims for their assigned users.
- Admin and Super Admin can filter by user and date range.

## 6. Transactions

- Shows advance, claim submission, refund, and approval settlement entries.
- Admin and Super Admin can filter by user/date/type.

## 7. Payment Voucher

- Open `Payment Voucher`.
- Filter by:
  - user
  - from date
  - to date
- Select one or more approved claims.
- Click `Create Combined Voucher`.

Voucher output includes:

- generated voucher number
- selected claim IDs
- period covered
- expense-level rows by claim
- per-claim subtotal
- final combined grand total

## 8. Settings

Settings include:

- company name, subtitle, logo, address, phone, website
- currency symbol
- email notifications on/off
- app notifications on/off
- require manager approval on/off
- auto-approve threshold
- approval notes

Important:

- After changing settings, click `Save Settings`.
- If `Email Notifications` is off, notification mails are skipped.

## 9. Troubleshooting

### Claim mail not received

- Check `Settings` -> `Email Notifications`.
- Check company support email and website.
- Check the submitter has a `manager_email` if manager-stage approval is expected.
- Check Supabase function secrets for Gmail are valid.

### Approval link opens but fails

- Confirm `company_settings.website` points to the live deployed domain.
- Confirm the live domain has SPA rewrite support for `/claim-action`.

### Attachment links not visible in email

- Submit a fresh claim after deployment.
- Ensure the attachment was uploaded successfully to the `claim-attachments` bucket.
