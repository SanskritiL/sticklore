#!/usr/bin/env python3
"""Sticklore renderer.

Checks a storyboard and builds self-contained HTML from it:

    render.py list                                  show poses, styles, icons
    render.py check  storyboard.json                validate only
    render.py looks  storyboard.json --out looks.html --styles a,b,c,d
    render.py animate storyboard.json --out animation.html

Uses only the Python standard library. Reads the storyboard and the files in
../assets, writes the one output file you name, and never uses the network.
"""

import argparse
import html
import json
import re
import sys
from pathlib import Path

ASSETS = Path(__file__).resolve().parent.parent / "assets"

COLOR_ROLES = {"ink", "accent", "accent2", "muted"}
FACES = {"left", "right"}
TEXT_SIZES = {"s", "m", "l", "xl"}
ENTERS = {"pop", "fade", "draw", "grow", "type", "none"}
PATH_DATA = re.compile(r"^[MmLlHhVvCcSsQqTtAaZz0-9eE\s,.\-+]+$")

# For each prop type: fields that must be present, and fields that may be.
COMMON = {"type", "id", "appear", "disappear", "enter", "color", "keys", "front", "float", "scale"}
PROPS = {
    "box":     ({"x"}, {"y", "w", "h", "label", "fill", "held_by"}),
    "circle":  ({"x"}, {"y", "r", "label", "fill", "held_by"}),
    "icon":    ({"x", "name"}, {"y", "size", "label", "spin", "held_by"}),
    "path":    ({"x", "d"}, {"y", "size", "label", "fill", "held_by"}),
    "text":    ({"x", "y", "text"}, {"size", "align"}),
    "counter": ({"x", "y", "to"}, {"from", "start", "dur", "prefix", "suffix", "decimals", "size"}),
    "line":    ({"x", "y", "x2", "y2"}, {"bend", "dashed", "label"}),
    "arrow":   ({"x", "y", "x2", "y2"}, {"bend", "dashed", "label"}),
    "bar":     ({"x", "h"}, {"y", "w", "label", "value", "fill"}),
}
ACTOR_FIELDS = {"id", "x", "y", "pose", "face", "expression", "say", "label", "color", "scale", "keys"}
ACTOR_KEY_FIELDS = {"at", "x", "pose", "face", "expression", "say", "dur", "walk_as"}
PROP_KEY_FIELDS = {"at", "x", "y", "h", "scale", "value", "dur"}
SCENE_FIELDS = {"id", "duration", "title", "caption", "actors", "props", "ground", "ground_y"}
TOP_FIELDS = {"title", "style", "style_overrides", "scenes"}

# What a storyboard may change about its chosen style, for "this look, but..." requests.
HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
OVERRIDES = {
    "bg": HEX, "ink": HEX, "accent": HEX, "accent2": HEX, "muted": HEX,
    "pattern": {"none", "ruled", "grid", "dots"},
    "headFill": {"bg", "ink"},
    "fill": {"hachure", "solid"},
    "stroke": (1.5, 12), "wobble": (0, 4), "passes": (1, 2), "fillOpacity": (0.1, 1),
    "boil": bool, "glow": bool,
}


def load_library():
    with open(ASSETS / "library.json", encoding="utf-8") as fh:
        return json.load(fh)


