# 🚗 קיר חברתי לבעלי רכב — Car Owners Social Wall

A fully client-side, static MVP web app that lets anyone post notices, warnings,
compliments, or questions about a vehicle licence plate number.
No custom backend — all data is stored in the user's own **Google Drive**.

> **Language:** Hebrew-first RTL UI | **Hosting:** GitHub Pages | **DB:** Google Drive (JSON files)

---

## Live Demo

🌐 **[https://asaflevi1983.github.io/Adani/](https://asaflevi1983.github.io/Adani/)**

---

## Features

- 🔐 **Mandatory Google Sign-In gate** — search and post are blocked until authenticated
- 📁 **Google Drive as DB** — one JSON file per plate inside `AdaniDB/vehicles/`
- 🔍 **Search by plate** — normalized to digits only
- 📝 **Post categories** — Notice / Warning / Compliment / Question (Hebrew)
- 🗑️ **Delete your own posts**
- 📱 **Responsive RTL layout**
- ⚡ **No build step** — plain HTML / CSS / JS

---

## Setup Instructions

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Click **"Select a project"** → **"New Project"** → give it a name → **Create**.

### 2. Enable the Google Drive API

1. In the left sidebar go to **"APIs & Services"** → **"Library"**.
2. Search for **"Google Drive API"** and click **Enable**.

### 3. Configure the OAuth Consent Screen

1. Go to **"APIs & Services"** → **"OAuth consent screen"**.
2. Choose **External** (unless you have a Google Workspace org).
3. Fill in the required fields (app name, support email).
4. Under **Scopes** add:
   - `https://www.googleapis.com/auth/drive.file`
5. Under **Test users** add your own Google account (and any other testers).
6. Save and continue.

> ⚠️ **Security note:** Keep the app in "Testing" mode and limit to known test users
> until you have completed a Google verification review (required for production).

### 4. Create an OAuth 2.0 Client ID

1. Go to **"APIs & Services"** → **"Credentials"** → **"Create Credentials"** → **"OAuth client ID"**.
2. Application type: **Web application**.
3. Under **Authorized JavaScript origins** add:
   ```
   http://localhost:8080
   https://<your-github-username>.github.io
   ```
4. Click **Create**. Copy the **Client ID**.

### 5. Create `docs/config.js`

```bash
cp docs/config.example.js docs/config.js
```

Edit `docs/config.js` and replace `YOUR_CLIENT_ID_HERE.apps.googleusercontent.com`
with the Client ID you just copied:

```js
window.APP_CONFIG = {
  googleClientId: "123456789-abc.apps.googleusercontent.com",
};
```

> ⚠️ `docs/config.js` is listed in `.gitignore` — **never commit it**.

---

## Run Locally

You need a simple static server (browsers block file:// for some APIs).

**Using Python (built-in):**
```bash
cd docs
python3 -m http.server 8080
```
Then open [http://localhost:8080](http://localhost:8080).

**Using Node.js (`serve`):**
```bash
npx serve docs -p 8080
```

---

## Deploy to GitHub Pages

### One-time setup (repository settings)

1. Go to your repository on GitHub.
2. **Settings** → **Pages**.
3. Under **Source** select **"GitHub Actions"**.

### Deploy

Push to `main` — the included workflow (`.github/workflows/pages.yml`) will
automatically deploy the `docs/` folder to GitHub Pages.

You can also trigger it manually:
**Actions** → **"Deploy to GitHub Pages"** → **"Run workflow"**.

> **Note:** `docs/config.js` is gitignored and will NOT be included in the deployment.
> For a public deployment you will need an alternative approach to inject the Client ID
> (e.g., a build step that reads a GitHub Secret). For a private/test deployment,
> you can temporarily commit `config.js` to a **private** repo only.

---

## File Structure

```
Adani/
├── docs/
│   ├── index.html          ← App shell (RTL Hebrew UI)
│   ├── app.js              ← Hash router + UI controllers
│   ├── driveStore.js       ← Google Drive auth + CRUD
│   ├── styles.css          ← Responsive RTL styles
│   ├── config.example.js   ← Config template (commit this)
│   └── config.js           ← Your secrets (gitignored, DO NOT commit)
├── .github/
│   └── workflows/
│       └── pages.yml       ← GitHub Pages deploy workflow
├── .gitignore
└── README.md
```

---

## Google Drive Data Layout

```
My Drive/
└── AdaniDB/
    └── vehicles/
        ├── 1234567.json
        ├── 9876543.json
        └── ...
```

Each file contains:
```json
{
  "plate": "1234567",
  "posts": [
    {
      "id": "uuid",
      "category": "warning",
      "content": "חנה במקום אסור",
      "createdAt": 1710000000000,
      "author": { "email": "user@example.com", "name": "ישראל ישראלי" }
    }
  ]
}
```

---

## Hash Routes

| Hash | Page |
|------|------|
| `#/` | Home / plate search |
| `#/vehicle/<plate>` | Vehicle posts + new post form |
| `#/about` | About / disclaimers |

---

## Disclaimers

- This is a **demo MVP** — not a production product.
- **No official Ministry of Transport integration.** Plate numbers are not verified.
- Content stored in the **user's own Drive** — no central server.
- The app uses `drive.file` scope (access only to files it created).

