# Plainly — Fine print. Clear answers.

**PromptWars vertical: AI for Legal Assistance & Access.**

Plainly helps people understand legal documents, compare drafts, ask grounded questions, and prepare a lawyer brief. It provides information, not legal advice. All demo documents are fictional.

## Run locally

Use Node **22.13+** (Node 22 or 24 recommended) and npm.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. For a production build:

```sh
npm run build
npm start
```

Only **one optional external API key** is needed: a [Google Gemini API key](https://aistudio.google.com/apikey). Copy `.env.example` to `.env`, set `GEMINI_API_KEY`, and optionally change `GEMINI_MODEL` to a model available to your account. Restart the server after changing environment variables. Never commit credentials or put them in a `NEXT_PUBLIC_` variable.

Without the key, text analysis, comparison, and document questions run in a browser Web Worker. No database server, login provider, maps, or payment API is required. Local encrypted sharing uses Node's built-in SQLite.

## Tools

| Tool | Result |
| --- | --- |
| Explain | Summary, extracted facts, risk findings with original quotes, and next steps |
| Compare | Clause alignment, changed wording, key figures, and a context-aware assessment |
| Ask | Document-based answers with citations; keyword retrieval without AI |
| Lawyer brief | Editable notes, priority terms, questions, Markdown download, and print/PDF |

The interface supports light/dark/system themes, larger text, keyboard navigation, screen-reader announcements, read-aloud, and responsive layouts. AI explanations offer nine languages; the deterministic engine is English only.

## Approach and logic

1. Normalize and segment the document; identify likely document type and extract facts.
2. Run 39 deterministic clause rules. Role, stage, jurisdiction, and wording influence severity and suggestions.
3. In on-device mode, return the rules' findings directly. Optional Gemini explanations build on these findings.
4. Verify every returned AI quotation against the source. Drop unsupported quotes, retain rule-detected high-risk findings, and compute the risk score on the server.
5. Use BM25-style retrieval for offline questions and a word-level diff for comparisons. AI errors fall back to deterministic results.

Quote verification establishes that words exist in the document; it does not establish that an interpretation or legal conclusion is correct. Scores are heuristics, not probabilities of legal harm.

## Architecture

```text
src/app/          Next.js App Router pages, metadata, robots, sitemap
src/pages/api/    Next API adapter for the existing Express application
src/proxy.ts      Per-request CSP nonces and page security headers
src/web/          React UI, session state, file readers, browser worker
src/shared/       Isomorphic analysis, rules, retrieval, diff, encryption
src/server/       Express API, Zod validation, Gemini, grounding, SQLite
public/samples/   Fictional demo documents
scripts/          Production smoke checks
```

Next.js renders the landing content on the server. The interactive workspace hydrates in the browser; document contents stay in memory. Webpack bundles the Web Worker and resolves shared TypeScript's ESM `.js` import paths. Vitest uses Vite only as its test transformer.

SEO includes title/description, Open Graph and Twitter metadata, canonical URL when `SITE_URL` is set, robots.txt, and sitemap.xml. Shared briefs have both no-index metadata and an `X-Robots-Tag` response header. No document or brief is included in the sitemap. Set `SITE_URL` to your final HTTPS origin before building for deployment.

## Security and privacy

- Pasted text, plain-text files, and Word files are processed locally in on-device mode. PDF and image extraction uses the server; scans require Gemini.
- AI mode sends text to the server and Gemini. Optional masking handles common personal identifiers but cannot guarantee complete anonymization.
- Documents are not deliberately persisted or logged by the app. Provider/platform handling is outside this guarantee. Theme and text-size preferences alone use browser localStorage.
- Express uses Helmet, bounded request parsing, Zod validation, rate limits, safe errors, and logs without request bodies or query strings. The frontend renders text through React without HTML injection.
- Next pages use fresh CSP nonces for scripts, no-referrer, frame protection, and restricted permissions. Inline styles remain allowed for React/Radix styling; production scripts do not use unsafe-eval.
- On persistent local/container hosting, shared briefs use browser AES-256-GCM. Only ciphertext is stored in SQLite; the decryption key is in the URL fragment. Links expire and can be revoked with a separate token. Anyone with the complete link can read the brief.
- Rate limiting is in-memory per instance. For public serverless AI traffic, configure Vercel Firewall rate limits and provider spend limits; application counters are not a global quota.

## Vercel deployment and CI/CD

The project uses native Next.js hosting on Vercel. `vercel.json` disables automatic Git deployments so they cannot bypass the checks in `.github/workflows/ci.yml`.

The pipeline runs on the single `main` branch and pull requests:

1. Install the lockfile on Node 22 and 24.
2. Run strict typechecking, ESLint (including hooks/accessibility rules), and all tests.
3. Build Next.js and the server; start the production app and smoke-test SSR, metadata, CSP, API validation, analysis, samples, and private-share indexing.
4. Audit production dependencies for high/critical advisories.
5. When deployment is enabled, build with pinned Vercel CLI 60.0.1, stage a production deployment without assigning the live domain, smoke-test that URL, then promote it.

A failed stage/smoke test stops promotion and leaves the existing production domain in place. This reduces deployment risk; it cannot guarantee that external services or every user flow will never fail.

### One-time setup

1. Create/import a Vercel project using the Next.js preset and **Node 22.x**. Keep the root at this repository and leave output-directory overrides unset.
2. Set Vercel production environment variables: `SITE_URL` (your public HTTPS origin), optionally `GEMINI_API_KEY` and `GEMINI_MODEL`. Configure deployment protection and Firewall limits as appropriate.
3. Add GitHub Actions secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID`. Find the IDs in Vercel project/team settings or `.vercel/project.json` after linking locally. Never commit that directory.
4. If staged deployment URLs are protected, add `VERCEL_AUTOMATION_BYPASS_SECRET` as a GitHub secret using Vercel's automation bypass setting. The smoke script sends it in a header, never the URL.
5. Add repository variable `VERCEL_DEPLOY_ENABLED=true`. Until then, CI runs but deployment is skipped.
6. Optionally protect the GitHub `production` environment with reviewers. Run the workflow from `main` after all secrets are configured.

If promotion later reveals a problem, use Vercel's deployment dashboard to restore the last known-good deployment. Do not alter Git history to perform a hosting rollback.

**Vercel limitations:** SQLite share links are automatically disabled because local storage is not durable across serverless instances. Brief copy/download/print still work. Enabling cloud sharing requires a durable external store. Uploads are capped at 3 MB on Vercel to keep base64 requests within the platform payload limit. The API function requests a 120-second duration; provider availability and account/platform limits still apply. No live Vercel deployment or Gemini document generation has been verified from this workspace. The supplied Gemini key was accepted by the model-list endpoint and the configured model was available.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm start
# In a second terminal:
npm run test:smoke
```

`npm run test:coverage` reports coverage. Tests cover deterministic analysis, hostile inputs, AI failure and grounding, redaction, extraction, HTTP validation/rate limits, encrypted sharing, navigation, upload busy state, brief export, quote placement, and basic frontend accessibility. The jsdom axe check does not measure rendered color contrast.

## API

All API responses are no-store. POST bodies are JSON.

| Route | Purpose |
| --- | --- |
| GET /api/health | Health and AI availability |
| GET /api/config | Limits, engine and sharing capabilities |
| POST /api/analyze | Text, reader context, redaction/AI options |
| POST /api/compare | Two labeled documents and context |
| POST /api/ask | Document, question, bounded history and context |
| POST /api/extract | Base64 PDF, image, Word or text extraction |
| POST /api/shares | Ciphertext, IV, allowed lifetime; persistent hosting only |
| GET /api/shares/:id | Fetch unexpired ciphertext |
| DELETE /api/shares/:id | Revoke using a Bearer deletion token |

## Optional container deployment

```sh
docker build -t plainly .
docker run --rm -p 8080:8080 --env-file .env -v plainly-data:/app/data plainly
```

The multi-stage image installs production dependencies, runs as the non-root `node` user, and checks `/api/health`. Mount persistent storage for SQLite shares. Docker is not installed in the current workspace, so container execution must be verified in CI or on a Docker host.

## Assumptions and honest limits

- English input works best with rules. AI translations, OCR, inferred facts, and interpretations may be wrong.
- Legal rules are incomplete and jurisdiction notes may become outdated. Get qualified advice before acting.
- On-device processing is available after loading the app. There is no service worker or guaranteed offline cold start; samples and unvisited lazy tabs may need a connection.
- Reloading discards document text, questions, and notes. Downloads and shared ciphertext are intentional exports.
- The service has no user accounts. A share link is a bearer capability, not identity-based authorization.
- Larger PDFs, damaged files, scans without an AI key, unsupported model IDs, or upstream timeouts can fail with a readable error or rule-based fallback.

## Hackathon submission

Submit a public repository with exactly one branch, under 10 MB excluding dependencies, and a maximum of three attempts per the supplied rules. Exclude `node_modules`, `.next`, `dist`, `.vercel`, `data`, coverage, and credentials. This working repository is private at the owner's request. The supplied hackathon rules require the final submission repository to be public; change visibility only when the owner authorizes submission.

MIT licensed. See LICENSE.
