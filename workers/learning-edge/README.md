# Clicksable Learning Edge

This Worker makes published Learning Center articles available directly from Supabase. It removes the GitHub Pages build delay for `/learning/<slug>/` while preserving GitHub Pages as the origin for every other request.

## Why this is the delivery path

Articles are queried with Supabase's publishable key. Row-level security allows that key to read only an article whose status is `published` and whose `published_at` time has arrived. The Worker cannot write articles, access HQ data, or start GitHub Actions.

It serves fresh HTML immediately after HQ saves the published article and caches each page for at most 60 seconds at Cloudflare's edge. GitHub Pages remains the fallback for unpublished, deleted, and legacy article URLs.

## One-time deployment

1. Create a Cloudflare account and add `clicksable.com`.
2. In Namecheap, replace the domain's nameservers with the two nameservers Cloudflare gives you. Wait for Cloudflare to mark the zone active. This keeps GitHub Pages as the origin; it only puts Cloudflare in front of it.
3. Install Wrangler and authenticate locally:

   ```powershell
   npm install -g wrangler
   wrangler login
   ```

4. From this folder, publish a preview Worker:

   ```powershell
   cd workers/learning-edge
   wrangler deploy
   ```

5. In Cloudflare Workers & Pages, open `clicksable-learning-edge` and add these routes:

   ```text
   clicksable.com/learning/*
   www.clicksable.com/learning/*
   ```

6. Publish a test article from HQ. It should open immediately at `https://clicksable.com/learning/<slug>/` and remain crawlable HTML.

No GitHub token, GitHub App, or Supabase service-role key is used by this Worker.
