"""ChArUco calibration tool — three modes:

    calibrate-camera live     interactive (cv2.imshow), needs display
    calibrate-camera capture  save frames to disk via ssh (no display)
    calibrate-camera compute  run calibration on a folder of frames
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

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


def _add_charuco_args(p: argparse.ArgumentParser) -> None:
    p.add_argument("--dictionary", default="DICT_4X4_100")
    p.add_argument("--squares-x", type=int, default=5)
    p.add_argument("--squares-y", type=int, default=5)
    p.add_argument("--square-mm", type=float, default=40.0)
    p.add_argument("--marker-mm", type=float, default=32.0)


def _add_camera_args(p: argparse.ArgumentParser) -> None:
    p.add_argument("--device", required=True, help="V4L2 device path (e.g. /dev/CAM_FACE1)")
    p.add_argument("--width", type=int, default=1280)
    p.add_argument("--height", type=int, default=720)
    p.add_argument("--focus", type=int, default=None, help="Lock focus to this value")


def _open_camera(args: argparse.Namespace, logger: Logger) -> UvcCamera:
    cam = UvcCamera(
        name="cal_cam",
        logger=logger,
        device=args.device,
        width=args.width,
        height=args.height,
        focus=args.focus,
        autofocus=False,
    )
    cam.init()
    return cam


def _save_intrinsics(path: str, intrinsics: dict) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w") as f:
        json5.dump({"intrinsics": intrinsics}, f, indent=2)


# ─────────────────────── live (X11 / display required) ───────────────────────


def _draw_status(frame: np.ndarray, view_count: int, last_count: int, msg: str) -> np.ndarray:
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
    cv2.putText(frame, msg, (10, h - 12), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 1)
    return frame


def cmd_live(args: argparse.Namespace) -> int:
    log = Logger("calibrate_camera.live")
    cam = _open_camera(args, log)

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
                    _save_intrinsics(args.output, intrinsics)
                    msg = f"saved -> {args.output}"
    finally:
        cam.close()
        cv2.destroyAllWindows()

    return 0


# ─────────────────────── capture (no display, headless ssh) ──────────────────


def cmd_capture(args: argparse.Namespace) -> int:
    log = Logger("calibrate_camera.capture")
    cam = _open_camera(args, log)

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    dictionary = _aruco_dict_from_name(args.dictionary)
    board = _build_charuco_board(
        args.squares_x, args.squares_y, args.square_mm, args.marker_mm, args.dictionary
    )
    detector = cv2.aruco.ArucoDetector(dictionary, cv2.aruco.DetectorParameters())

    existing = sorted(out_dir.glob("frame_*.jpg"))
    counter = max(int(p.stem.split("_")[1]) for p in existing) + 1 if existing else 1
    print(
        f"capture mode: writing to {out_dir} (starting at frame_{counter:03d}.jpg)\n"
        f"press ENTER to capture, q+ENTER to quit, p+ENTER to also save annotated preview"
    )

    save_preview = bool(args.save_preview)
    try:
        while True:
            try:
                user = input("> ").strip().lower()
            except EOFError:
                break
            if user == "q":
                break
            if user == "p":
                save_preview = not save_preview
                print(f"  save_preview = {save_preview}")
                continue

            frame = cam.capture()
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            marker_corners, marker_ids, _ = detector.detectMarkers(gray)
            charuco_count = 0
            if marker_ids is not None and len(marker_ids) > 0:
                ret, _, _ = cv2.aruco.interpolateCornersCharuco(
                    marker_corners, marker_ids, gray, board
                )
                charuco_count = int(ret) if ret > 0 else 0

            path = out_dir / f"frame_{counter:03d}.jpg"
            cv2.imwrite(str(path), frame, [cv2.IMWRITE_JPEG_QUALITY, 92])
            print(
                f"  frame_{counter:03d}.jpg saved — {charuco_count} charuco corners"
                + ("" if charuco_count > 0 else "  [reposition the board!]")
            )

            if save_preview and marker_ids is not None and len(marker_ids) > 0:
                preview = frame.copy()
                cv2.aruco.drawDetectedMarkers(preview, marker_corners, marker_ids)
                preview_path = out_dir / f"frame_{counter:03d}_preview.jpg"
                cv2.imwrite(str(preview_path), preview)

            counter += 1
    finally:
        cam.close()

    print(f"done. {counter - 1} frame(s) total in {out_dir}")
    return 0


# ─────────────────────── compute (offline, no camera) ────────────────────────


def cmd_compute(args: argparse.Namespace) -> int:
    frames_dir = Path(args.frames)
    if not frames_dir.is_dir():
        print(f"error: {frames_dir} is not a directory", file=sys.stderr)
        return 2

    paths = sorted(p for p in frames_dir.iterdir() if p.suffix.lower() in (".jpg", ".jpeg", ".png"))
    paths = [p for p in paths if not p.stem.endswith("_preview")]
    if not paths:
        print(f"error: no frames found in {frames_dir}", file=sys.stderr)
        return 2

    dictionary = _aruco_dict_from_name(args.dictionary)
    board = _build_charuco_board(
        args.squares_x, args.squares_y, args.square_mm, args.marker_mm, args.dictionary
    )
    session = CharucoCalibrationSession(
        board=board,
        dictionary=dictionary,
        rms_threshold_px=args.rms_threshold,
        per_view_reject_px=args.per_view_reject,
    )

    print(f"reading {len(paths)} frames from {frames_dir}")
    for path in paths:
        frame = cv2.imread(str(path), cv2.IMREAD_COLOR)
        if frame is None:
            print(f"  {path.name}: read failed, skipping")
            continue
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        n = session.capture_view(gray)
        flag = "" if n > 0 else "  [no corners — excluded]"
        print(f"  {path.name}: {n} corners{flag}")

    if session.view_count < 4:
        print(f"error: only {session.view_count} usable views; need at least 4", file=sys.stderr)
        return 2

    try:
        intrinsics = session.compute()
    except RuntimeError as exc:
        print(f"calibration failed: {exc}", file=sys.stderr)
        return 1

    print(
        f"OK rms={intrinsics['rms']:.3f}px "
        f"({intrinsics['n_views_used']} views used, "
        f"{intrinsics['n_views_dropped']} dropped)"
    )
    _save_intrinsics(args.output, intrinsics)
    print(f"saved -> {args.output}")
    return 0


# ─────────────────────── entry point ──────────────────────────────────────────


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="calibrate-camera", description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_live = sub.add_parser("live", help="Interactive calibration with cv2.imshow window.")
    _add_camera_args(p_live)
    _add_charuco_args(p_live)
    p_live.add_argument("--output", required=True, help="Calibration output path (.json5)")

    p_capture = sub.add_parser(
        "capture", help="Save raw frames to disk for offline calibration (no display)."
    )
    _add_camera_args(p_capture)
    _add_charuco_args(p_capture)
    p_capture.add_argument("--out-dir", required=True, help="Directory to write frame_*.jpg into")
    p_capture.add_argument(
        "--save-preview",
        action="store_true",
        help="Also save annotated preview frames (toggleable in-session with 'p').",
    )

    p_compute = sub.add_parser(
        "compute", help="Run calibration on a directory of pre-captured frames."
    )
    _add_charuco_args(p_compute)
    p_compute.add_argument("--frames", required=True, help="Directory of frame_*.jpg")
    p_compute.add_argument("--output", required=True, help="Calibration output path (.json5)")
    p_compute.add_argument("--rms-threshold", type=float, default=0.5)
    p_compute.add_argument("--per-view-reject", type=float, default=1.5)

    args = parser.parse_args(argv)
    if args.cmd == "live":
        return cmd_live(args)
    if args.cmd == "capture":
        return cmd_capture(args)
    if args.cmd == "compute":
        return cmd_compute(args)
    return 2


if __name__ == "__main__":
    sys.exit(main())
