# Skyline Web — Firebase Auth + Supabase Data

This version keeps **Firebase Authentication only** and moves Skyline application data and media storage to **Supabase**.

## Architecture

- Firebase Auth: email/password, password reset, Google sign-in, email verification.
- Supabase Postgres: profiles, posts, follows, likes, favorites, chats, inbox, comments/history tables.
- Supabase Storage: `skyline-media` bucket for uploaded images/videos.
- Supabase Edge Function: `skyline-api` verifies the Firebase ID token through Firebase Identity Toolkit, then performs database/storage operations with the Supabase service role. The service-role key is never shipped to the browser.

## Required Supabase setup

1. Open the Supabase SQL editor for the project configured in `supabase-config.js`.
2. Run `supabase/schema.sql`.
3. Deploy `supabase/functions/skyline-api/index.ts` as the `skyline-api` Edge Function.
4. Set these Edge Function secrets:

   - `SUPABASE_URL` — normally provided automatically by Supabase.
   - `SUPABASE_SERVICE_ROLE_KEY` — your Supabase server-side service-role key.
   - `FIREBASE_WEB_API_KEY` — the Firebase Web API key from `firebase-config.js`.

5. Keep `verify_jwt = false` for this function because Firebase, not Supabase Auth, is the identity provider. The function performs its own Firebase ID-token verification before every request.
6. Enable the Google provider in Firebase Authentication if Google login is required, and add your production web domain to Firebase Auth authorized domains.

## Important

Do **not** put `SUPABASE_SERVICE_ROLE_KEY` in any browser file, `.env` exposed to the client, or frontend JavaScript.

The frontend only contains the Supabase publishable key. The Firebase API key is also a client-side key; authorization comes from the Firebase ID token and the Edge Function verification.

## Frontend environment variables

Create a `.env` file from `.env.example` and add the Firebase Web configuration and Supabase project URL/publishable key. Never put the Supabase service-role key in this file.

## Run locally

Serve this directory over HTTP/HTTPS; don't open `index.html` directly from `file://`.

Example:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Data migration from the old Firebase Realtime Database

The schema is designed around the existing Skyline paths such as:

`skyline/users`, `skyline/posts`, `skyline/posts-likes`, `skyline/favorite-posts`, `skyline/followers`, `skyline/following`, `skyline/inbox`, `skyline/chats`, `skyline/line-posts`, comments, profile likes and history.

The web app does not use Firebase Realtime Database or Firebase Storage. Firebase is used only for Authentication. Existing Android data in Firebase Realtime Database is not automatically migrated; run the supplied schema and migration process before expecting the web app to show that old data.
