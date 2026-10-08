# Headless stub: lets evo_robot import robot_gui without libtk.
class _Stub:
    def __init__(self, *a, **k): pass
    def __getattr__(self, n): return _Stub()
    def __call__(self, *a, **k): return _Stub()
def __getattr__(name): return _Stub
