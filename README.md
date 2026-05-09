# ORB Algo

Open Range Breakout (ORB) intraday options trading algorithm for Angel One SmartAPI.

## What is Open Range Breakout (ORB)?

ORB is a momentum-based intraday options strategy. After the market opens and settles, we identify stocks that are showing strong directional momentum and wait for them to break through a key resistance (for gainers) or support (for losers) level confirmed by options Open Interest data. Once a breakout is confirmed, we enter a hedged options position and trail our stoploss as the trade moves in our favour.

## How This Algo Works — Step by Step

1. **10:30 AM IST — Morning Scan**
   Fetch all 50 Nifty 50 stocks via Angel One API. Compute % change from previous close. Pick top 5 gainers and top 5 losers.

2. **OI Level Identification**
   For each of the 10 stocks, fetch the monthly options chain.
   - Gainers → find the strike with maximum Call OI *above* spot price = Resistance
   - Losers  → find the strike with maximum Put OI *below* spot price  = Support

3. **Every 5 Minutes — Price Monitoring**
   Poll the spot price of all 10 stocks every 5 minutes. Wait for price to breach the identified level and *sustain* beyond it for 5 continuous minutes (not just a wick — actual price sustain).

4. **Trade Entry (first confirmed breakout wins, one trade per day)**
   - Buy the Call/Put at the breakout strike (1 lot)
   - Sell a hedge option at a strike where premium ≈ 1/4th of bought premium (reduces cost of trade)
   - Place a hard stoploss order on the exchange: max loss ₹3,000

5. **Trailing Stoploss**
   | Profit Milestone | SL Moves To         |
   |------------------|---------------------|
   | ₹2,000           | Entry cost (risk-free) |
   | ₹2,500           | Lock ₹500 profit    |
   | ₹3,000           | Lock ₹1,000 profit  |
   | Every +₹500      | Lock previous ₹500  |

6. **Exit**
   Trade exits when: SL is hit, trailing SL is hit, or 3:20 PM EOD square-off — whichever comes first. No second trade that day.

## Tech Stack

- **Runtime:** Node.js >= 22 LTS (ES Modules)
- **Language:** TypeScript (Strict mode)
- **Broker:** Angel One SmartAPI
- **Scheduling:** `node-cron`
- **Logging:** Winston
- **Notifications:** Telegram
- **CI/CD:** GitHub Actions
- **Process Manager:** PM2

## Installation & Setup

### Prerequisites
- Node.js >= 20 LTS
- pnpm (`npm install -g pnpm`)
- Angel One account with SmartAPI access
- Telegram bot token + chat ID

### Installation
```bash
git clone <repo-url>
cd orb-algo
pnpm install
```

### Environment Setup
```bash
cp .env.example .env
# Fill in your credentials in .env
```

## Commands

- `pnpm dev`           # Run with hot reload
- `pnpm typecheck`     # Type check
- `pnpm lint`          # ESLint check
- `pnpm format`        # Prettier format
- `pnpm test`          # Run tests
- `pnpm commit`        # Interactive conventional commit
- `pnpm build`         # Compile to JS

## Deployment (Oracle Cloud)

### Manual Initial Setup
1. Clone the repository to `~/orb-algo` on your server.
2. Install dependencies: `pnpm install`.
3. Create and fill `.env`.
4. Build the project: `pnpm build`.
5. Start with PM2: `pm2 start ecosystem.config.cjs`.
6. Save PM2 state: `pm2 save`.

### Automated Deploy
Every push to `master` that passes CI automatically deploys to Oracle Cloud via GitHub Actions.

Required GitHub Secrets:
- `ORACLE_HOST`
- `ORACLE_USER`
- `ORACLE_SSH_KEY`
