#!/bin/bash
HERE="$(cd "$(dirname "$0")" && pwd)"
# usage: val.sh <pin|master> <pc|rpi> <cfg> <robot> [--main-from f]
lib=$1; mode=$2; shift 2
pp=$HERE/tkstub; [ "$mode" = rpi ] && pp=$HERE/rpistub:$pp; [ "$lib" = master ] && pp=$HERE/libmaster/src:$pp
cd $HERE && PYTHONPATH=$pp timeout 120 $HERE/venv/bin/python $HERE/validate.py "$@" 2>&1
