# Blog Posts

Blog posts live in this directory as plain Markdown files.

## How to add a new post

1. Copy `_TEMPLATE.md` to a new file, e.g. `gluten-free-nyc-guide.md`
2. Fill in the frontmatter fields:
   - `title` — the post title (shown as H1 and in `<title>`)
   - `slug` — the URL path: `/blog/your-slug-here` (use lowercase, hyphens only)
   - `date` — ISO format `YYYY-MM-DD`; posts are sorted newest-first
   - `description` — meta description for SEO, keep under 160 characters
3. Write the post body in standard Markdown below the `---` closing delimiter
4. Save the file — the blog index and post pages update automatically (ISR, 24h)

## Frontmatter reference

| Field         | Required | Notes                              |
|---------------|----------|------------------------------------|
| `title`       | Yes      | Shown as page H1 and `<title>`     |
| `slug`        | No       | Defaults to filename without `.md` |
| `date`        | Yes      | `YYYY-MM-DD`; used for sort order  |
| `description` | No       | Used for meta description / excerpt|

## Markdown tips

- Use `## Heading` for section headings (H2)
- Use `### Subheading` for sub-sections (H3)
- Internal links: `[anchor text](/rankings)` or `[East Village](/gluten-free/nyc/east-village)`
- Bold: `**text**`, italic: `*text*`
- Files starting with `_` (like `_TEMPLATE.md`) are ignored by the blog reader

## Style guidance

- Each post should link to at least 3–5 internal CleanPlate pages
- Target one primary search query per post (put it in the title and description)
- Aim for 400–800 words — quality over length
