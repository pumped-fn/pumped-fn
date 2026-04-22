#!/usr/bin/env bash
# Minimal parse-metrics shim for autoresearch.
# Reads stdin, extracts lines of the form `METRIC name=value`,
# and emits a single JSON object on stdout:
#   {"name":value,...}

set -u

python3 -c '
import sys, re, json
pat = re.compile(r"^METRIC\s+([A-Za-z_][A-Za-z0-9_]*)=(-?[0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)$")
out = {}
for line in sys.stdin:
    m = pat.match(line.strip())
    if m:
        name, val = m.group(1), m.group(2)
        try:
            out[name] = float(val) if any(c in val for c in ".eE") else int(val)
        except ValueError:
            out[name] = val
print(json.dumps(out))
'
