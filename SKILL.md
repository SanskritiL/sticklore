---
name: stick-animation
description: Turn a topic into a short stick-figure explainer animation. Use whenever someone asks for a stick-figure animation, an animated explainer, a whiteboard-style or doodle video, or wants a concept, process, or idea shown as a short animation instead of explained in text, even if they never say "stick figure". Also use to revise or restyle an animation made earlier with this skill.
---

# Stick-figure explainer animations

You help people turn a topic they want to explain into a short stick-figure animation. The people using this usually know their topic better than they know animation, so you make the visual decisions, show options early, and get approval before doing the slow part.

The result is one self-contained HTML file that plays in any browser: the animated stage, the narration as captions, and play controls. It needs no internet connection and loads nothing from elsewhere.

## The flow

1. Offer four looks and a storyboard, then wait for the person's choice.
2. Build the animation from the approved storyboard in the chosen look.
3. Revise only what they ask for.

Ask at most one question before showing visuals. People would rather react to pictures than answer a questionnaire, so infer audience and length from the request where you can.

## Step 1: Offer four looks and a storyboard

### Find the core and the key frame

Work out the one thing a viewer should understand by the end, and the single moment that captures it best. That moment is the key frame. If the topic is too broad for a 30 to 90 second animation, narrow it and say what you left out.

### Draft the storyboard

Plan four to eight scenes. For each one decide:

- **Idea**: the single point this scene makes
- **Action**: what the figure physically does
- **Props and labels**: what is on screen, with at most six words of text
- **Narration**: one or two sentences, written to be spoken
- **Duration**: in seconds, usually 5 to 9

Open with a question or a small problem in the first few seconds, so the viewer has a reason to keep watching. End on a recap scene that shows the core idea in one image.

Prefer action to text. If a scene could be replaced by a caption, it is not a scene yet: find something the figure can do, hold, or react to that makes the idea visible. For abstract ideas, use a physical metaphor, such as a growing pile, a seesaw, a leaking pipe, or a snowball.

Verify every factual claim before it goes in, looking things up when you have a way to and the claim could be wrong or out of date. Viewers trust an animation more than a paragraph, and an error is harder to spot once it is drawn. If you are unsure of something, flag it to the person instead of animating it.

### Show the key frame in four looks

Write a one-scene storyboard file containing just the key frame (see "Writing the storyboard file" below), then run:

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/render.py looks keyframe.json \
  --styles whiteboard,chalkboard,notebook,poster --out looks.html
```

This draws the same moment in each style, numbered, on one page, so the person compares styles and not scenes. Choose four that suit the topic and are clearly different from each other: vary background, line quality, and color. `references/styles.md` describes all the styles and what each suits. Four similar options waste the choice.

### Present both together

Share `looks.html`, then in the same reply:

- name the four looks with one line each on the mood it sets
- say which one you would pick for this topic and why
- give the storyboard as a short numbered list (idea, action, narration per scene)

Then wait. Building takes longer to redo than a plan does, so this is the cheapest point to change direction. The person can pick by number or name, mix ("the chalkboard one with a blue accent"), and ask for storyboard changes in the same reply.

Skip the looks when the person already named a style, or chose one earlier in the conversation. Still show the storyboard.

## Step 2: Build the animation

Write the full storyboard as JSON with the chosen style, check it, and build:

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/render.py check storyboard.json
python3 ${CLAUDE_SKILL_DIR}/scripts/render.py animate storyboard.json --out animation.html
```

`check` reports errors, which you must fix, and warnings, which point at things that will look wrong: a walk that runs past the end of its scene, a label too long to read, text too small for a phone. Treat warnings as real unless you have a reason not to.

Do not draw figures by hand or write your own animation code. The script's rig keeps proportions identical across scenes, and hand-drawn figures drift from one scene to the next.

The chosen style is locked for the whole animation: every scene uses the same line weight, palette, and lettering, because a look that shifts partway through reads as a mistake. If the person asked for a mix, use `style_overrides` (described in the reference) to adjust the one style instead of switching styles between scenes.

If a scene needs a prop the library lacks, use the closest icon or draw it as a `path` prop, and tell the person what you substituted.

Share `animation.html` the way this environment shares files, so the person can open it. Then say in a sentence or two what you made, and offer specific changes they might want: pacing, a particular scene, or the tone of the narration.

## Step 3: Revise

Change only what the person asked for. Leave approved scenes and the locked style untouched, rebuild, and say which scenes changed, so they do not have to re-check the whole animation. Keep the storyboard file around between turns so a revision is an edit, not a rewrite.

## Writing the storyboard file

A storyboard is a JSON file. A minimal one-scene example:

```json
{
  "title": "How compound interest works",
  "style": "whiteboard",
  "scenes": [
    {
      "duration": 7,
      "title": "Interest earns interest",
      "caption": "Next year you earn 10% on $110, not on $100.",
      "actors": [
        { "id": "sam", "x": 240, "pose": "stand",
          "keys": [ { "at": 2.5, "pose": "point", "expression": "happy", "say": "It grows!" } ] }
      ],
      "props": [
        { "type": "bar", "x": 640, "h": 150, "label": "Start", "value": "$100", "color": "accent2", "appear": 0.5 },
        { "type": "bar", "x": 840, "h": 165, "label": "Year 1", "value": "$110", "appear": 1.6 }
      ]
    }
  ]
}
```

Read `references/storyboard-schema.md` before writing your first storyboard in a conversation. It lists every field, pose, icon, and prop type, and explains timing. `assets/example-storyboard.json` is a complete five-scene animation to borrow from. Running `render.py list` prints the available poses, styles, and icons.

What matters most when composing a scene:

- **The stage is 1280 wide and 720 tall.** The ground line is at y = 590 and a figure stands about 275 tall. A scene `title` uses the top 120. Keep things between x = 100 and x = 1180.
- **Give the figure a side and the subject the rest.** A figure on the left third, facing right, with the props on the right two-thirds, reads clearly. Leave about 150 between a figure and the nearest prop so a pointing arm or a speech bubble has room.
- **Time things to the narration.** Use `appear` so each prop arrives when the caption would mention it, in reading order. Leave the last second of a scene still so the viewer can take it in.
- **Movement takes time.** A figure walks about 240 per second, so crossing half the stage takes almost three seconds. `check` warns when a walk does not fit.
- **Text on the stage is a label.** Titles, labels, and speech bubbles stay under six words; full sentences belong in `caption`, which is shown below the stage at a readable size. Use text size `s` (28) or larger so it survives a phone screen.
- **Use the color roles on purpose.** `ink` is the default. Keep `accent` for the one thing the scene is about and `accent2` for what it is being compared with.

## Tone

Keep narration plain and conversational, as if explaining to a curious friend. Light humor is welcome when it comes from what the figure does; avoid jokes that only work in the narration.
