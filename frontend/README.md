This is the SeaNeB Property Panel/Auth app.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

`npm run dev` uses the port from `NEXT_PUBLIC_APP_URL` in `.env`.
Open the URL configured in `NEXT_PUBLIC_APP_URL` with your browser to see the result.

## Environment

Use the existing env keys below. Cookie and auth timing defaults are handled in code now, so you do not need extra cookie/api env aliases.

```env
NEXT_PUBLIC_APP_URL=https://your-app-domain
NEXT_PUBLIC_LISTING_URL=https://your-listing-domain
NEXT_ENV=development
NEXT_PUBLIC_DEV_URL=https://dev.seaneb.com
NEXT_PUBLIC_CENTRAL_URL=https://central-api.seaneb.com
NEXT_PUBLIC_PRODUCT_KEY=property
```

- In production, cookie defaults use the `.seaneb.com` parent domain automatically.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Deploy Notes

- Domain: `property.seaneb.app`
- Keep this repo for auth/panel pages only.
