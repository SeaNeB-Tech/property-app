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

Open [http://159.65.154.221:1002](http://159.65.154.221:1002) with your browser to see the result.

## Environment

Set these variables for production-safe cookie behavior:

```env
NEXT_PUBLIC_COOKIE_DOMAIN=property.seaneb.app
NEXT_PUBLIC_COOKIE_PATH=/
NEXT_PUBLIC_COOKIE_SAMESITE=Lax
NEXT_PUBLIC_LISTING_APP_URL=http://159.65.154.221:1001
NEXT_PUBLIC_API_BASE_URL=https://dev.seaneb.com/api/v1
```

- If hosted on same origin under a subpath, set `NEXT_PUBLIC_COOKIE_PATH` to that path (example: `/panel`).
- Keep cookie domain aligned with panel host.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Deploy Notes

- Domain: `property.seaneb.app`
- Keep this repo for auth/panel pages only.
