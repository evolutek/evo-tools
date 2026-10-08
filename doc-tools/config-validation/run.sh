#!/bin/bash
HERE="$(cd "$(dirname "$0")" && pwd)"
# usage: run.sh <pc|rpi> <config_dir> <robot> [extra args]
mode=$1; shift; cfg=$1; shift; rob=$1; shift
pp=$HERE/tkstub; [ "$mode" = rpi ] && pp=$HERE/rpistub:$pp
cd $HERE && PYTHONPATH=$pp timeout 60 $HERE/venv/bin/robot --config_dir "$cfg" --robot "$rob" --log_dir $HERE/logs "$@" 2>&1
echo "EXIT=$?"