def is_num(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def words(text):
    return len(str(text).split())


class Report:
    def __init__(self):
        self.errors = []
        self.warnings = []

    def error(self, where, message):
        self.errors.append(f"{where}: {message}")

    def warn(self, where, message):
        self.warnings.append(f"{where}: {message}")

    def unknown(self, where, obj, allowed):
        for name in obj:
            if name not in allowed:
                self.warn(where, f'unknown field "{name}" is ignored (allowed: {", ".join(sorted(allowed))})')

    def number(self, where, obj, name, required=False, low=None, high=None):
        if name not in obj:
            if required:
                self.error(where, f'"{name}" is required')
            return False
        value = obj[name]
        if not is_num(value):
            self.error(where, f'"{name}" must be a number, got {value!r}')
            return False
        if low is not None and value < low:
            self.error(where, f'"{name}" must be at least {low}, got {value}')
            return False
        if high is not None and value > high:
            self.error(where, f'"{name}" must be at most {high}, got {value}')
            return False
        return True

    def choice(self, where, obj, name, options, what):
        if name in obj and obj[name] not in options:
            self.error(where, f'"{name}": {obj[name]!r} is not a known {what}. Use one of: {", ".join(sorted(options))}')

    def print(self, stream=sys.stderr):
        for line in self.errors:
            print(f"ERROR   {line}", file=stream)
        for line in self.warnings:
            print(f"warning {line}", file=stream)


def check_keys(rep, where, keys, duration, allowed):
    """Shared checks for the timed instructions on actors and props."""
    if not isinstance(keys, list):
        rep.error(where, '"keys" must be a list')
        return []
    previous = 0
    good = []
    for i, key in enumerate(keys):
        kw = f"{where} key {i + 1}"
        if not isinstance(key, dict):
            rep.error(kw, "must be an object")
            continue
        rep.unknown(kw, key, allowed)
        if not rep.number(kw, key, "at", required=True, low=0):
            continue
        if key["at"] < previous:
            rep.error(kw, f'keys must be in time order ("at" {key["at"]} comes after {previous})')
        if key["at"] >= duration:
            rep.error(kw, f'"at" {key["at"]} is not inside the scene, which lasts {duration}s')
        previous = key["at"]
        rep.number(kw, key, "dur", low=0)
        good.append(key)
    return good


def check_actor(rep, where, actor, duration, lib, stage):
    rep.unknown(where, actor, ACTOR_FIELDS)
    rep.number(where, actor, "x", required=True)
    rep.number(where, actor, "y")
    rep.number(where, actor, "scale", low=0.4, high=2)
    poses = set(lib["poses"])
    rep.choice(where, actor, "pose", poses, "pose")
    rep.choice(where, actor, "face", FACES, "direction")
    rep.choice(where, actor, "expression", set(lib["expressions"]), "expression")
    rep.choice(where, actor, "color", COLOR_ROLES, "color role")
    if is_num(actor.get("x")) and not 40 <= actor["x"] <= stage["width"] - 40:
        rep.warn(where, f'x {actor["x"]} puts the figure at or beyond the edge of the {stage["width"]}px stage')

    speed = lib["dims"]["walkSpeed"] * (actor.get("scale", 1) if is_num(actor.get("scale")) else 1)
    x = actor.get("x", 0) if is_num(actor.get("x")) else 0
    busy_until = 0
    for i, key in enumerate(check_keys(rep, where, actor.get("keys", []), duration, ACTOR_KEY_FIELDS)):
        kw = f"{where} key {i + 1}"
        rep.choice(kw, key, "pose", poses, "pose")
        rep.choice(kw, key, "walk_as", poses, "pose")
        rep.choice(kw, key, "face", FACES, "direction")
        rep.choice(kw, key, "expression", set(lib["expressions"]), "expression")
        rep.number(kw, key, "x")
        if key["at"] < busy_until - 0.05:
            rep.warn(kw, f'starts at {key["at"]}s but the previous walk only finishes at {busy_until:.1f}s, so the figure will jump')
        if is_num(key.get("x")) and key["x"] != x:
            took = key["dur"] if is_num(key.get("dur")) else max(0.3, abs(key["x"] - x) / speed)
            busy_until = key["at"] + took
            if busy_until > duration + 0.05:
                rep.warn(kw, f"the walk needs until {busy_until:.1f}s but the scene ends at {duration}s. Lengthen the scene, shorten the walk, or set dur")
            x = key["x"]
        check_speech(rep, kw, key.get("say"))
    check_speech(rep, where, actor.get("say"))


def check_speech(rep, where, say):
    if say and len(str(say)) > 40:
        rep.warn(where, f'speech bubble "{say}" is long. Bubbles read best at four words or fewer; put the rest in the caption')


def check_prop(rep, where, prop, duration, lib, actor_ids):
    kind = prop.get("type")
    if kind not in PROPS:
        rep.error(where, f'"type": {kind!r} is not a known prop. Use one of: {", ".join(sorted(PROPS))}')
        return
    required, optional = PROPS[kind]
    rep.unknown(where, prop, COMMON | required | optional)
    for name in required:
        if name not in prop:
            rep.error(where, f'{kind} props need "{name}"')
    for name in ("x", "y", "x2", "y2", "w", "h", "r", "size", "bend", "float", "spin", "scale",
                 "from", "to", "start", "dur", "decimals"):
        if name == "size" and prop.get("size") in TEXT_SIZES and kind in ("text", "counter"):
            continue
        rep.number(where, prop, name)
    rep.choice(where, prop, "color", COLOR_ROLES, "color role")
    rep.choice(where, prop, "enter", ENTERS, "entrance")
    if "fill" in prop and not isinstance(prop["fill"], bool):
        rep.choice(where, prop, "fill", COLOR_ROLES, "color role (or true/false)")
    if kind == "icon" and "name" in prop and prop["name"] not in lib["icons"]:
        rep.error(where, f'icon {prop["name"]!r} is not in the library. Use one of: {", ".join(sorted(lib["icons"]))}; '
                         'or draw it as a "path" prop')
    if kind == "path" and "d" in prop and not PATH_DATA.match(str(prop["d"])):
        rep.error(where, '"d" may only contain SVG path commands and numbers')
    if "held_by" in prop and prop["held_by"] not in actor_ids:
        rep.error(where, f'"held_by": no actor with id {prop["held_by"]!r} in this scene')

    if rep.number(where, prop, "appear", low=0) and prop["appear"] >= duration:
        rep.error(where, f'"appear" {prop["appear"]} is not inside the scene, which lasts {duration}s')
    if is_num(prop.get("disappear")) and prop["disappear"] <= prop.get("appear", 0):
        rep.error(where, '"disappear" must come after "appear"')

    for name in ("text", "label"):
        if name in prop and words(prop[name]) > 6:
            rep.warn(where, f'{name} "{prop[name]}" has more than 6 words. On-screen text should be a label, not a sentence')
    if kind in ("text", "counter") and is_num(prop.get("size")) and prop["size"] < 24:
        rep.warn(where, f'size {prop["size"]} will be hard to read on a phone. Use 28 or more')

    for i, key in enumerate(check_keys(rep, where, prop.get("keys", []), duration, PROP_KEY_FIELDS)):
        for name in ("x", "y", "h", "scale"):
            rep.number(f"{where} key {i + 1}", key, name)


def check_overrides(rep, overrides):
    where = "style_overrides"
    if overrides is None:
        return
    if not isinstance(overrides, dict):
        rep.error(where, "must be an object")
        return
    for name, value in overrides.items():
        rule = OVERRIDES.get(name)
        if rule is None:
            rep.error(where, f'"{name}" cannot be overridden. Allowed: {", ".join(sorted(OVERRIDES))}')
        elif rule is HEX:
            if not isinstance(value, str) or not HEX.match(value):
                rep.error(where, f'"{name}" must be a hex color like "#ffd35c", got {value!r}')
        elif rule is bool:
            if not isinstance(value, bool):
                rep.error(where, f'"{name}" must be true or false')
        elif isinstance(rule, set):
            if value not in rule:
                rep.error(where, f'"{name}" must be one of: {", ".join(sorted(rule))}')
        elif not is_num(value) or not rule[0] <= value <= rule[1]:
            rep.error(where, f'"{name}" must be a number from {rule[0]} to {rule[1]}, got {value!r}')


def validate(sb, lib):
    rep = Report()
    stage = lib["stage"]
    if not isinstance(sb, dict):
        rep.error("storyboard", "must be a JSON object")
        return rep
    rep.unknown("storyboard", sb, TOP_FIELDS)
    if not sb.get("title"):
        rep.warn("storyboard", 'no "title"')
    if sb.get("style") not in lib["styles"]:
        rep.error("storyboard", f'"style": {sb.get("style")!r} is not a known style. Use one of: {", ".join(sorted(lib["styles"]))}')
    check_overrides(rep, sb.get("style_overrides"))
    scenes = sb.get("scenes")
    if not isinstance(scenes, list) or not scenes:
        rep.error("storyboard", '"scenes" must be a non-empty list')
        return rep

    total = 0
    for n, scene in enumerate(scenes, start=1):
        where = f"scene {n}"
        if not isinstance(scene, dict):
            rep.error(where, "must be an object")
            continue
        if scene.get("id"):
            where = f'scene {n} ({scene["id"]})'
        rep.unknown(where, scene, SCENE_FIELDS)
        if not rep.number(where, scene, "duration", required=True, low=0.5):
            continue
        duration = scene["duration"]
        total += duration
        if duration > 15:
            rep.warn(where, f"{duration}s is long for one idea. Consider splitting it")
        if not scene.get("caption"):
            rep.warn(where, "no caption, so viewers get no narration here")
        elif len(scene["caption"]) > 170:
            rep.warn(where, f'caption is {len(scene["caption"])} characters. Keep it to one or two short sentences')
        elif len(scene["caption"]) / 17 > duration:
            rep.warn(where, f"caption takes about {len(scene['caption']) / 17:.0f}s to read but the scene lasts {duration}s")
        if scene.get("title") and words(scene["title"]) > 6:
            rep.warn(where, f'title "{scene["title"]}" has more than 6 words')
        rep.number(where, scene, "ground_y", low=100, high=stage["height"])

        actors = scene.get("actors", [])
        props = scene.get("props", [])
        if not isinstance(actors, list) or not isinstance(props, list):
            rep.error(where, '"actors" and "props" must be lists')
            continue
        if not actors and not props:
            rep.warn(where, "nothing on screen. A scene with only a caption is a slide, not a scene")
        actor_ids = {a.get("id") for a in actors if isinstance(a, dict)}
        for i, actor in enumerate(actors, start=1):
            if isinstance(actor, dict):
                check_actor(rep, f"{where} actor {i}", actor, duration, lib, stage)
            else:
                rep.error(f"{where} actor {i}", "must be an object")
        for i, prop in enumerate(props, start=1):
            if isinstance(prop, dict):
                check_prop(rep, f"{where} prop {i}", prop, duration, lib, actor_ids)
            else:
                rep.error(f"{where} prop {i}", "must be an object")

    if len(scenes) > 10:
        rep.warn("storyboard", f"{len(scenes)} scenes is a lot. Four to eight keeps one idea in focus")
    if total > 120:
        rep.warn("storyboard", f"runs {total:.0f}s. Most explainers land best at 30 to 90 seconds")
    return rep


def read_storyboard(path):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except FileNotFoundError:
        sys.exit(f"ERROR   {path}: file not found")
    except json.JSONDecodeError as exc:
        sys.exit(f"ERROR   {path}: not valid JSON ({exc})")


def checked(path, lib, style=None):
    sb = read_storyboard(path)
    if style and isinstance(sb, dict):
        sb["style"] = style
    rep = validate(sb, lib)
    rep.print()
    if rep.errors:
        sys.exit(f"\n{len(rep.errors)} error(s). Fix them and run again.")
    return sb


def embed(data):
    # Safe to place inside a <script type="application/json"> block.
    return json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")


def build(template, sb, lib, extra=None):
    if sb.get("style_overrides"):
        # Fold the tweaks into this page's copy of the style; the library file is untouched.
        lib = json.loads(json.dumps(lib))
        lib["styles"][sb["style"]].update(sb["style_overrides"])
    page = (ASSETS / template).read_text(encoding="utf-8")
    runtime = (ASSETS / "runtime.js").read_text(encoding="utf-8")
    parts = {
        "__TITLE__": html.escape(str(sb.get("title", "Animation"))),
        "__STORYBOARD__": embed(sb),
        "__LIBRARY__": embed(lib),
        "__LOOKS__": embed(extra or {}),
        "__RUNTIME__": runtime,
    }
    # Split on the placeholders so that text inside the data is never re-scanned.
    pattern = re.compile("|".join(re.escape(k) for k in parts))
    return pattern.sub(lambda m: parts[m.group(0)], page)


def write(out, text):
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text, encoding="utf-8")
    print(f"wrote {out} ({len(text.encode('utf-8')) // 1024} KB)")


