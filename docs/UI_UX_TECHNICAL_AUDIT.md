# ClaimFlow Pro UI/UX and Technical Audit

Audit date: 2026-05-14  
Workspace: `E:\Final claims\Site Connect`  
Audit scope: source code, route structure, design tokens, Supabase schema, docs, build/test/lint output, and browser inspection of public screens at `http://127.0.0.1:8080/`.

Note: authenticated pages were audited from source because no valid app credentials were available in the repo. Public login, forgot password, reset-password invalid state, claim-action empty state, email-test, and mobile login were browser-verified.

## 1. Executive Summary

ClaimFlow Pro is a claims, approvals, ledger, and payment voucher web application for field/site claim reimbursement workflows. The current app is feature-rich: it supports role-based navigation, claim submission with attachments, manager/admin/super-admin approval stages, user balances, ledger exports, payment vouchers, master data settings, audit logs, profile updates, and email/app notifications.

The product direction is sound, but the experience currently feels like a functional internal tool that has grown screen by screen rather than a cohesive finance operations product. It uses modern React, Tailwind, shadcn/Radix primitives, Lucide icons, Recharts, Sonner toasts, Supabase, and Capacitor. The visual system has a strong blue gradient/glass-card style, good use of icons, and some mobile card layouts. However, the app still has dense tables, repeated modal patterns, inconsistent currency rendering, several unlabeled icon controls, and limited information hierarchy for high-stakes approval decisions.

The most important technical risks are security and governance. The database policies allow broad anon access while relying on client-managed custom auth. Passwords are hashed with raw SHA256, roles are mainly enforced in UI navigation and client functions, and sensitive claim attachments are stored in public buckets. These should be addressed before any major redesign rollout.

Verification summary:

- `npm run build` passes.
- `npm test` passes, but coverage is only one example test.
- `npm run lint` fails with 192 errors and 19 warnings, mostly `any` usage, hook dependency warnings, stale generated Android build output in lint scope, and a few real logic issues.
- Production build warns about large chunks: `index` around 672 kB minified and `DashboardView` around 407 kB minified, mainly from charts and shared dependencies.

Recommended redesign direction: enterprise SaaS, clean dashboard, data-heavy UX, productivity-focused UI. Avoid a decorative marketing feel. Keep the app operational, dense, and fast, but modernize the shell, simplify forms, unify tables and drawers, and create a proper finance-oriented design system.

## 2. Project Overview

### Product/App Name

- Primary app name in code/docs: ClaimFlow Pro.
- Runtime branding from current company settings/browser inspection: Irrigation Products International Pvt Ltd, Claims Management System.
- Workspace/folder name: Site Connect.

### Purpose Of The Application

ClaimFlow Pro manages employee/site expense claims from submission to approval and settlement. It centralizes claim creation, receipt upload, role-based approval, balance tracking, ledger entries, vouchers, audit logs, company settings, master dropdown data, and email/in-app notifications.

### Target Users/Personas

- Site user or employee: submits expenses, uploads bills, checks balance/history.
- Manager: reviews assigned team claims, approves or rejects, monitors assigned employees.
- Admin: verifies claims, manages users, configures settings/master data, reviews ledgers and reports.
- Super Admin: final approval authority, closes claims, oversees system-wide financial controls.
- Finance/accounts user: creates payment vouchers and exports ledger/claim reports.
- IT/operator: configures Supabase, email function, storage buckets, release/deployment.

### Main Business Goals

- Reduce reimbursement cycle time.
- Enforce multi-stage approval control.
- Keep an auditable record of claims and decisions.
- Maintain user advance/current balance visibility.
- Standardize cost categories, project codes, and claim documentation.
- Generate payment voucher outputs for accounting.
- Notify stakeholders when action is required.

### Core Workflows/User Journeys

- Login and password reset.
- First admin setup when no admin exists.
- Submit claim with one or more expense rows and bill attachments.
- Admin verification, manager approval, final super-admin approval.
- Rejection with reason.
- Claim history search/filter/export.
- Ledger statement filter/export.
- Payment voucher generation from approved claims.
- User CRUD, role assignment, manager mapping, advance credit.
- Settings/master data configuration.
- Profile image/password update.
- Notification review and read/unread management.

### Existing Problems Or UX Issues

- Dense data screens depend heavily on tables and modal detail views.
- Multi-stage approval responsibilities are not visually differentiated enough.
- Currency rendering is inconsistent: some screens use `Rs.`, some contain mojibake such as `â‚¹`.
- Public auth screens are polished, but the main app appears more utilitarian and fragmented.
- Repeated claim detail, attachment, and approval modals should be consolidated into one canonical detail drawer.
- Mobile support is partly strong, but finance/admin tables and voucher content remain hard to use on small screens.
- Some icon-only controls have no accessible name.
- Error, empty, loading, and success states exist but are inconsistent in tone and placement.
- Role-based navigation hides screens, but routes are not centrally guarded.

### Competitor References

No explicit competitor references were found in the repo. Useful benchmark categories:

- Expense/reimbursement SaaS: Zoho Expense, SAP Concur, Expensify, Fyle.
- Workflow/approval products: Kissflow, Pipefy, ServiceNow workflow modules.
- Finance operations dashboards: Ramp/Brex-style spend controls, internal ERP approval queues.

The best reference direction for this app is not a consumer expense app. It should feel like a controlled enterprise claims desk with quick scanning, strong auditability, and low-friction repeated approvals.

## 3. Tech Stack Details

### Frontend

| Area | Current implementation | Audit notes |
| --- | --- | --- |
| Framework/library | React 18.3.1, TypeScript | Modern baseline. |
| Build tool | Vite 5.4 with `@vitejs/plugin-react-swc` | Build passes. |
| Routing | `react-router-dom` v6, nested routes in `src/App.tsx` | Clear route map. React Router v7 future warnings appear in console. |
| State management | React state/effects, `AuthContext`, `ThemeContext` | No dedicated domain store. TanStack Query provider is mounted but not used. |
| Server state | Direct Supabase calls in `src/lib/claims-api.ts` | Business logic is client-heavy and hard to secure. |
| UI component libraries | shadcn-style components, Radix UI primitives, Lucide icons | Good foundation. Component inventory is broad. |
| CSS methodology | Tailwind utility classes, CSS variables in `src/index.css` | Good token base, but stale `App.css` and `src/styles/global.css` remain. |
| Styling system | shadcn tokens, custom `glass-card`, `stat-card`, gradients, dark mode class | Visually cohesive in places but overuses blue/glass. |
| Animation libraries | `tailwindcss-animate`, CSS keyframes | No reduced-motion handling for custom gradient/page animations. |
| Forms | Mostly local `useState` forms | `react-hook-form` and `zod` are installed but not meaningfully used in app forms. |
| Validation | Manual inline checks and toasts | Inconsistent and hard to reuse. |
| Charts | Recharts in Dashboard | Good capability but large chunk. |
| Notifications/toasts | Sonner plus shadcn toast provider | Two toaster systems are mounted. |
| Responsive framework | Tailwind breakpoints plus mobile bottom nav, cards, drawers | Mixed maturity across pages. |
| Mobile app wrapper | Capacitor 7 with Android project | Camera capture integrated in file upload. |

### Backend

