# Google Calendar — One-time setup (≈30 minutes)

This is the only manual step Nigel has to complete before each staff
member can connect their Google Calendar to the platform. After this,
Tove and Jade just click "Connect Google Calendar" inside their staff
profile — they don't touch the Cloud Console.

## 1. Create a Google Cloud project

1. Go to <https://console.cloud.google.com/>.
2. Top bar → project picker → **New project**.
3. Name: `astrabody-platform`. Organisation: leave default.
4. Click **Create**, wait ~10 seconds, then select the new project.

## 2. Enable the Calendar API

1. In the left menu → **APIs & Services → Library**.
2. Search **Google Calendar API** → click it → **Enable**.

## 3. Configure the OAuth consent screen

1. **APIs & Services → OAuth consent screen**.
2. User type: **External** → Create.
3. Fill in:
   - App name: `Astrabody Platform`
   - User support email: `enquiries@astrabody.co.uk`
   - App logo: upload Astrabody logo (sage on cream)
   - App domain: `astrabody.co.uk`
   - Authorised domains: `astrabody.co.uk`
   - Developer contact: `enquiries@astrabody.co.uk`
4. **Scopes** step → Add the following scopes:
   - `https://www.googleapis.com/auth/calendar` (read/write all calendars)
   - `https://www.googleapis.com/auth/calendar.events` (events only — narrower fallback)
   - `openid`, `email`, `profile`
5. **Test users** step → add yourself, Tove, Jade. (You can stay in
   *Testing* status until you publish the app; up to 100 test users.)
6. Save and continue.

## 4. Create OAuth client credentials

1. **APIs & Services → Credentials → + Create credentials → OAuth client ID**.
2. Application type: **Web application**.
3. Name: `astrabody-platform-web`.
4. **Authorised JavaScript origins**:
   - `http://localhost:3000` (local dev)
   - `https://platform.astrabody.co.uk` (production — adjust to the real domain)
5. **Authorised redirect URIs**:
   - `http://localhost:3000/api/google/callback`
   - `https://platform.astrabody.co.uk/api/google/callback`
6. **Create**. Google shows a dialog with two strings — copy them now,
   you won't see the secret again:
   - **Client ID**: ends in `.apps.googleusercontent.com`
   - **Client secret**: starts with `GOCSPX-`

## 5. Add the credentials to the platform `.env`

In `astrabody-platform/.env.local`:

```
GOOGLE_OAUTH_CLIENT_ID=<paste>
GOOGLE_OAUTH_CLIENT_SECRET=<paste>
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/google/callback
# In production, set GOOGLE_OAUTH_REDIRECT_URI to the https URL above.

# Token encryption — generate with: openssl rand -base64 32
GCAL_TOKEN_ENCRYPTION_KEY=<32-byte base64 secret>
```

The encryption key is what we use at the application layer to encrypt
each staff's refresh token before writing it to
`google_calendar_integrations.refresh_token_enc`. **Never** log it,
never commit it, never share it on Slack.

## 6. Publish the app (when ready for non-test users)

While in *Testing*, Google forces a scary "unverified app" warning and
caps you at 100 users. To remove both:

1. **OAuth consent screen → Publish app**.
2. Google asks for verification because we use a sensitive scope
   (`auth/calendar`). Submit:
   - Privacy policy URL: `https://astrabody.co.uk/privacy`
   - Demo video: 30-second screencast of the OAuth flow
   - Justification: "Each staff member connects their own calendar to
     receive bookings created by their employer's booking platform."
3. Verification takes 4–6 weeks. While it's pending, the test list
   continues to work — keep adding users there if needed.

> **Tip**: launch with the test list for the first 6–8 weeks of
> production. Astrabody only needs three calendars (Nigel, Tove, Jade)
> + a buffer for new hires. Submit verification once we're ready to
> resell to other tenants.

## 7. What the staff sees

Once steps 1–5 are done, the flow on the platform is:

1. Tove logs into `platform.astrabody.co.uk` with her Astrabody email.
2. Goes to **Settings → My calendar** → clicks **Connect Google Calendar**.
3. Redirected to Google, signs in with her own Google account, sees the
   Astrabody Platform consent screen, clicks **Allow**.
4. Redirected back. Her status now reads **Connected — primary calendar**.
5. From this point on, every booking assigned to Tove appears as an event
   on her Google Calendar within seconds, and any block she adds in
   Google Calendar (lunch, off-time) makes the matching slot disappear
   from the public booking page.

No app to install. Native on iPhone, Mac Calendar, Outlook calendar
subscription, etc.

## 8. Troubleshooting

- **"redirect_uri_mismatch" on callback** → the URI in `.env.local`
  must match exactly (scheme, host, port, path) one of the entries in
  step 4.5. Trailing slashes count.
- **"Access blocked: this app is not verified"** → expected while in
  *Testing*. Add the user to the test list (step 3.5) or click
  *Advanced → Continue* to bypass.
- **Refresh token missing** → happens on the second consent for the
  same Google account. Solution: pass `prompt=consent&access_type=offline`
  on every authorise request (the platform does this by default).
- **Calendar events not syncing back** → confirm the scope
  `auth/calendar` (not just `auth/calendar.events`) was granted, and
  that the staff's `is_active` flag in `google_calendar_integrations`
  is true.

## 9. Security notes

- Refresh tokens are encrypted with `GCAL_TOKEN_ENCRYPTION_KEY` before
  hitting the database. A Supabase leak alone does not compromise calendars.
- Access tokens are short-lived (1 hour). They're cached in
  `access_token` only as a warm cache; we always have the refresh token
  to re-issue.
- Each staff's calendar is private to that staff member's row — RLS
  prevents another tenant or another staff from reading the tokens.
- Revocation: if a staff leaves, set `is_active = false` and call
  `https://oauth2.googleapis.com/revoke?token=<refresh_token>` once
  before deleting the row. The platform admin UI does this automatically.
