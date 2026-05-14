# 🚀 Email Notification System - Quick Start Guide

## 5-Minute Setup

### Step 1: Deploy the Updated Function
```bash
supabase functions deploy send-notification
```

✅ This deploys both `index.ts` (main handler) and `emailTemplates.ts` (templates)

---

### Step 2: Test It Works
```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/send-notification \
  -H "Content-Type: application/json" \
  -d '{
    "recipientEmail": "your-email@example.com",
    "type": "claim_submitted",
    "data": {
      "employeeName": "Test User",
      "claimId": "CLM-TEST-001",
      "amount": 5000,
      "date": "2024-03-13",
      "site": "Test Office"
    }
  }'
```

You should get:
```json
{
  "success": true,
  "message": "Email sent successfully",
  "id": "email_xxx"
}
```

Check your email inbox in 30 seconds! 📧

---

## Complete Example: Send Claim Notification

### Basic Function Call
```typescript
import { supabase } from '@/integrations/supabase/client';

async function notifyClaimSubmitted(claim: any, employee: any) {
  const { data, error } = await supabase.functions.invoke('send-notification', {
    body: {
      recipientEmail: employee.email,
      type: 'claim_submitted',
      data: {
        employeeName: employee.name,
        claimId: claim.id,
        amount: claim.amount,
        date: new Date().toLocaleDateString(),
        site: claim.site,
        currencySymbol: '₹'
      }
    }
  });

  if (error) {
    console.error('Email failed:', error);
    return;
  }
  
  console.log('Email sent successfully!');
}
```

---

## All Email Types

### 1️⃣ claim_submitted
```typescript
{
  recipientEmail: 'user@example.com',
  type: 'claim_submitted',
  data: {
    employeeName: 'John Doe',
    claimId: 'CLM-001',
    amount: 5000,
    date: '2024-03-13',
    site: 'Mumbai Office',
    currencySymbol: '₹'
  }
}
```

### 2️⃣ claim_approved
```typescript
{
  recipientEmail: 'user@example.com',
  type: 'claim_approved',
  data: {
    employeeName: 'John Doe',
    claimId: 'CLM-001',
    amount: 5000,
    approvedBy: 'Jane Manager',
    currencySymbol: '₹'
  }
}
```

### 3️⃣ claim_rejected
```typescript
{
  recipientEmail: 'user@example.com',
  type: 'claim_rejected',
  data: {
    employeeName: 'John Doe',
    claimId: 'CLM-001',
    amount: 5000,
    rejectionReason: 'Missing receipt',
    rejectedBy: 'Jane Manager',
    currencySymbol: '₹'
  }
}
```

### 4️⃣ user_created
```typescript
{
  recipientEmail: 'newuser@example.com',
  type: 'user_created',
  data: {
    employeeName: 'Jane Smith',
    email: 'jane@example.com',
    role: 'Employee',
    loginUrl: 'https://claimflow.company.com/login'
  }
}
```

### 5️⃣ password_reset
```typescript
{
  recipientEmail: 'user@example.com',
  type: 'password_reset',
  data: {
    employeeName: 'John Doe',
    resetLink: 'https://claimflow.company.com/reset?token=xyz',
    expiresIn: '24 hours'
  }
}
```

---

## Integrate Into Your App

### Add to `src/lib/claims-api.ts`

