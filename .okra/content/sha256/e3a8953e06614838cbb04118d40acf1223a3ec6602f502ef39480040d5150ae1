#!/usr/bin/env bash
set -euo pipefail

artifact=${1:?usage: replay-dkr-l1.sh <lint-rule-coverage-map.md>}
root=$(git rev-parse --show-toplevel)

check_hash() {
  local expected=$1
  local path=$2
  local actual
  actual=$(sha256sum "$root/$path" | cut -d' ' -f1)
  test "$actual" = "$expected" || {
    echo "stale source: $path expected=$expected actual=$actual" >&2
    exit 1
  }
}

check_hash be33e6ec129d3a1bb23edcf72b403273c40d44f7a4d79a33a68aaf76e6de7008 AGENTS.md
check_hash 472c729aab2799759c6e29b1e10cde45a2aaecd9ac499cbc510cb7405c1515d2 pkg/tool/lint/src/index.ts
check_hash 85f0372edced14cca3933a06ee0518991660229090f721d1e5d878eac1c14273 pkg/tool/lint/tests/scanner.test.ts
check_hash b0023b317c12fc21e271d5f793c07bd9ff99c239263fc8fe590239595bc4f731 pkg/tool/lint/README.md
check_hash 1209b7959fbe3cb1461428e2f137cf251854cf95bc68955c99af2dde499d6e54 package.json

for token in \
  'AG-8 `touched_file_lint_violation_count`' \
  'AG-9 `implicit_required_dependency_count`' \
  'AG-10 `unrequested_builtin_binding_count`' \
  'AG-11 `scope_seam_escape_count`' \
  'AG-12 `ungrouped_related_handle_count`' \
  'AG-13 `hidden_execution_edge_count`' \
  'AG-14 `redundant_graph_ceremony_count`' \
  '## Candidate parser fixtures' \
  '## Compile/API assertion fixtures' \
  '## Scope conformance fixtures' \
  '## False-positive and false-negative register' \
  '## Bounded candidate delivery paths' \
  'Candidate CKRs and candidate PKRs are not promoted until the orchestrator accepts the supporting DKR learning checkpoint.'
do
  grep -Fq "$token" "$artifact" || {
    echo "missing artifact token: $token" >&2
    exit 1
  }
done

echo 'dkr_l1_replay source_hashes=5 wall_rows=7 classification_sections=3 status=candidate_replayable'
