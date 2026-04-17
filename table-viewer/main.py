import tkinter as tk
from PIL import Image, ImageTk
import os
from math import atan2, nan
import json


program_dir = os.path.dirname(__file__)


with open(os.path.join(program_dir, "config.json"), "r") as f:
    config = json.load(f)


IMG_FILENAME = os.path.join(program_dir, config["background"])
IMG_PADDING = 10

LABEL_PADDING = 10
LABEL_HEIGHT = 15
LABEL_FONT_SIZE = 15

TABLE_WIDTH = 3000
TABLE_HEIGHT = 2000
TABLE_SIZE_UNIT = "mm"

ROBOT_DIAMETER = 140 * 2 # Same unit as table size above
ROBOT_COLOR = "red"

RULE_WIDTH = 3
RULE_COLOR = "black"

LOOK_TARGET_RADIUS = 7
LOOK_TARGET_COLOR = "blue"

LOOK_DIRECTION_LENGTH = 100
LOOK_DIRECTION_WIDTH = 3


def lerp(src_min, src_max, dst_min, dst_max, value):
    return (value - src_min) * (dst_max - dst_min) / (src_max - src_min) + dst_min

def clamp(value, minv, maxv):
    return min(max(value, minv), maxv)


def resize_inside(img: Image, w: int, h: int):
    desired_w = img.width
    desired_h = img.height
    if desired_w > w or desired_h > h:
        while desired_w > w or desired_h > h:
            desired_w //= 2
            desired_h //= 2
    else:
        while desired_w < w and desired_h < h:
            desired_w *= 2
            desired_h *= 2
        desired_w //= 2
        desired_h //= 2
    print("Resize to %i x %i" % (desired_w, desired_h))
    return img.resize((desired_w, desired_h), Image.LANCZOS)


img = Image.open(IMG_FILENAME)

win = tk.Tk()
win.title("Table")
#win.resizable(False, False)

screen_w = win.winfo_screenwidth()
screen_h = win.winfo_screenheight()

img = resize_inside(img, screen_w - 40, screen_h - 80)


LABEL_TOTAL_HEIGHT = LABEL_HEIGHT + 2 * LABEL_PADDING

IMG_MIN_X = IMG_PADDING
IMG_MAX_X = IMG_MIN_X + img.width
IMG_MIN_Y = LABEL_TOTAL_HEIGHT + IMG_PADDING
IMG_MAX_Y = IMG_MIN_Y + img.height

ROBOT_CANVAS_DIAMETER = ROBOT_DIAMETER * (IMG_MAX_X - IMG_MIN_X) / TABLE_WIDTH

WIN_W = IMG_MAX_X + IMG_PADDING
WIN_H = IMG_MAX_Y + IMG_PADDING

RULE_HALF_WIDTH = RULE_WIDTH // 2


