# ORB Algo — Blueprint

## Strategy Overview

**Open Range Breakout (ORB)** — A daily intraday options strategy on Nifty 50 stocks.
Every morning at 10:30 AM IST, scan for the top 5 gainers and top 5 losers in the Nifty 50.
Identify key option OI levels as resistance (gainers) and support (losers). Monitor spot prices
every 5 minutes. When a breakout/breakdown is confirmed, enter a hedged options trade and manage
it with a trailing stoploss until EOD or target is hit.

---

## Project Stack

| Concern | Choice |
|---|---|
| Runtime | Node.js >= 20 LTS |
| Language | TypeScript (strict), ES modules (`import`/`export`) |
| Package manager | pnpm |
| Framework | Express (HTTP server + health check endpoint only) |
| Broker | Angel One SmartAPI |
| TOTP | `otplib@^13.x` — TypeScript-first, async-native, no `createGuardrails` workaround needed |
| Scheduling | `node-cron` |
| Logging | Winston (daily files, IST timestamps, `Asia/Kolkata`) |
| Notifications | Telegram (send only) |
| Testing | Jest + ts-jest, 100% coverage enforced |
| Linting | ESLint + Prettier |
| Pre-commit | Husky + lint-staged |
| Process manager | PM2 (Oracle Cloud Free Tier) |
| Env | `.env` via `dotenv` |

---

## Project Structure

```
orb-algo/
├── .github/
│   └── workflows/
│       ├── ci.yml                      # Typecheck → lint → prettier → test → build
│       └── deploy.yml                  # SSH deploy to Oracle Cloud on CI pass
├── src/
│   ├── server.ts                   # Express app + health route + graceful shutdown
│   ├── config/
│   │   └── env.ts                  # dotenv validation + typed config export
│   ├── store/
│   │   ├── sessionStore.ts         # Singleton: jwtToken, feedToken, refreshToken
│   │   ├── scripMasterStore.ts     # Singleton: in-memory scrip master array
│   │   └── tradeStore.ts           # Singleton: active trade state + trailing SL state
│   ├── helpers/
│   │   ├── constants.ts            # All Angel One API URLs, timing constants
│   │   ├── api.ts                  # Generic axios GET/POST wrappers with auth headers
│   │   ├── login.ts                # TOTP generation + SmartAPI session login
│   │   ├── holidayCheck.ts         # NSE holiday API check + weekend check
│   │   ├── scripMaster.ts          # Download + parse Angel One scrip master JSON
│   │   ├── marketData.ts           # getLtp, getOptionChain (optionGreek API), getTopMovers
│   │   ├── orders.ts               # placeOrder, placeStoploss, modifyStoploss, exitTrade
│   │   ├── oiAnalyzer.ts           # findResistance (max call OI above spot), findSupport (max put OI below spot)
│   │   ├── trailingSlManager.ts    # Trailing SL state machine (₹2k risk-free → ₹500 trail increments)
│   │   └── logger.ts               # Winston: console + daily file (logs/orb-YYYY-MM-DD.log)
│   ├── jobs/
│   │   ├── morningScanner.ts       # 10:30 AM job: fetch top 5 gainers + losers, identify OI levels
│   │   ├── priceMonitor.ts         # Every 5 min job: poll spot prices, check breakout/breakdown
│   │   └── tradeMonitor.ts         # Every 5 min job (post-entry): check SL breach, update trailing SL
│   ├── notifier.ts                 # Telegram sendMessage wrapper
│   └── main.ts                     # Entry point: holiday check → login → scrip master → start cron jobs
├── __tests__/
│   ├── helpers/
│   │   ├── login.test.ts
│   │   ├── holidayCheck.test.ts
│   │   ├── marketData.test.ts
│   │   ├── orders.test.ts
│   │   ├── oiAnalyzer.test.ts
│   │   └── trailingSlManager.test.ts
│   ├── jobs/
│   │   ├── morningScanner.test.ts
│   │   ├── priceMonitor.test.ts
│   │   └── tradeMonitor.test.ts
│   └── store/
│       ├── sessionStore.test.ts
│       ├── scripMasterStore.test.ts
│       └── tradeStore.test.ts
├── __mocks__/
│   └── axios.ts                    # Auto-mock for axios
├── logs/                           # Winston daily log files (gitignored)
├── dist/                           # Compiled JS output (gitignored)
├── .env                            # Local env (gitignored)
├── .env.example                    # Template committed to repo
├── .eslintrc.json
├── .prettierrc
├── .prettierignore
├── .gitignore
├── tsconfig.json
├── tsconfig.build.json             # Excludes __tests__ for production build
├── jest.config.ts
├── ecosystem.config.js             # PM2 config
├── GEMINI.md                       # AI assistant instructions (README update rule + project conventions)
├── package.json
└── README.md
```

