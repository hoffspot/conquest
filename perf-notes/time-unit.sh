#!/bin/bash
# Each unit test file's wall time, run alone (four files at a time, as CI does)
out=/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/unit-times.tsv
: > "$out"
cd /home/user/conquest
ls test/*.test.js | xargs -P 4 -I{} bash -c 's=$(date +%s.%N); node --test "{}" > /dev/null 2>&1; rc=$?; e=$(date +%s.%N); printf "%s\t%.1f\t%s\n" "{}" "$(echo "$e - $s" | bc)" "$rc" >> '"$out"
echo done
