"""Interactive ChArUco calibration tool for a single UVC camera.

Keys:
  SPACE  capture current view
  c      compute calibration
  s      save to --output
  r      reset session
  q      quit
"""

from __future__ import annotations

import argparse
import os
import sys

import cv2
import json5
import numpy as np

from evo_lib.drivers.camera import UvcCamera
from evo_lib.drivers.camera.aruco import (
    CharucoCalibrationSession,
    _aruco_dict_from_name,
    _build_charuco_board,
)
from evo_lib.logger import Logger


def _draw_status(
    frame: np.ndarray, view_count: int, last_count: int, msg: str
) -> np.ndarray:
    h = frame.shape[0]
    cv2.rectangle(frame, (0, h - 70), (frame.shape[1], h), (0, 0, 0), -1)
    cv2.putText(
        frame,
        f"views={view_count}  last_corners={last_count}",
        (10, h - 40),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.6,
        (0, 255, 0),
        2,
    )
    cv2.putText(
        frame, msg, (10, h - 12), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 1
    )
    return frame


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--device", required=True, help="V4L2 device path (e.g. /dev/CAM_FACE1)")
    p.add_argument("--output", required=True, help="Calibration output path (.json5)")
    p.add_argument("--width", type=int, default=1280)
    p.add_argument("--height", type=int, default=720)
    p.add_argument("--focus", type=int, default=None, help="Lock focus to this value")
    p.add_argument("--dictionary", default="DICT_4X4_100")
    p.add_argument("--squares-x", type=int, default=5)
    p.add_argument("--squares-y", type=int, default=5)
    p.add_argument("--square-mm", type=float, default=40.0)
    p.add_argument("--marker-mm", type=float, default=32.0)
    args = p.parse_args(argv)

    log = Logger("calibrate_camera")
    cam = UvcCamera(
        name="cal_cam",
        logger=log,
        device=args.device,
        width=args.width,
        height=args.height,
        focus=args.focus,
        autofocus=False,
    )
    cam.init()

    board = _build_charuco_board(
        args.squares_x, args.squares_y, args.square_mm, args.marker_mm, args.dictionary
    )
    dictionary = _aruco_dict_from_name(args.dictionary)
    session = CharucoCalibrationSession(board=board, dictionary=dictionary)
    detector = cv2.aruco.ArucoDetector(dictionary, cv2.aruco.DetectorParameters())

    intrinsics: dict | None = None
    last_count = 0
    msg = "SPACE=capture  c=compute  s=save  r=reset  q=quit"

    try:
        while True:
            frame = cam.capture()
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            marker_corners, marker_ids, _ = detector.detectMarkers(gray)
            if marker_ids is not None and len(marker_ids) > 0:
                cv2.aruco.drawDetectedMarkers(frame, marker_corners, marker_ids)

            cv2.imshow(
                "calibrate_camera", _draw_status(frame, session.view_count, last_count, msg)
            )
            k = cv2.waitKey(1) & 0xFF
            if k == ord("q"):
                break
            elif k == ord(" "):
                last_count = session.capture_view(gray)
                msg = (
                    f"captured view #{session.view_count} ({last_count} corners)"
                    if last_count > 0
                    else "no charuco corners detected — move the board"
                )
            elif k == ord("r"):
                session = CharucoCalibrationSession(board=board, dictionary=dictionary)
                last_count = 0
                msg = "session reset"
            elif k == ord("c"):
                try:
                    intrinsics = session.compute()
                    msg = (
                        f"OK rms={intrinsics['rms']:.3f}px "
                        f"({intrinsics['n_views_used']} views, "
                        f"{intrinsics['n_views_dropped']} dropped) — press 's' to save"
                    )
                except RuntimeError as exc:
                    msg = f"compute failed: {exc}"
            elif k == ord("s"):
                if intrinsics is None:
                    msg = "nothing to save — run 'c' first"
                else:
                    os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)
                    with open(args.output, "w") as f:
                        json5.dump({"intrinsics": intrinsics}, f, indent=2)
                    msg = f"saved -> {args.output}"
    finally:
        cam.close()
        cv2.destroyAllWindows()

    return 0


if __name__ == "__main__":
    sys.exit(main())