| Area | Current implementation | Audit notes |
| --- | --- | --- |
| Backend framework | Supabase Postgres, Storage, Edge Functions | No conventional REST/GraphQL backend. |
| API architecture | Frontend calls Supabase tables/functions directly | Fast to build but centralizes business rules in client. |
| Authentication | Custom users/sessions table, SHA256 password hash, token in localStorage | High risk. Needs hardened server-side auth and password hashing. |
| Database | Supabase Postgres | Schema includes users, sessions, claims, expense_items, transactions, app_lists, company_settings, notifications, audit_logs, password_resets. |
| ORM | None | Uses Supabase JS query builder. |
| Hosting/cloud | Vercel for web, Supabase for backend, Capacitor Android build | Vercel SPA rewrite configured. |
| Storage/CDN | Supabase storage buckets: claim-attachments, company-assets, user-avatars | Buckets are public. Claim receipts/attachments should not be public for production. |
| Email | Supabase Edge Function `send-notification`, Nodemailer/Gmail SMTP | Function validates CORS/origin and template type. |

### DevOps

| Area | Current implementation | Audit notes |
| --- | --- | --- |
| CI/CD | No `.github` workflow found | Add CI for build, lint, test, typecheck. |
| Deployment platform | Vercel, documented in `docs/DEPLOYMENT_AND_RELEASE_GUIDE.md` | Current `vercel.json` has security headers and SPA rewrites. |
| Monitoring/logging | Browser console, Supabase function logs, manual docs | No Sentry, LogRocket, OpenTelemetry, or structured app monitoring found. |
| Testing | Vitest configured; one example test | Needs workflow and domain coverage. |
| Linting | ESLint configured | Currently failing. Scope includes generated Android build output. |

### Design

| Area | Current implementation | Audit notes |
| --- | --- | --- |
| Design system | shadcn/Radix primitives plus custom Tailwind utilities | Good start, no documented component usage guidelines. |
| Tokens | CSS variables in `src/index.css`, Tailwind config extensions | Primary blue, dark sidebar, semantic success/warning/info/destructive tokens. |
| Typography | Inter via Google Fonts, Tailwind font scale | Good readable base; hierarchy is sometimes weak in dense tables. |
| Color system | Blue primary, green success, amber warning, red destructive, neutral surfaces | Good semantic intent, but warning on white text can fail contrast and overall palette is blue-heavy. |
| Component structure | `src/components/ui` primitives, feature views in `src/components/views` | Clear folders. Feature components are large and duplicate patterns. |

## 4. Global Design System Audit

### Branding

- Brand personality: professional, operational, finance-admin focused.
- Visual tone: modern SaaS with blue gradient, glass cards, rounded components, icon-led navigation.
- Design style: internal dashboard with a polished auth shell; main pages use repeated cards/tables.
- Accessibility level: basic semantic components from Radix/shadcn help, but custom controls and table-heavy screens need work.

### Typography

- Font family: Inter, loaded from Google Fonts.
- Font scale: Tailwind `xs` through `4xl`, with utility classes such as `text-display`, `text-title`, `text-heading`.
- Heading hierarchy: page headings are mostly `h2`; card/table sections use `h3/h4`. Some pages lack a consistent `PageHeader` structure.
- Readability issues:
  - Numeric tables use regular proportional numbers; finance values would benefit from `font-variant-numeric: tabular-nums`.
  - Long labels in charts and table cells can truncate without full context.
  - Mobile screens often mix very large amount text with small metadata, which is useful, but needs consistent hierarchy.

### Colors

- Primary: HSL 217 91% 60%, rendered as bright blue.
- Secondary/accent/info: similar blue family.
- Success: green HSL 142 71% 45%.
- Warning: amber HSL 38 92% 50%.
- Destructive: red HSL 0 84% 60%.
- Sidebar: dark blue/slate.
- Contrast/accessibility:
  - Blue with white generally works.
  - Warning foreground is white on amber, likely weak for small text.
  - Status badges use colored backgrounds and text, which helps.
  - Some muted text is low emphasis but likely acceptable on white; verify WCAG in final redesign.
- Palette issue: the UI reads as heavily blue. The brand logo introduces green, but the system does not use it enough.

### Spacing

- Tailwind spacing extensions include xs, sm, md, lg, xl, 2xl, 3xl.
- Containers: Tailwind `container` max 1400px, custom `container-wide`.
- Main content: desktop has left offset for 70px collapsed sidebar and safe-area padding; mobile bottom nav adds bottom padding.
- Breakpoints: mostly `sm`, `md`, `lg`, `xl`; mobile cards start around `md`.
- Issues:
  - Some pages use `p-6`, others `p-4`, and tables use inconsistent cell padding.
  - Settings and voucher pages can become visually crowded because filters, forms, and tables are stacked without a common section rhythm.

### Components

Buttons:
- shadcn `Button` plus custom class utilities.
- Strong icon use.
- Several icon-only buttons need `aria-label`.
- Destructive and success actions are visible but should be more consistently grouped.

Inputs/selects:
- shadcn Input/Select/Label.
- Many `Label` components are not linked via `htmlFor`, especially around Select controls.
- Validation is mostly toast-based and not always inline.

Cards:
- `glass-card`, `card-base`, `card-elevated`, `stat-card`.
- Cards are used heavily. Good for dashboard and forms; less good when page sections become nested-card-like.

Tables:
- Used across history, approvals, ledger, balances, vouchers, users, audit.
- Overflow-x handles desktop overflow, but mobile needs more card alternatives.
- No visible column sorting, saved filters, density controls, or sticky bulk actions.

Modals/drawers:
- Radix Dialog plus custom `ResponsiveOverlay` that switches to Vaul Drawer on mobile.
- Strong foundation; repeated claim details should become one shared component.

Navigation:
- Desktop collapsible icon sidebar, mobile bottom nav plus bottom sheet menu.
- Good mobile affordance for primary submit action.
- Desktop collapsed sidebar may be hard to discover without tooltips.

Dropdowns/tabs/toasts/loaders:
- Radix Select/Dropdown primitives, Sonner toasts, skeletons, spinners.
- Toasts are used for most validation, which can be missed by screen-reader and keyboard users.

### Interactions

- Hover states exist for buttons, cards, table rows, and nav.
- Active states exist in sidebar and mobile nav.
- Animations: page fade/slide, button active scale, card hover elevation, gradient background motion.
- Empty states: present but plain text-only in many tables.
- Error states: present in auth/settings/user/profile, often generic.
- Success states: toasts.
- Missing interaction polish:
  - Need consistent focus-visible states for custom buttons.
  - Need confirmation modals instead of `confirm()` for destructive operations.
  - Need action-specific disabled/loading states across all tables.
  - Need clear undo/recover paths for delete/deactivate.

## 5. Page-By-Page Analysis

### Global Authenticated App Shell

Route/URL: wraps `/`, `/submit`, `/history`, `/ledger`, `/transactions`, `/balances`, `/manager-approval`, `/admin-approval`, `/final-approval`, `/voucher`, `/users`, `/settings`, `/audit`, `/profile`

Purpose:
- Provides authenticated layout, desktop sidebar, header, notification bell, theme toggle, logout, and mobile bottom nav.
- Primary user goal: move quickly between operational work areas.

Layout:
- Header: sticky `glass-card` with company logo, app title, user name/role, notification bell, theme toggle, avatar, logout.
- Sidebar: desktop fixed left rail, collapsed at 70px and expandable to 240/280px.
- Footer: no footer; mobile bottom nav acts as persistent navigation.
- Sections: main content rendered via `Outlet`.
- Grid/layout: left rail plus content, mobile bottom bar plus bottom sheet menu.

Components Used:
- AppSidebar, AppHeader, MobileBottomNav, NotificationBell, Avatar, Sheet, Button, icons.

Content Structure:
- Company and user context in header.
- Role-specific navigation items in sidebar/sheet.
- Submit Claim emphasized as floating center action on mobile.

