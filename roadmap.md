# Firemaxxer — Roadmap

A personal finance web app that digitizes and extends the functionality of the **Fiscal Workspace.xlsx** spreadsheet. Built on the same stack as Perkmaxxer and Fridgem8.

---

## Tech Stack

### Backend
| Package | Version | Purpose |
|---|---|---|
| express | 4.x | HTTP server |
| pg | 8.x | PostgreSQL client |
| ioredis | 5.x | Redis (JWT blacklist, rate limiting) |
| jsonwebtoken | 9.x | Access + refresh token signing |
| bcrypt | 5.x | Password hashing |
| zod | 3.x | Request validation |
| cors | 2.x | CORS for frontend origin |
| helmet | 7.x | Security headers |
| express-rate-limit | 7.x | Rate limiting |
| cookie-parser | 1.x | HttpOnly cookie parsing |
| morgan | 1.x | HTTP logging |
| nodemailer | 8.x | Email (verification, password reset) |
| dotenv | 16.x | Environment variables |
| typescript | 5.x | Language |
| ts-node-dev | 2.x | Dev runner |
| vitest | 2.x | Tests |

### Frontend
| Package | Version | Purpose |
|---|---|---|
| react | 18.x | UI |
| react-dom | 18.x | DOM adapter |
| @tanstack/react-query | 5.x | Server state |
| react-router-dom | 6.x | Routing |
| recharts | 2.x | Charts (net worth history, FIRE progress) |
| vite | 5.x | Build tool |
| typescript | 5.x | Language |

### Infrastructure
- **PostgreSQL 15 Alpine** — primary database
- **Redis 7 Alpine** — JWT blacklisting + rate limit state
- **Docker Compose** — local dev services

---

## Directory Structure

```
firemaxxer/
├── backend/
│   ├── src/
│   │   ├── config/         # db.ts, redis.ts, env.ts, migrate.ts
│   │   ├── middleware/     # requireAuth.ts, errorHandler.ts
│   │   ├── models/         # account.ts, verificationToken.ts, asset.ts, liability.ts, ...
│   │   ├── routes/         # auth.ts, assets.ts, liabilities.ts, income.ts, expenses.ts, fire.ts, refi.ts
│   │   ├── services/       # jwt.ts, email.ts
│   │   └── index.ts
│   ├── migrations/
│   └── docker-compose.yml
├── client/
│   ├── src/
│   │   ├── api/            # client.ts, auth.ts, assets.ts, liabilities.ts, income.ts, expenses.ts, refi.ts
│   │   ├── components/     # shared UI components
│   │   ├── context/        # AuthContext.tsx
│   │   ├── hooks/          # useAuth.ts, useAssets.ts, etc.
│   │   ├── pages/          # Dashboard, Assets, Liabilities, Income, Expenses, Fire, Refi, Account
│   │   ├── types.ts
│   │   └── main.tsx
│   └── vite.config.ts
└── roadmap.md
```

---

## Phase 1 — Foundation & User Management (verbatim from Perkmaxxer)

This is a direct copy of the auth system in Perkmaxxer. No changes to logic.

