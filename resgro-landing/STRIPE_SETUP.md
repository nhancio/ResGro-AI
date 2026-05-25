# Stripe Setup Guide for ResGro

## 1. Create a Stripe Account
Go to https://dashboard.stripe.com and sign up or log in.

## 2. Create the Product & Price

1. Go to **Products** → **Add product**
2. Set:
   - **Name:** ResGro Pro
   - **Description:** AI-powered restaurant growth — full analytics + autonomy agent
3. Under **Pricing**, add a price:
   - **Currency:** AUD
   - **Amount:** $250.00
   - **Billing period:** Monthly
   - **Free trial:** 30 days
4. Save the product

## 3. Create a Payment Link (Easiest Method)

1. Go to **Payment Links** → **New**
2. Select the **ResGro Pro** product/price you just created
3. Enable **Free trial** (30 days)
4. Under **After payment**, set redirect URL to:
   ```
   https://app.resgro.ai/#/app
   ```
   (or `http://localhost:3000/#/app` for local testing)
5. Copy the Payment Link URL (e.g., `https://buy.stripe.com/xxx`)

## 4. Add Keys to `.env`

Create a `.env` file in the project root with:

```env
# Stripe
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_xxxxxxxxxxxxxxxxxxxxx
VITE_STRIPE_CHECKOUT_URL=https://buy.stripe.com/your-payment-link-id
```

For testing, use your **test mode** keys:
```env
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxxxxxxxxxx
VITE_STRIPE_CHECKOUT_URL=https://buy.stripe.com/test_your-test-link-id
```

## 5. DNS Setup for app.resgro.ai

To have `app.resgro.ai` serve the app:

### Option A: Netlify (Recommended)
1. In Netlify, go to **Domain settings** → **Add custom domain**
2. Add `app.resgro.ai`
3. In your DNS provider, add a CNAME record:
   - **Name:** `app`
   - **Value:** your Netlify site URL (e.g., `your-site.netlify.app`)
4. The hash-based routing (`#/app`, `#/app-demo`) handles everything on the same deploy

### Option B: Separate Deployment
Deploy a second instance of this app on `app.resgro.ai` if you want full separation.

## 6. Flow Summary

```
resgro.ai (main website)
  ├── "App — Paid" button → #/pricing page → Stripe checkout → redirect to #/app (paid portal)
  └── "App — Demo" button → #/app-demo (demo portal, no payment)

app.resgro.ai (optional separate domain)
  ├── #/app or #/Start Now → Paid app portal (Self-Serve + Autonomy)
  └── #/app-demo → Demo app portal (limited features)
```

## Environment Variables Summary

| Variable | Where to find | Example |
|----------|--------------|---------|
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe Dashboard → Developers → API keys | `pk_live_xxx` |
| `VITE_STRIPE_CHECKOUT_URL` | Stripe Dashboard → Payment Links | `https://buy.stripe.com/xxx` |
| `VITE_EMAILJS_PUBLIC_KEY` | EmailJS Dashboard (already configured) | — |
| `VITE_EMAILJS_SERVICE_ID` | EmailJS Dashboard (already configured) | — |
| `VITE_EMAILJS_TEMPLATE_ID` | EmailJS Dashboard (already configured) | — |
