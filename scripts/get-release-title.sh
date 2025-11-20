#!/bin/bash

set -e

status_output=$(pnpm changeset status 2>&1)

packages=$(echo "$status_output" | grep -oP '(?<=- )@pumped-fn/[a-z-]+' | paste -sd ',' -)
count=$(echo "$packages" | tr ',' '\n' | grep -c '@pumped-fn' || echo "0")

if [ "$count" -eq "0" ]; then
  echo "chore: version packages"
  exit 0
fi

if [ "$count" -eq "1" ]; then
  echo "Release: $packages"
else
  pkg_list=$(echo "$packages" | sed 's/,/, /g')
  echo "Release: $count packages - $pkg_list"
fi