### 1.1 Backend Scaffold
- `backend/docker-compose.yml` — Postgres 15 + Redis 7
- `backend/src/config/env.ts` — Zod-validated env vars (`DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `SMTP_*`, `PORT`, `FRONTEND_ORIGIN`)
- `backend/src/config/db.ts` — pg Pool singleton
- `backend/src/config/redis.ts` — ioredis singleton
- `backend/src/config/migrate.ts` — custom migration runner (reads `/migrations/*.sql` in order, tracks applied in `schema_migrations`)
- `backend/src/index.ts` — Express app setup: helmet, cors, morgan, cookie-parser, rate limiter, routes, error handler

### 1.2 Database — Accounts Migration (`001_accounts.sql`)
```sql
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  resend_used BOOLEAN NOT NULL DEFAULT false,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  password_changed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX accounts_email_idx ON accounts (lower(email));

CREATE TABLE verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('verify', 'reset')),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX verification_tokens_account_idx ON verification_tokens (account_id);
```

### 1.3 Auth Services & Models
- `services/jwt.ts` — `signAccessToken` (15 min), `signRefreshToken` (30 day), `verifyAccessToken`, `verifyRefreshToken`, Redis JTI blacklist
- `models/account.ts` — `createAccount`, `findByEmail`, `findById`, `markEmailVerified`, `updatePasswordHash`, `setPasswordChangedAt`, `deleteAccount`
- `models/verificationToken.ts` — 6-digit codes, bcrypt-hashed, TTLs, `validateAndConsumeToken`
- `services/email.ts` — nodemailer wrappers for verification + reset emails

### 1.4 Auth Routes (`/api/auth/*`)
| Method | Path | Description |
|---|---|---|
| POST | /register | Create account + send verification code |
| POST | /verify-email | Validate 6-digit code, set JWT cookies |
| POST | /resend-verification | Resend code (once per account) |
| POST | /login | Email + password, set JWT cookies |
| POST | /refresh | Issue new token pair from refresh token |
| POST | /logout | Blacklist JTIs, clear cookies |
| POST | /forgot-password | Send reset code via email |
| POST | /reset-password | Validate code, update password hash |
| GET | /me | Return current account |
| DELETE | /account | Delete account after password verification |

### 1.5 Middleware
- `requireAuth.ts` — resolves account from access token cookie, checks Redis blacklist, extends `req.account`
- `errorHandler.ts` — custom classes (`ApiError`, `AuthError`, `ForbiddenError`, `NotFoundError`), Zod error formatting

### 1.6 Frontend Auth
- `api/client.ts` — `apiFetch` with `credentials: 'include'`, silent 401 refresh retry, auth failure event
- `context/AuthContext.tsx` — account/loading state, `useAuth()` hook, logout, initialize from `/api/auth/me`
- Pages: `LoginPage`, `RegisterPage`, `VerifyEmailPage`, `ForgotPasswordPage`, `ResetPasswordPage`

---

## Phase 2 — Assets & Liabilities

Corresponds to the spreadsheet's **Assets** sheet and **Debt details** sheet. Tracks snapshots of asset values and loan balances over time.

### 2.1 Database — Assets Migration (`002_assets_liabilities.sql`)

```sql
-- Asset accounts (brokerage, retirement, real estate, etc.)
CREATE TABLE assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  name TEXT NOT NULL,                       -- "Fidelity (Individual)", "Half Moon Lane"
  type TEXT NOT NULL CHECK (type IN (
    'brokerage', '401k', 'roth_ira', 'real_estate', 'cash', 'other'
  )),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX assets_account_idx ON assets (account_id);

-- Point-in-time valuations
CREATE TABLE asset_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES assets (id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  value NUMERIC(14,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (asset_id, snapshot_date)
);
CREATE INDEX asset_snapshots_asset_idx ON asset_snapshots (asset_id);
CREATE INDEX asset_snapshots_date_idx ON asset_snapshots (snapshot_date);

-- Liabilities (mortgages, credit cards, loans)
CREATE TABLE liabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  name TEXT NOT NULL,                       -- "Magnolia", "Half Moon"
  type TEXT NOT NULL CHECK (type IN (
    'mortgage', 'credit_card', 'auto_loan', 'student_loan', 'other'
  )),
  interest_rate NUMERIC(6,4) NOT NULL,      -- e.g. 0.02625 for 2.625%
  linked_asset_id UUID REFERENCES assets (id) ON DELETE SET NULL,  -- for real estate
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX liabilities_account_idx ON liabilities (account_id);

-- Point-in-time liability balances
CREATE TABLE liability_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  liability_id UUID NOT NULL REFERENCES liabilities (id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  balance NUMERIC(14,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (liability_id, snapshot_date)
);
CREATE INDEX liability_snapshots_liability_idx ON liability_snapshots (liability_id);
CREATE INDEX liability_snapshots_date_idx ON liability_snapshots (snapshot_date);
```

### 2.2 API Routes (`/api/assets`, `/api/liabilities`)

**Assets**
| Method | Path | Description |
|---|---|---|
| GET | /api/assets | List all assets for account |
| POST | /api/assets | Create asset |
| PUT | /api/assets/:id | Update asset metadata |
| DELETE | /api/assets/:id | Delete asset + snapshots |
| GET | /api/assets/:id/snapshots | Get value history |
| POST | /api/assets/:id/snapshots | Add snapshot |
| DELETE | /api/assets/:id/snapshots/:snapshotId | Delete snapshot |

**Liabilities**
| Method | Path | Description |
|---|---|---|
| GET | /api/liabilities | List all liabilities for account |
| POST | /api/liabilities | Create liability |
| PUT | /api/liabilities/:id | Update liability (rate, name, linked asset) |
| DELETE | /api/liabilities/:id | Delete liability + snapshots |
| GET | /api/liabilities/:id/snapshots | Get balance history |
| POST | /api/liabilities/:id/snapshots | Add snapshot |
| DELETE | /api/liabilities/:id/snapshots/:snapshotId | Delete snapshot |

**Net Worth Summary**
| Method | Path | Description |
|---|---|---|
| GET | /api/net-worth | Aggregated net worth by date across all assets/liabilities |

### 2.3 Frontend — Assets & Liabilities Page
- Table of all assets with most recent value and type
- Table of all liabilities with balance, rate, linked asset, and equity (asset value − balance)
- Net worth history line chart (x: date, y: total assets, total liabilities, net worth)
- Add/edit/delete asset and liability via modal
- Add snapshot inline (date + value)
- Total net worth summary card at top

---

## Phase 3 — Income Sources

Corresponds to the **Income** sheet. Tracks income sources with frequency normalization to monthly/annual.

### 3.1 Database — Income Migration (`003_income.sql`)

```sql
CREATE TABLE income_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  name TEXT NOT NULL,                        -- "Paycheck - LinkedIn", "RSU Vesting"
  amount NUMERIC(12,2) NOT NULL,             -- amount per frequency unit
  frequency TEXT NOT NULL CHECK (frequency IN (
    'weekly', 'bi_weekly', 'semi_monthly', 'monthly', 'quarterly', 'semi_annually', 'annually'
  )),
  taxable BOOLEAN NOT NULL DEFAULT true,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX income_sources_account_idx ON income_sources (account_id);
```

### 3.2 API Routes (`/api/income`)
| Method | Path | Description |
|---|---|---|
| GET | /api/income | List income sources |
| POST | /api/income | Create income source |
| PUT | /api/income/:id | Update income source |
| DELETE | /api/income/:id | Delete income source |
| GET | /api/income/summary | Computed: monthly + annual totals, taxable vs non-taxable |

### 3.3 Frontend — Income Page
- Table of all income sources with name, amount, frequency, monthly equivalent, annual equivalent, taxable flag
- Add/edit/delete via modal
- Summary card: total monthly income, total annual income, taxable annual income

---

## Phase 4 — Recurring Expenses

Corresponds to the **Recurring Costs** sheets (timestamped snapshots). Supports versioned expense snapshots so history is preserved as costs change over time.

### 4.1 Database — Expenses Migration (`004_expenses.sql`)

```sql
-- Expense snapshots (represent a point-in-time version of your recurring costs)
CREATE TABLE expense_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  label TEXT NOT NULL,                  -- e.g. "2025 - 04", "Ideal Retired"
  effective_date DATE NOT NULL,
  is_retirement_plan BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX expense_snapshots_account_idx ON expense_snapshots (account_id);

-- Individual line items within a snapshot
CREATE TABLE expense_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES expense_snapshots (id) ON DELETE CASCADE,
  name TEXT NOT NULL,                   -- "Mortgage", "Therapy (Melanie)"
  owner TEXT,                           -- "Melanie and Ramil", "Freida+"
  vertical TEXT,                        -- "Half Moon Lane", "Magnolia"
  category TEXT NOT NULL,               -- "Housing", "Health", "Utilities", etc.
  critical BOOLEAN NOT NULL DEFAULT false,
  amount NUMERIC(12,2) NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN (
    'weekly', 'bi_weekly', 'monthly', 'quarterly', 'semi_annually', 'annually'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX expense_items_snapshot_idx ON expense_items (snapshot_id);
```

### 4.2 API Routes (`/api/expenses`)
| Method | Path | Description |
|---|---|---|
| GET | /api/expenses/snapshots | List all expense snapshots |
| POST | /api/expenses/snapshots | Create new expense snapshot |
| PUT | /api/expenses/snapshots/:id | Update snapshot label/date |
| DELETE | /api/expenses/snapshots/:id | Delete snapshot + items |
| GET | /api/expenses/snapshots/:id/items | List items in snapshot |
| POST | /api/expenses/snapshots/:id/items | Add item to snapshot |
| PUT | /api/expenses/snapshots/:id/items/:itemId | Update item |
| DELETE | /api/expenses/snapshots/:id/items/:itemId | Delete item |
| GET | /api/expenses/snapshots/:id/summary | Computed: monthly + annual totals, by category, critical vs non-critical |
| POST | /api/expenses/snapshots/:id/clone | Clone a snapshot with a new label/date |

### 4.3 Frontend — Expenses Page
- Snapshot selector (dropdown by label/date)
- "Clone" button to create a new version from an existing one
- Grouped table: items sorted by monthly cost descending, grouped by category
- Inline add/edit/delete of items
- Filter toggle: "Critical only" / "All"
- Summary sidebar: total monthly, total annual, breakdown by category, critical vs discretionary split
- Snapshot history: sparkline of total monthly cost across all snapshots over time

---

## Phase 5 — FIRE Feasibility Dashboard

Corresponds to **Financial Planning** and **Retirement Outlook** sheets. This is a computed read-only view that aggregates income, expenses, and assets to answer: *how close am I to FIRE, and what does retirement look like?*

### 5.1 API Routes (`/api/fire`)
No new tables — all computed from existing data.

| Method | Path | Description |
|---|---|---|
| GET | /api/fire/current | Current-state FIRE feasibility |
| GET | /api/fire/retirement | Retirement-state FIRE feasibility |

**Current FIRE response shape:**
```json
{
  "monthlyIncome": 21743,
  "monthlyExpenses": 6462,
  "monthlyRetiredExpenses": 7336,
  "annualDrain": -88032,
  "existingAssets": 2394771,
  "fiBalance": 2602695,
  "yearsToFI": 1.20,
  "yearsToFIWithGrowth": 0.76,
  "assumedInterestGain": 0.04,
  "taxDetails": {
    "caRate": 0.093,
    "federalRate": 0.24,
    "ltCapGainsRate": 0.15,
    "totalTaxes": -79874
  }
}
```

**Config inputs** (user-configurable, stored in `account_settings`):
- Annual salary, bonus, RSU quarterly amount, ESPP quarterly gain
- 401k contribution, medical deductions
- Tax bracket assumptions (CA + Federal)
- Safe withdrawal rate (default: 4%)
- Assumed portfolio growth rate (default: 4%)
- Assumed retirement income (social security / part-time, default: $10,000/yr)

### 5.2 Database — Settings Migration (`005_settings.sql`)
```sql
CREATE TABLE account_settings (
  account_id UUID PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  fire_config JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`fire_config` keys:
```json
{
  "annualSalary": 260000,
  "annualBonus": 39000,
  "rsuQuarterlyGross": 25500,
  "esppQuarterlyGain": 2500,
  "k401Annual": 47000,
  "medicalDeductionAnnual": 2808,
  "caStateTaxRate": 0.093,
  "caMaxPrevBracket": 132590,
  "caMaxTaxPrevBracket": 5837.82,
  "fedTaxRate": 0.24,
  "fedMaxPrevBracket": 190750,
  "fedMaxTaxPrevBracket": 32580,
  "ltCapGainsRate": 0.15,
  "safeWithdrawalRate": 0.04,
  "assumedGrowthRate": 0.04,
  "retirementAnnualIncome": 10000,
  "activeExpenseSnapshotId": null,
  "retiredExpenseSnapshotId": null
}
```

| Method | Path | Description |
|---|---|---|
| GET | /api/settings | Get account settings |
| PUT | /api/settings | Update settings |

### 5.3 Frontend — FIRE Dashboard Page
Layout mirrors the spreadsheet's Financial Planning sheet, rebuilt as a proper dashboard:

**Top row — Summary cards:**
- Net Worth (linked to assets/liabilities latest snapshot)
- Monthly Income
- Monthly Expenses (current snapshot)
- Monthly Surplus/Deficit

**FIRE Progress section:**
- FI Balance target (annual drain ÷ safe withdrawal rate)
- Existing Assets
- Progress bar: assets / FI balance
- Years to FI (with and without growth)
- Estimated FI date

**Retirement Outlook section:**
- Switched view: replaces income with retirement income config
- Same FI calculation under retirement assumptions
- Delta: how much more is needed to cover retired monthly costs

**Tax Breakdown section:**
- Gross income, deductions, CA taxes, Federal taxes, net income
- Monthly take-home

**Configuration panel (side drawer):**
- All fire_config fields as editable inputs
- Snapshot selectors for "current expenses" and "retired expenses"

---

## Phase 6 — Loan Refinance Calculator

Corresponds to **Refi** and **Refi with Invest** sheets. Compares multiple loan scenarios side-by-side.

### 6.1 Database — Refi Migration (`006_refi.sql`)

```sql
-- Saved refi analyses (multi-scenario comparisons)
CREATE TABLE refi_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  name TEXT NOT NULL,                         -- "Half Moon Lane Refi 2024"
  loan_original_value NUMERIC(14,2) NOT NULL, -- original loan amount
  loan_current_balance NUMERIC(14,2) NOT NULL,-- current remaining balance
  current_annual_rate NUMERIC(6,4) NOT NULL,  -- e.g. 0.04625
  months_in INTEGER NOT NULL DEFAULT 0,       -- how many months already paid
  assumed_investment_rate NUMERIC(6,4) NOT NULL DEFAULT 0.05,
  home_value_after_loan NUMERIC(14,2),        -- projected home value at payoff
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX refi_analyses_account_idx ON refi_analyses (account_id);

-- Scenarios within an analysis (columns in the spreadsheet)
CREATE TABLE refi_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL REFERENCES refi_analyses (id) ON DELETE CASCADE,
  label TEXT NOT NULL,                        -- "30 @ 2.88%"
  term_years INTEGER NOT NULL,                -- 15, 20, 30
  annual_rate NUMERIC(6,4) NOT NULL,          -- e.g. 0.02875
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX refi_scenarios_analysis_idx ON refi_scenarios (analysis_id);
```

### 6.2 Refi Calculation Logic (backend service)
All computed server-side from stored inputs. No raw numbers stored beyond inputs.

For each scenario vs. current loan:
- Monthly payment: `P * r / (1 - (1+r)^-n)` where P = balance, r = monthly rate, n = months
- Total interest over remaining term
- Difference in total interest vs. current
- Monthly savings (positive = cheaper, negative = more expensive)
- If monthly savings > 0: compound investment of savings over term
- If monthly savings < 0: opportunity cost of higher payment
- Total gain by choosing this scenario (accounting for investment growth + residual mortgage cost)
- Total paid over term

### 6.3 API Routes (`/api/refi`)
| Method | Path | Description |
|---|---|---|
| GET | /api/refi | List all saved analyses |
| POST | /api/refi | Create new analysis |
| PUT | /api/refi/:id | Update analysis inputs |
| DELETE | /api/refi/:id | Delete analysis |
| GET | /api/refi/:id/scenarios | List scenarios for analysis |
| POST | /api/refi/:id/scenarios | Add scenario |
| PUT | /api/refi/:id/scenarios/:scenarioId | Update scenario (label, rate, term) |
| DELETE | /api/refi/:id/scenarios/:scenarioId | Delete scenario |
| GET | /api/refi/:id/results | Computed comparison results for all scenarios |

**Results response shape (per scenario):**
```json
{
  "scenarioId": "...",
  "label": "30 @ 2.88%",
  "termYears": 30,
  "annualRate": 0.02875,
  "monthlyPayment": 1496.93,
  "totalInterest": 177230.92,
  "totalPaid": 594230.92,
  "monthlyDelta": 469.79,
  "totalInterestDiff": -113786.73,
  "potentialMonthlyInvestment": 0,
  "investmentGainAtTermEnd": 392612.02,
  "totalGainByChoosing": 414499.83
}
```

### 6.4 Frontend — Refi Calculator Page
- Analysis selector (dropdown of saved analyses) + "New Analysis" button
- Input panel: loan balance, current rate, months in, home value, assumed investment rate
- Scenario table (one column per scenario):
  - Label, Term, Rate
  - Monthly Payment
  - Monthly Delta vs. current (green if savings, red if cost)
  - Total Interest
  - Total Interest Saved/Extra
  - Investment Gain (if savings are invested)
  - **Total Gain by Choosing** (summary row, highlighted)
  - Total Paid
- Bar chart: "Total Gain by Choosing" across scenarios
- "Add Scenario" button (opens modal with term + rate inputs)
- Current loan column always shown for reference

---

## Phase 7 — Navigation & Polish

### 7.1 App Shell
- Sidebar navigation: Dashboard (FIRE), Assets & Liabilities, Income, Expenses, Refi Calculator, Account
- Top bar: account email, logout button
- Protected routes: redirect to `/login` if unauthenticated
- Responsive layout (desktop-first, mobile-usable)

### 7.2 Account Page
- Change email
- Change password
- Delete account
- FIRE config quick-access link

### 7.3 Empty States
- Each page has a helpful empty state with a CTA when no data exists yet

### 7.4 Error Handling
- Toast notifications for API errors
- Form field-level validation errors from Zod (surfaced via react-hook-form or manual)

---

## Migration Order

```
001_accounts.sql
002_assets_liabilities.sql
003_income.sql
004_expenses.sql
005_settings.sql
006_refi.sql
```

---

## Environment Variables

```env
# Backend
DATABASE_URL=postgresql://firemaxxer:firemaxxer@localhost:5434/firemaxxer
REDIS_URL=redis://localhost:6381
JWT_ACCESS_SECRET=<32+ random chars>
JWT_REFRESH_SECRET=<32+ random chars>
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
FROM_EMAIL=noreply@firemaxxer.app
PORT=3003
FRONTEND_ORIGIN=http://localhost:5175
```

---

## Port Assignments (avoids conflicts with Perkmaxxer + Fridgem8)

| Service | Port |
|---|---|
| Backend | 3003 |
| Frontend (Vite) | 5175 |
| PostgreSQL | 5434 |
| Redis | 6381 |

---

## Build Order Summary

1. **Phase 1** — Auth system (verbatim from Perkmaxxer): backend scaffold → migrations → models → routes → frontend auth pages
2. **Phase 2** — Assets & Liabilities: migrations → routes → net worth summary → charts
3. **Phase 3** — Income Sources: migration → routes → frontend page
4. **Phase 4** — Recurring Expenses: migration → snapshot/item routes → frontend page with category grouping
5. **Phase 5** — FIRE Dashboard: settings migration → computation service → frontend dashboard with config drawer
6. **Phase 6** — Refi Calculator: migration → computation service → frontend comparison table + chart
7. **Phase 7** — Nav, account page, empty states, polish