UX Analysis:
- Strengths: role-aware nav, compact desktop rail, strong mobile primary action, theme toggle.
- Weaknesses: no route-level role guard; hidden nav text in collapsed sidebar lacks tooltips; logout appears both sidebar and header; command palette exists but is not mounted.
- Friction points: sidebar expand/collapse may close after navigation and force repeated opening for multi-step admin work.
- Accessibility issues: sidebar toggle needs `aria-label`; notification bell needs `aria-label`; collapsed nav should provide tooltips.
- Mobile issues: bottom nav takes vertical space but main content has bottom padding; good baseline.

UI Style:
- Bright gradient sidebar/header card style; rounded controls; compact information.

Responsive Behavior:
- Desktop: fixed collapsed sidebar.
- Tablet: still desktop pattern from `md` upward.
- Mobile: bottom nav with More sheet.

User Flow:
- Entry: after login.
- Actions: navigate, logout, theme toggle, notifications.
- Exit: logout.

Performance Concerns:
- Notification polling every 30 seconds can create repeated reads.
- Header calls company settings separately from BrandingSync.

Redesign Suggestions:
- Add a stable enterprise sidebar with tooltips, breadcrumbs, and optional expanded default for admin roles.
- Add route guards for role-only pages.
- Consolidate header and branding fetch.
- Mount command palette intentionally or remove it.

### Login

Page Name: Login  
Route/URL: `/` when unauthenticated

Purpose:
- Authenticate users into the claims system.
- Primary user goal: sign in quickly.

Layout:
- Centered auth card on full blue gradient background.
- Card header contains logo, company name, subtitle.
- Body contains email/password, password visibility toggle, remember email, sign-in CTA, forgot-password link.

Components Used:
- Input, Label, Checkbox, Button, logo image, Lucide icons, inline error block.

Content Structure:
- Brand first, then credentials, then support action.
- CTA is full-width and clearly emphasized.

UX Analysis:
- Strengths: visually polished, simple, strong brand presence, remembered email support.
- Weaknesses: no explicit help/contact support link; no password requirements unless resetting; error handling is generic.
- Friction points: if Supabase or admin setup fails, the user sees only generic failures.
- Accessibility issues: password visibility icon button has no accessible name in DOM snapshot.
- Mobile issues: browser-verified at 390px wide; card fits well.

UI Style:
- Blue gradient, glass/card, rounded logo, high contrast white-on-blue header.

Responsive Behavior:
- Desktop: centered max-width card.
- Tablet: same centered card.
- Mobile: full-width card with comfortable touch targets.

User Flow:
- Entry: open root route.
- Actions: enter credentials, toggle password, remember email, forgot password, create admin if no admin exists.
- Exit: authenticated app shell or forgot/admin setup.

Performance Concerns:
- Initial load checks company settings and admin existence.
- Auth restore has an 8 second verification timeout.

Redesign Suggestions:
- Add support/contact microcopy.
- Add accessible labels to password visibility.
- Add better offline/backend unavailable state.
- Use a quieter background for enterprise tone, keeping the brand logo prominent.

### Forgot Password

Page Name: Forgot Password  
Route/URL: `/` when unauthenticated, internal login state

Purpose:
- Request a reset link.
- Primary user goal: recover access.

Layout:
- Same auth card/header as login.
- Single email field, helper text, send reset link CTA, back link.

Components Used:
- Input, Label, Button, Key icon, inline success/error block.

Content Structure:
- Minimal and direct.

UX Analysis:
- Strengths: simple flow, matches login styling.
- Weaknesses: success message says "Check your email" even if delivery is suppressed for privacy; okay security-wise but can be confusing.
- Accessibility issues: back button is a button styled as a link; acceptable but should have clear focus state.
- Mobile issues: browser-verified, fits well.

Performance Concerns:
- Depends on Supabase password reset table insert and email function.

Redesign Suggestions:
- Add "Return to sign in" as secondary button with consistent hierarchy.
- Add support contact for users who do not receive mail.

### First Admin Signup

Page Name: Create Admin Account  
Route/URL: `/` when no admin exists and user chooses setup

Purpose:
- Bootstrap the first admin user.
- Primary user goal: configure first administrator.

Layout:
- Same auth-card shell with shield icon header.
- Form fields for name, email, password, confirm password.

Components Used:
- Input, Label, Button, toast, error alert.

Content Structure:
- Form-only setup step.

UX Analysis:
- Strengths: prevents signup when admin exists; simple form.
- Weaknesses: lacks password strength guidance; no confirmation of organization/company setup.
- Accessibility issues: error summary is visual; should be announced.
- Mobile issues: responsive heights and inputs are fine.

Performance Concerns:
- Calls admin-existence check and writes directly to users table.

Redesign Suggestions:
- Make this a short setup wizard: organization, admin, security confirmation.
- Require stronger password policy and server-side validation.

### Reset Password

Page Name: Reset Password  
Route/URL: `/reset-password?email=...&token=...`

Purpose:
- Let a user set a new password from emailed token.
- Primary user goal: create a new password and return to login.

Layout:
- Auth-card shell with invalid, success, and form states.
- New password and confirm password fields with visibility toggles.

Components Used:
- Input, Label, Button, inline alerts, Lucide icons.

Content Structure:
- Clear state-specific heading.
- Form state has validation copy for minimum length.

UX Analysis:
- Strengths: handles invalid link and success redirect.
- Weaknesses: invalid route shows a good message, but no contact path.
- Accessibility issues: password toggle buttons need labels; validation should be linked to fields via `aria-describedby`.
- Mobile issues: same auth-card pattern should fit.

Performance Concerns:
- Uses custom password reset table and raw hash update from client.

Redesign Suggestions:
- Use a secure auth provider/password reset flow.
- Add password strength meter only if it does not slow the flow.

### Dashboard

Page Name: Dashboard Overview  
Route/URL: `/` authenticated, `/dashboard` redirects to `/`

Purpose:
- Summarize claims, users, amounts, pending approvals, manager assigned employees, and charts.
- Primary user goal: understand workload and claim status quickly.

Layout:
- Header card with title and Refresh.
- Role-specific stat card grid.
- Manager assigned employee table if manager.
- Monthly bar chart, category pie chart, status pie chart.

Components Used:
- Stat cards, Button, Recharts BarChart/PieChart, tables, icons, skeleton loaders.

Content Structure:
- Top-level metrics first.
- Process queue metrics second.
- Charts lower on page.

UX Analysis:
- Strengths: role-aware metrics; good quick summary; charts add useful trend/category/status views.
- Weaknesses: pie chart labels can be busy; stat cards are visually similar and lack action links; no "needs my action" prioritized queue.
- Friction points: dashboard does not directly route from cards to filtered queues.
- Accessibility issues: chart information needs accessible text/table equivalent.
- Mobile issues: stat grid collapses; charts may be cramped.

UI Style:
- Glass/stat cards, blue/green/amber/red icon colors.

Responsive Behavior:
- Desktop: 4-column admin stats, 3-column pending stats.
- Tablet: 2-column/3-column.
- Mobile: single column and full-width charts.

User Flow:
- Entry: after login.
- Actions: refresh, review metrics, scroll charts.
- Exit: navigate via sidebar/mobile nav.

Performance Concerns:
- `DashboardView` is the largest lazy chunk at about 407 kB minified.
- Recharts should be split or loaded only when chart data is visible.

Redesign Suggestions:
- Make dashboard action-led: "My approvals", "Claims awaiting verification", "Payment-ready claims".
- Replace or supplement pie charts with ranked lists for scanability.
- Add clickable stat cards with filtered navigation.
- Add accessible summaries for charts.

### Submit Claim

Page Name: New Claim Submission  
Route/URL: `/submit`

