#!/bin/bash
HERE="$(cd "$(dirname "$0")" && pwd)"
# usage: CONFIGS_DIR=<evo-robot-configs worktrees> [FIXCOLORS_DIR=<fix/colors worktree>] valall.sh
W=${CONFIGS_DIR:?set CONFIGS_DIR to the evo-robot-configs worktrees dir}; F=${FIXCOLORS_DIR:-$W/fixcolors}
cd $HERE; M=$W/2026-hololutek/hololutek/main.json5
for lib in pin master; do for c in "$W/2026-evolutek evolutek" "$W/2026-evolutek-test evolutek --main-from $M" "$W/empty empty --main-from $M" "$F evolutek --main-from $M" "$W/2026-hololutek test --main-from $M" "$W/2026-hololutek test_camera --main-from $M" "$W/2026-hololutek test_tcs34725 --main-from $M"; do echo "######## $lib :: $c" | sed "s#$W/##;s#--main-from.*#(+main)#"; ./val.sh $lib rpi $c > out.txt 2>&1; sed -n '/^SUMMARY/,$p' out.txt | grep -v "missing peripherals.*\(_1[5-9]'\|_20'\|_2[5-9]'\|_30'\)" | cut -c1-300; grep -h "Failed to execute\|ABORT\|WARN.*commands" out.txt | sed "s#.*Error: ##" | cut -c1-250; done; done
