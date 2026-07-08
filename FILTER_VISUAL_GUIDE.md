# Visual Guide: New Claim History Filters

## Where to Find It
**Path:** http://localhost:8080/ → History Tab → Scroll Down

---

## Layout on Desktop

```
┌─────────────────────────────────────────────────────────────────────┐
│ 🔍 FILTERS                                                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  [Search]              [User ▼]      [Project/Site ▼]              │
│  Claim, user, site...  All users     All sites                      │
│                        ├ user1       ├ NYC Project                  │
│  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬     ├ user2       ├ LA Project                   │
│  (Real-time search)    ├ user3       └ Boston Project               │
│                        └ more        (Dynamic from data)             │
│                                                                       │
│  [Status ▼]            [Category ▼]   [Amount Range]               │
│  All statuses          All categories  Min ▬ Max ▬                 │
│  ├ Pending             ├ Travel        (0-999999)                   │
│  ├ Approved            ├ Meals                                      │
│  ├ Rejected            ├ Hotels        (Real-time filters)          │
│  ├ Accounts Processing └ Transport                                  │
│  └ Paid                                                              │
│                                                                       │
│  [Apply Filter]  [Reset All]                                        │
│                                                                       │
│  Showing 12 of 45 claims                                            │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Layout on Mobile

```
┌──────────────────────────────────┐
│ 🔍 FILTERS                       │
├──────────────────────────────────┤
│                                  │
│ [Search_________________]        │
│ Claim, user, site...             │
│                                  │
│ [User ▼]                         │
│ All users                        │
│                                  │
│ [Project/Site ▼]                 │
│ All sites                        │
│                                  │
│ [Status ▼]                       │
│ All statuses                     │
│                                  │
│ [Category ▼]                     │
│ All categories                   │
│                                  │
│ [Min_____] [Max_____]            │
│ Amount Range                     │
│                                  │
│ [Apply]  [Reset]                 │
│                                  │
│ Showing 12 of 45 claims          │
│                                  │
└──────────────────────────────────┘
```

---

## Example Filter Combinations

### Scenario 1: Find Recent Travel Expenses
1. **Category Filter:** Select "Travel"
2. **Amount Filter:** Min: 100, Max: 5000
3. Result: Shows only claims with travel expenses between 100-5000

### Scenario 2: Find Pending Claims by Specific User
1. **User Filter:** Select "john.doe@company.com"
2. **Status Filter:** Select "Pending"
3. Result: Shows only pending claims from John Doe

### Scenario 3: Search for Specific Site's Expenses
1. **Search:** Type "NYC"
2. **Project/Site Filter:** Select "NYC Project"
3. Result: Shows all claims mentioning NYC or from NYC Project site

### Scenario 4: Find Claims Ready for Payment
1. **Status Filter:** Select "Accounts Processing"
2. **Amount Filter:** Min: 1000
3. Result: Shows high-value claims in accounts processing

---

## Key Features

### 🔍 Search Box
- **What it searches:** Claim ID, User Name, User Email, Site Name, Customer Name
- **Case:** Case-insensitive
- **Type:** Real-time (no need to click anything)
- **Clears with:** Reset button

### 📍 Project/Site Filter
- **Populated from:** Unique sites in all claims
- **Updates when:** New claims added with new sites
- **Behavior:** Shows only claims from selected site

### 📊 Status Filter
- **Possible values:** Pending, Approved, Rejected, Accounts Processing, Paid, Closed
- **Updated from:** Claim status field
- **Behavior:** Shows only claims with selected status

### 🏷️ Category Filter
- **Populated from:** Unique categories in expense items
- **Updates when:** New expense categories added
- **Behavior:** Shows claims that contain the selected expense category

### 💰 Amount Range
- **Min Amount:** Minimum total claim amount
- **Max Amount:** Maximum total claim amount
- **Range:** 0 to infinity (or your max claim amount)
- **Inclusive:** Both bounds included (amount >= min AND amount <= max)

### 📈 Result Counter
- **Format:** "Showing X of Y claims"
- **Updates:** In real-time as filters change
- **Includes:** Only visible filtered claims

### 🔄 Reset Button
- **Clears:** ALL filters at once
- **Resets:** Search, Status, Site, Category, Amount Range
- **Keeps:** User filter (for manager/employee views)
- **Effect:** Shows all available claims again

---

## User Experience

### Before Clicking Apply
- Filters work immediately (real-time)
- You can type in search and see results instantly
- No need to click "Apply" button
- "Apply" and "Reset" buttons are for batch operations

### After Resetting
- All dropdowns show "All [items]"
- Search box becomes empty
- Amount fields clear
- Result counter updates to show total

### Selection Workflow
1. **Select Filters** → Results update live
2. **Review Results** → See count update
3. **Refine Further** → Add more filters
4. **Download** → PDF or CSV uses filtered results
5. **Reset** → Start over with fresh view

---

## Integration Points

### Affects These Operations
- ✅ PDF Report Download - Uses filtered claims
- ✅ CSV Export - Uses filtered claims
- ✅ Claim Selection - Select/deselect works on filtered view
- ✅ Bulk Download - Selected PDF uses filtered results
- ✅ Result Counter - Shows filtered count

### Doesn't Affect
- ❌ Load more button - Still loads all claims
- ❌ Server pagination - Uses backend API
- ❌ Approval workflows - Works on raw claims

---

## How It Works Technically

```
User Input → Filter State → Derived "filteredClaims" → UI Render
    ↓              ↓                    ↓                  ↓
Search      { search,      Claims.filter((claim) → Display
Category    status,        conditions)   only
Amount      site,    →     displayedClaims
            category,       
            minAmount,      
            maxAmount }     
```

**Key Insight:** The filter logic runs in-memory (client-side), so it's instant with no server round-trip needed.

---

## Next Steps

1. ✅ Open http://localhost:8080/
2. ✅ Go to History tab
3. ✅ Scroll to see the filters
4. ✅ Try filtering (they work immediately)
5. ✅ Click Reset to clear all
6. ✅ Test PDF/CSV export with filters applied
7. ✅ Test on mobile view

Enjoy your new filtering powers! 🎉