Purpose:
- Create a claim with project/site, expense rows, amounts with/without bill, and attachments.
- Primary user goal: submit a valid claim quickly.

Layout:
- Balance summary card with after-claim projection.
- Main form card.
- Project site and read-only user name.
- Expense details as mobile cards or desktop table.
- Attachment section and submit CTA.

Components Used:
- Input, Select, Label, Button, FileUpload, table, mobile cards, Sonner toasts.

Content Structure:
- Balance context first.
- Site selection before row-level cost code.
- Expense row totals and grand total.
- Attachments before final submit.

UX Analysis:
- Strengths: supports multiple expense rows; filters cost codes by project/category; requires bills if with-bill amount exists; mobile card layout is thoughtful.
- Weaknesses: desktop table has many fields and can feel spreadsheet-heavy; no draft/save; claim date is optional in UI but likely important; validation is toast-only.
- Friction points: user must understand "with bill" versus "without bill"; cost code dropdown is disabled until site/category are chosen.
- Accessibility issues: Select labels are not programmatically associated; toast-only validation can be missed.
- Mobile issues: mobile cards work well but can get long for many expenses.

UI Style:
- Functional card with clear primary button; table is compact.

Responsive Behavior:
- Desktop: horizontal editable table.
- Tablet: table remains with overflow.
- Mobile: each expense is its own card.

User Flow:
- Entry: nav or mobile plus action.
- Actions: select site, add rows, upload camera/gallery/PDF/JPEG, submit.
- Exit: success resets form and remains on submit page.

Performance Concerns:
- Client-side image compression can be CPU-heavy on mobile.
- `SubmitClaimView` chunk is about 32 kB, acceptable.

Redesign Suggestions:
- Convert to a guided claim builder with sticky running total.
- Add inline field errors and row-level validation.
- Add save draft and duplicate row.
- Use an `AmountInput` component with consistent currency formatting.
- Show attachment requirement beside relevant rows.

### Claim History

Page Name: Claim History  
Route/URL: `/history`

Purpose:
- Review submitted claims, filter/export, inspect details and attachments.
- Primary user goal: find claims and understand status/outcomes.

Layout:
- Filter card with user/date fields.
- Bulk selection summary card.
- Main data card with header actions.
- Mobile cards or desktop table.
- Claim details responsive overlay.
- PDF report preview overlay.

Components Used:
- Select, Input, Checkbox, Button, Badge, Skeleton, ResponsiveOverlay, AttachmentPreview, iframe report preview, CSV/PDF export.

Content Structure:
- Filters first, then selected-bulk context, then table.
- Row shows claim ID, date, user, site, amounts, status, action.

UX Analysis:
- Strengths: strong operational coverage; mobile cards; selected claims support; attachment previews; report preview.
- Weaknesses: no status filter in UI despite status being central; PDF "download" opens preview rather than direct download; selection state can be hard to track in long lists.
- Friction points: details action uses only an eye icon on desktop; bulk selected report flow needs clearer naming.
- Accessibility issues: row checkboxes need accessible names; status badges should not rely only on color.
- Mobile issues: mobile card is better than table, but filter stack can consume top of screen.

UI Style:
- Table/cards with colored status badges.

Responsive Behavior:
- Desktop: data table with overflow.
- Mobile: cards with prominent amount and action buttons.

User Flow:
- Entry: nav.
- Actions: filter, select, export CSV/PDF, view details/attachments.
- Exit: close overlay or navigate.

Performance Concerns:
- PDF generated as client-side HTML blob.
- `getClaimById` called per details view.

Redesign Suggestions:
- Add saved filters: Mine, Pending, Approved, Rejected, This Month.
- Use a right-side claim detail drawer as the canonical claim review surface.
- Add status timeline in claim detail.
- Clarify export actions: CSV, PDF Preview, Download PDF.

### Ledger Statement

Page Name: Ledger Statement  
Route/URL: `/ledger`, `/transactions`

Purpose:
- Show credit/debit ledger entries, running balance, and exports.
- Primary user goal: reconcile balance and export accounting records.

Layout:
- Header with title, description, PDF/Excel/Refresh actions.
- Filter band for user and date.
- Summary stat cards for entries, total credit, total debit.
- Ledger table.

Components Used:
- Select, Input, Button, table, export utilities.

Content Structure:
- Export actions at top right.
- Filters before summary.
- Ledger rows by date.

UX Analysis:
- Strengths: useful summary, user/date filtering, PDF and Excel export.
- Weaknesses: no mobile card alternative; no transaction type filter in UI though docs mention type filtering; no search.
- Friction points: "Credit/Debit" and amount split can be clearer with signed amounts.
- Accessibility issues: table needs caption and better row semantics.
- Mobile issues: horizontal table likely difficult.

UI Style:
- Clean card/table, muted filter band.

Responsive Behavior:
- Desktop: table.
- Tablet/mobile: overflow-x table.

User Flow:
- Entry: nav.
- Actions: filter, export, refresh.
- Exit: nav/export.

Performance Concerns:
- Client-side PDF generation is custom handwritten PDF content.
- Long ledgers can make table and PDF generation heavy.

Redesign Suggestions:
- Add transaction type/status filters.
- Add mobile ledger cards.
- Add running balance visualization and opening/closing balance.
- Export from backend for large data.

### User Balance Summary

Page Name: User Balance Summary  
Route/URL: `/balances`

Purpose:
- Show user-level advance, pending, approved, rejected, and current balances.
- Primary user goal: monitor balances across allowed users.

Layout:
- Header with export and refresh.
- Search box.
- Data table.

Components Used:
- Input, Button, table, Skeleton.

Content Structure:
- User identity first, financial columns right-aligned.

UX Analysis:
- Strengths: compact, searchable, exportable.
- Weaknesses: no mobile card view; currency encoding issues appear in source; no drill-down to user ledger or claims.
- Friction points: users cannot click balance rows to understand how balance was calculated.
- Accessibility issues: search input should have an explicit label.
- Mobile issues: table overflow.

UI Style:
- Simple table, colored financial columns.

Responsive Behavior:
- Desktop: table.
- Mobile: overflow table only.

User Flow:
- Entry: nav.
- Actions: search, export CSV, refresh.
- Exit: nav.

Performance Concerns:
- Balance calculation can involve per-user aggregation on client/API side.

Redesign Suggestions:
- Add user balance detail drawer with ledger/claims breakdown.
- Add status chips and role filter.
- Add mobile cards.

### Manager Approval

Page Name: Manager Approval  
Route/URL: `/manager-approval`

Purpose:
- Let managers review and approve/reject pending claims.
- Primary user goal: clear assigned approval queue.

Layout:
- Main card with title and Refresh.
- Mobile approval cards or desktop table.
- Approve overlay with claim summary, attachments, final approved amount, notes.
- Reject overlay with reason.
- Claim details overlay.

Components Used:
- Button, Badge, ResponsiveOverlay, Textarea, Input, AttachmentPreview, Skeleton.

Content Structure:
- Queue table/card lists amount, site, date, submitted by, with/without bill.
- Actions: details, approve, reject.

UX Analysis:
- Strengths: mobile cards are action-ready; approve modal includes attachments and amount adjustment.
- Weaknesses: manager approval and admin approval share the same component but labels vary; approval context could be stronger with risk flags and policy notes.
- Friction points: final approved amount is mandatory even when unchanged.
- Accessibility issues: desktop icon-only action buttons need labels; rejection reason required state is not tied to field.
- Mobile issues: cards are usable.

UI Style:
- Utility table/card with green/red actions.

Responsive Behavior:
- Desktop: table.
- Mobile: cards.

