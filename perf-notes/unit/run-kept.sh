#!/bin/bash
# Runs unit test files one at a time with the plans kept, as `npm test` runs each (the preload, the timeout),
# and says how each came out. run-kept.sh <out folder> <test names without .test.js ...>   (from the checkout)
out="$1"; shift
mkdir -p "$out"
for name in "$@"; do
    node --import ./test/plan-cache.js --test --test-timeout=900000 "test/$name.test.js" > "$out/$name.tap" 2>&1
    echo "$name: exit $? $(grep -E '^# (tests|pass|fail|cancelled) ' "$out/$name.tap" | tr '\n' ' ')"
done