---

## Environment Variables

```env
# Server configuration
PORT=3000
NODE_ENV=development

# SmartAPI credentials
API_KEY=
CLIENT_CODE=
CLIENT_PIN=
CLIENT_TOTP_PIN=        # 16-character TOTP secret key provided by Angel Broking

# Telegram notifications
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

---

## Module Specifications

### `src/main.ts`

Startup sequence (runs once at boot, then cron takes over):

```
1. Load + validate env (config/env.ts)
2. Check if today is NSE trading day (holidayCheck.ts)
   → If holiday/weekend: log + notify Telegram "Today is NSE holiday, algo not running" → process.exit(0)
3. Login to SmartAPI (login.ts) → store session in sessionStore
4. Download + parse scrip master (scripMaster.ts) → store in scripMasterStore
5. Register cron jobs:
   - morningScanner:  '30 10 * * 1-5'  (10:30 AM IST, Mon–Fri)
   - priceMonitor:    every 5 mins between 10:35 AM and 3:25 PM (active only when no trade)
   - tradeMonitor:    every 5 mins between 10:35 AM and 3:25 PM (active only when trade is live)
6. Start Express server for health check endpoint: GET /health
```

---

### `src/config/env.ts`

Validates all required env vars at startup. Throws `Error` if any are missing. Exports a typed
`config` object — no `process.env` access anywhere else in the codebase.

```typescript
export interface Config {
  port: number;
  nodeEnv: string;
  apiKey: string;
  clientCode: string;
  clientPin: string;
  clientTotpPin: string;
  telegramBotToken: string;
  telegramChatId: string;
}
```

---

### `src/helpers/login.ts`

```typescript
// 1. Get public IP via ipify API (cached in module-level variable after first call)
// 2. Generate TOTP using otplib v13 async API:
//    import { generate } from 'otplib';
//    const token = await generate({ secret: config.clientTotpPin });
// 3. POST to Angel One loginByPassword endpoint with required IP headers:
//    X-ClientPublicIP, X-ClientLocalIP, X-MACAddress, X-PrivateKey, X-UserType, X-SourceID
// 4. Check response.data.status === true
// 5. On success: store { jwtToken, feedToken, refreshToken } in sessionStore
// 6. On failure: throw Error with Angel One error message
```

Dependencies: `axios`, `otplib@^13.x`

---

### `src/helpers/holidayCheck.ts`

```typescript
// Fetch NSE holiday list from live API:
// GET https://www.nseindia.com/api/holiday-master?type=trading
// Parse response to extract holiday dates for current year
// Check if today (IST) is in holiday list OR is Saturday/Sunday
// Returns: { isTradingDay: boolean, reason?: string }
```

Note: NSE API requires browser-like headers (User-Agent, Referer). Use the same header pattern
observed in reference repos.

---

### `src/helpers/scripMaster.ts`

```typescript
// Download from:
// https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json
// Filter to NFO exchange, OPTSTK instrument type (stock options)
// Store filtered array in scripMasterStore singleton
// Called once at startup
```

---

### `src/helpers/marketData.ts`

**`getTopMovers()`** — compute top 5 gainers and losers entirely via Angel One:
```typescript
// 1. Hardcoded list of all 50 Nifty 50 stock tokens (stable, updated manually on index rebalance)
// 2. Single batch call: POST market/v1/quote/ with mode='FULL', exchangeTokens: { NSE: [all 50 tokens] }
//    Response per stock includes: ltp, close (previous day close)
// 3. Compute % change = ((ltp - close) / close) * 100 for each stock
// 4. Sort descending → top 5 = gainers
//    Sort ascending  → top 5 = losers
// Returns: { gainers: Stock[], losers: Stock[] }
// Stock: { symbol: string; symbolToken: string; ltp: number; changePercent: number }
```

**`getLtp(symbol, symbolToken, exchange)`** — single LTP fetch via Angel One:
```typescript
// POST https://apiconnect.angelone.in/rest/secure/angelbroking/order/v1/getLtpData
// Returns: number (LTP)
```

**`getOptionChain(symbol, expiryDate)`** — fetch OI data via Angel One optionGreek API:
```typescript
// POST https://apiconnect.angelone.in/rest/secure/angelbroking/marketData/v1/optionGreek
// Payload: { name: symbol, expirydate: 'DDMMYYYY' }
// Returns: OptionStrike[] with { strikePrice, optionType: 'CE'|'PE', openInterest, ltp }
```

**`getMonthlyExpiry()`** — find next monthly expiry for Nifty 50 stocks (last Thursday of month,
adjusted for holidays):
```typescript
// Nifty 50 stock options expire on last Thursday of the month
// If last Thursday is a holiday, roll back to Wednesday
// Returns expiry in 'DDMMYYYY' format for Angel One API
```

---

### `src/helpers/oiAnalyzer.ts`

```typescript
// findResistance(strikes: OptionStrike[], spotPrice: number): number
// → Filter CE strikes where strikePrice > spotPrice
// → Return strikePrice with highest openInterest among those
// → This is the level the stock must break above to trigger entry