def cmd_list(_args, lib):
    print("POSES\n  " + ", ".join(lib["poses"]))
    print("EXPRESSIONS\n  " + ", ".join(lib["expressions"]))
    print("STYLES")
    for key, style in lib["styles"].items():
        print(f"  {key:<11} {style['name']}: {style['mood']}")
    print("ICONS\n  " + ", ".join(lib["icons"]))
    print("PROP TYPES\n  " + ", ".join(PROPS))
    print("COLOR ROLES\n  " + ", ".join(sorted(COLOR_ROLES)))
    stage = lib["stage"]
    print(f"STAGE\n  {stage['width']} x {stage['height']}, ground line at y={stage['ground']}")


def cmd_check(args, lib):
    sb = checked(args.storyboard, lib)
    seconds = sum(s["duration"] for s in sb["scenes"])
    print(f"ok: {len(sb['scenes'])} scenes, {seconds:.0f}s, style {sb['style']}")


def cmd_looks(args, lib):
    sb = checked(args.storyboard, lib)
    styles = [s.strip() for s in args.styles.split(",") if s.strip()]
    for name in styles:
        if name not in lib["styles"]:
            sys.exit(f'ERROR   style {name!r} is not known. Use: {", ".join(lib["styles"])}')
    if not 2 <= len(styles) <= 6:
        sys.exit("ERROR   give between 2 and 6 styles (four is the usual number)")
    index = args.scene - 1
    if not 0 <= index < len(sb["scenes"]):
        sys.exit(f"ERROR   --scene must be between 1 and {len(sb['scenes'])}")
    duration = sb["scenes"][index]["duration"]
    at = duration - 0.05 if args.at is None else min(max(args.at, 0), duration)
    write(args.out, build("looks.html", sb, lib, {"styles": styles, "scene": index, "at": at}))


