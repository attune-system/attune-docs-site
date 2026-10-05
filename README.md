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

Set `slackInviteUrl` in your Helm values to change the Slack invitation:

```yaml
slackInviteUrl: "https://join.slack.com/t/attune-dev/shared_invite/YOUR_INVITE"
```

Apply the values with `helm upgrade --install`. The chart passes the value as
`SLACK_INVITE_URL` and rolls the pods. You can keep the same image for later invite
changes. Deploy an image built with runtime redirect support once before using
this value. Previously published images do not read it.

For a standalone container, set `SLACK_INVITE_URL` in its runtime environment and
restart the container after changing it. The URL must use HTTPS without credentials.
Both servers reject whitespace and characters unsafe for nginx configuration.

Slack buttons point to `/community/slack/`. At startup, the nginx entrypoint hook
reads the runtime invite and writes a redirect configuration under `/tmp`.
The server returns a temporary redirect with `Cache-Control: no-store`. This
works without JavaScript. If the runtime value is empty, nginx serves a static
page that redirects to the invite packaged in the image.

Local Astro development and preview use that static fallback. Override the
fallback at build time with `PUBLIC_SLACK_INVITE_URL`. The support link remains
a build-time setting named `PUBLIC_SUPPORT_URL`. Container builds accept both
as build arguments:

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

The import command also accepts an HTTP URL. It keeps `public/openapi.json` as
the latest contract and archives the previous contract at
`public/openapi/versions/<version>.json` when the API version changes. Commit
the latest contract, archived contracts, and `public/openapi/versions.json`
together. The importer records each file's SHA-256 and refuses to replace a
historical version with different content.

The API explorer reads the version catalog and lets readers switch between the
latest and archived contracts. It loads a pinned Scalar bundle and does not
persist authentication data.

## Client behavior

Use HTML and CSS for static content and native controls for small interactions.
Starlight uses Pagefind for its static search index, and Scalar renders the API
contract on `/api/`. If the site needs other custom client behavior, use
Datastar. Do not add React or another SPA framework.

## Deploy with Helm

The deployment pulls the public
`ghcr.io/attune-system/attune-docs-site:0.1.11` image. Add the Attune chart
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