User Flow:
- Entry: role nav.
- Actions: view details, approve with notes/amount, reject with reason, refresh.
- Exit: queue updates after action.

Performance Concerns:
- Opening approve fetches full claim details separately.

Redesign Suggestions:
- Create a single "Approval Queue" pattern with tabs/stage labels.
- Show policy checklist, receipt status, duplicate warning, and balance impact.
- Provide approve unchanged shortcut plus amount adjustment affordance.

### Admin Verification

Page Name: Admin Verification  
Route/URL: `/admin-approval`

Purpose:
- Let admins verify claims and forward them to manager/final approval.
- Primary user goal: validate documentation and amounts.

Layout:
- Same ApprovalView structure with admin labels.

Components Used:
- Same as Manager Approval.

Content Structure:
- Queue of pending admin verification claims.
- Approve label: Verify & Forward.

UX Analysis:
- Strengths: supports verified amount and notes.
- Weaknesses: no explicit document verification checklist; admin cannot easily compare submitted vs verified per line item in table row.
- Friction points: determining why a claim is at admin stage requires details overlay.
- Accessibility issues: same as approval view.
- Mobile issues: mobile cards are usable.

Performance Concerns:
- `getPendingAdminClaims()` has no user/role parameter in route component; route should be guarded server-side.

Redesign Suggestions:
- Admin verification should be document-first: attachments, line items, exceptions, final amount.
- Add "request correction" as a distinct action if workflow supports it.

### Final Approval

Page Name: Final Approval  
Route/URL: `/final-approval`

Purpose:
- Let super admin close claims with final approval or rejection.
- Primary user goal: release/close payment-ready claims.

Layout:
- Same ApprovalView structure with final approval labels.

Components Used:
- Same as ApprovalView.

Content Structure:
- Queue of pending final approval claims.
- Approve label: Final Approve.

UX Analysis:
- Strengths: consistent with other approval queues.
- Weaknesses: final approval needs stronger accounting/payment context, not just claim context.
- Friction points: users must go to Payment Voucher separately after closure.
- Accessibility issues: same as approval view.
- Mobile issues: mobile cards are usable.

Performance Concerns:
- Same repeated details fetch.

Redesign Suggestions:
- Add grouped final approval batches by user/project/date.
- Connect final approval to voucher/payment readiness.
- Show audit trail before final approve.

### Payment Voucher

Page Name: Payment Vouchers  
Route/URL: `/voucher`

Purpose:
- Generate printable/exportable payment vouchers from approved/closed claims.
- Primary user goal: prepare finance voucher documentation.

Layout:
- Filter card.
- Selected-claims action card.
- Table of approved claims.
- Dialog with voucher preview, claim details, line items, signature blocks.

Components Used:
- Select, Input, Checkbox, Dialog, Button, table, HTML export/print.

Content Structure:
- Filters first.
- Selection summary appears when claims selected.
- Voucher preview contains company header, voucher metadata, line-item table, totals, amount in words, signatures.

UX Analysis:
- Strengths: business-critical voucher generation is implemented; supports combined vouchers; preview includes signatures and amount in words.
- Weaknesses: page is table-heavy and not mobile optimized; voucher preview is very dense; user directory mapping is loaded but paid-to can still become "Multiple Users" without grouped subtotals by user.
- Friction points: "Voucher" action is an eye icon plus text; bulk flow could be clearer.
- Accessibility issues: dialog title contains action buttons inside title row; table preview needs better semantics.
- Mobile issues: large voucher dialog/table will be hard on small screens.

UI Style:
- Finance document inside modal; minimal visual hierarchy.

Responsive Behavior:
- Desktop: table/dialog.
- Tablet/mobile: table overflow and large dialog.

User Flow:
- Entry: admin/super-admin nav.
- Actions: filter, select one/multiple, create voucher, print/export.
- Exit: close dialog/export.

Performance Concerns:
- Client-side HTML print/export and large DOM in dialog.

Redesign Suggestions:
- Use a voucher builder: selected claims panel, preview pane, grouped totals.
- Add "voucher batch" concept and saved voucher history.
- Provide A4 print stylesheet and PDF output from a server function.

### User Management

Page Name: User Management  
Route/URL: `/users`

Purpose:
- Admin CRUD for users, roles, manager assignments, active status, and advances.
- Primary user goal: maintain user directory and balances.

Layout:
- Error alert if loading fails.
- Main card with header actions.
- Mobile user cards or desktop table.
- Create user dialog.
- Edit user dialog.
- Add advance dialog.

Components Used:
- Button, Input, Select, Switch, Dialog, Badge, Skeleton, toasts, icons.

Content Structure:
- User list with name/email/role/manager/status/balance/actions.
- Dialog forms for create/edit.

UX Analysis:
- Strengths: mobile card view is good; key admin actions are present; active status is visible.
- Weaknesses: uses browser `confirm()` for delete; edit manager dropdown lists all users except self, not only manager/admin roles; create/edit validation is minimal.
- Friction points: Add Advance is icon-only in desktop table; unclear without tooltip.
- Accessibility issues: icon buttons need labels; switch controls need accessible names; confirm dialog is not accessible.
- Mobile issues: cards are usable.

UI Style:
- Clear role/status badges; compact table/actions.

Responsive Behavior:
- Desktop: table.
- Mobile: cards.

User Flow:
- Entry: admin nav.
- Actions: add, edit, activate/deactivate, delete, add advance, refresh.
- Exit: close dialogs.

Performance Concerns:
- `getAllUsers()` computes current balance per user, leading to N+1 queries.

Redesign Suggestions:
- Add user detail drawer with profile, ledger, claims, manager chain.
- Replace destructive confirm with AlertDialog.
- Add search/filter by role/status/manager.
- Add bulk import/export if user list grows.

### Settings

Page Name: Settings  
Route/URL: `/settings`

Purpose:
- Configure company branding, notification toggles, approval workflow, and dropdown master data.
- Primary user goal: maintain system configuration.

Layout:
- Company Settings card.
- Notification Settings card.
- Approval Workflow card.
- Dropdown Master Data card with add controls and list table.

Components Used:
- Input, Textarea, Select, Switch, Checkbox, Button, ImageUpload, table, toasts.

Content Structure:
- Company identity first.
- Notifications and workflow settings.
- Master data management last.

UX Analysis:
- Strengths: broad admin capability; logo upload; approval configuration; project code category mapping.
- Weaknesses: all settings appear in one long page; Save Settings only applies settings above, while master data add/delete is immediate; that distinction is easy to miss.
- Friction points: project code form expands into a wide complex panel inside an inline add row.
- Accessibility issues: switch controls need accessible names/descriptions; category checkboxes should be fieldset/legend.
- Mobile issues: master data table and project code form are dense.

UI Style:
- Card-based admin settings, clear section icons.

Responsive Behavior:
- Company grid collapses; master data still table-heavy.

User Flow:
- Entry: admin nav.
- Actions: upload logo, edit settings, save, add/delete master data.
- Exit: nav.

Performance Concerns:
- Multiple initial fetches: settings, app lists, dropdown options.

Redesign Suggestions:
- Split into tabs: Company, Notifications, Workflow, Master Data, Security.
- Add unsaved-changes detection.
- Add inline edit for master data and confirm delete.
- Show impact preview for approval workflow changes.

### Audit Trail

Page Name: Audit Trail  
Route/URL: `/audit`

Purpose:
- Review recent audit events.
- Primary user goal: inspect system actions and actor history.

Layout:
- Single card with title, search input, refresh button, table.

Components Used:
- Input, Button, table, action color pill.

Content Structure:
- Event time, action, performer, target, details.