// findSupport(strikes: OptionStrike[], spotPrice: number): number
// → Filter PE strikes where strikePrice < spotPrice
// → Return strikePrice with highest openInterest among those
// → This is the level the stock must break below to trigger entry
```

---

### `src/jobs/morningScanner.ts`

Runs at **10:30 AM IST** every trading day:

```
1. Fetch top 5 gainers + top 5 losers from Nifty 50 (marketData.getTopMovers)
2. For each of 10 stocks:
   a. Get current monthly expiry date
   b. Fetch option chain via optionGreek API
   c. For gainers: run oiAnalyzer.findResistance → store as watchLevel
   d. For losers:  run oiAnalyzer.findSupport    → store as watchLevel
3. Save all 10 { symbol, symbolToken, ltp, side: 'CALL'|'PUT', watchLevel } to tradeStore.watchList
4. Notify Telegram with watchList summary
5. Activate priceMonitor job
```

---

### `src/jobs/priceMonitor.ts`

Runs every **5 minutes** between 10:35 AM – 3:25 PM, only when `tradeStore.activeTrade === null`:

```
For each stock in tradeStore.watchList:
  1. Fetch current LTP via getLtp
  2. For CALL side (gainer): check if LTP > watchLevel
     For PUT side  (loser):  check if LTP < watchLevel
  3. If condition met:
     a. Check if this is the FIRST 5-min poll showing breach (store breachStartTime)
     b. If breachStartTime exists AND current time - breachStartTime >= 5 mins:
        → CONFIRMED BREAKOUT → trigger trade entry (orders.ts)
     c. If price reverts before 5 mins: reset breachStartTime
  4. First confirmed breakout across any stock triggers entry
     → Stop processing remaining stocks for the day
```

---

### `src/helpers/orders.ts`

**`enterTrade(stock, side, watchLevel)`**:
```typescript
// 1. Find buy option in scripMaster: strike = watchLevel, type = CE (CALL) or PE (PUT), monthly expiry
// 2. Place MARKET BUY order for 1 lot
// 3. Fetch option chain to find hedge strike:
//    → Find strike where premium ≈ 1/4th of bought option's premium
//    → For CALL: hedge strike is higher than watchLevel (OTM call)
//    → For PUT:  hedge strike is lower than watchLevel (OTM put)
// 4. Place MARKET SELL order for hedge (1 lot)
// 5. Compute net entry cost = buy premium - sell premium (net debit)
// 6. Place initial STOPLOSS order on exchange:
//    → SL trigger = net entry cost - ₹3000 (hard SL)
// 7. Store active trade in tradeStore:
//    { buyOrder, sellOrder, slOrderId, entryPrice, currentSl, trailingMilestone: 0 }
// 8. Notify Telegram: "Trade entered: BUY APOLLOHOSP 8500 CE @ ₹X, SELL 8700 CE @ ₹Y, SL ₹Z"
// 9. Deactivate priceMonitor, activate tradeMonitor
```

**`modifyStoploss(newSl)`**:
```typescript
// POST to Angel One modifyOrder API
// Update slOrderId in tradeStore with new SL price
```

**`exitTrade(reason)`**:
```typescript
// 1. Cancel existing SL order
// 2. Place MARKET SELL for bought leg
// 3. Place MARKET BUY  for sold hedge leg
// 4. Calculate final P&L
// 5. Notify Telegram: "Trade exited: reason=X, P&L=₹Y"
// 6. Clear tradeStore.activeTrade
// 7. Deactivate tradeMonitor — no more trades today
```

---

### `src/helpers/trailingSlManager.ts`

```typescript
// Input: currentMtm (current P&L of open trade), trade entry details
// State machine:
//
// Stage 0 (initial):     MTM < ₹2000   → no change, hard SL at -₹3000
// Stage 1 (risk-free):   MTM >= ₹2000  → shift SL to entry price (₹0 loss)
// Stage 2:               MTM >= ₹2500  → shift SL to lock ₹500 profit
// Stage 3:               MTM >= ₹3000  → shift SL to lock ₹1000 profit
// Stage N:               MTM >= ₹(2000 + N*500) → shift SL to lock ₹(N*500) profit
//
// Returns: { shouldModifySl: boolean, newSlValue: number }
// Caller (tradeMonitor) calls modifyStoploss if shouldModifySl === true
// Never moves SL backwards — only forward
```

---

### `src/jobs/tradeMonitor.ts`

Runs every **5 minutes** while `tradeStore.activeTrade !== null`:

```
1. Fetch LTP of both legs in a single batch call:
   POST market/v1/quote/ with mode='LTP', exchangeTokens: { NFO: [buyToken, sellToken] }
