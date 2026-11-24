# Fakka فكّة — your change, digitally

When a shop has no small change, Fakka sends the change to the customer's phone instead of handing out candy or saying "keep it". Customers can then spend it at another shop, send it to a friend, or donate it.

This repo contains a **bilingual (Arabic / English, RTL-aware) website and an installable web app prototype**. It's plain HTML, CSS, and JavaScript, with no build step.

## What's inside

| Path | What it is |
|---|---|
| `index.html` | Marketing landing page: hero, problem, how it works, customers vs merchants, FAQ, waitlist |
| `app/` | The Fakka app, an installable PWA with offline shell |
| `assets/base.css` | Shared design tokens (light and dark mode) |
| `assets/i18n.js` | Tiny translation helper, AR/EN toggle, EGP formatting |
| `assets/site-strings.js`, `app/strings.js` | All copy in English and Egyptian Arabic |

## The app

**Customer wallet**
- **Receive:** shows your QR code and number for the cashier
- **Pay:** spend your balance at a Fakka shop
- **Send:** give fakka to a friend
- **Donate:** one-tap "spare piasters" donation to a cause
- Activity history

**Merchant mode**
- **Give change:** enter the bill and the cash paid. The app works out the change and suggests the part that can't be paid with notes (below EGP 5) as fakka. It sends to a customer's number, and unknown numbers get a wallet waiting for them.
- **Top up:** add to the change float (simulated)
- Today's summary and history, plus a "My code" screen for receiving payments

Limits follow the website's FAQ: up to **EGP 20** per change transaction. Amounts are stored as integer piasters.

### Try the live demo
1. Open `app/` and tap **Demo shop**.
2. Open `app/` in a **second tab** and tap **Demo customer**.
3. In the shop tab, choose **Give change**, enter bill 46.50 and paid 50, tap **Mona (demo)**, then **Send change**.
4. The customer tab updates instantly with a notification.

## Run locally

Any static server works:

```bash
python3 -m http.server 8000
# website: http://localhost:8000/
# app:     http://localhost:8000/app/
```

You can also open `index.html` directly from disk. The service worker (offline and install) only runs when served over http(s).

## Deploy

It's a static site, so it can go on GitHub Pages, Netlify, Vercel, or Cloudflare Pages with no configuration. With GitHub Pages: *Settings → Pages → Deploy from branch*, root folder.

## Prototype limits / next steps

This is a clickable prototype. All data lives in the browser's `localStorage`, and there is no real money, server, or authentication. To go to production you'd need:

- A backend ledger (double-entry, idempotent transfers) plus an API
- Phone OTP sign-in and a wallet PIN
- Payment-partner integration for merchant top-ups and customer cash-out (bank / mobile wallets), plus licensing with the Central Bank of Egypt (e-money regulations)
- QR scanning with the camera on the merchant side
- Native apps (e.g. React Native / Expo) reusing the same flows and copy
- A real waitlist backend (the form currently saves only in the browser)
