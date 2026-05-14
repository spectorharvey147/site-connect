# Email And Gmail Setup Guide

This guide explains how to change the Gmail sender and validate email delivery.

## 1. Current Email Flow

Email notifications are sent through the Supabase Edge Function:

- [send-notification/index.ts](/C:/Users/Kulo5/Downloads/claimflow-pro-main%20(2)/claimflow-pro-main/supabase/functions/send-notification/index.ts)

Templates are defined in:

- [send-notification/emailTemplates.ts](/C:/Users/Kulo5/Downloads/claimflow-pro-main%20(2)/claimflow-pro-main/supabase/functions/send-notification/emailTemplates.ts)

## 2. What You Need To Change Gmail Sender

- new Gmail account
- 2-step verification enabled on that Gmail account
- Gmail app password

## 3. Generate Gmail App Password

1. Sign in to the Gmail account.
2. Open Google Account Security.
3. Enable `2-Step Verification`.
4. Open `App passwords`.
5. Create a new app password for mail usage.
6. Copy the 16-character password.

## 4. Set Supabase Function Secrets

```powershell
supabase secrets set GMAIL_USER=newsender@gmail.com
supabase secrets set GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx
```

If the project is already linked:

```powershell
supabase functions deploy send-notification --project-ref YOUR_PROJECT_REF
```

## 5. Update App Settings

Open Settings and verify:

- `support_email`
- `website`
- `email_notifications_enabled = true`

`support_email` controls the email footer shown to users.

## 6. Email Types Used By App

- user created
- claim submitted to user
- claim submitted for approval
- claim approved
- claim rejected
- password reset

## 7. Operational Checks

After switching Gmail:

1. Create a test user.
2. Submit a test claim.
3. Confirm manager-stage mail.
4. Confirm admin-stage mail.
5. Confirm Super Admin dual-mail behavior where applicable.
6. Confirm approve link opens and works.
7. Confirm reject flow works.

## 8. If Mail Does Not Send

Check:

- `email_notifications_enabled` is on
- `GMAIL_USER` secret exists
- `GMAIL_APP_PASSWORD` secret exists
- Gmail account has app passwords enabled
- support email and website are set correctly
- latest `send-notification` function is deployed

## 9. If Amount Symbol Is Broken

The template now normalizes common broken rupee encodings in:

- [emailTemplates.ts](/C:/Users/Kulo5/Downloads/claimflow-pro-main%20(2)/claimflow-pro-main/supabase/functions/send-notification/emailTemplates.ts)

If a bad symbol still appears:

- submit a fresh claim after deployment
- test a fresh email, not an old one

## 10. Recommendation

Use a dedicated project Gmail account for this app, not a personal mailbox.