2. Compute current MTM = (buyLtp - entryBuyPrice) - (sellLtp - entrySellPrice)  [net position P&L]
3. Run trailingSlManager.check(currentMtm)
   → If shouldModifySl: call orders.modifyStoploss(newSlValue)
4. Check if SL has been hit (query order book or compare LTP vs SL):
   → If hit: orders.exitTrade('SL hit')
5. At 3:20 PM IST: force exitTrade('EOD square-off') regardless of P&L
```

---

### `src/store/tradeStore.ts`

Singleton holding all mutable runtime state:

```typescript
interface WatchStock {
  symbol: string;
  symbolToken: string;
  ltp: number;
  side: 'CALL' | 'PUT';
  watchLevel: number;
  breachStartTime: Date | null;
}

interface ActiveTrade {
  symbol: string;
  buyOrderId: string;
  sellOrderId: string;
  slOrderId: string;
  entryBuyPremium: number;
  entrySellPremium: number;
  netDebit: number;           // entryBuyPremium - entrySellPremium
  currentSlValue: number;
  trailingStage: number;      // 0 = initial, 1 = risk-free, 2+ = profit locked
}

interface TradeStore {
  watchList: WatchStock[];
  activeTrade: ActiveTrade | null;
}
```

---

### `src/notifier.ts`

```typescript
// sendNotification(message: string): Promise<void>
// POST to Telegram Bot API: https://api.telegram.org/bot{TOKEN}/sendMessage
// Fire-and-forget (no throw on failure — never let notification failure crash algo)
```

---

### `src/helpers/logger.ts`

Winston with two transports:
- Console: colorized, IST timestamp
- File: `logs/orb-YYYY-MM-DD.log`, JSON format, daily rotation

---

## TypeScript Configuration

### `tsconfig.json` (development + type-check)
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "rootDir": "./src",
    "outDir": "./dist",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true
  },
  "include": ["src", "__tests__"]
}
```

### `tsconfig.build.json` (production build — excludes tests)
```json
{
  "extends": "./tsconfig.json",
  "exclude": ["__tests__", "__mocks__", "node_modules", "dist"]
}
```

---

## Jest Configuration (`jest.config.ts`)

```typescript
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  coverageThreshold: { global: { lines: 100, functions: 100, branches: 100, statements: 100 } },
  collectCoverageFrom: ['src/**/*.ts'],
  coveragePathIgnorePatterns: ['src/server.ts', 'src/main.ts'],  // entry points excluded
};
```

All external API calls (axios) are mocked via `__mocks__/axios.ts`. SmartAPI responses are
fully typed mock fixtures.

---

## Prettier

Prettier handles all code formatting. ESLint handles code quality. The two never overlap
(`eslint-config-prettier` disables all ESLint formatting rules).

### `.prettierrc`
```json
{
  "singleQuote": true,
  "jsxSingleQuote": true,
  "arrowParens": "avoid",
  "endOfLine": "lf",
  "trailingComma": "all",
  "printWidth": 80,
  "tabWidth": 2,
  "semi": true
}
```

### `.prettierignore`
```
pnpm-lock.yaml
dist/
node_modules/
coverage/
*.log
README.md
```

### How Prettier is enforced

