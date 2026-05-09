# ORB Algo — Project Instructions

This document provides foundational context and instructions for the ORB Algo project, an intraday options trading bot using the Open Range Breakout (ORB) strategy for Nifty 50 stocks via Angel One SmartAPI.

## Project Overview

**Purpose:** Automate the ORB strategy on Nifty 50 stocks, scanning for top movers at 10:30 AM IST, identifying OI levels, and entering hedged trades upon breakout confirmation.

**Core Stack:**
- **Runtime:** Node.js >= 22 LTS (ES Modules)
- **Language:** TypeScript (Strict mode)
- **Broker:** Angel One SmartAPI
- **Scheduling:** `node-cron`
- **Logging:** Winston (Daily rotation, IST timestamps)
- **Notifications:** Telegram Bot API
- **Testing:** Jest + `ts-jest`
- **Process Manager:** PM2

## Architecture

The project follows a modular helper-based architecture with singleton stores for runtime state management.

- **`src/main.ts`**: Orchestrator that bootstraps the app (env check, holiday check, login, scrip download) and registers cron jobs.
- **`src/config/env.ts`**: Centralized, typed environment configuration and validation.
- **`src/store/`**: Singleton classes managing session tokens (`sessionStore`), instrument data (`scripMasterStore`), and active trade/watch state (`tradeStore`).
- **`src/helpers/`**:
    - `api.ts`: Authenticated axios wrapper with interceptors for JWT injection.
    - `marketData.ts`: Logic for LTP, option chains, and identifying top movers.
    - `oiAnalyzer.ts`: Analyzes Open Interest to find support (PE) and resistance (CE).
    - `orders.ts`: Handles trade entry (hedged legs), SL placement, and exits.
    - `trailingSlManager.ts`: State machine for dynamic trailing stop-loss logic.
- **`src/jobs/`**:
    - `morningScanner.ts`: Runs at 10:30 AM IST to pick 10 candidate stocks.
    - `priceMonitor.ts`: Polls LTP every 5 mins to detect and confirm breakouts (5-min sustainability).
    - `tradeMonitor.ts`: Manages live trades, calculates MTM, and triggers trailing SL or EOD square-off.

## Building and Running

**Prerequisites:** Node.js 20+, `pnpm`

### Key Commands

- **Development:** `pnpm dev` (Uses `tsx` watch mode)
- **Build:** `pnpm build` (Outputs to `dist/`)
- **Start (Production):** `pnpm start`
- **Test:** `pnpm test` (Enforces 100% coverage via `jest.config.ts`)
- **Lint:** `pnpm lint` or `pnpm lint:fix`
- **Format:** `pnpm format`
- **Type Check:** `pnpm typecheck`

### Environment Setup

A `.env` file is required (see `.env.example`). Key variables include `API_KEY`, `CLIENT_CODE`, `CLIENT_PIN`, `CLIENT_TOTP_PIN`, and Telegram credentials.

## Development Conventions

- **Module System:** Always use ES Modules (`import`/`export`). Use `.js` extensions in imports where required by Node.js ESM.
- **Type Safety:** Maintain strict TypeScript compliance. Avoid `any` except where absolutely necessary (and justified).
- **Timezones:** All time-sensitive logic (crons, logs) must use `Asia/Kolkata` (IST).
- **State Management:** Use the existing singleton stores in `src/store/` to maintain runtime state. Avoid global variables.
- **Error Handling:** Centralized logging via `src/helpers/logger.ts`. Use Telegram notifications for critical failures and trade updates.
- **Testing:** New features or helpers MUST include unit tests in `__tests__/`. Mock all external API calls using the established Jest patterns.
- **CI/CD:** Husky pre-commit hooks run linting, formatting, and tests on staged files.

## AI Assistant Instructions

### README Update Rule (MANDATORY)

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

### Instruction & Command Review (MANDATORY)

Always review `GEMINI.md` (and specifically the **Project Conventions** below) before executing any shell commands or pushing code. This ensures strict compliance with local environment constraints (e.g., mandatory PowerShell syntax) and project-specific workflows. This is critical to prevent command failures in the local Windows environment.

### Project Conventions

- PowerShell Syntax: Since we are on Windows PowerShell, always use `;` as a statement separator instead of `&&`.
- PowerShell Searching: `grep` is not available. Use `Select-String -Pattern "pattern" -Path file` for searching within files.
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

### Git Conventions

- **Commits:** Use `pnpm commit` for interactive, conventional commit messages. Commit messages are enforced via `commitlint`.
- **Branches:** Branch names must follow the pattern: `<type>/<description>` (e.g., `feature/add-tests`, `fix/login-bug`). Valid types are `feature`, `fix`, `hotfix`, `chore`, `refactor`, `docs`, `test`.
- **PR Titles:** PR titles must follow the conventional commit format (e.g., `feat: implement ORB scanner`). Enforced via GitHub Actions.
- **Pull Requests:** Every PR must have a clear, descriptive title and a detailed description that outlines the changes made, the rationale behind them, and how they were verified. This is mandatory for traceability.

### When Adding a New Module

1. Create the source file in src/
2. Create the test file in __tests__/ (mirror the src/ structure)
3. Ensure 100% coverage for the new file
4. Update README.md if the module changes behaviour, setup, or deployment

## Project Files of Interest

- `blueprint.md`: The original design specification (source of truth for logic).
- `ecosystem.config.cjs`: PM2 configuration for production deployment.
- `src/helpers/constants.ts`: Contains API URLs, Nifty 50 token list, and timing constants.
