# Supabase Migration And Setup Guide

This guide explains how to move ClaimFlow Pro to a new Supabase account or project.

## 1. What You Need

- a new Supabase account or access to a new Supabase organization
- a new Supabase project
- project URL
- anon key
- service role key if needed for admin automation
- CLI access or Dashboard SQL Editor access

## 2. Project Files Used

Primary files in this repo:

- [supabase/config.toml](/C:/Users/Kulo5/Downloads/claimflow-pro-main%20(2)/claimflow-pro-main/supabase/config.toml)
- [supabase/migrations/complete_schema.sql](/C:/Users/Kulo5/Downloads/claimflow-pro-main%20(2)/claimflow-pro-main/supabase/migrations/complete_schema.sql)
- [supabase/functions/send-notification/index.ts](/C:/Users/Kulo5/Downloads/claimflow-pro-main%20(2)/claimflow-pro-main/supabase/functions/send-notification/index.ts)
- [supabase/functions/send-notification/emailTemplates.ts](/C:/Users/Kulo5/Downloads/claimflow-pro-main%20(2)/claimflow-pro-main/supabase/functions/send-notification/emailTemplates.ts)
- [src/integrations/supabase/client.ts](/C:/Users/Kulo5/Downloads/claimflow-pro-main%20(2)/claimflow-pro-main/src/integrations/supabase/client.ts)
- [src/integrations/supabase/types.ts](/C:/Users/Kulo5/Downloads/claimflow-pro-main%20(2)/claimflow-pro-main/src/integrations/supabase/types.ts)

## 3. Create New Supabase Project

1. Create a new Supabase project from the dashboard.
2. Wait until the database and API are ready.
3. Copy:
   - Project URL
   - anon key
   - service role key

## 4. Update Local Environment

Update `.env`:

```env
VITE_SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
VITE_SUPABASE_ANON_KEY="YOUR_ANON_KEY"
```

If you use a separate deployment system, update the same variables there.

## 5. Link CLI To New Project

Update [supabase/config.toml](/C:/Users/Kulo5/Downloads/claimflow-pro-main%20(2)/claimflow-pro-main/supabase/config.toml):

```toml
project_id = "YOUR_NEW_PROJECT_REF"
```

Then log in:

```powershell
supabase login
```

Optional:

```powershell
supabase link --project-ref YOUR_NEW_PROJECT_REF
```

## 6. Apply SQL Schema

Recommended:

1. Open Supabase SQL Editor.
2. Run the full schema from:
   [complete_schema.sql](/C:/Users/Kulo5/Downloads/claimflow-pro-main%20(2)/claimflow-pro-main/supabase/migrations/complete_schema.sql)

This file creates:

- tables
  - `users`
  - `sessions`
  - `claims`
  - `expense_items`
  - `transactions`
  - `app_lists`
  - `company_settings`
  - `notifications`
  - `audit_logs`
  - `password_resets`
- indexes
- storage buckets
- storage policies
- schema defaults

## 7. Required Storage Buckets

The schema creates these:

- `claim-attachments`
- `company-assets`
- `user-avatars`

The main app currently depends on:

- `claim-attachments`
- `company-assets`

## 8. RLS / Policies

This project relies mainly on storage policies and uses app-managed auth patterns in the database tables.

Key policies created in the schema:

- public read access for `claim-attachments`
- upload access for `claim-attachments`
- delete access for `claim-attachments`

Review the exact SQL in:

- [complete_schema.sql](/C:/Users/Kulo5/Downloads/claimflow-pro-main%20(2)/claimflow-pro-main/supabase/migrations/complete_schema.sql)

Before go-live, confirm:

- the bucket names exactly match the frontend code
- public read is enabled only for the buckets the app expects
- no old policies from a previous project conflict with the imported schema

## 9. Seed / Initial Data

Check these after schema import:

- `company_settings`
  Must contain at least one row
- `app_lists`
  Add categories, project names, project codes
- `users`
  Create Admin / Super Admin account

Important:

- the app now inserts `company_settings` if missing when saving settings, but it is still best to seed one row up front
- user manager hierarchy depends on `manager_email`

## 10. Required Company Settings

Open Settings in the app and verify:

- `company_name`
- `company_subtitle`
- `support_email`
- `currency_symbol`
- `website`
- `email_notifications_enabled`
- `app_notifications_enabled`
- `require_manager_approval`
- `auto_approve_below`

Critical:

- `website` must be the live deployed frontend URL used in approval emails

## 11. Edge Function Deployment

Deploy the function:

```powershell
supabase functions deploy send-notification --project-ref YOUR_NEW_PROJECT_REF
```

Files involved:

- [index.ts](/C:/Users/Kulo5/Downloads/claimflow-pro-main%20(2)/claimflow-pro-main/supabase/functions/send-notification/index.ts)
- [emailTemplates.ts](/C:/Users/Kulo5/Downloads/claimflow-pro-main%20(2)/claimflow-pro-main/supabase/functions/send-notification/emailTemplates.ts)

## 12. Function Secrets

Set these secrets:

```powershell
supabase secrets set GMAIL_USER=yourgmail@gmail.com
supabase secrets set GMAIL_APP_PASSWORD=your_16_char_app_password
```

Optional verification:

```powershell
supabase functions list
```

## 13. Post-Migration Checks

Run these checks after setup:

1. Login works with Admin user.
2. Company logo uploads to `company-assets`.
3. Claim attachments upload to `claim-attachments`.
4. User submits a claim.
5. Manager receives mail if `manager_email` is set and manager approval is enabled.
6. Admin/Super Admin receive mail at the correct stage.
7. Approval links open the live domain.
8. Transactions update after submit/approve/reject.
9. Payment voucher generates correctly.
10. Settings save and reload correctly.

## 14. Common Failure Points

### Approval emails open wrong domain

- `company_settings.website` still points to old deployment

### Manager never receives claim mail

- user has no `manager_email`
- manager approval is disabled
- email notifications are off

### Attachments do not open

- storage bucket missing
- wrong bucket policy
- path mismatch in upload vs preview code

### No emails sent at all

- `email_notifications_enabled = false`
- function not deployed
- Gmail secrets missing or invalid

## 15. Recommended Handover Checklist

- Save new Supabase project ref
- Save anon key and service role key securely
- Save Gmail sender details securely
- Confirm one Admin account exists
- Confirm one Super Admin account exists
- Confirm Settings `website` is correct
- Confirm storage buckets and policies exist
- Confirm `send-notification` is deployed