| When | How |
|---|---|
| On save (editor) | VS Code / editor plugin reads `.prettierrc` automatically |
| On commit | `lint-staged` runs `prettier --write` on staged `.ts` files |
| On CI | `pnpm format:check` runs `prettier --check` — fails build if any file is unformatted |

`prettier --write` (local) formats in-place. `prettier --check` (CI) is read-only and exits
non-zero if formatting differs — ensures nothing slips through without being formatted.

---

## ESLint

### `.eslintrc.json`
```json
{
  "root": true,
  "parser": "@typescript-eslint/parser",
  "parserOptions": { "project": "./tsconfig.json" },
  "plugins": ["@typescript-eslint"],
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended-type-checked",
    "prettier"
  ],
  "rules": {
    "no-console": "warn",
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/explicit-function-return-type": "error",
    "@typescript-eslint/no-unused-vars": "error"
  }
}
```

`"prettier"` must be **last** in `extends` to override all formatting rules.

---

## Husky + lint-staged

### Pre-commit hook (`.husky/pre-commit`)
```
pnpm lint-staged
```

### `lint-staged` config in `package.json`
```json
{
  "lint-staged": {
    "*.ts": [
      "eslint --fix",
      "prettier --write",
      "jest --bail --findRelatedTests --passWithNoTests"
    ]
  }
}
```

### `package.json` scripts
```json
{
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "build": "tsc -p tsconfig.build.json",
    "start": "node dist/main.js",
    "lint": "eslint src __tests__ --ext .ts",
    "lint:fix": "eslint src __tests__ --ext .ts --fix",
    "format": "prettier --write \"src/**/*.ts\" \"__tests__/**/*.ts\"",
    "format:check": "prettier --check \"src/**/*.ts\" \"__tests__/**/*.ts\"",
    "typecheck": "tsc --noEmit",
    "test": "jest",
    "test:coverage": "jest --coverage",
    "prepare": "husky install"
  }
}
```

---

## GitHub Actions

Two workflows live in `.github/workflows/`:

### `ci.yml` — runs on every push and pull request to `main`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v3
        with:
          version: latest

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Typecheck
        run: pnpm typecheck

      - name: Lint
        run: pnpm lint

      - name: Prettier check
        run: pnpm format:check

      - name: Test with coverage
        run: pnpm test:coverage

      - name: Build
        run: pnpm build
```

**Order matters:** typecheck → lint → prettier → test → build.
If any step fails, the workflow stops and the PR cannot be merged.

---

### `deploy.yml` — runs on push to `main` after CI passes (manual trigger optional)

```yaml
name: Deploy

on:
  workflow_run:
    workflows: [CI]
    types: [completed]
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    if: ${{ github.event.workflow_run.conclusion == 'success' }}

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v3
        with:
          version: latest

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build
        run: pnpm build

      - name: Deploy to Oracle Cloud via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.ORACLE_HOST }}
          username: ${{ secrets.ORACLE_USER }}
          key: ${{ secrets.ORACLE_SSH_KEY }}
          script: |
            cd ~/orb-algo
            git pull origin main
            pnpm install --frozen-lockfile
            pnpm build
            pm2 restart orb-algo
```

**GitHub Secrets required** (set in repo Settings → Secrets → Actions):
| Secret | Value |
|---|---|
| `ORACLE_HOST` | Oracle Cloud instance public IP |
| `ORACLE_USER` | SSH username (e.g. `ubuntu`) |
| `ORACLE_SSH_KEY` | Private SSH key for Oracle instance |

Note: `.env` file with credentials is **never in the repo** — it lives only on the Oracle
server and is managed manually. The deploy step does `git pull` + `pnpm build` + `pm2 restart`
only; it does not touch `.env`.

---

### Project structure addition

```
orb-algo/
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── deploy.yml
```

---

## PM2 Configuration (`ecosystem.config.js`)

```javascript
module.exports = {
  apps: [
    {
      name: 'orb-algo',
      script: './dist/main.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env_production: {
        NODE_ENV: 'production',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
    },
  ],
};
```

---

## Oracle Cloud Deployment Flow

```
1. SSH into Oracle Cloud Free Tier instance (Ubuntu)
2. Install Node.js >= 20 LTS, pnpm, PM2
3. Clone repo: git clone <repo>
4. cd orb-algo && pnpm install
5. Copy .env: cp .env.example .env && vi .env  (fill credentials)
6. Build:  pnpm build
7. Start:  pm2 start ecosystem.config.js --env production
8. Save:   pm2 save
9. Enable on reboot: pm2 startup
```

---

## Complete Daily Flow (Runtime)

```
[Boot / PM2 restart]
  └─ main.ts
       ├─ Validate env
       ├─ NSE holiday check → exit if holiday
       ├─ SmartAPI login (TOTP) → sessionStore
       ├─ Download scrip master → scripMasterStore
       └─ Register cron jobs

