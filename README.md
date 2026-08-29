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

## Configure community links

The Slack invitation and project support links use the project's public URLs by
default. Override either link at build time with
`PUBLIC_SLACK_INVITE_URL` or `PUBLIC_SUPPORT_URL`. Container builds accept the
same names as build arguments:

```bash
docker build \
  --build-arg PUBLIC_SLACK_INVITE_URL=https://example.com/slack \
  --build-arg PUBLIC_SUPPORT_URL=https://example.com/support \
  .
```

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

## Deploy with Helm

The deployment pulls the public
`ghcr.io/attune-system/attune-docs-site:0.1.2` image. Add the Attune chart
repository, then install the chart with `deploy/helm-values.yaml`:

```bash
helm repo add attune https://raw.githubusercontent.com/attune-system/attune-charts/main
helm repo update attune
helm upgrade --install attune-docs-site attune/attune-docs-site \
  --namespace attune-sites \
  --create-namespace \
  --values deploy/helm-values.yaml \
  --wait
```

The values file creates an Ingress for `docs.attunedev.org` through Traefik.
Point the domain at the cluster ingress address before you open the site. The
raw `deploy/k3s.yaml` manifest remains available for deployments that do not use
Helm.
