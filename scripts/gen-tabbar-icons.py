#!/usr/bin/env python3
"""生成 just4love tabBar 占位图标（6 张 PNG，81x81，透明背景）。

三个 tab 各两种状态（默认灰 / 选中粉）：
  - recommend: 心形
  - message:   对话框气泡
  - mine:      人形

这是临时占位资源，后续替换为正式设计稿时文件名保持不变即可。
"""
import os
from PIL import Image, ImageDraw

SIZE = 81
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "miniprogram", "assets", "tabbar")
OUT_DIR = os.path.normpath(OUT_DIR)

COLOR_DEFAULT = (153, 153, 153, 255)   # #999999 灰
COLOR_SELECTED = (255, 90, 95, 255)    # #FF5A5F 主题粉


def new_canvas():
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def draw_heart(draw, color):
    # 用两个圆 + 一个三角拼成心形
    r = 16
    cx1, cy1 = 28, 32
    cx2, cy2 = 53, 32
    draw.ellipse((cx1 - r, cy1 - r, cx1 + r, cy1 + r), fill=color)
    draw.ellipse((cx2 - r, cy2 - r, cx2 + r, cy2 + r), fill=color)
    draw.polygon([(15, 36), (66, 36), (40, 66)], fill=color)


def draw_bubble(draw, color):
    # 圆角对话框 + 小尾巴
    draw.rounded_rectangle((12, 16, 69, 52), radius=12, fill=color)
    draw.polygon([(26, 50), (26, 66), (42, 50)], fill=color)
    # 三个点
    dot = (255, 255, 255, 255)
    for cx in (28, 40, 52):
        draw.ellipse((cx - 3, 30, cx + 3, 36), fill=dot)


def draw_person(draw, color):
    # 头 + 肩
    r = 13
    cx, cy = 40, 27
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=color)
    draw.pieslice((15, 40, 65, 95), start=180, end=360, fill=color)


SHAPES = {
    "recommend": draw_heart,
    "message": draw_bubble,
    "mine": draw_person,
}


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, fn in SHAPES.items():
        for suffix, color in (("", COLOR_DEFAULT), ("-active", COLOR_SELECTED)):
            img, draw = new_canvas()
            fn(draw, color)
            out = os.path.join(OUT_DIR, f"{name}{suffix}.png")
            img.save(out, "PNG")
            print(f"  wrote {os.path.relpath(out)} ({os.path.getsize(out)} bytes)")


if __name__ == "__main__":
    main()
