# Search and AI visibility measurement playbook

This is an internal operating checklist for Search Console, Bing Webmaster Tools, and repeatable AI answer observations. It is not evidence that a page is indexed or cited. Record what each tool actually reports; do not turn a submission or one answer into a performance claim.

## 1. Google Search Console

- [ ] Confirm the `clicksable.com` Domain property is verified by DNS and that the correct owner account has access.
- [ ] Confirm the `https://clicksable.com/` URL-prefix property if you use one. Check that `http` and `www` variants resolve to the canonical HTTPS host.
- [ ] Submit `https://clicksable.com/sitemap.xml` in the Sitemaps report and record the submitted date, last read, discovered URL count, and any reported errors.
- [ ] Inspect the canonical home, `/creator/`, `/business/`, `/company/`, `/learning/`, and a published article. Record Google's declared canonical and whether each page is indexed.
- [ ] Review Page indexing exclusions. Redirected host variants are expected only when they land on the canonical host; `/creator-reward/` and `/hq/` are intentionally `noindex` and should stay out of the sitemap. Investigate any unexpected URL or status.
- [ ] Review Search results performance by page and query monthly. Save the date range and compare like-for-like periods; do not infer that a change was caused by a site edit without supporting evidence.
- [ ] Check Core Web Vitals and crawl stats when available. Separate field data, lab results, and crawl observations in notes.

Google states that a sitemap is a discovery hint and does not guarantee crawling or indexing. Use URL Inspection for a small number of important URLs; repeated requests do not speed up crawling.

## 2. Bing Webmaster Tools

- [ ] Sign in with a company-controlled Microsoft account and verify the canonical `https://clicksable.com/` site. Importing the verified Search Console property is an option; confirm the imported site and permissions.
- [ ] Submit `https://clicksable.com/sitemap.xml` and review Site Explorer, URL Inspection, and indexing reports for unexpected crawl or index problems.
- [ ] After a deployment, review the IndexNow report. The site workflow submits changed public URLs and hosts the matching key file at the root. A successful submission means Bing received a notification; it does not prove indexing.
- [ ] Record any profile or verification changes in the account owner’s access log. Keep recovery access with the business.

## 3. AI answer and citation baseline

### Define the sample before checking

- [ ] Choose a stable set of buyer questions from real customer language, sales calls, support questions, and relevant Search Console queries. Include the market and service category in each question where that context matters.
- [ ] Keep the same wording for each baseline run. Add new questions as a dated version rather than silently changing the old set.
- [ ] Choose only the platforms relevant to the audience. Record the exact surface (for example, Google AI Overviews, ChatGPT Search, Bing Copilot, Gemini, or Perplexity); product surfaces and availability can change.
- [ ] Record check date and time, market/location, language, platform, signed-in state where relevant, and any personalization or source mode visible in the interface. Do not enter confidential client information.

### Record observations without turning them into promises

For every prompt and platform, record:

- Whether an answer appeared and whether Clicksable or a tested business was mentioned.
- The exact answer wording only when needed to interpret the observation; otherwise summarize it.
- Whether the business was named, described, recommended, or compared. Keep these as separate observations.
- Every visible source URL, the source type (first-party, publisher, review, directory, community, or other), and whether it supports the specific statement.
- Relevant competitors shown, answer variability, errors, and links or screenshots that can be checked later.
- A short note about changes made to relevant site pages since the last run.

| Checked at (UTC) | Prompt-set version | Market and language | Platform/surface | Prompt ID | Brand mentioned? | Source URLs saved? | Competitors shown | Evidence link or note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |  |

### Review and experiment cadence

- [ ] Save an initial baseline before making measurement-led changes.
- [ ] Recheck the same sample monthly, and after a significant page or technical change. Record platform and date because answers vary.
- [ ] Change one meaningful factor at a time where practical (for example, improve a service explanation or add a verifiable source), note the release date, then compare later observations.
- [ ] Treat a single appearance or absence as an observation, not a trend. Summarize repeated patterns with the number of prompts, platforms, dates, and source links reviewed.
- [ ] Do not claim “AI recommended us,” a citation rate, or a ranking improvement unless the measurement method, sample, date range, and evidence support that exact claim.

## Official references

- [Google Search Console sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Google recrawl and URL Inspection guidance](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl)
- [Bing Webmaster Tools URL submission and IndexNow](https://www.bing.com/webmasters/help/URL-Submission-62f2860b)
- [IndexNow protocol documentation](https://www.indexnow.org/documentation)
