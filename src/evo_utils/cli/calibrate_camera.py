"""ChArUco calibration tool — five modes:

calibrate-camera intrinsics  interactive K + dist (cv2.imshow), needs display
calibrate-camera capture     save frames to disk via ssh (no display)
calibrate-camera compute     run intrinsics on a folder of frames
calibrate-camera extrinsics  compute R_robot_camera from a known table marker
calibrate-camera verify      live preview of detected markers + robot-frame pose
"""

from __future__ import annotations

import argparse
import math
import os
import sys
from pathlib import Path

os.environ.setdefault(
    "QT_LOGGING_RULES",
    "qt.qpa.fonts.warning=false;qt.qpa.xcb.warning=false",
)

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
from evo_lib.types import EUROBOT_FIXED_TABLE_TAGS, EUROBOT_TAG_SIZES_MM
from evo_lib.types.pose import Pose3D


def _add_charuco_args(p: argparse.ArgumentParser) -> None:
    p.add_argument("--dictionary", default="DICT_4X4_100")
    p.add_argument("--squares-x", type=int, default=5)
    p.add_argument("--squares-y", type=int, default=5)
    p.add_argument("--square-mm", type=float, default=40.0)
    p.add_argument("--marker-mm", type=float, default=32.0)


def _add_camera_args(p: argparse.ArgumentParser) -> None:
    p.add_argument(
        "--device",
        required=True,
        help="V4L2 device path (/dev/CAM_FACE1) OR HTTP MJPEG URL "
        "(http://10.10.42.115:8080/stream)",
    )
    p.add_argument("--width", type=int, default=1280)
    p.add_argument("--height", type=int, default=720)
    p.add_argument("--focus", type=int, default=None, help="Lock focus to this value")


class _HttpCapture:
    def __init__(self, url: str):
        self._cap = cv2.VideoCapture(url)
        if not self._cap.isOpened():
            raise RuntimeError(f"failed to open HTTP stream: {url}")

    def capture(self) -> np.ndarray:
        ok, frame = self._cap.read()
        if not ok:
            raise RuntimeError("HTTP stream: frame grab failed")
        return frame

    def close(self) -> None:
        self._cap.release()


def _open_source(args: argparse.Namespace, logger: Logger):
    if args.device.startswith(("http://", "https://", "rtsp://")):
        return _HttpCapture(args.device)
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


def _require_display() -> None:
    if not os.environ.get("DISPLAY"):
        print(
            "error: $DISPLAY is empty — this subcommand needs an X server "
            "(reconnect with 'ssh -X pi@<host>' or 'ssh -Y ...').",
            file=sys.stderr,
        )
        raise SystemExit(2)