win.geometry("%ix%i+%i+%i" % (WIN_W, WIN_H, (screen_w - WIN_W) // 2, (screen_h - WIN_H) // 2))

canvas = tk.Canvas(win, background="white", width=WIN_W, height=WIN_H)
canvas.pack(anchor=tk.CENTER, padx=0, pady=0)

tkimg = ImageTk.PhotoImage(img)
canvas.create_image(IMG_MIN_X, IMG_MIN_Y, image=tkimg, anchor="nw")

txt = canvas.create_text(LABEL_PADDING, LABEL_PADDING, text="Coordinates: _, _", fill="black", font=('Helvetica', LABEL_FONT_SIZE), anchor="nw")
robot = None
v_rule = None
h_rule = None
look_target = None
look_direction = None

pos_x = None
pos_y = None

look_x = None
look_y = None

mouse_pressed = None

def update_rule():
    global v_rule, h_rule
    if v_rule is None:
        v_rule = canvas.create_rectangle(pos_x - RULE_HALF_WIDTH, IMG_MIN_Y, pos_x + RULE_HALF_WIDTH, IMG_MAX_Y, fill=RULE_COLOR)
    else:
        canvas.moveto(v_rule, pos_x - RULE_WIDTH, IMG_MIN_Y)
    if h_rule is None:
        h_rule = canvas.create_rectangle(IMG_MIN_X, pos_y - RULE_HALF_WIDTH, IMG_MAX_X, pos_y + RULE_HALF_WIDTH, fill=RULE_COLOR)
    else:
        canvas.moveto(h_rule, IMG_MIN_X, pos_y - RULE_HALF_WIDTH)

def update_robot():
    global robot
    if robot is None:
        robot = canvas.create_oval(0, 0, ROBOT_CANVAS_DIAMETER, ROBOT_CANVAS_DIAMETER, fill=ROBOT_COLOR)
    canvas.moveto(robot, pos_x - ROBOT_CANVAS_DIAMETER // 2, pos_y - ROBOT_CANVAS_DIAMETER // 2)

def update_look_target():
    global look_target
    if look_target is None:
       look_target = canvas.create_oval(0, 0, LOOK_TARGET_RADIUS, LOOK_TARGET_RADIUS, fill=LOOK_TARGET_COLOR)
    canvas.moveto(look_target, look_x - LOOK_TARGET_RADIUS // 2, look_y - LOOK_TARGET_RADIUS // 2)

def update_look_direction():
    if look_x is None or look_y is None or pos_x is None or pos_y is None:
        return
    global look_direction
    if look_direction is not None:
        canvas.delete(look_direction)
    dx = look_x - pos_x
    dy = look_y - pos_y
    k = min(max(LOOK_DIRECTION_LENGTH / (dx*dx + dy*dy)**.5, -1), 1)
    dx *= k
    dy *= k
    look_direction = canvas.create_line(pos_x, pos_y, pos_x + dx, pos_y + dy, fill=LOOK_TARGET_COLOR, width=LOOK_DIRECTION_WIDTH)

def update_display():
    heading = nan
    if look_x is not None and look_y is not None and pos_x is not None and pos_y is not None:
        heading = atan2(look_x - pos_x, look_y - pos_y)
    x = nan
    y = nan
    if x is not None and y is not None:
        x = clamp(lerp(IMG_MIN_X, IMG_MAX_X, 0, TABLE_WIDTH, pos_x), 0, TABLE_WIDTH)
        y = clamp(lerp(IMG_MIN_Y, IMG_MAX_Y, 0, TABLE_HEIGHT, pos_y), 0, TABLE_HEIGHT)
    value = "Coordinates: x = %i %s, y = %i %s, heading = %.2f" % (y, TABLE_SIZE_UNIT, x, TABLE_SIZE_UNIT, heading)
    canvas.itemconfig(txt, text=value)
    print(value)

def update_go_to(e):
    global pos_x, pos_y
    pos_x = e.x
    pos_y = e.y
    update_rule()
    update_robot()
    update_look_direction()
    update_display()

def update_look_at(e):
    global look_x, look_y
    look_x = e.x
    look_y = e.y
    update_look_target()
    update_look_direction()
    update_display()

def on_click_go_to(e):
    update_go_to(e)

def on_mouse_down_go_to(e):
    global mouse_pressed
    mouse_pressed = 1

def on_mouse_up_go_to(e):
    global mouse_pressed
    mouse_pressed = None

def on_click_look_at(e):
    update_look_at(e)

def on_mouse_down_look_at(e):
    global mouse_pressed
    mouse_pressed = 3

def on_mouse_up_look_at(e):
    global mouse_pressed
    mouse_pressed = None

def on_mouse_move(e):
    if mouse_pressed == 1:
        update_go_to(e)
    elif mouse_pressed == 3:
        update_look_at(e)


canvas.bind('<Button-1>', on_click_go_to)
win.bind("<ButtonPress-1>", on_mouse_down_go_to)
win.bind("<ButtonRelease-1>", on_mouse_up_go_to)

canvas.bind('<Button-3>', on_click_look_at)
win.bind("<ButtonPress-3>", on_mouse_down_look_at)
win.bind("<ButtonRelease-3>", on_mouse_up_look_at)

win.bind("<Motion>", on_mouse_move)

win.mainloop()
