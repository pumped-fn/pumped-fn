#!/usr/bin/env bash
set -euo pipefail

DIAGRAM_DIRS=(
  "docs/diagrams/scenarios"
  ".claude/skills/pumped-design/references/diagrams"
)

TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

extract_mermaid_blocks() {
  local file="$1"
  local output_prefix="$2"
  local in_mermaid=false
  local block_num=0
  local current_block=""

  while IFS= read -r line; do
    if [[ "$line" =~ ^\`\`\`mermaid ]]; then
      in_mermaid=true
      block_num=$((block_num + 1))
      current_block=""
    elif [[ "$line" =~ ^\`\`\`$ ]] && [ "$in_mermaid" = true ]; then
      in_mermaid=false
      echo "$current_block" > "${output_prefix}_${block_num}.mmd"
    elif [ "$in_mermaid" = true ]; then
      current_block="${current_block}${line}\n"
    fi
  done < "$file"

  echo "$block_num"
}

validate_diagram() {
  local mmd_file="$1"
  local source_file="$2"
  local block_num="$3"

  if mmdc -i "$mmd_file" -o "${mmd_file}.svg" 2>&1 | grep -q "Error"; then
    echo "❌ FAIL: $source_file (block $block_num)"
    mmdc -i "$mmd_file" -o "${mmd_file}.svg" 2>&1 || true
    return 1
  else
    echo "✅ PASS: $source_file (block $block_num)"
    return 0
  fi
}

main() {
  local total=0
  local failed=0

  for dir in "${DIAGRAM_DIRS[@]}"; do
    if [ ! -d "$dir" ]; then
      echo "⚠️  Directory not found: $dir (skipping)"
      continue
    fi

    while IFS= read -r -d '' file; do
      local temp_prefix="$TEMP_DIR/$(basename "$file" .md)"
      local block_count
      block_count=$(extract_mermaid_blocks "$file" "$temp_prefix")

      if [ "$block_count" -eq 0 ]; then
        echo "⚠️  No mermaid blocks found: $file"
        continue
      fi

      for i in $(seq 1 "$block_count"); do
        total=$((total + 1))
        if ! validate_diagram "${temp_prefix}_${i}.mmd" "$file" "$i"; then
          failed=$((failed + 1))
        fi
      done
    done < <(find "$dir" -name "*.md" -print0)
  done

  echo ""
  echo "================================"
  echo "Total diagrams: $total"
  echo "Passed: $((total - failed))"
  echo "Failed: $failed"
  echo "================================"

  if [ "$failed" -gt 0 ]; then
    exit 1
  fi
}

main "$@"
