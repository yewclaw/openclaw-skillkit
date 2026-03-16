#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "usage: ./scripts/example.sh <location> <yyyy-mm-dd>" >&2
  exit 1
fi

location="$1"
travel_date="$2"

cat <<EOF
fetch current conditions for: ${location}
fetch short forecast for: ${travel_date}
summarize temperature, rain risk, wind, and packing implications
EOF