```typescript
// Send notification on claim submission
export async function submitClaim(...) {
  // ... existing logic ...
  
  // Send email
  await supabase.functions.invoke('send-notification', {
    body: {
      recipientEmail: userEmail,
      type: 'claim_submitted',
      data: {
        employeeName: userName,
        claimId,
        amount: claim.amount,
        date: new Date().toLocaleDateString(),
        site: claim.site,
        currencySymbol: '₹'
      }
    }
  }).catch(err => console.warn('Email failed:', err));
}

// Send notification on approval
export async function approveClaim(claimId, employeeEmail, amount, managerName) {
  // ... existing logic ...
  
  await supabase.functions.invoke('send-notification', {
    body: {
      recipientEmail: employeeEmail,
      type: 'claim_approved',
      data: {
        employeeName: employeeEmail.split('@')[0],
        claimId,
        amount,
        approvedBy: managerName,
        currencySymbol: '₹'
      }
    }
  }).catch(err => console.warn('Email failed:', err));
}

// Send notification on rejection
export async function rejectClaim(claimId, employeeEmail, amount, reason, managerName) {
  // ... existing logic ...
  
  await supabase.functions.invoke('send-notification', {
    body: {
      recipientEmail: employeeEmail,
      type: 'claim_rejected',
      data: {
        employeeName: employeeEmail.split('@')[0],
        claimId,
        amount,
        rejectionReason: reason,
        rejectedBy: managerName,
        currencySymbol: '₹'
      }
    }
  }).catch(err => console.warn('Email failed:', err));
}
```

---

## What Happens Next

### 1. Email Sent ✅
- Template loads based on type
- HTML is generated with your data
- Resend API sends email
- Function returns success

### 2. Email Delivered 📧
- Resend queues the email
- Sends to recipient's email provider
- Arrives in inbox (usually within 30 seconds)
- Shows professional formatting

### 3. User Sees 👀
- Professional HTML email
- Personalized with their data
- Clear call-to-action if needed
- ClaimFlow branding

---

## Troubleshooting

### ❌ "RESEND_API_KEY not configured"
**Fix**: Check Supabase Secrets
```bash
supabase secrets list
```
Should show: `RESEND_API_KEY | *...`

### ❌ "recipientEmail and type are required"
**Fix**: Check request body
```json
{
  "recipientEmail": "user@example.com",  // ✓ Required
  "type": "claim_submitted",             // ✓ Required
  "data": { ... }                        // ✓ Optional but needed for template
}
```

### ❌ "Invalid email type"
**Fix**: Use one of these values:
- `claim_submitted`
- `claim_approved`
- `claim_rejected`
- `user_created`
- `password_reset`

### ❌ Email not received
**Fix**: Check Resend dashboard
- Log in to https://resend.com/dashboard
- Check email delivery status
- Verify API key has credits
- Check spam folder

---

## Files Created/Updated

### New Files ✨
- `supabase/functions/send-notification/emailTemplates.ts` - Email templates
- `EMAIL_INTEGRATION_GUIDE.md` - Complete integration guide
- `EMAIL_SYSTEM_SUMMARY.md` - Implementation summary
- `INDEX_TS_REFERENCE.md` - Detailed index.ts reference
- `QUICK_START.md` - This file

### Updated Files 🔄
- `supabase/functions/send-notification/index.ts` - Main handler with templates

---

## Next: Monitor & Maintain

### Check Function Logs
```bash
supabase functions logs send-notification
```

Look for these success logs:
```
✅ Email sent successfully! Message ID: email_xxx
```

### Monitor Email Delivery
1. Log in to Resend: https://resend.com/dashboard
2. Go to "Emails" section
3. See delivery status for each email sent
4. Check bounce/unsubscribe rates

### Add More Email Types
1. Create new template function in `emailTemplates.ts`
2. Add to `getTemplate()` switch statement
3. Deploy: `supabase functions deploy send-notification`
4. Call with new type from frontend

---

## Performance Tips

✅ **Do This:**
- Wrap calls in try-catch
- Log failures gracefully
- Don't wait for email to send (async/fire-and-forget)
- Batch emails if sending many

❌ **Don't Do This:**
- Block claim submission waiting for email
- Expose RESEND_API_KEY in frontend
- Send without validating email address
- Retry failed emails indefinitely

---

## Summary

You now have a **complete, production-ready email notification system** with:

✅ 5 professional email templates
✅ Type-safe template selection
✅ Comprehensive error handling
✅ Detailed logging for debugging
✅ CORS support for frontend calls
✅ Resend API integration
✅ Ready for deployment

**Ready to send emails?** Deploy with one command:
```bash
supabase functions deploy send-notification
```

Then integrate into your claims workflow and watch professional emails land in user inboxes! 🚀
