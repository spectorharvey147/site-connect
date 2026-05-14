# 🚀 Getting Started - Email System

> **TL;DR:** Read [EMAIL_QUICK_REFERENCE.md](EMAIL_QUICK_REFERENCE.md) then run `await testSendEmail('test@email.com', 'user_created', {})`

---

## ⚡ Quick Start (2 Minutes)

### Step 1: Open Browser Console
Press `F12`, go to **Console** tab

### Step 2: Run This Command
```javascript
await testSendEmail('your@email.com', 'user_created', { name: 'Test' })
```

### Step 3: Check Results
- ✅ See `SUCCESS` message in console
- 📧 Email arrives in inbox within 30 seconds
- 🎉 Done!

---

## 📚 Documentation Guide

**Choose your path:**

### 🏃 I Want to Test Right Now
→ [EMAIL_QUICK_REFERENCE.md](EMAIL_QUICK_REFERENCE.md)

### 🔧 I'm Getting an Error
→ [DEBUG_EMAIL_401_ERROR.md](DEBUG_EMAIL_401_ERROR.md)

### 📖 I Want to Understand Everything
→ [EMAIL_DEBUGGING_COMPLETE.md](EMAIL_DEBUGGING_COMPLETE.md)

### 🏗️ I Want to See the Architecture
→ [ARCHITECTURE_DIAGRAMS.md](ARCHITECTURE_DIAGRAMS.md)

### ✅ I Want to Verify Setup
→ [VERIFICATION_CHECKLIST.md](VERIFICATION_CHECKLIST.md)

### 📑 I Want an Overview
→ [EMAIL_SYSTEM_INDEX.md](EMAIL_SYSTEM_INDEX.md)

---

## 🧪 Testing Commands

Copy and paste into browser console:

### Quick Tests
```javascript
// Single email test
await testSendEmail('test@example.com', 'user_created', { name: 'Test' })

// Or use quick test functions
await quickEmailTests.testUserCreated()
await quickEmailTests.testClaimSubmitted()
await quickEmailTests.testClaimApproved()
await quickEmailTests.testClaimRejected()
```

### Verify Setup
```bash
# In terminal
node validate-email-setup.js
```

---

## ❓ Troubleshooting

| Problem | Solution |
|---------|----------|
| `ReferenceError: testSendEmail is not defined` | Restart dev server: `npm run dev` |
| `undefined` for environment variables | Hard refresh: `Ctrl+Shift+R` |
| 401 Unauthorized error | Read [DEBUG_EMAIL_401_ERROR.md](DEBUG_EMAIL_401_ERROR.md) |
| Email not received | Check spam folder, wait 30 seconds |

---

## 🎯 Common Scenarios

### Scenario 1: Test All Email Types
```javascript
await quickEmailTests.testUserCreated()
await quickEmailTests.testClaimSubmitted()
await quickEmailTests.testClaimApproved()
await quickEmailTests.testClaimRejected()
```

### Scenario 2: Test Custom Email
```javascript
await testSendEmail('custom@email.com', 'user_created', {
  name: 'John Doe',
  role: 'Manager'
})
```

### Scenario 3: Debug Issues
```javascript
// Check if variables are loaded
console.log(import.meta.env.VITE_SUPABASE_URL)

// Check Network tab (F12 → Network)
// Then run a test and look for /functions/v1/send-notification
```

---

## 📋 System Status

✅ **All Systems Operational**
- Validation: 21/21 checks passed
- Backend: ✓ Working (verified via Thunder Client)
- Frontend: ✓ Configured correctly
- Documentation: ✓ Complete
- Testing: ✓ Ready

---

## 🔑 Key Files

| File | Purpose |
|------|---------|
| `.env` | Configuration (Supabase keys) |
| `src/integrations/supabase/client.ts` | Supabase SDK setup |
| `src/pages/EmailTest.tsx` | Email test UI page |
| `supabase/functions/send-notification/` | Backend email function |
| `src/lib/email-test-helpers.ts` | Browser console helpers |

---

## ✅ What Was Set Up

- ✅ Enhanced error logging in frontend
- ✅ Browser console test helpers
- ✅ Validation script (21 checks)
- ✅ Debug utilities
- ✅ Complete documentation (8 guides)
- ✅ Architecture diagrams
- ✅ Integration examples
- ✅ Checklists & guides

---

## 🎬 Next Steps

1. **Verify it works:**
   ```javascript
   await testSendEmail('test@email.com', 'user_created', {})
   ```

2. **Read the guide:**
   - Open [EMAIL_QUICK_REFERENCE.md](EMAIL_QUICK_REFERENCE.md)
   - 5-minute read

3. **Integrate (optional):**
   - Read integration section in [EMAIL_DEBUGGING_COMPLETE.md](EMAIL_DEBUGGING_COMPLETE.md)
   - Add email calls to claims-api.ts

4. **Deploy:**
   - Use [VERIFICATION_CHECKLIST.md](VERIFICATION_CHECKLIST.md) before going live

---

## 💡 Pro Tips

1. **Open all docs:** Click the links above
2. **Quick help:** Check [EMAIL_QUICK_REFERENCE.md](EMAIL_QUICK_REFERENCE.md)
3. **Browser console:** Press F12 to see debug logs with 🔧 and 📧 emoji
4. **Network tab:** Check actual API responses under Network → /functions/v1/send-notification
5. **Automation:** Run `node validate-email-setup.js` to verify everything

---

## 🆘 Still Stuck?

1. **For 401 errors:** [DEBUG_EMAIL_401_ERROR.md](DEBUG_EMAIL_401_ERROR.md)
2. **For setup questions:** [EMAIL_DEBUGGING_COMPLETE.md](EMAIL_DEBUGGING_COMPLETE.md)
3. **For how it works:** [ARCHITECTURE_DIAGRAMS.md](ARCHITECTURE_DIAGRAMS.md)
4. **For checklists:** [VERIFICATION_CHECKLIST.md](VERIFICATION_CHECKLIST.md)

---

## 📱 Quick Reference

**Browser Console:**
```javascript
// Test email
await testSendEmail('email@example.com', 'user_created', {})

// Quick tests
await quickEmailTests.testUserCreated()

// Check variables
import.meta.env.VITE_SUPABASE_ANON_KEY
```

**Terminal:**
```bash
# Start dev server
npm run dev

# Validate setup
node validate-email-setup.js
```

**Browser DevTools:**
- F12 → Console: See debug logs with emoji
- F12 → Network: Check API response

---

## 🎓 Learning Path

```
START
  ↓
[Quick Reference] (5 min)
  ↓
Browser Console Test
  ↓
Works? ✅ → [Skip to Integration]
  ↓ ❌
[Debug Guide] (10 min)
  ↓
Still stuck?
  ↓
[Complete Guide] (15 min)
  ↓
[Architecture] (visual)
  ↓
RESOLVED ✅
```

---

## 🎉 Success!

**When email system works:**
- ✅ Test command shows SUCCESS
- ✅ Email arrives in inbox
- ✅ No console errors
- ✅ Network shows 200 status
- ✅ All 21 validation checks pass

**You're ready to:**
- 🧪 Test more scenarios
- 🔗 Integrate into your app
- 🚀 Deploy to production

---

**Start here:** [EMAIL_QUICK_REFERENCE.md](EMAIL_QUICK_REFERENCE.md)  
**Questions?** Check the guides above  
**Ready?** Run: `await testSendEmail('test@email.com', 'user_created', {})`