def cmd_animate(args, lib):
    sb = checked(args.storyboard, lib, style=args.style)
    write(args.out, build("player.html", sb, lib))


def main():
    parser = argparse.ArgumentParser(description="Check a storyboard and build a stick-figure animation from it.")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("list", help="show the poses, styles, icons and prop types")

    p = sub.add_parser("check", help="validate a storyboard without building anything")
    p.add_argument("storyboard")

    p = sub.add_parser("looks", help="draw one frame in several styles so the user can pick")
    p.add_argument("storyboard")
    p.add_argument("--styles", default="whiteboard,chalkboard,notebook,poster", help="comma-separated style names")
    p.add_argument("--scene", type=int, default=1, help="which scene to show, counting from 1")
    p.add_argument("--at", type=float, default=None, help="seconds into that scene (default: its last moment)")
    p.add_argument("--out", default="looks.html")

    p = sub.add_parser("animate", help="build the finished animation")
    p.add_argument("storyboard")
    p.add_argument("--style", default=None, help="override the storyboard's style")
    p.add_argument("--out", default="animation.html")

    args = parser.parse_args()
    lib = load_library()
    {"list": cmd_list, "check": cmd_check, "looks": cmd_looks, "animate": cmd_animate}[args.command](args, lib)


if __name__ == "__main__":
    main()
