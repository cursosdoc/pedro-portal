# pedro-portal

Job Radar website for Pedro's daily UK job digest.

- `gh-pages` holds the site (served by GitHub Pages). It is updated by the job-radar digest via `tools/publish_site.py` in ~/Projects/job-radar.
- One JSON file per day under `data/days/`; `data/index.json` lists the days. Days are never deleted.
- `main` holds this README only.