[10:30 AM IST — morningScanner]
  ├─ Fetch Nifty 50 top 5 gainers + top 5 losers
  ├─ For each stock: fetch option chain → find OI level
  ├─ Store 10 stocks with watchLevel in tradeStore.watchList
  ├─ Notify Telegram: watchList summary
  └─ Activate priceMonitor

[Every 5 mins — priceMonitor] (while no active trade)
  ├─ Poll LTP for each of 10 stocks
  ├─ Check breakout/breakdown condition
  ├─ If price sustains beyond watchLevel for 5 mins:
  │    ├─ Enter trade (buy option + sell hedge)
  │    ├─ Place SL order on exchange
  │    ├─ Notify Telegram
  │    ├─ Deactivate priceMonitor
  │    └─ Activate tradeMonitor
  └─ (continue polling if no trigger)

[Every 5 mins — tradeMonitor] (while active trade exists)
  ├─ Fetch current LTP of both legs
  ├─ Compute MTM
  ├─ Run trailing SL logic → modify SL order if milestone crossed
  ├─ Check if SL order was hit → exit trade + deactivate tradeMonitor
  └─ At 3:20 PM → force EOD square-off

[EOD]
  └─ Algo idle until next trading day (PM2 keeps process alive)
```

---

## Key Dependencies

```json
{
  "dependencies": {
    "axios": "^1.x",
    "dotenv": "^16.x",
    "express": "^4.x",
    "moment-timezone": "^0.5.x",
    "node-cron": "^3.x",
    "otplib": "^13.x",
    "winston": "^3.x",
    "winston-daily-rotate-file": "^4.x"
  },
  "devDependencies": {
    "@types/express": "^4.x",
    "@types/jest": "^29.x",
    "@types/node": "^20.x",
    "@types/node-cron": "^3.x",
    "@typescript-eslint/eslint-plugin": "^7.x",
    "@typescript-eslint/parser": "^7.x",
    "eslint": "^8.x",
    "eslint-config-prettier": "^9.x",
    "husky": "^9.x",
    "jest": "^29.x",
    "lint-staged": "^15.x",
    "prettier": "^3.x",
    "ts-jest": "^29.x",
    "tsx": "^4.x",
    "typescript": "^5.x"
  }
}
```

---

## README Convention

**README.md must be kept up to date with every change.** This is a hard rule — not optional.

### What README.md must always contain

#### 1. Strategy Explanation

Explain what ORB is and how this algo implements it:

```
# ORB Algo

## What is Open Range Breakout (ORB)?

ORB is a momentum-based intraday options strategy. After the market opens and
settles, we identify stocks that are showing strong directional momentum and
wait for them to break through a key resistance (for gainers) or support
(for losers) level confirmed by options Open Interest data. Once a breakout
is confirmed, we enter a hedged options position and trail our stoploss as
the trade moves in our favour.

## How This Algo Works — Step by Step

1. **10:30 AM IST — Morning Scan**
   Fetch all 50 Nifty 50 stocks via Angel One API. Compute % change from
   previous close. Pick top 5 gainers and top 5 losers.

2. **OI Level Identification**
   For each of the 10 stocks, fetch the monthly options chain.
   - Gainers → find the strike with maximum Call OI *above* spot price = Resistance
   - Losers  → find the strike with maximum Put OI *below* spot price  = Support

3. **Every 5 Minutes — Price Monitoring**
   Poll the spot price of all 10 stocks every 5 minutes. Wait for price to
   breach the identified level and *sustain* beyond it for 5 continuous
   minutes (not just a wick — actual price sustain).

4. **Trade Entry (first confirmed breakout wins, one trade per day)**
   - Buy the Call/Put at the breakout strike (1 lot)
   - Sell a hedge option at a strike where premium ≈ 1/4th of bought premium
     (reduces cost of trade)
   - Place a hard stoploss order on the exchange: max loss ₹3,000

5. **Trailing Stoploss**
   | Profit Milestone | SL Moves To         |
   |------------------|---------------------|
   | ₹2,000           | Entry cost (risk-free) |
   | ₹2,500           | Lock ₹500 profit    |
   | ₹3,000           | Lock ₹1,000 profit  |
   | Every +₹500      | Lock previous ₹500  |

