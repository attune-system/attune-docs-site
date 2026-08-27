# Attune documentation site

This repository contains the public documentation for
[docs.attunedev.org](https://docs.attunedev.org). It builds static HTML with
Astro and Starlight. The site has no React runtime.

The repository owns its Markdown, screenshots, and `public/openapi.json` file.
A normal build does not read the Attune implementation repository or its wiki.

## Develop the site

```bash
npm install
npm run dev
```

Run the full local check before you publish a change:

```bash
npm run verify
```

Astro writes the static site and Pagefind search index to `dist/`.

## Update the API contract

Export the OpenAPI document from the Attune project, then import the snapshot:

```bash
npm run import:openapi -- /path/to/openapi.json
npm run verify
```

The import command also accepts an HTTP URL. Commit `public/openapi.json` with
the related documentation change. The API explorer loads a pinned Scalar
bundle and does not persist authentication data.

## Client behavior

Use HTML and CSS for static content and native controls for small interactions.
Starlight uses Pagefind for its static search index, and Scalar renders the API
contract on `/api/`. If the site needs other custom client behavior, use
Datastar. Do not add React or another SPA framework.

## Deploy to k3s

Build the image and import it into a single-node local k3s cluster:

```bash
docker build -t attune-docs-site:local .
docker save attune-docs-site:local | sudo k3s ctr images import -
kubectl apply -f deploy/k3s.yaml
```

For a multi-node cluster, push the image to a registry that every node can read.
The manifest creates an Ingress for `docs.attunedev.org` through Traefik. Point
the domain at the cluster ingress address before you open the site.
