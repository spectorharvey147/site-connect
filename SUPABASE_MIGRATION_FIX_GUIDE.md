# Supabase Migration Issue - Resolution Guide

## Problem
**Error:** "Remote migration versions not found in local migrations directory"

This occurs when:
1. Migrations exist on the remote Supabase project but not locally
2. The local `supabase/migrations/` directory is out of sync with the remote
3. Supabase CLI preview cannot reconcile the differences

## Current Local Migrations
Your local `supabase/migrations/` directory contains these files:

```
20260304193914_8dc62815-49cb-497b-87b9-d10cb4650158.sql
20260306083542_6d973e48-a1cf-494d-a5e4-66f90b2f9be6.sql
20260306083845_a1ba9a4c-1c47-4143-8dd3-f8061768013e.sql
20260307062555_3c49e67f-b3f3-47c8-add1-9e33d619f475.sql
20260309082456_7efea780-3ca9-4782-b124-be3d0a9528cc.sql
20260313_remove_default_admin.sql
20260314_add_claim_number.sql
20260314000100_add_password_resets_table.sql
20260323_harden_master_data_and_constraints.sql
20260514001500_align_fresh_rebuild_schema.sql
20260514090000_add_verified_amount_to_claims.sql
20260516000100_add_accounts_role_and_final_approval_fields.sql
20260518000100_add_user_signature_url.sql
20260518093000_ensure_user_signature_url.sql
20260523090000_add_accounts_payment_flow_to_claims.sql
20260604193000_add_accounts_sap_exports.sql
20260604195500_add_payment_voucher_codes.sql
20260604202000_add_customer_names_to_projects_and_claims.sql
complete_schema.sql (baseline schema)
```

## Solution Options

### Option 1: Pull Remote Migrations (Recommended)
If you want to sync with the remote Supabase project:

```powershell
cd "e:\Final claims\Site Connect"
npx supabase login  # If not already logged in
npx supabase db pull  # Download remote migrations locally
```

This will:
- Compare local migrations with remote
- Download any missing remote migrations
- Create new migration files with the remote schema

### Option 2: Push Local Migrations to Remote
If your local migrations are the source of truth:

```powershell
cd "e:\Final claims\Site Connect"
npx supabase login
npx supabase db push  # Upload local migrations to remote
```

### Option 3: Use Complete Schema File
For a fresh start, use the complete schema (fastest approach):

```powershell
cd "e:\Final claims\Site Connect"
# Open Supabase Dashboard -> SQL Editor
# Copy contents of: supabase/migrations/complete_schema.sql
# Paste and run in the SQL Editor
# This applies all schema at once
```

### Option 4: Reset and Resync
For a clean slate:

```powershell
cd "e:\Final claims\Site Connect"

# 1. Unlink from current project
npx supabase unlink

# 2. Link to your project
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF

# 3. Pull the remote state
npx supabase db pull

# 4. Review changes and commit
git add supabase/migrations/
git commit -m "sync: align local migrations with remote database"
```

## Prerequisites

Before running any of these commands, ensure:

1. **Docker is running** (required for Supabase CLI)
   ```powershell
   # Check if Docker is running
   docker --version  # Should show version info
   ```

2. **You have access to Supabase project**
   - Project URL and anon key in `.env`
   - Project reference (from project settings)

3. **Git is up to date**
   ```powershell
   cd "e:\Final claims\Site Connect"
   git status  # Should be clean
   ```

## Current Status

**Local Migration Files:** 19 SQL files + 1 complete schema  
**Latest Local Migration:** 20260604202000_add_customer_names_to_projects_and_claims.sql  
**Complete Schema:** Included in migrations directory

## Why This Happened

The migration version mismatch typically occurs when:
1. Multiple developers push different migration versions
2. Supabase project was created with different schema than local migrations
3. Preview environment isn't properly configured
4. Migration files have non-standard naming (some use simple dates like `20260313` instead of full timestamps)

**Note:** Your `20260313_remove_default_admin.sql` and similar files use non-standard naming. Supabase prefers the format: `YYYYMMDDHHMMSS_description.sql`

## Recommended Next Steps

1. **If using Docker locally:**
   ```powershell
   docker-compose up -d  # Start Supabase local
   npx supabase db pull  # Sync with local Supabase
   ```

2. **If using remote Supabase project:**
   ```powershell
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db pull  # Get current remote state
   git add supabase/migrations/
   git commit -m "sync: pull remote migrations"
   ```

3. **For production deployment:**
   - Run `complete_schema.sql` directly in Supabase Dashboard
   - Then deploy application code separately

## Testing

After applying migrations, test the database:

```powershell
cd "e:\Final claims\Site Connect"

# 1. Check if tables exist
# Open Supabase Dashboard -> SQL Editor and run:
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';

# 2. Verify key tables
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM claims;
SELECT COUNT(*) FROM expense_items;
```

## References

- [Supabase CLI Docs](https://supabase.com/docs/reference/cli/supabase-db-pull)
- [Supabase Migrations Guide](https://supabase.com/docs/guides/cli/managing-environments)
- Project Config: `supabase/config.toml`

## Support

If migrations continue to fail:
1. Check Docker is running: `docker ps`
2. Verify Supabase project access: `npx supabase projects list`
3. Review Supabase logs: `npx supabase status`
4. Contact Supabase support or check their docs for your specific error
