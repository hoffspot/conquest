#!/bin/bash
# Runs unit test files one at a time under the reviewer's measuring preload, a line a process into <out>.
# measure.sh <out.jsonl> [--cache] <test names without .test.js ...>   (run from the checkout)
out="$1"; shift
extra=""
if [ "$1" = "--cache" ]; then extra="--import ./test/plan-cache.js"; shift; fi
hook=/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/tests/hook/register.mjs
for name in "$@"; do
    PERF_OUT="$out" NODE_OPTIONS="--import $hook" node $extra --test "test/$name.test.js" > "$out.$name.tap" 2>&1
    echo "$name: exit $? $(grep -E '^# (tests|pass|fail|skipped) ' "$out.$name.tap" | tr '\n' ' ')"
done
