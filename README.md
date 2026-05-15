# Rho Output Compare

Static GitHub Pages app for comparing tagged rho unfolding plot previews.

## Sync plots

From this repository:

```bash
python3 scripts/sync_from_unfold.py --clean
```

The sync script copies PNG previews from:

- `/mnt/extra/wsLinux/unfold/outputs/rho/original/_previews`
- `/mnt/extra/wsLinux/unfold/outputs/rho/fixed_jec/_previews`

Then it rewrites `manifest.json` so the browser app can pair plots by relative path.

## Local preview

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173`.
