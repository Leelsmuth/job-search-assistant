# Job Search Assistant browser extension

Chrome extension (Manifest V3) that fills an application page from the profile and prepared answers already stored in the app. It can also save the open posting to the tracker.

The extension never submits a form, never clicks Submit or Apply, and never moves a multi-step form past the final review page. You read the page and submit it yourself.

## Before you load it

Apply [`drizzle/migrations/0020_extension_tokens.sql`](../drizzle/migrations/0020_extension_tokens.sql) in the Supabase SQL editor. The extension API returns an error until that table exists. Do not merge the app change until the migration has been applied. Do not run it from CI.

In the app, open **Settings → Browser extension** and create a token. It is shown once. The server stores only a SHA-256 hash. Tokens expire after 14 days, are limited to five active tokens per account, and can be revoked. A token can read the application profile and prepared answers, and can write tracker entries. It cannot do anything else.

No Supabase key is packaged in the extension. The extension talks only to `https://job-search-assistant-virid.vercel.app`.

Attaching the original uploaded resume PDF needs `SUPABASE_SERVICE_ROLE_KEY` on the server (Vercel env, never in the extension). Without it, the extension attaches a PDF rendered from the saved resume text. A tailored resume or cover letter for the matched job is used when one is already saved. The extension does not generate new answers.

## Build

From this directory:

```bash
npm install
npm run build
npm run zip
```

`npm run build` writes an unpacked extension to `extension/dist`. `npm run zip` writes `extension/dist/job-search-assistant.zip`.

## Load unpacked

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and choose the `extension/dist` folder (the folder that contains `manifest.json`, not the zip).
4. Click the extension icon. The side panel opens.
5. Paste the token from Settings and choose **Link account**.

The public key in the manifest keeps the extension id stable (`epkapkpodghpodnfdpmfhenkdhmnigni`), which is the only browser origin the API allows.

## What it does

- **Fill this page** on Greenhouse, Lever, Ashby, and Workday application pages. It sets native input values and dispatches `input` and `change` so React-controlled fields update. Workday is handled one step at a time: open the next step yourself and fill again. On a Review step it stops.
- Required fields it cannot fill are listed in the panel and outlined on the page. Voluntary EEO questions stay empty unless you already saved an answer.
- **Save to tracker** on any posting you are viewing, including LinkedIn and Indeed. Click the toolbar icon first so Chrome grants access to that tab. Title, company, location, URL, and description are captured best-effort; edit the title and company before saving. The same URL is not added twice.
- **Mark as applied** writes the existing assisted-apply tracker event. It does not submit the employer form.

## Permissions

| Permission | Why |
| --- | --- |
| `activeTab` | Read the posting you just opened the panel on, including LinkedIn and Indeed |
| `scripting` | Run the local fill script on that tab |
| `storage` | Keep the extension token on this computer |
| `sidePanel` | Show the fill and tracker panel |
| Host access | The app, plus Greenhouse, Lever, Ashby, and Workday |

There is no remote code. Page contents are sent only to the app, and only after you link a token.