def _open_resized_window(
    name: str, capture_w: int, capture_h: int, max_w: int = 1280
) -> None:
    if capture_w <= max_w:
        target_w, target_h = capture_w, capture_h
    else:
        target_w = max_w
        target_h = int(capture_h * max_w / capture_w)
    cv2.namedWindow(name, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(name, target_w, target_h)


def _open_camera_for_subcommand(
    args: argparse.Namespace,
    name: str,
    log: Logger,
    *,
    require_extrinsics: bool = False,
) -> UvcCamera:
    cam = UvcCamera(
        name=name,
        logger=log,
        device=args.device,
        width=args.width,
        height=args.height,
        focus=args.focus,
        autofocus=False,
        marker_size_mm=args.marker_size_mm,
        dictionary=args.dictionary,
        calibration_path=args.calibration,
    )
    cam.init()
    if not cam.is_intrinsics_loaded():
        cam.close()
        print(f"error: no intrinsics in {args.calibration}", file=sys.stderr)
        raise SystemExit(2)
    if require_extrinsics and not cam.is_extrinsics_loaded():
        cam.close()
        print(
            f"error: no extrinsics in {args.calibration} — run 'extrinsics' first",
            file=sys.stderr,
        )
        raise SystemExit(2)
    return cam


# ─────────────────────── intrinsics (X11 / display required) ─────────────────


def _draw_status(
    frame: np.ndarray, view_count: int, live_count: int, last_count: int, msg: str
) -> np.ndarray:
    h = frame.shape[0]
    cv2.rectangle(frame, (0, h - 70), (frame.shape[1], h), (0, 0, 0), -1)
    color = (0, 255, 0) if live_count >= 10 else (0, 165, 255)
    cv2.putText(
        frame,
        f"views={view_count}  live={live_count}  last={last_count}",
        (10, h - 40),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.6,
        color,
        2,
    )
    cv2.putText(
        frame, msg, (10, h - 12), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 1
    )
    return frame


def cmd_intrinsics(args: argparse.Namespace) -> int:
    _require_display()
    log = Logger("calibrate_camera.intrinsics")
    cam = _open_source(args, log)

    board = _build_charuco_board(
        args.squares_x, args.squares_y, args.square_mm, args.marker_mm, args.dictionary
    )
    dictionary = _aruco_dict_from_name(args.dictionary)
    session = CharucoCalibrationSession(board=board, dictionary=dictionary)
    detector = cv2.aruco.ArucoDetector(dictionary, cv2.aruco.DetectorParameters())

    intrinsics: dict | None = None
    last_count = 0
    msg = "SPACE=capture (need >=10 live)  c=compute  s=save  r=reset  q=quit"

    _open_resized_window("calibrate_camera", args.width, args.height)
    try:
        while True:
            frame = cam.capture()
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            marker_corners, marker_ids, _ = detector.detectMarkers(gray)
            live_count = 0
            charuco_corners = None
            charuco_ids = None
            if marker_ids is not None and len(marker_ids) > 0:
                cv2.aruco.drawDetectedMarkers(frame, marker_corners, marker_ids)
                ret, charuco_corners, charuco_ids = cv2.aruco.interpolateCornersCharuco(
                    marker_corners, marker_ids, gray, board
                )
                live_count = int(ret) if ret and ret > 0 else 0
                if live_count > 0:
                    cv2.aruco.drawDetectedCornersCharuco(
                        frame, charuco_corners, charuco_ids
                    )

            cv2.imshow(
                "calibrate_camera",
                _draw_status(frame, session.view_count, live_count, last_count, msg),
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
    cam = _open_source(args, log)

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

    paths = sorted(
        p for p in frames_dir.iterdir() if p.suffix.lower() in (".jpg", ".jpeg", ".png")
    )
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
        print(
            f"error: only {session.view_count} usable views; need at least 4",
            file=sys.stderr,
        )
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


# ─────────────────────── extrinsics (live, X11) ──────────────────────────────


def _pose3d_to_R_t(pose: Pose3D) -> tuple[np.ndarray, np.ndarray]:
    qw, qx, qy, qz = pose.quaternion
    R = np.array(
        [
            [
                1 - 2 * (qy * qy + qz * qz),
                2 * (qx * qy - qw * qz),
                2 * (qx * qz + qw * qy),
            ],
            [
                2 * (qx * qy + qw * qz),
                1 - 2 * (qx * qx + qz * qz),
                2 * (qy * qz - qw * qx),
            ],
            [
                2 * (qx * qz - qw * qy),
                2 * (qy * qz + qw * qx),
                1 - 2 * (qx * qx + qy * qy),
            ],
        ],
        dtype=np.float64,
    )
    t = np.array([pose.x, pose.y, pose.z], dtype=np.float64).reshape(3, 1)
    return R, t


def _resolve_marker_pose(marker_id: int, args: argparse.Namespace) -> Pose3D:
    fixed = EUROBOT_FIXED_TABLE_TAGS.get(marker_id)
    if fixed is not None:
        return fixed
    if args.marker_table_pos_mm is None or args.marker_table_rot_deg is None:
        raise SystemExit(
            f"error: id {marker_id} not in EUROBOT_FIXED_TABLE_TAGS, "
            f"need --marker-table-pos-mm X Y Z and --marker-table-rot-deg RX RY RZ"
        )
    rx, ry, rz = (math.radians(v) for v in args.marker_table_rot_deg)
    x, y, z = args.marker_table_pos_mm
    return Pose3D(x=x, y=y, z=z, roll=rx, pitch=ry, yaw=rz)


def _pick_reference_marker(
    marker_corners: list,
    marker_ids,
    explicit_id: int | None,
) -> tuple[int | None, int | None]:
    if marker_ids is None or len(marker_ids) == 0:
        return None, None
    best_id, best_idx, best_area = None, None, -1.0
    for i, mid in enumerate(marker_ids.flatten()):
        mid = int(mid)
        if explicit_id is not None:
            if mid == explicit_id:
                return mid, i
            continue
        if mid not in EUROBOT_FIXED_TABLE_TAGS:
            continue
        area = float(cv2.contourArea(marker_corners[i].astype(np.float32)))
        if area > best_area:
            best_id, best_idx, best_area = mid, i, area
    return best_id, best_idx


def cmd_extrinsics(args: argparse.Namespace) -> int:
    _require_display()
    log = Logger("calibrate_camera.extrinsics")

    rx, ry, rz = (math.radians(v) for v in args.robot_table_rot_deg)
    rx_pos = args.robot_table_pos_mm
    robot_pose = Pose3D(
        x=rx_pos[0], y=rx_pos[1], z=rx_pos[2], roll=rx, pitch=ry, yaw=rz
    )

    if args.ref_marker_id is not None:
        marker_pose = _resolve_marker_pose(args.ref_marker_id, args)
        pose_robot_marker = robot_pose.inverse().compose(marker_pose)
        log.info(
            f"explicit marker id={args.ref_marker_id} expected in robot frame at "
            f"({pose_robot_marker.x:.1f}, {pose_robot_marker.y:.1f}, {pose_robot_marker.z:.1f}) mm "
            f"yaw={math.degrees(pose_robot_marker.yaw):.1f}deg"
        )
    else:
        log.info(
            f"AUTO mode: looking for any of {sorted(EUROBOT_FIXED_TABLE_TAGS.keys())}"
        )

    cam = _open_camera_for_subcommand(args, "cal_cam", log)

    detector = cv2.aruco.ArucoDetector(
        _aruco_dict_from_name(args.dictionary), cv2.aruco.DetectorParameters()
    )
    half = args.marker_size_mm * 0.5
    obj_pts = np.array(
        [
            [-half, half, 0.0],
            [half, half, 0.0],
            [half, -half, 0.0],
            [-half, -half, 0.0],
        ],
        dtype=np.float32,
    )
    K, dist = cam.K, cam.dist

    auto_mode = args.ref_marker_id is None
    msg = f"SPACE=capture {args.num_frames} frames  q=quit"
    captured = False
    _open_resized_window("calibrate_camera extrinsics", args.width, args.height)
    try:
        while not captured:
            frame = cam.capture()
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            mc, mi, _ = detector.detectMarkers(gray)
            if mi is not None and len(mi) > 0:
                cv2.aruco.drawDetectedMarkers(frame, mc, mi)
            ref_id_now, ref_idx_now = _pick_reference_marker(mc, mi, args.ref_marker_id)
            tvec_live = None
            if ref_id_now is not None:
                cv2.polylines(
                    frame,
                    [mc[ref_idx_now].astype(np.int32)],
                    True,
                    (0, 255, 0),
                    4,
                )
                ok_live, rvec_live, tvec_live = cv2.solvePnP(
                    obj_pts,
                    mc[ref_idx_now],
                    K,
                    dist,
                    flags=cv2.SOLVEPNP_IPPE_SQUARE,
                )
                if ok_live:
                    cv2.drawFrameAxes(
                        frame, K, dist, rvec_live, tvec_live, args.marker_size_mm * 0.5
                    )

            color = (0, 255, 0) if ref_id_now is not None else (0, 165, 255)
            h = frame.shape[0]
            cv2.rectangle(frame, (0, h - 70), (frame.shape[1], h), (0, 0, 0), -1)
            if auto_mode:
                hud = (
                    f"AUTO -> tag {ref_id_now}"
                    if ref_id_now is not None
                    else f"AUTO: looking for {sorted(EUROBOT_FIXED_TABLE_TAGS.keys())}"
                )
            else:
                hud = (
                    f"REF id={args.ref_marker_id}  "
                    f"{'VISIBLE' if ref_id_now is not None else 'NOT FOUND'}"
                )
            cv2.putText(
                frame, hud, (10, h - 40), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2
            )
            cv2.putText(
                frame,
                msg,
                (10, h - 12),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (200, 200, 200),
                1,
            )
            cv2.imshow("calibrate_camera extrinsics", frame)

            k = cv2.waitKey(1) & 0xFF
            if k == ord("q"):
                break
            if k == ord(" ") and ref_id_now is not None:
                ref_id = ref_id_now
                marker_pose = _resolve_marker_pose(ref_id, args)
                pose_robot_marker = robot_pose.inverse().compose(marker_pose)
                R_robot_marker, t_robot_marker_mm = _pose3d_to_R_t(pose_robot_marker)
                log.info(
                    f"locked on tag {ref_id}, expected in robot frame at "
                    f"({pose_robot_marker.x:.1f}, {pose_robot_marker.y:.1f}, "
                    f"{pose_robot_marker.z:.1f}) mm "
                    f"yaw={math.degrees(pose_robot_marker.yaw):.1f}deg"
                )

                corners_per_frame: list[np.ndarray] = []
                for _ in range(args.num_frames):
                    f = cam.capture()
                    g = cv2.cvtColor(f, cv2.COLOR_BGR2GRAY)
                    mc2, mi2, _ = detector.detectMarkers(g)
                    if mi2 is None:
                        continue
                    for i, mid in enumerate(mi2.flatten()):
                        if int(mid) == ref_id:
                            corners_per_frame.append(
                                mc2[i].reshape(4, 2).astype(np.float32)
                            )
                            break

                if len(corners_per_frame) < 5:
                    msg = (
                        f"only {len(corners_per_frame)}/{args.num_frames} frames "
                        f"saw marker — retry, hold still"
                    )
                    continue

                # Bundle PnP: stack 4N correspondences and refine in one solvePnP.
                n = len(corners_per_frame)
                obj_4N = np.tile(obj_pts, (n, 1))
                img_4N = np.concatenate(corners_per_frame, axis=0)
                ok0, rvec0, tvec0 = cv2.solvePnP(
                    obj_pts,
                    corners_per_frame[0],
                    K,
                    dist,
                    flags=cv2.SOLVEPNP_IPPE_SQUARE,
                )
                if not ok0:
                    msg = "init solvePnP failed — retry"
                    continue
                ok, rvec, tvec = cv2.solvePnP(
                    obj_4N,
                    img_4N,
                    K,
                    dist,
                    rvec=rvec0,
                    tvec=tvec0,
                    useExtrinsicGuess=True,
                    flags=cv2.SOLVEPNP_ITERATIVE,
                )
                if not ok:
                    msg = "bundle solvePnP failed — retry"
                    continue

                proj, _ = cv2.projectPoints(obj_4N, rvec, tvec, K, dist)
                err_px = float(
                    np.sqrt(((proj.reshape(-1, 2) - img_4N) ** 2).sum(1).mean())
                )

                extrinsics = cam.calibrate_extrinsics_from_pose(
                    ref_id,
                    rvec,
                    tvec,
                    R_robot_marker,
                    t_robot_marker_mm,
                )
                cam.save_calibration()

                t = extrinsics["t_robot_camera_mm"]
                print("\n=== EXTRINSICS SAVED ===")
                print(
                    f"  used {n}/{args.num_frames} frames, reproj rms = {err_px:.3f} px"
                )
                print(f"  t_robot_camera_mm = ({t[0]:.1f}, {t[1]:.1f}, {t[2]:.1f})")
                print(f"  saved -> {args.calibration}")
                msg = "DONE — q to quit"
                captured = True
    finally:
        cam.close()
        cv2.destroyAllWindows()

    return 0


# ─────────────────────── verify (X11 / display required) ──────────────────────


def cmd_verify(args: argparse.Namespace) -> int:
    _require_display()
    log = Logger("calibrate_camera.verify")
    cam = _open_camera_for_subcommand(args, "ver_cam", log, require_extrinsics=True)

    msg = f"size lookup by ID, fallback={args.marker_size_mm:.0f}mm  q=quit"
    _open_resized_window("calibrate_camera verify", args.width, args.height)
    K, dist = cam.K, cam.dist

    try:
        while True:
            frame = cam.capture()
            markers = cam.detect_from_frame(frame)

            for m in markers:
                pts = m.corners.astype(np.int32).reshape(-1, 1, 2)
                cv2.polylines(frame, [pts], True, (0, 255, 0), 2)
                center = m.corners.mean(axis=0).astype(int)
                size_mm = EUROBOT_TAG_SIZES_MM.get(m.id, args.marker_size_mm)
                if m.position_robot_mm is not None:
                    x, y, z = m.position_robot_mm
                    label = f"id={m.id} ({size_mm:.0f}mm) ({x:.0f}, {y:.0f}, {z:.0f})"
                else:
                    label = f"id={m.id} ({size_mm:.0f}mm) (no pose)"
                cv2.putText(
                    frame,
                    label,
                    (int(center[0]) - 100, int(center[1]) - 10),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.6,
                    (0, 255, 0),
                    2,
                )
                if m.rvec_camera is not None and m.tvec_camera is not None:
                    cv2.drawFrameAxes(
                        frame, K, dist, m.rvec_camera, m.tvec_camera, size_mm * 0.5
                    )

            h = frame.shape[0]
            cv2.rectangle(frame, (0, h - 30), (frame.shape[1], h), (0, 0, 0), -1)
            cv2.putText(
                frame,
                msg,
                (10, h - 8),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (200, 200, 200),
                1,
            )
            cv2.imshow("calibrate_camera verify", frame)

            k = cv2.waitKey(1) & 0xFF
            if k == ord("q"):
                break
    finally:
        cam.close()
        cv2.destroyAllWindows()

    return 0


# ─────────────────────── entry point ──────────────────────────────────────────


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="calibrate-camera", description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_intr = sub.add_parser(
        "intrinsics", help="Interactive K + dist calibration with cv2.imshow window."
    )
    _add_camera_args(p_intr)
    _add_charuco_args(p_intr)
    p_intr.add_argument(
        "--output", required=True, help="Calibration output path (.json5)"
    )

    p_capture = sub.add_parser(
        "capture", help="Save raw frames to disk for offline calibration (no display)."
    )
    _add_camera_args(p_capture)
    _add_charuco_args(p_capture)
    p_capture.add_argument(
        "--out-dir", required=True, help="Directory to write frame_*.jpg into"
    )
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
    p_compute.add_argument(
        "--output", required=True, help="Calibration output path (.json5)"
    )
    p_compute.add_argument("--rms-threshold", type=float, default=0.5)
    p_compute.add_argument("--per-view-reject", type=float, default=1.5)

    p_extr = sub.add_parser(
        "extrinsics",
        help="Compute (R_robot_camera, t_robot_camera_mm) from a known reference marker.",
    )
    _add_camera_args(p_extr)
    p_extr.add_argument(
        "--calibration",
        required=True,
        help="JSON5 file with intrinsics (extrinsics will be merged in).",
    )
    p_extr.add_argument(
        "--ref-marker-id",
        type=int,
        default=None,
        help="ArUco id to use as reference. If omitted, auto-detect any tag "
        "from EUROBOT_FIXED_TABLE_TAGS (largest one wins if several visible).",
    )
    p_extr.add_argument(
        "--marker-size-mm",
        type=float,
        default=100.0,
        help="Reference marker side length (default 100mm = Eurobot fixed tags).",
    )
    p_extr.add_argument("--dictionary", default="DICT_4X4_100")
    p_extr.add_argument(
        "--marker-table-pos-mm",
        type=float,
        nargs=3,
        default=None,
        metavar=("X", "Y", "Z"),
        help="Fallback marker pose if id not in EUROBOT_FIXED_TABLE_TAGS.",
    )
    p_extr.add_argument(
        "--marker-table-rot-deg",
        type=float,
        nargs=3,
        default=None,
        metavar=("RX", "RY", "RZ"),
    )
    p_extr.add_argument(
        "--robot-table-pos-mm",
        type=float,
        nargs=3,
        required=True,
        metavar=("X", "Y", "Z"),
        help="Robot center in TABLE frame at calibration time (mm).",
    )
    p_extr.add_argument(
        "--robot-table-rot-deg",
        type=float,
        nargs=3,
        default=[0.0, 0.0, 0.0],
        metavar=("RX", "RY", "RZ"),
    )
    p_extr.add_argument("--num-frames", type=int, default=30)

    p_ver = sub.add_parser(
        "verify",
        help="Live preview: every detected ArUco's ID + position in the robot frame.",
    )
    _add_camera_args(p_ver)
    p_ver.add_argument(
        "--calibration",
        required=True,
        help="JSON5 file with both intrinsics and extrinsics (run extrinsics first).",
    )
    p_ver.add_argument(
        "--marker-size-mm",
        type=float,
        default=100.0,
        help="Fallback marker size for IDs not in EUROBOT_TAG_SIZES_MM (default 100mm).",
    )
    p_ver.add_argument("--dictionary", default="DICT_4X4_100")

    args = parser.parse_args(argv)
    if args.cmd == "intrinsics":
        return cmd_intrinsics(args)
    if args.cmd == "capture":
        return cmd_capture(args)
    if args.cmd == "compute":
        return cmd_compute(args)
    if args.cmd == "extrinsics":
        return cmd_extrinsics(args)
    if args.cmd == "verify":
        return cmd_verify(args)
    return 2


if __name__ == "__main__":
    sys.exit(main())
