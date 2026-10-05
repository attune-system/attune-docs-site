const defaultSlackInviteUrl =
  "https://join.slack.com/t/attune-dev/shared_invite/zt-48be9zpxt-7m5AJFuv_AO5uX9~K2qBMQ";
const defaultSupportUrl = "https://buymeacoffee.com/androxxtraxxon";

interface SiteLinkEnvironment {
  PUBLIC_SLACK_INVITE_URL?: string;
  PUBLIC_SUPPORT_URL?: string;
}

export function resolveSiteLinks(env: SiteLinkEnvironment) {
  return {
    slackInviteUrl: "/community/slack/",
    supportUrl: env.PUBLIC_SUPPORT_URL?.trim() || defaultSupportUrl,
  };
}

export function resolveSlackInviteDestination(env: SiteLinkEnvironment) {
  const destination = env.PUBLIC_SLACK_INVITE_URL?.trim() || defaultSlackInviteUrl;
  const url = new URL(destination);
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password) {
    throw new Error("PUBLIC_SLACK_INVITE_URL must be an absolute HTTPS URL without credentials");
  }
  return destination;
}
