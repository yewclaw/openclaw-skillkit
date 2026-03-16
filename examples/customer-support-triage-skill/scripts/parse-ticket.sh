#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "usage: ./scripts/parse-ticket.sh <ticket-file>" >&2
  exit 1
fi

ticket_file="$1"

if [ ! -f "$ticket_file" ]; then
  echo "ticket file not found: $ticket_file" >&2
  exit 1
fi

printf 'Summary input from %s\n' "$ticket_file"
printf '%s\n' '---'
sed -n '1,20p' "$ticket_file"
