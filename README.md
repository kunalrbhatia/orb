# ORB Algo

Open Range Breakout (ORB) intraday options trading algorithm for Angel One SmartAPI.

## What is Open Range Breakout (ORB)?

ORB is a momentum-based intraday options strategy. After the market opens and settles, we identify stocks that are showing strong directional momentum and wait for them to break through a key resistance (for gainers) or support (for losers) level confirmed by options Open Interest data. Once a breakout is confirmed, we enter a hedged options position and trail our stoploss as the trade moves in our favour.

## How This Algo Works — Step by Step

1. **09:00 AM IST — Daily Initialization**
   The bot automatically logs into Angel One, downloads the latest scrip master data, and clears any state from the previous day. This ensures fresh session tokens and instruments for the new trading day.

2. **10:30 AM IST — Morning Scan**
   Fetch all 50 Nifty 50 stocks via Angel One API. Compute % change from previous close. Pick top 5 gainers and top 5 losers.

3. **Resistance and Support Identification**
   For each of the 10 stocks, fetch the monthly options chain and the morning's candle data (from 9:15 AM to 10:30 AM).
   - **Resistance (Gainers):** The higher of (Maximum Call OI strike above spot) and (Morning High).
   - **Support (Losers):** The lower of (Maximum Put OI strike below spot) and (Morning Low).
   This dual-check ensures we only enter trades when both price action and heavy OI levels are cleared.

4. **10:35 AM IST to 03:25 PM IST — Price Monitoring**
   Poll the spot price of all 10 stocks every 5 minutes. Wait for price to breach the identified level and *sustain* beyond it for 5 continuous minutes (not just a wick — actual price sustain).

5. **Trade Entry (first confirmed breakout wins, one trade per day)**
   - Buy the Call/Put at the breakout strike (1 lot)
   - Sell a hedge option at a strike where premium ≈ 1/4th of bought premium (reduces cost of trade)
   - Place a hard stoploss order on the exchange: max loss ₹3,000

6. **Trailing Stoploss**
   | Profit Milestone | SL Moves To         |
   |------------------|---------------------|
   | ₹2,000           | Entry cost (risk-free) |
   | ₹2,500           | Lock ₹500 profit    |
   | ₹3,000           | Lock ₹1,000 profit  |
   | Every +₹500      | Lock previous ₹500  |

7. **Exit**
   Trade exits when: SL is hit, trailing SL is hit, or 3:20 PM EOD square-off — whichever comes first. No second trade that day.

## Resilience & Efficiency

- **Exponential Backoff:** Implements robust retry logic with a 2-second initial delay for failed requests, specifically handling `403 Forbidden` and `429 Too Many Requests` status codes, as well as Angel One's custom "status: false" error patterns.
- **Throttled Scanning:** The morning scanner uses deliberate delays (3s between stocks, 1s between historical requests) to respect strict broker rate limits (3 requests per second for historical data), ensuring stability during high-load morning periods.
- **Diagnostic Observability:** Enhanced logging captures snippets of rejection responses and HTTP methods to troubleshoot network-level blocks and rate-limiting in production.
- **Dynamic Monthly Expiry:** Automatically detects and targets the final Thursday of the current month (or the next, if the current month's expiry has passed) to ensure option chain data is always current and valid.

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

## Telegram Commands

The following commands can be sent to the Telegram bot to control the algorithm in real-time:

- `/killorb`: Activates the **Soft Kill Switch**. Suspends all core tasks (scanning, monitoring, trading) but keeps the process alive.
- `/resumeorb`: Deactivates the Soft Kill Switch and resumes normal operations.
- `/paperorb`: Toggles **Paper Trading Mode**. When enabled, the algo performs all calculations and scans but mocks order placement instead of taking actual trades.

## Soft Kill Switch

The Soft Kill mechanism is designed for emergency pauses without losing the bot's state.

- **Suspend:** Send `/killorb`. The bot will stop executing scheduled tasks and notify you.
- **Resume:** Send `/resumeorb`. The bot will resume its schedule immediately.
- **Advantages:** Unlike a hard process shutdown, Soft Kill maintains your Angel One session and scrip data in memory, saving API rate limits and avoiding heavy bootstrap phases.

## Paper Trading Mode

Paper mode allows you to test the algorithm without risking real capital.

- **Toggle:** Send `/paperorb` via Telegram.
- **Verification:** When enabled, all trade notifications in Telegram will be prefixed with `[PAPER]`.
- **Persistence:** The mode persists across restarts via a `.paper-trade` file in the root directory.

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
