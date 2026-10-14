# Learning Center setup

The public page is at `/learning/`. Open `/hq/`, sign in with an approved Supabase Auth account, and use the **Learning Center** tab to write drafts, add search metadata and FAQs, set the YouTube channel/videos, publish articles, and review/export subscriber consent records.

## One-time Supabase setup

1. In Supabase Authentication, create the owner's account with a strong unique password. Create the owner account from Supabase Authentication → Users; keep the existing creator sign-up flow available, and do not treat public sign-ups as HQ approval.
2. Open **SQL Editor** and run `supabase/migrations/202610140001_learning_center.sql`.
3. In that SQL file's final instruction, replace `YOUR-AUTH-USER-UUID` with the owner's `auth.users.id` and run the insert once. Find the UUID in Authentication → Users. Never add the publishable/anon key as an administrator.
4. Open `/hq/`, sign in with that account, scan the authenticator QR code, and verify the six-digit code. HQ will require MFA for every admin data operation. Store recovery codes securely in the authenticator/password manager.
5. In HQ → Learning Center, set the YouTube channel and add video URLs (one per line). Add a test draft before publishing your first real article.

The SQL migration replaces the old access policies on the site's existing campaigns, creator profiles, video submissions, announcements, support messages, and project leads. Public access is limited to the parts needed by the live site; creator records are scoped to their signed-in owner, and HQ reads/edits require an allowlisted account with MFA. Review the migration and run it in the Supabase project before using the new editor. The old hardcoded HQ PIN is removed from the page.

## Newsletter notes

Sign-ups are saved as **pending** in `newsletter_subscribers`; HQ can review them, change status, and export CSV. No email delivery service or confirmation/unsubscribe automation is configured yet. Pending means the address has not been confirmed by an email provider. Do not treat CSV export as permission to send marketing mail without the applicable consent and unsubscribe workflow.

## SEO / GEO publishing note

Published articles are generated as standalone HTML at `/learning/<slug>/`, with unique metadata, canonical URLs, Article JSON-LD, sanitized article content, and optional FAQ markup. The generated sitemap includes each published article; the Learning Center listing also has ordinary links to those pages. A scheduled GitHub Actions run rebuilds and deploys the sitemap and pages every 15 minutes, and it can also be started manually.

### One-time GitHub Pages setup

After merging the static publisher workflow, open the repository on GitHub and go to **Settings → Pages → Build and deployment → Source**. Select **GitHub Actions**. The first workflow run then publishes the website and crawlable article pages together. You do not need to create Supabase secrets: the generator uses only the same public Supabase publishable key already used by the Learning Center, and the database's public policy exposes only published articles. Never put the Supabase service-role key in GitHub Actions or the website.

After this is enabled, publish from **HQ → Learning Center** as usual. The article appears in the browser-loaded library immediately; its standalone HTML URL and sitemap entry are deployed on the next scheduled run (normally within 15 minutes). In HQ, use **Open published URL** to open the article page after deployment. GitHub Actions → **Publish crawlable Learning Center** → **Run workflow** can be used to request an immediate rebuild.

Submitting the sitemap in Google Search Console can help Google discover the URLs, but it does not guarantee indexing or first-page rankings. Continue publishing useful original articles and review search performance over time.
