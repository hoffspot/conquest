#!/bin/bash
# The whole unit suite once, as `npm test` runs it, from an empty plan cache, under the reviewer's measuring
# preload (a line a process into full.jsonl, the runner's output into full.tap). Run from the checkout.
S=$(dirname "$0")
rm -rf node_modules/.cache/pellagos-plans
rm -f "$S/full.jsonl" "$S/full.tap"
date
PERF_OUT="$S/full.jsonl" NODE_OPTIONS="--import /tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/tests/hook/register.mjs" npm test > "$S/full.tap" 2>&1
echo "npm test: exit $?"
date
grep -E "^# (tests|suites|pass|fail|cancelled|skipped|todo|duration_ms) " "$S/full.tap"
uptime
