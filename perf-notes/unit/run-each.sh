#!/bin/bash
# Runs unit test files one at a time, each alone, and says how each came out (and its QUICK lines, if asked for).
# run-each.sh <out folder> <test names without .test.js ...>   (run from the checkout)
out="$1"; shift
mkdir -p "$out"
for name in "$@"; do
    node --test "test/$name.test.js" > "$out/$name.tap" 2>&1
    echo "$name: exit $? $(grep -E '^# (tests|pass|fail|cancelled|skipped) ' "$out/$name.tap" | tr '\n' ' ')"
    grep -E "QUICK" "$out/$name.tap"
done
