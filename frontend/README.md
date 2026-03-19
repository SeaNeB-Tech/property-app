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

Set these variables for production-safe cookie behavior:

```env
NEXT_PUBLIC_COOKIE_DOMAIN=property.seaneb.app
NEXT_PUBLIC_COOKIE_PATH=/
NEXT_PUBLIC_COOKIE_SAMESITE=None
NEXT_PUBLIC_APP_URL=https://your-app-domain
NEXT_PUBLIC_LISTING_URL=https://your-listing-domain
NEXT_PUBLIC_API_BASE_URL=https://dev.seaneb.com/api/v1
```

- If hosted on same origin under a subpath, set `NEXT_PUBLIC_COOKIE_PATH` to that path (example: `/panel`).
- Keep cookie domain aligned with panel host.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Deploy Notes

- Domain: `property.seaneb.app`
- Keep this repo for auth/panel pages only.
