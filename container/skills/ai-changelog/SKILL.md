---
name: ai-changelog
description: Fetch the past week of changelog entries from Anthropic, Google Gemini, and OpenAI, generate a beautiful HTML dashboard, deploy it to Vercel, and return the URL. Use when the user says "差分", "diff", "changelog", "AI更新", "最近の変更", "AI changelog", "AI updates", "weekly AI news", or asks about recent changes from AI providers.
allowed-tools: Bash(agent-browser:*)
---

# AI Changelog — Weekly Summary

Fetch changelogs from Anthropic, Google Gemini, and OpenAI for the past 7 days, generate a styled HTML dashboard, deploy to Vercel, and return the live URL.

## Step 1: Determine Date Range

```bash
echo "Today: $(date +%Y-%m-%d)"
echo "7 days ago: $(date -d '7 days ago' +%Y-%m-%d 2>/dev/null || date -v-7d +%Y-%m-%d)"
```

Use these dates to filter changelog entries.

## Step 2: Fetch Changelogs

### Anthropic

Use `WebFetch` to retrieve:

```
https://platform.claude.com/docs/en/release-notes/overview
```

This is static HTML. Parse the response for date-stamped sections and extract entries from the past 7 days. Look for date headings (e.g., "March 18, 2026") and their associated bullet points or descriptions.

If WebFetch fails, fall back to `agent-browser`:
```bash
agent-browser open "https://platform.claude.com/docs/en/release-notes/overview"
agent-browser wait --load networkidle
agent-browser snapshot
```

### OpenAI

Use `WebFetch` to retrieve:

```
https://developers.openai.com/changelog/
```

This is a static Astro site. Parse the HTML for changelog entries with dates and descriptions. Filter to the past 7 days.

**Do NOT use** `platform.openai.com/docs/changelog` — it returns 403.

If WebFetch fails, fall back to `agent-browser`.

### Google Gemini

This page is a JavaScript SPA and **requires a browser**. Use `agent-browser`:

```bash
agent-browser open "https://ai.google.dev/gemini-api/docs/changelog"
agent-browser wait --load networkidle
agent-browser snapshot
```

Extract changelog entries from the rendered page content. Filter to the past 7 days.

If agent-browser fails, try `WebFetch` as a fallback (some content may be in the initial HTML).

## Step 3: Handle Missing Data

For each provider:
- If the page loads but no entries exist in the past 7 days → show "No updates this week"
- If the page fails to load entirely → show "Could not fetch updates" with a subtle error style
- **If ALL three providers fail → report the error to the user and do NOT deploy**

## Step 4: Generate HTML

Create a single `index.html` file with all CSS inlined. The design should be:

**Layout:**
- Dark header bar with title "AI Changelog" and the date range (e.g., "Mar 15 – Mar 22, 2026")
- Three provider sections, each with a colored header card
- Entries displayed as cards within each section, grouped by date
- Footer with "Generated on [timestamp]"

**Brand colors:**
- Anthropic: `#D97757` (coral)
- OpenAI: `#000000` (black)
- Google Gemini: `#4285F4` (blue)

**Design philosophy — avoid generic AI aesthetics:**

You tend to produce safe, predictable designs. Do NOT do that here. Make this feel like a hand-crafted editorial dashboard, not a template.

<frontend_aesthetics>
Typography:
- Load distinctive fonts from Google Fonts. Never use Inter, Roboto, Arial, or system fonts.
- Good choices: Bricolage Grotesque for headings, JetBrains Mono for dates/tags, Crimson Pro for body.
- Use extreme weight contrasts (200 vs 800), size jumps of 3x+.
- One hero font used decisively across the page.

Color & Theme:
- Commit to a cohesive dark theme with rich depth. No white backgrounds.
- Use a dominant dark background (#0a0a0f or similar deep navy/charcoal) with vibrant provider accent colors.
- Provider colors should POP against the dark background:
  - Anthropic: coral/amber gradient
  - OpenAI: electric green or sharp white
  - Gemini: bright blue with subtle glow
- Use CSS variables for consistency.

Motion & Animation:
- Staggered fade-in on page load using CSS animation-delay (each card appears sequentially).
- Subtle hover effects on cards (slight lift + glow in provider color).
- One well-orchestrated entrance animation beats scattered micro-interactions.

Backgrounds:
- Layer CSS gradients for atmosphere. Add a subtle grid pattern or geometric texture.
- Each provider section can have a faint radial glow in its brand color.
- Create depth with layered backgrounds, not flat solid colors.

Avoid these cliches:
- Purple gradients on white backgrounds
- Generic card layouts with identical shadows
- Cookie-cutter Bootstrap/Tailwind default aesthetics
- Timid, evenly-distributed color palettes
</frontend_aesthetics>

**Layout guidelines:**
- Responsive: max-width container, stacks on mobile
- Each entry card shows: date badge, title, description
- If an entry has a link, make the title clickable

**Source links (important):**
- Each provider section header must include a link to the original changelog page:
  - Anthropic: `https://platform.claude.com/docs/en/release-notes/overview`
  - OpenAI: `https://developers.openai.com/changelog/`
  - Gemini: `https://ai.google.dev/gemini-api/docs/changelog`
- Style the link as a subtle "View original changelog →" button or text link next to the provider name
- Individual entries should also link to their specific page if the original changelog provides per-entry URLs

**Keep it concise:** Summarize long descriptions. The page should be scannable.

## Step 5: Deploy to Vercel

Use the `mcp__vercel__vercel_deploy` tool:

```
mcp__vercel__vercel_deploy({
  name: "ai-changelog",
  files: [
    { file: "index.html", data: "<the full HTML string>" }
  ]
})
```

No `projectSettings` needed — Vercel will serve it as a static site.

## Step 6: Return Result

Respond to the user with:
1. The deployed URL
2. A brief summary: how many updates were found per provider
3. Any providers that were unavailable

Example response:
```
AI Changelog deployed!

URL: https://ai-changelog-xxx.vercel.app

Summary:
- Anthropic: 3 updates
- OpenAI: 5 updates
- Gemini: 2 updates

Period: Mar 15 – Mar 22, 2026
```
