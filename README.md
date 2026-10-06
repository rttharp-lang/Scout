# Scout
Travel Planning

## Mascot Lab

`mascot-lab/` is a separate app in this repo: a website for high-school coaches with a team
logo but no designer. Coaches remix the logo through 23 print-shop effects, see the look on
a six-piece team collection, and send an order request for the roster. It is Vite + React
and runs entirely in the browser. It ships as a static site (`dist/`) or as a single-file
claude.ai Artifact.

```sh
cd mascot-lab
npm install
npm run dev     # http://127.0.0.1:5199
```

See [`mascot-lab/README.md`](mascot-lab/README.md) for build, deploy, Artifact publishing,
order handling and tests, and `mascot-lab/CONTRACTS.md` for the module spec.
