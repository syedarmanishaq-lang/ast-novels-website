# AST Novels — ast-novels.vercel.app

A premium novel library website. Luffy uploads novels; readers read them in a
beautiful web reader. Installable as a PWA (no Play Store needed).

## Quick start (local preview)

```bash
cd website
python3 -m http.server 8080
# open http://localhost:8080
```

## Publishing workflow (how your novels go live)

1. **Edit** in the admin panel (see below).
2. **Export** — click 📤 *Export all* in the admin sidebar.
3. **Place files** — copy the downloaded `.json` files into `data/novels/`
   and cover images into `img/covers/` of your local copy.
4. **Push to GitHub** — commit & push. Vercel redeploys automatically. 🎉

## Admin panel

**URL:** `/manage-ast9/` (NOT `/admin/` — too easy to guess).

### Your secret admin URL (do this first)
1. Rename the folder `manage-ast9/` to any secret word you like,
   e.g. `manage-blue-mango-42/`.
2. Update `ADMIN_PATH` at the top of `manage-ast9/js/admin.js`.
3. Update the `Disallow:` line in `robots.txt`.
4. Push to GitHub → redeploy. Keep the new URL to yourself.

This is your **first layer** of protection. The password login is the second.

### Your password (no default exists)
- The **first time** you open the admin page, it asks you to **create**
  your own username + password.
- It is hashed with SHA-256 and stored **only in your browser**
  (localStorage). There is no password written anywhere in the code.
- Change it anytime in *Settings → Change password*.

### Features
- 📊 Dashboard — novels, chapters, words, views, drafts, trash stats
- 📚 Novel list — search, filter by language/status
- ➕ Add / ✏️ Edit novels — title, author, language, genre, description,
  cover upload with preview, chapters (add / reorder / delete)
- 📤 Bulk chapter import — paste with `=== Chapter title ===` separators
- 👁️ Preview before publishing
- 📝 Draft / Published toggle (drafts are hidden from the public site)
- 🗑️ Trash / restore / delete forever (soft delete)
- 📈 View counter per novel (counted on the public novel page)
- 🔗 Google Drive / URL sources (see below)
- 📤 Export / 📥 Import JSON (backup & hand-editing)

### Security note
> For maximum security, use the admin panel on your **local copy**
> (`localhost`), not the live `https://` URL. The panel itself shows this
> notice. (Reason: on a static site the admin is client-side; using it
> locally keeps your staged work off the public web until you publish.)

## Google Drive novels (read INSIDE the site)

Readers **never** see the Drive URL and are **never** redirected to Drive.

### How it works
- In the admin, you paste a **Drive share link** → the panel extracts and
  stores **only the file ID** (e.g. `source: {provider:"gdrive", fileId:"…"}`).
- The reader builds the Google Drive API request **at runtime in JavaScript**,
  so the page URL stays `read.html?id=xyz` and no Drive URL ever appears
  in the page HTML.
- **PDFs** render with PDF.js, page by page, inside your reader UI
  (day/sepia/night themes adapt the pages).
- **Text files** are fetched and rendered in the premium text reader.
- A **direct text/JSON URL** source is also supported
  (`source: {provider:"url", url:"…"}`).

### Setup (one time)
1. Upload the file to Google Drive → Share → **"Anyone with the link"**.
2. Get a free **Drive API key**: Google Cloud Console → enable
   *Google Drive API* → Credentials → Create API key. Restrict it to the
   Drive API and to `ast-novels.vercel.app`.
3. Paste the key into `DRIVE_API_KEY` at the top of `js/reader.js`.
4. In the admin, paste the share link → *Test Drive link* to confirm it loads.

## Novel JSON format (`data/novels/`)

One file per novel, plus `index.json` listing them all:

```json
{
  "slug": "my-novel",
  "title": "My Novel",
  "title_en": "My Novel",
  "author": "Author Name",
  "language": "ur",
  "genre": "افسانہ",
  "description": "Short description…",
  "cover": "img/covers/my-novel.jpg",
  "featured": false,
  "sample": false,
  "status": "published",
  "source": { "provider": "gdrive", "fileId": "…" },
  "chapters": [ { "title": "Chapter 1", "text": "…" } ]
}
```

- `language`: `"ur"` (RTL, Urdu typography) or `"en"`.
- Omit `source` for normal chapter-based novels.
- `status`: `"published"` or `"draft"` (drafts hidden publicly).

## Library contents (day one)

**English (Project Gutenberg, public domain):** Pride and Prejudice (61 ch),
Frankenstein (28), Dracula (27), Alice in Wonderland (12),
Sherlock Holmes (12 stories), Moby Dick (135), Treasure Island (34),
The Gift of the Magi, The Tell-Tale Heart.

**Urdu (ur.wikisource.org, public domain):** Toba Tek Singh, Khol Do,
Thanda Gosht (Manto); Selected Poetry of Iqbal (Shikwa, Himala);
Selected Ghazals of Ghalib (30 ghazals); Chandni Raat (sample).

## Tech

- Static HTML/CSS/JS — no build step, no backend.
- PWA: `manifest.json` + `sw.js` (offline reading after first visit).
- SEO: per-page titles/descriptions, OG/Twitter cards, JSON-LD
  (WebSite + Book), `sitemap.xml`, `robots.txt`, canonical URLs,
  Google Translate widget, Search Console verification placeholder.
- Deploy: push to GitHub → Vercel auto-deploys (`ast-novels` project).

## Design

Warm literary aesthetic — paper, ink, oxblood, gold. Cormorant Garamond +
Source Serif 4 + Inter + Noto Nastaliq Urdu. No neon, no glassmorphism,
no gradients-for-show. Hand-crafted book covers (painted English covers,
typographic Urdu series).
