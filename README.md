# Japan Talent Desk Landing Page

Premium one-page static website for Japan Talent Desk, a Japanese market recruitment intelligence service for European football clubs.

## File Structure

```text
.
├── assets/
│   ├── favicon.svg
│   ├── scoutai-hero.jpg
│   └── scoutai-hero.png
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

## Favicon And Logo Treatment

The current favicon is a restrained monogram using the dark green and muted gold palette. For a future brand pass, keep the same direction: a simple monogram or wordmark, no football ball icon, no AI circuit motif, and no startup-style gradient mark.

## Hero Asset

The hero image was generated for this project as a premium editorial football scouting scene. The site uses the optimized JPEG, with the original PNG retained as the source asset.

```text
assets/scoutai-hero.jpg
```
