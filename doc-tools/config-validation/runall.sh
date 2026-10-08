#!/bin/bash
HERE="$(cd "$(dirname "$0")" && pwd)"
# usage: CONFIGS_DIR=<evo-robot-configs worktrees> [FIXCOLORS_DIR=<fix/colors worktree>] runall.sh [flag] [lines]
T=$HERE; W=${CONFIGS_DIR:?set CONFIGS_DIR to the evo-robot-configs worktrees dir}; F=${FIXCOLORS_DIR:-$W/fixcolors}
flag=$1; n=${2:-12}
for m in pc rpi; do for c in "$W/2026-hololutek hololutek" "$W/2026-evolutek evolutek" "$W/2026-evolutek-test evolutek" "$W/empty empty" "$F evolutek" "$W/2026-hololutek test" "$W/2026-hololutek test_camera" "$W/2026-hololutek test_tcs34725"; do set -- $c; echo "######## $m $2 @ ${1##*/}"; $T/run.sh $m $1 $2 $flag | grep -v "^\s*$" | tail -$n; done; done
