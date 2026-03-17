#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/packages/lite"

OUTPUT=$(pnpm test -- --coverage 2>&1)
echo "$OUTPUT"

TESTS=$(echo "$OUTPUT" | grep -oP '\d+(?= passed)' | tail -1)

COVERAGE_XML="coverage/clover.xml"
if [ -f "$COVERAGE_XML" ]; then
  STMT_COV=$(python3 -c "
import xml.etree.ElementTree as ET
tree = ET.parse('$COVERAGE_XML')
root = tree.getroot()
for proj in root.findall('.//project'):
    m = proj.find('metrics')
    if m is not None:
        s, cs = int(m.get('statements',0)), int(m.get('coveredstatements',0))
        c, cc = int(m.get('conditionals',0)), int(m.get('coveredconditionals',0))
        f, cf = int(m.get('methods',0)), int(m.get('coveredmethods',0))
        print(f'METRIC stmt_coverage={100*cs/s:.1f}')
        print(f'METRIC branch_coverage={100*cc/c:.1f}')
        print(f'METRIC fn_coverage={100*cf/f:.1f}')
")
  echo "$STMT_COV"
fi

echo "METRIC test_count=$TESTS"
echo "METRIC test_files=$(echo "$OUTPUT" | grep -oP '\d+(?=\))' | tail -1)"
