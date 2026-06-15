# Self-hosted SearXNG for keyless discovery

`server/sources/searxng.js` is the keyless replacement for Brave / Serper / Exa.
It only runs when `SEARXNG_URL` is set and the endpoint returns JSON.

## Run with Docker

```bash
docker compose -f searxng/docker-compose.yml up -d
```

This serves SearXNG at <http://127.0.0.1:8081>. Set:

```
SEARXNG_URL=http://127.0.0.1:8081
```

in `.env`. Smoke test:

```bash
curl 'http://127.0.0.1:8081/search?q=acme+fleet+software&format=json' | head -c 400
```

You should get JSON with a `results` array.

## Stop

```bash
docker compose -f searxng/docker-compose.yml down
```

## Notes

- `settings.yml` enables `json` format (required by the scraper) and a handful
  of keyless engines (Google, Bing, DuckDuckGo, Brave, Qwant, Startpage,
  Mojeek, Wikipedia). Adjust as needed.
- The `limiter` is off because all traffic is local and the sourcing pipeline
  issues many queries per discovery pass. Do **not** expose this instance
  publicly with `limiter: false`.
- If you change `settings.yml`, restart the container:
  `docker compose -f searxng/docker-compose.yml restart`.
