# Getting Started (non-technical guide)

This is a step-by-step walkthrough. You don't need to know how to code.

---

## 1. One-time setup (do this once on your computer)

### Install Node.js

1. Go to **https://nodejs.org/** and click the big green **LTS** download button.
2. Run the installer. Accept all the defaults and click Next, Next, Install.
3. After it finishes, you're done. (No need to open Node.js itself.)

### Open a terminal in this folder

- **Windows**: In File Explorer, open the `Sourcing-Tool` folder. Click the address bar at the top, type `powershell`, and press **Enter**. A blue window will open.
- **Mac**: Open **Terminal**, type `cd `, drag the `Sourcing-Tool` folder onto the window, press **Enter**.

### Install the tool's dependencies

In the terminal, copy-paste this and press Enter:

```
npm install
```

You'll see a wall of text scroll by for about a minute. When you see your prompt again with no error, it's done.

> If you see a few yellow `WARN` lines, that's normal — ignore them. Only worry about red `ERROR` lines.

---

## 2. Starting the tool (every time you want to use it)

In the same terminal window, type:

```
npm run dev
```

You'll see two colored sections of output. Wait until you see a line that says **`Local: http://localhost:5173/`**.

Open your web browser and go to:

**http://localhost:5173**

That's it — the tool is running.

> To **stop** the tool, click on the terminal window and press **Ctrl+C** (Windows) or **Cmd+C** (Mac). To start again later, just `npm run dev` again.

---

## 3. Using the tool

The screen has three main areas: a **left sidebar** (filters), a **top tab bar** (Discover / Saved / Universe), and the **main panel** (results).

### Step 1 — Set your filters in the left sidebar

The sidebar has three tabs at the top: **Product**, **Vertical**, **Company**.

- **Product** — click the type of software you're looking for (ERP, Field Service, CMMS, etc.).
- **Vertical** — click any industries that matter (Metals & Mining, Forestry, Waste & Recycling, …).
- **Company** — pick the kind of business you want:
  - **Ownership**: pick `Founder-Operated` for owner-run companies, or `Vintage PE` for ones acquired before 2020 by a PE firm. (The other options are also there.)
  - **Revenue / Employees / Year Founded**: optional ranges.
  - **PE thesis filters** (checkboxes at the bottom):
    - **Mission-critical** — show only companies where the software is core to operations.
    - **Vertically integrated** — show only purpose-built single-industry vendors.
    - **Proprietary stack** — hide open-source / reseller companies.
    - **Founder-op or vintage PE** — only owner-run or pre-2020 PE-owned.
    - **Min ownership confidence** — slider; higher = stricter.

### Step 2 — Click "Search All Sources"

The big yellow-green button on the right.

You'll see live status updates ("PE portfolios", "Capterra", "Enrich 12/87 …"). Companies stream in one by one as they're found.

When it finishes, every result is sorted by **thesis score** (higher = better fit).

### Step 3 — Review each result

Each card shows:

- **Score** (left circle) — how well it matches your thesis.
- **Ownership tag** — Founder-Operated / Vintage PE / Recent PE / Unknown.
- **MC / VI / Prop** — Mission-Critical / Vertically Integrated / Proprietary, Yes or No.
- **Sources** chips — where the company was found (e.g. `PE:Mainsail Partners · G2 · Apollo`). Multiple sources = stronger signal.

**Click a card to expand it.** You'll see:

- Founded year, HQ, employees, revenue (when available).
- Acquisition history.
- Click the source links to verify the data yourself.
- **Manual triage buttons** — if you can tell from the description that it's a fit (or isn't), click **yes** or **no** to override the automatic scoring. Click **unset** to clear.

### Step 4 — Save the ones you like

Click **+ Save** on any card. The button turns green and the company is added to your **Saved** tab.

> Tip: Click **Find more** to run the search again *excluding* what you've already seen. Great for expanding the universe.

### Step 5 — Add contact details and export

Click the **Saved** tab at the top.

For each saved company, fill in any of:

- Website (if it isn't already filled)
- Contact name, role, email
- Quality tier (Bronze → Platinum)
- Comments / notes

Then click **Export to Excel** in the top-right. A file called `sourcing-file.xlsx` will download with all your saved companies and every enrichment field (thesis score, acquisitions, sources, etc.).

### The Universe tab

This is the long-term memory. **Every** company the tool has ever found across **all** your past searches lives here. You can save / un-save from this tab too — useful for building a pipeline over weeks or months.

---

## 4. Optional: better results with API keys (free tiers available)

The tool works out of the box, but plugging in a few free API keys makes it find a lot more companies and read web pages more reliably.

1. In the `Sourcing-Tool` folder, find the file called **`.env.example`** and make a copy of it named **`.env`** (no extension prefix — just `.env`).
2. Open `.env` in Notepad (Windows) or TextEdit (Mac).
3. For each service below, sign up, get a key, and paste it after the `=`:

| Variable | Where to get a free key | What it does |
| --- | --- | --- |
| `BRAVE_API_KEY` | https://brave.com/search/api/ | Web search across the open web |
| `EXA_API_KEY` | https://exa.ai/ | "Find similar companies" neural search |
| `OPENAI_API_KEY` | https://platform.openai.com/api-keys | Optional: mission-critical / vertical-integration judgment via GPT |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com/ | Optional: same, via Claude |
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey | Optional: same, via Gemini |

4. Save the file.
5. **Stop the tool** (Ctrl+C in the terminal) and **restart it** (`npm run dev`).
6. To turn on the LLM classifier, click the **⚙ gear icon** in the top right of the app and pick your provider.

Keys stay on your computer. They are never sent to the browser.

---

## 5. Troubleshooting

**The page says "Stream disconnected" or shows no results.**
Stop the tool with Ctrl+C and run `npm run dev` again. Make sure both the `server` and `web` lines started without red text.

**"npm is not recognized" or "command not found".**
Node.js didn't install properly, or you opened the wrong terminal. Re-install Node.js from https://nodejs.org/ and open a **new** terminal window.

**Most companies say "Unknown" ownership.**
Add a `BRAVE_API_KEY` (free) to your `.env` file — it dramatically improves acquisition-year detection.

**The tool is slow.**
First search is slowest because it scrapes 20 PE-firm portfolio pages from scratch. Subsequent searches re-use what's already in `universe.db` and only enrich new domains.

**I want to start fresh.**
Stop the tool, delete the file `universe.db` in the `Sourcing-Tool` folder, then `npm run dev` again.

---

## 6. Where things live (for the curious)

- `universe.db` — your private database of every company ever discovered.
- `.env` — your API keys (never share this file).
- `sourcing-file.xlsx` — saved to your **Downloads** folder when you export.
- Everything else — code; ignore it.
