#!/bin/bash
# freeze.sh <name>: a copy of the worktree as it stands now (its files, not its history), to run
# tests and benchmarks over while the worktree's worked on. In frozen/<name>, with the review's
# benchmark scripts pointed at it in frozen/<name>-bench.
set -e
W=/home/user/conquest/.claude/worktrees/agent-acbdbc1c6ff7d3964
SCR=/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/combat-impl
SRC=/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/combat
F=$SCR/frozen/$1
rm -rf "$F" "$F-bench"
mkdir -p "$F" "$F-bench"
(cd "$W" && tar -c --exclude=./node_modules --exclude=./.git --exclude=./client/models --exclude=./test-results --exclude=./playwright-report .) | tar -x -C "$F"
ln -s "$W/node_modules" "$F/node_modules"
ln -s "$W/client/models" "$F/client/models"
for f in "$SRC"/*.mjs; do
    sed "s#/home/user/conquest/#$F/#g" "$f" > "$F-bench/$(basename "$f")"
done
echo "$F"