6. **Exit**
   Trade exits when: SL is hit, trailing SL is hit, or 3:20 PM EOD
   square-off — whichever comes first. No second trade that day.

## Real Example

**Date:** Any trading day
**Stock:** APOLLOHOSP, Spot price at 10:30 AM = ₹8,061

**Step 1 — APOLLOHOSP is in top 5 gainers (+2.86% on the day)**

**Step 2 — OI Analysis (monthly expiry)**
Scanning Call OI above ₹8,061:
| Strike | Call OI   |
|--------|-----------|
| 8,100  | 22,375    |
| 8,200  | 34,875    |
| 8,300  | 49,250    |
| 8,400  | 59,750    |
| 8,500  | 1,32,750  ← Max Call OI = Resistance level

→ Watch Level set at ₹8,500

**Step 3 — Price Monitoring**
- 11:05 AM: APOLLOHOSP spot = ₹8,490 (not breached yet)
- 11:10 AM: spot = ₹8,510 → breach detected, breachStartTime recorded
- 11:15 AM: spot = ₹8,525 → still above ₹8,500, 5 mins sustained ✅

**Step 4 — Trade Entry at 11:15 AM**
- BUY  APOLLOHOSP 8500 CE @ ₹180 (1 lot = 125 qty → ₹22,500 debit)
- Find hedge: strike where premium ≈ ₹180/4 = ₹45 → APOLLOHOSP 8700 CE @ ₹44
- SELL APOLLOHOSP 8700 CE @ ₹44  (₹5,500 credit)
- Net debit = ₹22,500 − ₹5,500 = ₹17,000
- Hard SL placed on exchange at net MTM = −₹3,000

