"""Tolerant config validator: replays Robot._init step by step, collecting every error.

usage: validate.py <config_dir> <robot> [--main-from <file>]
"""
import itertools
import shutil
import sys
import tempfile
import traceback
from pathlib import Path

from evo_lib.logger import Logger, LoggerConsoleSink
from evo_lib.config import ConfigObject
from evo_lib.driver_definition import DriverInitArgs
from evo_robot.robot.robot import Robot, RobotParameters
from evo_robot.hardware import peripheral_manager as pm

cfg_dir = Path(sys.argv[1])
robot_name = sys.argv[2]
main_from = sys.argv[4] if len(sys.argv) > 4 and sys.argv[3] == "--main-from" else None

if main_from:
    # Work on a temp copy so the real worktree is never touched.
    tmp = Path(tempfile.mkdtemp())
    shutil.copytree(cfg_dir / robot_name, tmp / robot_name)
    shutil.copy(main_from, tmp / robot_name / "main.json5")
    print(f"NOTE main.json5 injected from {main_from}")
    cfg_dir = tmp

errors = []


def err(stage, msg):
    errors.append((stage, msg))
    print(f"ERROR [{stage}] {msg}")


def tolerant_instantiate(self):
    config = self._config_manager.load_config("peripherals", "peripherals.json5").raw
    per = config.get_object("peripherals")
    for name in per.keys():
        try:
            pc = per.get_object(name)
            extra = set(pc.keys()) - {"driver", "args"}
            if extra:
                print(f"WARN  [peripherals] {name}: unread keys {sorted(extra)}")
            driver = self._drivers.get(pc.get_str("driver"))
            args = pc.get_object_or("args", ConfigObject())
            idef = driver.get_init_args_definition()
            ia = DriverInitArgs(name, idef)
            unknown = set(args.keys()) - set(idef.get_args().keys())
            if unknown:
                print(f"WARN  [peripherals] {name}: args ignored (unknown to driver): {sorted(unknown)}")
            for an, ad in idef.get_args().items():
                if an in args:
                    ia.set(an, ad.get_type().value_from_config(args[an]))
                elif ad.is_required():
                    raise ValueError(f"Missing required argument '{an}'")
                else:
                    ia.set(an, ad.get_default())
            p = driver.create(ia)
            p._definition = driver
            p._init_args = ia
            self._peripherals.register(name, p)
            self._auto_register_subcomponents(p)
        except Exception as e:
            err("peripherals", f"{name}: {type(e).__name__}: {e}")


pm.RobotPeripheralsManager._instantiate_peripherals = tolerant_instantiate

logger = Logger("robot")
logger.add_sink(LoggerConsoleSink())
params = RobotParameters(robot_name=robot_name, log_dir_path=Path("/tmp"), config_dir_path=cfg_dir, dry_mode=True, no_run=True)
robot = Robot(logger, params)


def step(stage, fn):
    try:
        fn()
        return True
    except Exception as e:
        err(stage, f"{type(e).__name__}: {e}")
        traceback.print_exc(limit=3)
        return False


if not step("main", robot._init_config):
    print("ABORT: no main config")
    sys.exit(2)
robot._init_events()
robot._peripherals_manager.register_drivers()
step("peripherals", robot._peripherals_manager.create_peripherals)
ai = robot._ai_manager
step("main.team_colors", ai._load_ai_config)
step("main.team_transforms", lambda: robot.get_main_config().get_object("team_transforms"))
ok_actions = step("actions", lambda: ai._actions_engine.load_config(
    robot.get_configs_manager().load_config("actions", "actions.json5").raw))

# Static check of each action command against the instantiated peripherals.
pmgr = robot.get_peripherals_manager()
if ok_actions:
    for action in ai.get_actions():
        cmds = getattr(action, "_commands", [])
        if len(cmds) >= 2:
            print(f"WARN  [actions] {action.get_name()}: {len(cmds)} commands -> SchedulerExecutor.exec bug on 2nd command")
        choices = {}
        for inp in action.get_inputs():
            t = inp.type
            c = getattr(t, "_choices", None) or getattr(t, "choices", None)
            lo, hi = getattr(t, "min", None), getattr(t, "max", None)
            if c:
                choices[inp.name] = list(c)
            elif lo is not None and hi is not None and hi - lo < 100:
                choices[inp.name] = list(range(int(lo), int(hi) + 1))
        for cmd in cmds:
            names = set()
            keys = list(choices)
            for combo in itertools.product(*[choices[k] for k in keys]) if keys else [()]:
                try:
                    names.add(cmd.peripheral.format(**dict(zip(keys, combo))))
                except KeyError as e:
                    err("actions", f"{action.get_name()}: peripheral template {cmd.peripheral!r} uses free-form input {e} (not enumerable)")
                    break
            missing = sorted(n for n in names if not pmgr.get_peripherals().has(n))
            present = sorted(n for n in names if pmgr.get_peripherals().has(n))
            if missing:
                err("actions", f"{action.get_name()}: {cmd.command} on missing peripherals {missing} (present: {present})")
            for n in present:
                p = pmgr.get_peripherals().get(n)
                d = p.get_definition()
                if d is None:
                    err("actions", f"{action.get_name()}: {n} has no definition (sub-component)")
                    continue
                dc = d.get_commands()
                try:
                    c = dc.get(cmd.command)
                except Exception:
                    c = None
                if c is None:
                    err("actions", f"{action.get_name()}: driver {d.get_name()} ({n}) has no command {cmd.command!r}; has {[x.name for x in dc.get_all()]}")
                    break
                dargs = [a for a, _ in c.args.fields]
                bad = set(cmd.args) - set(dargs)
                if bad:
                    err("actions", f"{action.get_name()}: {cmd.command} on {d.get_name()} gets unknown args {sorted(bad)}; expects {dargs}")
                    break

step("scripts", ai._scripts_manager.init)
for s in ai.get_scripts():
    print(f"INFO  [scripts] {s.get_name()} args={[a for a, _ in s.get_args()]}")
step("graphs", ai._init_ai_runners)
step("strategies", ai._load_strategies_config)
print("SUMMARY", robot_name, "errors:", len(errors))
for stage, m in errors:
    print("  -", stage, "|", m)