UX Analysis:
- Strengths: searchable, readable action pills, compact.
- Weaknesses: no filters by actor/action/date; details are truncated; no mobile card layout.
- Friction points: cannot open claim/user target from audit row.
- Accessibility issues: action color should not be only signal; search input needs label.
- Mobile issues: table overflow.

UI Style:
- Simple audit table.

Responsive Behavior:
- Desktop: table.
- Mobile: overflow table.

User Flow:
- Entry: admin nav.
- Actions: search, refresh.
- Exit: nav.

Performance Concerns:
- Fetches latest 200 logs; no pagination.

Redesign Suggestions:
- Add timeline/card view, filters, and target links.
- Add severity/category icons.
- Add pagination or infinite scroll.

### My Profile

Page Name: My Profile  
Route/URL: `/profile`

Purpose:
- Show profile info, quick stats, avatar upload, and password change.
- Primary user goal: manage own account and check personal summary.

Layout:
- Profile info card with image upload.
- Three quick stat cards.
- Change password card.

Components Used:
- ImageUpload, Card, Badge, Input, Label, Button, toasts.

Content Structure:
- Identity first, stats second, security third.

UX Analysis:
- Strengths: useful personal summary; avatar update; password visibility toggle.
- Weaknesses: profile name/email not editable; password policy is inconsistent with reset flow (4 chars here vs 6 chars elsewhere); profile picture update reloads full page.
- Friction points: user must re-login context via full reload after avatar update.
- Accessibility issues: show/hide password button has text, better than icon-only; image upload needs alt/label clarity.
- Mobile issues: card stack works.

UI Style:
- Mixed custom glass cards and shadcn cards.

Responsive Behavior:
- Desktop: horizontal profile card plus 3-column stats.
- Mobile: stacked.

User Flow:
- Entry: nav.
- Actions: upload/remove avatar, change password.
- Exit: nav/logout.

Performance Concerns:
- Loads balance, claims, transactions concurrently.

Redesign Suggestions:
- Add account security panel with password rules, session info, and last login.
- Avoid page reload after avatar update by refreshing auth context.
- Align password rules across reset/profile.

### Claim Email Action

Page Name: Claim Email Action  
Route/URL: `/claim-action?claimId=...&action=approve|reject&role=...&approverEmail=...`

Purpose:
- Allow approval/rejection from email link.
- Primary user goal: take a quick claim action without navigating full app.

Layout:
- Centered card with claim metadata, amount, optional approved amount, rejection reason, details table, attachments, and action buttons.

Components Used:
- Card, Input, Textarea, Button, AttachmentPreview, table, loader.

Content Structure:
- Claim title, submitter/site/amount, action-specific input, claim details/attachments, approve/reject CTA.

UX Analysis:
- Strengths: supports email workflow and attachment review.
- Weaknesses: missing claim ID state still shows empty claim details before message; approve can auto-process for non-admin approve links, reducing review time but increasing accidental action risk.
- Friction points: no authentication/verification screen visible in this flow.
- Accessibility issues: table and action messages need better semantics.
- Mobile issues: centered card should fit, but line-item table can overflow.

Performance Concerns:
- Loads claim by URL parameter.

Redesign Suggestions:
- Add secure one-time action token instead of raw email/role query params.
- Show a clear confirmation step for approve.
- Use mobile card layout for expense lines.

### Email Test

Page Name: Email Test  
Route/URL: `/test/email`

Purpose:
- Developer/admin utility to invoke email notification function.
- Primary user goal: verify email delivery.

Layout:
- Centered card over blue gradient background.
- Email input, send button, result alerts, static test details.

Components Used:
- Card, Input, Label, Button, alerts, Mail icon.

Content Structure:
- Test email address first.
- Output messages below.
- Test payload details at bottom.

UX Analysis:
- Strengths: useful diagnostic route.
- Weaknesses: exposed route in production unless protected externally; has console debug logs and hard-coded test content.
- Accessibility issues: alerts are plain divs.
- Mobile issues: simple card likely works.

Performance Concerns:
- Directly invokes Supabase Edge Function.

Redesign Suggestions:
- Move to protected admin diagnostics area.
- Add environment/function status and last result metadata.

### Not Found

Page Name: 404 Page  
Route/URL: `*`

Purpose:
- Catch unknown routes.
- Primary user goal: return home.

Layout:
- Centered 404 message on muted background.

Components Used:
- Basic link and text.

Content Structure:
- 404 heading, message, home link.

UX Analysis:
- Strengths: simple and clear.
- Weaknesses: "Oops!" tone is less enterprise; uses `<a href="/">` full reload instead of router link.
- Accessibility issues: acceptable but minimal.
- Mobile issues: fine.

Performance Concerns:
- Logs route to console.

Redesign Suggestions:
- Use app branding, support link, and router navigation.

## 6. User Flows

### Authentication Flow

Steps:
1. User opens `/`.
2. AuthProvider checks saved `claimsToken`.
3. If token valid, app shell loads.
4. If no token, LoginPage loads.
5. User submits email/password.
6. Client hashes password with SHA256, compares via Supabase query, creates session row, stores token in localStorage.
7. User enters authenticated shell.

Pain points:
- Custom auth is high risk.
- Token storage in localStorage increases exposure to XSS.
- User sees generic failures for backend/config issues.
- Role access is not centrally enforced at route/backend level.

Opportunities:
- Move to Supabase Auth or a secure backend auth service.
- Add protected route and permission boundary.
- Add clear backend unavailable messaging.

### Onboarding Flow

Steps:
1. Login checks if admin exists.
2. If no admin exists, Create Admin Account button appears.
3. User creates first admin.
4. Admin signs in.
5. Admin configures company settings, app lists, users, managers, advances.

Pain points:
- Setup is split across login and Settings.
- No checklist for required master data before claims.

Opportunities:
- Add first-run setup wizard.
- Add setup completion checklist and sample data import.

### Dashboard Flow

Steps:
1. User lands on dashboard after login.
2. App loads summary and chart data.
3. User scans metrics/charts.
4. User navigates manually to relevant work area.

Pain points:
- Cards are not action links.
- Charts are secondary but heavy.

Opportunities:
- Add "requires my action" queue.
- Make metrics clickable with filtered destinations.

### Search/Filter Flow

Steps:
1. User opens History, Ledger, Balances, Audit, Voucher, or User Management.
2. User types search or sets filters.
3. User clicks Apply/Refresh in many pages.
4. User exports or opens details.

Pain points:
- Filters differ by page.
- Some pages have search, some only filters.
- No saved filters or clear active-filter chips.

Opportunities:
- Create common FilterBar component.
- Add filter chips, saved views, and status presets.

### Checkout/Payment Flow

There is no checkout/payment gateway. The relevant financial settlement flow is Payment Voucher.

Steps:
1. Admin/super admin opens Payment Voucher.
2. Filters approved/closed claims.
3. Selects one or multiple claims.
4. Creates voucher preview.
5. Exports HTML or prints.

Pain points:
- No saved voucher records.
- No payment status tracking.
- Voucher is generated client-side only.

Opportunities:
- Add voucher batches with IDs, statuses, and PDF archive.
- Add payment date/reference and reconciliation.

### CRUD Flows

User Management:
1. Add user.
2. Assign role/manager/advance.
3. Edit user.
4. Toggle active.
5. Delete user.
6. Add advance.

Settings/Master Data:
1. Edit company settings.
2. Save settings.
3. Add/delete category/project/project code.

Pain points:
- Destructive actions use browser confirm.
- Settings save behavior is mixed with immediate master data mutations.
- Minimal inline validation.

Opportunities:
- Standardize CRUD dialogs, confirmations, and inline validation.
- Add audit preview before destructive actions.

