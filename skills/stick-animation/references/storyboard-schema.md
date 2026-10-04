# Storyboard reference

A storyboard is one JSON file. `render.py check` validates it and explains anything wrong.

Contents: [Top level](#top-level) · [Scenes](#scenes) · [Actors](#actors) · [Poses](#poses) · [Actor keys](#actor-keys) · [Props](#props) · [Prop types](#prop-types) · [Icons](#icons) · [Entrances and motion](#entrances-and-motion) · [Style tweaks](#style-tweaks) · [Recipes](#recipes)

## Top level

| Field | Required | Meaning |
| - | - | - |
| `title` | recommended | Shown above the player and used as the page title |
| `style` | yes | One of `whiteboard`, `chalkboard`, `notebook`, `blueprint`, `poster`, `neon`, `kraft`. See `styles.md` |
| `style_overrides` | no | Small changes to the chosen style. See [Style tweaks](#style-tweaks) |
| `scenes` | yes | List of scenes, played in order |

## Scenes

Each scene is self-contained: it lists everything on screen. Nothing carries over from the previous scene, so repeat an actor (same `id`, same position) if they should appear to stay put across a cut.

| Field | Required | Meaning |
| - | - | - |
| `duration` | yes | Seconds. Usually 5 to 9 |
| `caption` | recommended | The narration: one or two sentences, shown under the stage for the whole scene |
| `title` | no | Up to six words, drawn at the top of the stage with an accent underline |
| `actors` | no | List of stick figures |
| `props` | no | List of objects, drawn in list order (later ones on top) |
| `ground` | no | `false` hides the ground line. Default `true` |
| `ground_y` | no | Moves the ground line. Default 590 |
| `id` | no | A name for the scene, used in error messages |

The stage is 1280 by 720. x runs left to right, y runs top to bottom, so y = 0 is the top edge.

## Actors

| Field | Required | Meaning |
| - | - | - |
| `x` | yes | Where the figure stands (the centre of its hips) |
| `id` | no | A name. Needed if a prop is `held_by` this actor |
| `pose` | no | Starting pose. Default `stand` |
| `face` | no | `right` or `left`. Default `right` |
| `expression` | no | `neutral`, `happy`, `sad`, `surprised`, `thinking`, or `none` for a blank face |
| `say` | no | Speech bubble shown from the start until the first key. Four words or fewer |
| `label` | no | A name tag under the figure, such as "You" or "Server" |
| `color` | no | `ink` (default), `accent`, `accent2`, or `muted`. Use to tell two figures apart |
| `scale` | no | Size, 0.4 to 2. Default 1. Use about 0.7 for a child or a background figure |
| `y` | no | The height the feet rest at. Default is the ground. Use to stand on a platform |
| `keys` | no | Timed instructions. See [Actor keys](#actor-keys) |

A figure is about 275 tall and, with arms out, about 200 wide at scale 1.

## Poses

| Pose | What it looks like | Good for |
| - | - | - |
| `stand` | Arms relaxed at the sides | Neutral, listening |
| `explain` | One forearm raised and gesturing | Talking, narrating |
| `point` | Arm straight out in the facing direction | Directing attention to a prop |
| `point_up` | Arm raised diagonally, head tilted back | Pointing at something high, "aha" |
| `wave` | Raised arm waving | Greeting, goodbye |
| `shrug` | Both forearms out, head tilted | "Who knows?", posing the question |
| `think` | Hand to chin | Wondering, considering |
| `confident` | Hands on hips | Certainty, a conclusion |
| `carry` | Both arms forward at waist height | Holding a prop (`held_by`) |
| `hold_up` | Both arms raised in a Y | Lifting a prop overhead, showing it off |
| `push` | Leaning lunge, arms forward | Pushing a heavy prop |
| `write` | Arm forward, moving slightly | Writing on a board to the side |
| `sit` | Seated, shins vertical | Needs a seat: a `box` about 62 high centred on the same x |
| `jump` | In the air, arms up, legs tucked | A leap. Follow it with `stand` half a second later for a hop |
| `cheer` | Arms in a V, bouncing | Celebration |
| `dance` | Arms swinging, bouncing | Joy, a silly beat |
| `surprised` | Leaning back, arms flung out | A reveal, a shock |
| `sad` | Slumped, head down | A problem, a loss |
| `walk` | Walking on the spot | Rarely needed: figures walk by themselves when `x` changes |

Poses and expressions are separate. Pair them: `think` with `thinking`, `cheer` with `happy`, `surprised` with `surprised`.

## Actor keys

A key is an instruction given at a moment in the scene. Any field left out stays as it was.

```json
"keys": [
  { "at": 1.0, "x": 700, "pose": "point" },
  { "at": 4.5, "pose": "cheer", "expression": "happy", "say": "Yes!" }
]
```

| Field | Meaning |
| - | - |
| `at` | Seconds into the scene when the instruction starts. Keys must be in time order |
| `x` | Walk to this position. The figure turns to face where it is going and walks there |
| `pose` | Pose to take. If `x` also changes, the pose is taken on arrival |
| `face` | Which way to face afterwards. After a walk the default is the direction walked |
| `expression` | New expression |
| `say` | Speech bubble shown from this key until the next key. Leave it out to clear the bubble |
| `dur` | Seconds the walk should take, to override the normal walking speed |
| `walk_as` | A pose for the arms and torso while the legs walk, such as `carry` or `push` |

Timing rules:

- Walking speed is about 240 per second. A walk from x = 200 to x = 700 takes about 2.1 seconds, so the next key should be at least that much later.
- A change of pose takes about a third of a second.
- A speech bubble needs roughly two seconds on screen to be read.
- `check` warns if a key starts before the previous walk has finished, or if a walk runs past the end of the scene.

## Props

Fields every prop accepts:

| Field | Meaning |
| - | - |
| `type` | Required. One of the types below |
| `x`, `y` | Position. See each type for what the point refers to |
| `appear` | Seconds into the scene when the prop arrives. Default 0 |
| `disappear` | Seconds into the scene when it fades out |
| `enter` | How it arrives: `pop`, `fade`, `draw`, `grow`, `type`, or `none`. Each type has a sensible default |
| `color` | `ink`, `accent`, `accent2`, or `muted` |
| `scale` | Size multiplier. Default 1 |
| `float` | Gentle up-and-down drift, in pixels. Good for clouds and floating ideas |
| `front` | `true` draws the prop in front of the figures |
| `keys` | Timed changes. See [Entrances and motion](#entrances-and-motion) |

## Prop types

**`box`** – a rectangle. `x`, `y` are its centre. Leave `y` out and it rests on the ground.
Fields: `w` (default 120), `h` (default 80), `label`, `fill` (`true` or a color role), `held_by`.

**`circle`** – `x`, `y` are its centre. Leave `y` out and it rests on the ground.
Fields: `r` (default 40), `label`, `fill`, `held_by`.

**`icon`** – a drawing from the icon library. `x`, `y` are its centre. Leave `y` out and it rests on the ground.
Fields: `name` (required), `size` (default 90), `label` (drawn underneath), `spin` (degrees per second), `held_by`. Default color is `accent`.

**`bar`** – a chart bar that grows upward. `x` is its centre and `y` its base (default: the ground).
Fields: `h` (required, height in pixels), `w` (default 80), `label` (under the bar), `value` (text above the bar), `fill` (`false` for outline only). Default color is `accent`. Choose one pixels-per-unit scale for all bars in a scene so their heights compare honestly.

**`text`** – words on the stage. `x`, `y` are the centre of the text.
Fields: `text` (required; `\n` starts a new line), `size` (`s` 28, `m` 40, `l` 56, `xl` 80, or a number), `align` (`left`, `right`; default centred). Use `"enter": "type"` for a typewriter effect.

**`counter`** – a number that counts from one value to another. `x`, `y` are its centre.
Fields: `to` (required), `from` (default 0), `dur` (seconds, default 1.5), `start` (when counting begins; default is `appear`), `prefix`, `suffix`, `decimals`, `size`.

**`arrow`** and **`line`** – from `x`, `y` to `x2`, `y2`, all required. They draw themselves from start to end.
Fields: `bend` (pixels of curve; negative curves the other way, and for a left-to-right arrow a negative bend arcs upward), `dashed`, `label` (drawn beside the middle).

**`path`** – your own drawing, for anything the icon library lacks. `x`, `y` are its centre. Leave `y` out and it rests on the ground.
Fields: `d` (required, SVG path data drawn inside a 0 to 100 box), `size` (default 90), `fill`, `label`, `held_by`. Keep it simple: a few lines and curves read better than detail.

`held_by` takes an actor's `id` and makes the prop follow that actor's hands. Pair it with the `carry` or `hold_up` pose, and with `"walk_as": "carry"` if the actor walks.

## Icons

`sun`, `cloud`, `bulb`, `coin`, `star`, `heart`, `tree`, `house`, `drop`, `bolt`, `leaf`, `sprout`, `fire`, `flag`, `gear`, `check`, `cross`, `question`, `exclaim`, `warning`, `book`, `clock`, `computer`, `server`, `phone`, `envelope`, `globe`, `magnifier`, `mountain`, `lock`, `key`, `battery`

Icons stand in well for bigger ideas: `bulb` for an idea, `gear` for a process, `bolt` for energy, `drop` for water, `envelope` for a message, `lock` for security, `globe` for the internet or the world.

## Entrances and motion

Default entrances: `box`, `circle`, `icon`, and `path` use `pop`; `text` and `counter` use `fade`; `arrow` and `line` use `draw`; `bar` uses `grow`.

Prop keys move or change a prop over time. Each one starts at `at` and takes `dur` seconds (default 0.6):

```json
{ "type": "circle", "x": 400, "r": 36, "fill": true,
  "keys": [ { "at": 1.0, "x": 950, "scale": 2.6, "dur": 4 } ] }
```

| Key field | Meaning |
| - | - |
| `at` | Required. When the change starts |
| `dur` | How long it takes |
| `x`, `y` | Move to this position |
| `scale` | Grow or shrink to this size |
| `h` | For a `bar`: change its height |
| `value` | For a `bar`: change the text above it |

## Style tweaks

When the person wants a look "but with" a change, keep the one style and adjust it:

```json
"style": "chalkboard",
"style_overrides": { "accent": "#7fe7ff", "stroke": 6 }
```

| Field | Values |
| - | - |
| `bg`, `ink`, `accent`, `accent2`, `muted` | Hex colors such as `#ffd35c` |
| `stroke` | Line thickness, 1.5 to 12 |
| `wobble` | How hand-drawn the lines are, 0 (ruler-straight) to 4 |
| `passes` | 1, or 2 for a sketchy double line |
| `boil` | `true` makes the lines shimmer as if redrawn each frame |
| `pattern` | `none`, `ruled`, `grid`, or `dots` |
| `headFill` | `bg` for an outlined head, `ink` for a solid one |
| `fill` | `hachure` for hand-shaded fills, `solid` for flat color |
| `glow` | `true` for glowing lines. Only suits dark backgrounds |

Check that `ink` still stands out clearly against `bg` after any color change.

## Recipes

**Carry something across the stage and set it down**

```json
"actors": [ { "id": "ana", "x": 200, "pose": "carry",
  "keys": [ { "at": 0.8, "x": 760, "walk_as": "carry", "pose": "carry" },
            { "at": 4.0, "pose": "confident", "expression": "happy" } ] } ],
"props": [ { "type": "box", "x": 0, "w": 70, "h": 60, "label": "data", "held_by": "ana", "disappear": 3.9 },
           { "type": "box", "x": 850, "w": 70, "h": 60, "label": "data", "appear": 3.9, "enter": "none" } ]
```

The held box disappears as an identical one appears on the ground, which reads as setting it down.

**Two figures talking**

```json
"actors": [
  { "id": "a", "x": 420, "label": "You", "pose": "explain",
    "keys": [ { "at": 0.5, "say": "Where is it?" }, { "at": 3.0, "pose": "stand" } ] },
  { "id": "b", "x": 860, "face": "left", "label": "Server", "color": "accent2",
    "keys": [ { "at": 3.0, "pose": "point", "say": "Over there!" } ] }
]
```

Give each figure a `label` and a different `color` so the viewer can tell them apart, and let only one speak at a time.

**A process with three steps**

Place three boxes at x = 340, 640, 940 with `appear` at 0.5, 2.5, 4.5, and arrows between them that appear half a second after each box. Have the figure `point` at each as it arrives.

**A comparison**

Two `bar` props side by side, the baseline in `accent2` appearing first and the subject in `accent` appearing second, then a dashed `line` across at the height of the shorter one to make the gap visible.
