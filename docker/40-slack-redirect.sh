#!/bin/sh
set -eu
export LC_ALL=C

invite=${SLACK_INVITE_URL:-}
snippet=/tmp/slack-redirect.conf

invalid() {
    printf '%s\n' 'SLACK_INVITE_URL must be an absolute HTTPS URL without credentials or unsafe characters' >&2
    exit 1
}

if [ -n "$invite" ]; then
    case "$invite" in
        https://*) ;;
        *) invalid ;;
    esac
    safe_characters="a-zA-Z0-9._~:/?#@!&'()*+,=%-"
    case "$invite" in
        *[!$safe_characters]*) invalid ;;
    esac
    authority=${invite#https://}
    authority=${authority%%[/?#]*}
    host=${authority%%:*}
    case "$host" in
        ''|[!a-zA-Z0-9]*|*[!a-zA-Z0-9.-]*) invalid ;;
    esac
    case "$authority" in
        *:*)
            port=${authority#*:}
            case "$port" in ''|*[!0-9]*) invalid ;; esac
            ;;
    esac
    printf 'return 302 "%s";\n' "$invite" > "$snippet"
else
    : > "$snippet"
fi

nginx -t