### Settings/Profile Flow

Steps:
1. Admin configures branding, notifications, workflow, master data.
2. User updates avatar/password from profile.

Pain points:
- Profile password policy inconsistent.
- Avatar update reloads page.
- Settings are long and untabbed.

Opportunities:
- Split settings tabs.
- Refresh user context after avatar upload.
- Centralize password policy.

### Notifications Flow

Steps:
1. NotificationBell polls every 30 seconds.
2. User opens dropdown.
3. User marks one or all read.

Pain points:
- Polling can be noisy.
- Dropdown is small for long notification text.
- No notification preferences per user.

Opportunities:
- Use realtime/subscriptions or smarter polling.
- Add notification center page/history.
- Add notification categories and deep links.

## 7. Accessibility Audit

### Color Contrast

- Most primary blue/white combinations are likely acceptable.
- Warning foreground is white on amber in tokens, likely insufficient for small text.
- Muted gray text should be checked against white/card backgrounds.
- Status should always include text, not just color. This is mostly true today.

### Keyboard Navigation

- Radix components provide good keyboard support.
- Custom icon buttons and cards need consistent focus-visible rings.
- Sidebar collapsed state should remain understandable by keyboard users.
- Browser `confirm()` should be replaced with accessible dialogs.

### Screen Reader Support

- Several icon-only buttons lack accessible names:
  - password visibility toggles in auth screens
  - notification bell
  - sidebar toggle
  - desktop table action buttons
- Tables need captions or contextual headings.
- Chart information needs text alternatives.

### Focus States

- shadcn controls include focus rings.
- Some custom `button` classes only have hover states.
- Destructive and success action focus treatment should be consistent.

### Semantic HTML

- Layout mostly uses headings, buttons, tables.
- Forms often use `Label` visually but not always with `htmlFor`.
- Status/alert messages should use `role="alert"` or ARIA live regions where appropriate.

### ARIA Usage

- Radix provides ARIA for Dialog, Select, Sheet/Drawer.
- Custom controls should add labels and descriptions.
- Bulk select checkboxes should have row-specific accessible labels.

### Responsive Accessibility

- Mobile bottom nav touch targets are large.
- Dense tables on mobile create horizontal scroll and cognitive load.
- Drawers are a good mobile pattern, but content inside them can still be table-heavy.

### Form Accessibility

- Add inline field messages connected with `aria-describedby`.
- Avoid toast-only validation for required fields.
- Group checkbox sets with fieldsets/legends.
- Amount fields should announce currency and constraints.

## 8. Responsive Design Audit

### Mobile-First Readiness

The app has deliberate mobile investment: login works well, mobile bottom nav is strong, Submit Claim and several queue/history/user pages switch to cards, and `ResponsiveOverlay` switches dialogs to drawers.

### Breakpoint Consistency

- Common breakpoint is `md` for switching tables/cards.
- Some pages still use table-only responsive behavior.
- Settings and voucher content need dedicated mobile layouts.

### Overflow Issues

- Tables use horizontal overflow, which prevents breakage but is not ideal UX.
- Voucher preview and audit/ledger/balance tables are most likely to overflow.
- Long project codes, descriptions, emails, and status labels can crowd columns.

### Touch Targets

- Mobile bottom nav targets are good.
- Form inputs use `h-11` in key mobile forms.
- Dense table icon buttons on desktop may be okay, but mobile equivalent should use labeled buttons.

### Mobile Navigation Usability

- Bottom nav has Home, History, Submit, Profile, More.
- More sheet exposes full menu with role filtering.
- Good pattern; add badges for pending approvals/notifications.

### Tablet Adaptation

- Tablet is partly treated as desktop from `md` upward.
- Admin users on tablets may benefit from expanded sidebar and denser two-pane layouts.

## 9. UX Issues List

High impact:

- Custom auth, broad Supabase policies, and public claim attachments create security risk.
- Role-only screens are not centrally route-guarded.
- Approval workflows lack a single clear claim review surface and policy checklist.
- Currency formatting is inconsistent and includes mojibake in several files.
- Lint is failing, which makes refactor safety weaker.

Medium impact:

- Dense finance/admin tables are not consistently mobile-friendly.
- Dashboard cards are informative but not actionable.
- Filters differ by page and lack active chips/saved views.
- Validation is often toast-only.
- Destructive actions use browser confirm.
- Query/data logic is large and concentrated in `claims-api.ts`.

Low impact:

- CommandPalette is present but not mounted.
- Stale CSS files remain (`App.css`, `src/styles/global.css`).
- Two toast systems are mounted.
- React Router v7 future warnings appear in console.

## 10. Component Inventory

### Existing Primitive Components

- Accordion, Alert, AlertDialog, AspectRatio, Avatar, Badge, Breadcrumb, Button, Calendar, Card, Carousel, Checkbox, Collapsible, Command, ContextMenu, Dialog, Drawer, DropdownMenu, Form, HoverCard, Input, InputOTP, Label, Menubar, NavigationMenu, Pagination, Popover, Progress, RadioGroup, Resizable, ResponsiveOverlay, ScrollArea, Select, Separator, Sheet, Sidebar, Skeleton, Slider, Sonner, Switch, Table, Tabs, Textarea, Toast, Toggle, ToggleGroup, Tooltip.

### Existing App Components

- AppHeader
- AppSidebar
- MobileBottomNav
- LoginPage
- AdminSignupForm
- BrandingSync
- CommandPalette
- NotificationBell
- ImageUpload
- FileUpload
- AttachmentPreview
- RupeeIcon
- NavLink

### Existing Page/View Components

- DashboardView
- SubmitClaimView
- ClaimHistoryView
- TransactionsView
- UserBalanceView
- ApprovalView
- PaymentVoucherView
- UserManagementView
- SettingsView
- AuditLogView
- UserProfileView
- ClaimAction
- ResetPassword
- EmailTest
- NotFound

### Missing/Recommended Product Components

- PageHeader with breadcrumb, title, description, primary actions.
- FilterBar with chips, reset, saved views.
- DataTable with sorting, column controls, empty states, pagination.
- ClaimDetailDrawer with timeline, documents, expenses, approvals, audit.
- ApprovalChecklist with policy and receipt verification states.
- AmountInput with currency prefix, precision, validation, tabular numerals.
- StatusPill with accessible status text.
- EmptyState with action and contextual guidance.
- ConfirmDialog for destructive operations.
- UserDetailDrawer.
- VoucherPreview with print/PDF layout component.
- NotificationCenter.

## 11. Suggested Design System

### Direction

Use a clean enterprise SaaS system with a finance operations personality:

- Calm neutral surfaces.
- Strong but restrained brand color.
- Clear semantic states.
- Dense but readable tables.
- Action-first approval queues.
- Document-style voucher/report previews.

### Suggested Tokens

Typography:

- Font: Inter.
- Body: 14px/20px for dense app UI, 16px/24px for form help text.
- Page title: 24px/32px semibold.
- Section title: 18px/28px semibold.
- Card title: 14px/20px semibold.
- Numeric values: tabular nums, semibold/bold depending hierarchy.

Color:

- Background: neutral 50/100.
- Surface: white/light card.
- Border: neutral 200.
- Text: neutral 900.
- Muted: neutral 500/600.
- Primary: brand teal/blue blend, not all-blue.
- Action blue: use for links and primary action.
- Success: green.
- Warning: amber with dark text.
- Danger: red.
- Info: cyan/blue.

Spacing:

- 4px base grid.
- Page padding: 24px desktop, 16px tablet, 12-16px mobile.
- Card padding: 16px for dense, 20-24px for forms.
- Table row heights: compact 44px, comfortable 52px.

