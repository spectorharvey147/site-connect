# Deployment And Release Guide

## 1. Web Deployment

Current live project uses Vercel.

Important config:

- [vercel.json](/C:/Users/Kulo5/Downloads/claimflow-pro-main%20(2)/claimflow-pro-main/vercel.json)

This rewrite is required so `/claim-action` works as an SPA route.

## 2. Required Web Environment

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## 3. Web Build

```powershell
npm run build
```

## 4. Vercel Production Deploy

```powershell
npx vercel deploy --prod
```

After deploy:

- confirm live domain matches `company_settings.website`

## 5. Supabase Function Deploy

```powershell
supabase functions deploy send-notification --project-ref YOUR_PROJECT_REF
```

## 6. Android Build Flow

The project uses Capacitor.

Key file:

- [capacitor.config.ts](/C:/Users/Kulo5/Downloads/claimflow-pro-main%20(2)/claimflow-pro-main/capacitor.config.ts)

### Sync latest web code into Android

```powershell
npx cap sync android
```

### Build web + sync in one step

```powershell
npm run android:build
```

### Build signed Android release APK

```powershell
cd android
gradlew.bat assembleRelease
```

Current release output path:

- [app-release.apk](/C:/Users/Kulo5/Downloads/claimflow-pro-main%20(2)/claimflow-pro-main/android/app/build/outputs/apk/release/app-release.apk)

## 7. Android Signing

Files used:

- [android/keystore.properties](/C:/Users/Kulo5/Downloads/claimflow-pro-main%20(2)/claimflow-pro-main/android/keystore.properties)
- [android/app/build.gradle](/C:/Users/Kulo5/Downloads/claimflow-pro-main%20(2)/claimflow-pro-main/android/app/build.gradle)

Check:

- keystore file exists
- passwords and alias are correct
- release signing config is active

## 8. Pre-Release Checklist

- web build passes
- email function deployed
- settings `website` points to live domain
- email notifications toggle verified
- manager/admin/super admin approval flows verified
- voucher output verified
- Android APK builds successfully

## 9. Safe Cleanup Targets

Generated folders that can be removed and regenerated:

- `dist/`
- `.vercel/`
- `supabase/.temp/`
- `android/.gradle/`
- `android/build/`
- `android/app/build/`

Do not delete casually:

- `src/`
- `supabase/functions/`
- `supabase/migrations/`
- `android/app/src/`
- `.env`
- `android/keystore.properties`
- keystore file
