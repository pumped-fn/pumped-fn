#!/bin/bash

set -e

status_output=$(pnpm changeset status 2>&1)

packages=$(echo "$status_output" | grep -oP '(?<=- )@pumped-fn/[a-z-]+' | paste -sd ',' - || true)

if [ -z "$packages" ]; then
  echo "chore: version packages"
  exit 0
fi

count=$(echo "$packages" | tr ',' '\n' | wc -l | tr -d ' ')

if [ "$count" = "1" ]; then
  echo "Release: $packages"
else
  pkg_list=$(echo "$packages" | sed 's/,/, /g')
  echo "Release: $count packages - $pkg_list"
fi