Radius/shadow:

- Radius: 8px for cards/inputs/buttons.
- Shadows: minimal; rely on borders for enterprise clarity.
- Avoid heavy glass/backdrop effects inside work surfaces.

Components:

- Buttons: primary, secondary, ghost, destructive, success only where action stage requires it.
- Inputs: explicit labels, inline errors, helper text.
- Tables: sticky headers, sort, row selection, column visibility, density.
- Cards: use for stats, mobile rows, and real repeated items.
- Drawers: use for details/review; avoid nested modals.
- Toasts: use for completion, not primary validation.

## 12. Suggested Redesign Direction

Recommended directions:

- Enterprise: best fit for approvals, audit, roles, and financial data.
- Clean dashboard: dashboard should prioritize action queues and status health.
- Data-heavy UX: tables, filters, exports, and drill-downs matter.
- Productivity-focused UI: reduce clicks for repeated approval/admin tasks.
- Minimal: use restraint, but not at the cost of workflow clarity.

Directions to avoid as primary style:

- Glassmorphism: current login can keep a polished brand feel, but daily work pages should be clearer and less decorative.
- Neumorphism: low contrast, poor for enterprise accessibility.
- AI-native UI: possible future layer for claim anomaly detection or assistant search, not the main redesign foundation.

Modern UX patterns to introduce:

- Action queue dashboard.
- Two-pane list/detail layouts on desktop.
- Persistent filter bars with saved views.
- Timeline-based claim detail.
- Batch actions for approvals/vouchers.
- Inline validation and row-level error states.
- Audit trail and approval notes embedded in claim review.

## 13. Wireframe Recommendations

### App Shell

- Left sidebar expanded by default for admin roles, collapsible with tooltips.
- Top header includes breadcrumb, page-level search/command, notifications, account.
- Main content uses `PageHeader -> FilterBar -> Content`.

### Dashboard

- First row: "Needs my action", "Pending this stage", "Payment-ready", "Exceptions".
- Second row: trend and workload charts.
- Right rail or lower panel: recent activity/audit.
- Stat cards click through to filtered pages.

### Submit Claim

- Step 1: claimant/project/date context.
- Step 2: expenses as editable rows/cards with inline errors.
- Step 3: attachments with bill requirement indicators.
- Sticky footer: total with bill, total without bill, after-claim balance, submit.

### Approval Queue

- Desktop two-pane:
  - Left: queue list with amount/status/age/submitter.
  - Right: selected claim detail with expenses, attachments, checklist, timeline, action footer.
- Mobile:
  - Queue cards open full-height review drawer.

### Claim History

- Filter tabs: All, Pending, Approved, Rejected, Closed.
- Search by claim ID/site/user.
- Claim rows/cards with status timeline preview.
- Detail drawer with download/export actions.

### Payment Voucher

- Left: approved claims table with filters and grouping.
- Right: voucher batch summary and preview.
- Footer: create voucher, print, export PDF, mark paid if supported.

### Settings

- Tabs: Company, Notifications, Workflow, Master Data, Security.
- Master Data: separate tables for Categories, Projects, Project Codes.
- Add/edit in drawer, not inline expanding row.

## 14. Tech Audit

### Build/Test/Lint

- Build: passes.
- Tests: pass, but only one example test exists.
- Lint: fails with 192 errors and 19 warnings.
- Build warnings: large chunks over 500 kB, especially main index and dashboard chart chunk.

### Architecture Risks

- `src/lib/claims-api.ts` is very large and mixes data access, workflow policy, notifications, demo data, mapping, and formatting.
- Business rules run in the browser against Supabase tables.
- TanStack Query is installed and provided but unused, so data fetching lacks caching/invalidation patterns.
- Types are weak in views and API helpers due extensive `any` usage.
- Auth and role checks are not centralized.

### Security Risks

- Raw SHA256 password hashing is not sufficient for passwords.
- Session token in localStorage is XSS-sensitive.
- Supabase RLS policies allow all access to tables with anon key.
- Public storage buckets expose claim attachments, company assets, and avatars.
- Email action links include role and approver email in query params.
- Role-based navigation is not the same as authorization.

### Data/Performance Risks

- Per-user balance calculations can cause N+1 queries.
- Notification polling every 30 seconds is simple but can scale poorly.
- Client-side PDF/HTML exports are okay for small datasets but not robust for larger records.
- Dashboard chart library increases chunk size.
- Generated Android build output appears in lint scope.

### Maintainability Risks

- Stale `App.css` and `src/styles/global.css` can confuse future styling work.
- Duplicate Supabase client modules exist (`src/lib/supabase.ts` and `src/integrations/supabase/client.ts`) with different missing-env behavior.
- Two toaster systems are mounted.
- Repeated claim detail table/attachment UI across History, Approval, ClaimAction.

## 15. Priority Redesign Roadmap

### P0: Stabilize Security And Foundations

- Replace custom auth or harden it behind server-side auth.
- Move role/permission checks to a central route guard and backend policy layer.
- Restrict claim attachments with signed URLs or authenticated access.
- Fix password policy and hashing.
- Fix lint scope and high-signal lint errors.
- Fix currency mojibake and standardize currency formatting.

### P1: Design System And Shell

- Create documented tokens and component guidelines.
- Redesign app shell with breadcrumbs, tooltips, and consistent page headers.
- Build shared PageHeader, FilterBar, DataTable, StatusPill, AmountInput, EmptyState, ConfirmDialog.
- Replace glass/card overuse with cleaner enterprise surfaces.

### P2: Core Workflow Redesign

- Redesign Submit Claim as guided builder with sticky total.
- Redesign Approval queues into list/detail review workspace.
- Create canonical ClaimDetailDrawer reused everywhere.
- Add inline validation and accessible error summaries.

### P3: Finance/Admin Productivity

- Redesign Ledger, Balances, Payment Voucher, Users, Settings, Audit around filters, drill-downs, and batch operations.
- Add voucher batch history and printable PDF generation.
- Add user detail drawer and master data management screens.

### P4: Performance, Observability, And Quality

- Use TanStack Query or equivalent for server state.
- Split Recharts and heavy exports.
- Add pagination and backend export for large datasets.
- Add CI for build, lint, test, typecheck.
- Add real test coverage for auth, claim submission, approvals, vouchers, and permissions.
- Add monitoring/logging for client and edge functions.

## 16. Source References

Key files reviewed:

- `src/App.tsx`
- `src/pages/Index.tsx`
- `src/components/LoginPage.tsx`
- `src/components/AppHeader.tsx`
- `src/components/AppSidebar.tsx`
- `src/components/MobileBottomNav.tsx`
- `src/components/NotificationBell.tsx`
- `src/components/views/*`
- `src/pages/ResetPassword.tsx`
- `src/pages/ClaimAction.tsx`
- `src/pages/EmailTest.tsx`
- `src/index.css`
- `tailwind.config.ts`
- `package.json`
- `vite.config.ts`
- `vercel.json`
- `supabase/migrations/complete_schema.sql`
- `supabase/functions/send-notification/index.ts`
- `docs/USER_GUIDE.md`
- `docs/SUPABASE_MIGRATION_AND_SETUP_GUIDE.md`
- `docs/DEPLOYMENT_AND_RELEASE_GUIDE.md`

Browser-verified routes:

- `/` unauthenticated login
- forgot password state inside login
- `/reset-password` invalid-link state
- `/claim-action` missing claim id state
- `/test/email`
- login at mobile viewport 390 x 844

Command verification:

- `npm run build`: passed with chunk-size warnings.
- `npm test`: passed 1 test.
- `npm run lint`: failed with 192 errors and 19 warnings.
