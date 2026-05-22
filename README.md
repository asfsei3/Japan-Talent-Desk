# Japan Talent Desk Site

Public-facing static site for Japan Talent Desk, a Japanese market recruitment intelligence service for European football clubs.

## File Structure

```text
.
├── archive/
│   └── legacy-fsl/
├── assets/
│   ├── favicon.svg
│   ├── jtd-hero.jpg
│   └── jtd-hero.png
├── docs/
│   ├── README.md
│   ├── newsletter/
│   ├── outbound/
│   ├── reports/
│   └── strategy/
├── index.html
├── package.json
├── README.md
├── server.js
└── styles.css
```

## Local Run

```bash
npm start
```

Open `http://localhost:3000`.

## Deploying To Railway From GitHub

1. Push this folder to a GitHub repository.
2. In Railway, create a new project from the GitHub repo.
3. Railway should detect Node automatically.
4. Use the default start command:

```bash
npm start
```

5. Railway will provide `PORT` automatically. The included `server.js` serves only static files.

## Content Boundaries

- Root site files are for the public LP only.
- `docs/strategy/` is for current JTD positioning and messaging source-of-truth.
- `docs/outbound/` is for outbound policy, CTA rules, and send workflow notes.
- `docs/newsletter/` is for Japan Market Weekly process and Brevo-related notes.
- `docs/reports/` is for sample note structure guidance and report operations.
- `archive/legacy-fsl/` is for internal method references only. FSL should inform the work, not appear in outward JTD messaging.

## Favicon And Logo Treatment

The site currently uses a restrained text-only header and the local `favicon.svg`.

Japan Talent Desk remains the outward service name in copy, headings, and newsletter language.

## Hero Asset

The hero image was generated for this project as a premium editorial football scouting scene. The site uses the optimized JPEG, with the original PNG retained as the source asset.

```text
assets/jtd-hero.jpg
```
