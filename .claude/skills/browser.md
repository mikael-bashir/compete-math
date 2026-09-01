# Browser Skill

A headed Chrome instance is already running, launched and kept alive by the session daemon. You can connect to it via Playwright using the Chrome DevTools Protocol (CDP).

## Finding the port

Read `.claude/browser-port` in the current worktree root:

```bash
cat .claude/browser-port
```

This gives you the CDP port (e.g. `9910`).

## Connecting with Playwright

```typescript
import { chromium } from 'playwright';

const port = (await import('fs')).readFileSync('.claude/browser-port', 'utf8').trim();
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const [context] = browser.contexts();
const [page] = context.pages();
```

Always use `connectOverCDP` — never `chromium.launch()`. The daemon manages the browser lifecycle; launching a new instance will conflict.

## Common actions

**Navigate and wait for load:**
```typescript
await page.goto('http://localhost:3000/account');
await page.waitForLoadState('networkidle');
```

**Click and interact:**
```typescript
await page.getByRole('button', { name: 'Add Credits' }).click();
await page.getByLabel('Amount').fill('50');
```

**Take a screenshot to inspect current state:**
```typescript
await page.screenshot({ path: '/tmp/browser-check.png' });
```

**Read visible text:**
```typescript
const text = await page.locator('main').innerText();
```

**Wait for navigation or element:**
```typescript
await page.waitForURL('**/account');
await page.waitForSelector('[data-testid="balance"]');
```

## Running via Bash

You can also run one-off Playwright scripts through Bash without writing a file:

```bash
node -e "
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const port = fs.readFileSync('.claude/browser-port', 'utf8').trim();
  const browser = await chromium.connectOverCDP('http://localhost:' + port);
  const page = browser.contexts()[0].pages()[0];
  await page.goto('http://localhost:3000');
  console.log(await page.title());
  await browser.close(); // disconnects only — does not kill the daemon
})();
"
```

## Rules

- Always `browser.close()` (disconnect) when done — this disconnects the CDP session but does not kill Chrome.
- Never call `browser.contexts()[0].close()` or `context.browser().close()` — that would kill the persistent profile.
- The dev server is separate; start it with `pnpm dev` if it isn't running. The browser daemon does not start the app server.
- If `connectOverCDP` fails, the daemon may not have fully started yet — wait a couple of seconds and retry once.