**Step 5 — Trailing SL in action**
- 12:00 PM: MTM = +₹2,100 → SL shifted to entry (risk-free, can't lose now)
- 12:30 PM: MTM = +₹2,600 → SL shifted to lock ₹500
- 01:00 PM: MTM = +₹3,100 → SL shifted to lock ₹1,000
- 01:30 PM: MTM = +₹2,800 → SL is at ₹1,000 (doesn't move backward)
- 02:00 PM: MTM = +₹3,600 → SL shifted to lock ₹1,500

**Step 6 — Exit**
- 02:45 PM: MTM drops to ₹1,500 → trailing SL at ₹1,500 is hit
- Exit: SELL bought CE + BUY sold CE at market
- Final P&L: +₹1,500 ✅
```

#### 2. Installation & Setup

```
## Prerequisites
- Node.js >= 20 LTS
- pnpm (`npm install -g pnpm`)
- Angel One account with SmartAPI access + algo trading approval
- Telegram bot token + chat ID for notifications

## Installation

git clone <repo-url>
cd orb-algo
pnpm install

## Environment Setup

cp .env.example .env

Fill in .env:
  API_KEY         — Angel One SmartAPI key
  CLIENT_CODE     — Angel One client code
  CLIENT_PIN      — Angel One login PIN
  CLIENT_TOTP_PIN — 16-character TOTP secret (from Angel One app setup)
  TELEGRAM_BOT_TOKEN — Telegram bot token
  TELEGRAM_CHAT_ID   — Your Telegram chat ID

## Local Development

pnpm dev           # Run with hot reload (tsx watch)
pnpm typecheck     # TypeScript type check
pnpm lint          # ESLint check
pnpm format        # Prettier format (writes in place)
pnpm format:check  # Prettier check (read-only, used by CI)
pnpm test          # Run Jest tests
pnpm test:coverage # Run Jest with 100% coverage check
pnpm build         # Compile TypeScript to dist/
```

#### 3. Deployment (Oracle Cloud Free Tier + PM2)

```
## Deployment on Oracle Cloud Free Tier

### One-time Server Setup

1. Create an Oracle Cloud Free Tier account and provision an
   Always Free VM (Ubuntu 22.04, ARM or AMD).

2. SSH into your instance:
   ssh ubuntu@<your-oracle-ip>

3. Install Node.js 20 LTS:
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs

4. Install pnpm:
   npm install -g pnpm

5. Install PM2:
   npm install -g pm2

6. Clone the repo:
   git clone <repo-url> ~/orb-algo
   cd ~/orb-algo

7. Install dependencies:
   pnpm install --frozen-lockfile

8. Create and fill .env:
   cp .env.example .env
   nano .env   # fill all credentials

9. Build:
   pnpm build

10. Start with PM2:
    pm2 start ecosystem.config.js --env production

11. Save PM2 process list (survives reboots):
    pm2 save

12. Enable PM2 on system startup:
    pm2 startup
    # Run the command it outputs (sudo env PATH=...)

### Updating the Deployment

SSH into server, then:
  cd ~/orb-algo
  git pull origin main
  pnpm install --frozen-lockfile
  pnpm build
  pm2 restart orb-algo

### Monitoring

  pm2 status          # Check if algo is running
  pm2 logs orb-algo   # Live logs
  pm2 monit           # CPU + memory dashboard

### Automated Deploy via GitHub Actions

Every push to main that passes CI automatically:
1. SSHes into Oracle Cloud
2. Runs git pull + pnpm build + pm2 restart

Required GitHub Secrets (Settings → Secrets → Actions):
  ORACLE_HOST     — Oracle instance public IP
  ORACLE_USER     — SSH username (ubuntu)
  ORACLE_SSH_KEY  — Private SSH key
```

### Enforcement

README update is a **developer discipline** enforced via `CLAUDE.md` (see next section).
There is no automated linter for README content — the AI assistant is responsible for
checking whether any committed code change requires a README update and making it before
the commit is finalised.

---

## CLAUDE.md

`CLAUDE.md` lives at the project root and is read by Claude Code (and any other AI assistant
like Gemini) automatically on every session. It encodes project conventions so the AI enforces
them without being told each time.

### Contents of `CLAUDE.md`

```markdown
# ORB Algo — AI Assistant Instructions

## README Update Rule (MANDATORY)

Before finalising any commit, check whether the code changes affect any of the following.
If yes, update README.md first, then commit both together:

- Strategy logic (morningScanner, priceMonitor, tradeMonitor, trailingSlManager)
- Environment variables (.env.example changed)
- Installation or setup steps
- Build, test, or lint commands (package.json scripts changed)
- Deployment process (PM2 config, GitHub Actions workflows)
- New dependencies added or removed

Do NOT commit code changes without updating README if any of the above are affected.
This rule has no exceptions.

## Project Conventions

- Language: TypeScript strict mode, ES modules (import/export — never require())
- Package manager: pnpm (never npm or yarn)
- All code must pass: typecheck → eslint → prettier → jest (100% coverage) → build
- Prettier config is in .prettierrc — never override inline
- No process.env access outside src/config/env.ts
- All external API calls go through src/helpers/api.ts (never raw axios elsewhere)
- Singleton stores live in src/store/ — never use global variables
- All timestamps must use Asia/Kolkata timezone
- Never use console.log — use logger from src/helpers/logger.ts
- Never commit .env — credentials live on server only

## When Adding a New Module

1. Create the source file in src/
2. Create the test file in __tests__/ (mirror the src/ structure)
3. Ensure 100% coverage for the new file
4. Update README.md if the module changes behaviour, setup, or deployment
```

---

## Resolved Decisions

1. **Top movers source** — Fetch all 50 Nifty stocks via Angel One's market quote API
   (`market/v1/quote/` with mode `FULL`), compute % change = `(ltp - close) / close * 100`,
   sort descending for top 5 gainers and ascending for top 5 losers. No external scraping.
   Nifty 50 constituent token list is hardcoded (stable list, changes rarely).

2. **SL breach detection** — Dual approach:
   - Exchange SL order placed at entry (hard safety net — survives process crash)
   - In-app LTP comparison every 5 mins via tradeMonitor (for trailing SL updates)
   - When trailing SL milestone is crossed: call `modifyOrder` API to update exchange SL,
     then update `tradeStore.activeTrade.currentSlValue`
   - If in-app detects breach before exchange fires: place market exit immediately

3. **Session refresh** — Reactive: all API wrappers in `api.ts` catch 401 responses,
   call `login.ts` to re-login, refresh `sessionStore`, then retry the original request
   once. If retry also fails, throw and notify Telegram.

4. **`otplib` version** — Use `^13.x` (latest stable v13.4.0, March 2026).
   v13 is TypeScript-first, async-native, uses `@noble/hashes` + `@scure/base` (audited).
   The `createGuardrails` / `MIN_SECRET_BYTES` workaround from niftyicifalgo is **not needed**
   in v13 — the API is simply `await generate({ secret })`.

## Remaining Open Questions

None. All decisions resolved.
