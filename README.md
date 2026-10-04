# Sticklore

Turn any topic into a short stick-figure explainer animation, from a conversation with Claude.

Ask Claude to explain something as an animation, such as how compound interest works, why the sky is blue, or how DNS finds a website. Claude plans the scenes, shows you the key moment drawn in four different looks, and builds the finished animation once you have picked one.

## Use it

Ask for an animation in your own words:

- "Make a stick-figure animation that explains photosynthesis to a ten-year-old."
- "I need a 45-second animated explainer on how vaccines train the immune system."
- "Show how a hash table works as a whiteboard animation."

Claude then works in three steps:

1. **Look and storyboard.** You get one page showing the same key frame in four styles, numbered, alongside a short scene-by-scene storyboard. Reply with the look you like and any changes to the plan.
2. **Animation.** Claude builds the animation in that look and gives you a single HTML file.
3. **Revisions.** Ask for changes to a scene, the pacing, or the wording. Only the scenes you mention change.

The animation file plays in any modern browser, on a computer or a phone. It has play and pause, a scrubber with scene markers, captions you can turn off, and the full script underneath.

## What is in the box

- Seven looks: whiteboard, chalkboard, notebook doodle, blueprint, bold poster, night neon, and crayon on kraft paper. Each can be adjusted ("the chalkboard, but with a blue accent").
- One consistent stick figure with 19 poses and five facial expressions. It walks by itself when it moves, can carry and push things, and can talk in speech bubbles.
- Props: boxes, circles, arrows, lines, labels, growing chart bars, counting numbers, and 32 hand-drawn icons, plus custom shapes.
- A checker that catches problems before anything is built, such as a walk that does not fit in its scene or a label too small to read on a phone.

## Requirements

Python 3.8 or newer, which Claude runs for you. There is nothing to install: the plugin uses only the Python standard library.

## What it runs, and what data it sends

The plugin sends no data anywhere.

- It runs one script, `skills/stick-animation/scripts/render.py`, on the machine or sandbox where Claude is working. The script reads the storyboard file Claude wrote and the plugin's own files, and writes the one HTML file it is asked to create. It does not use the network, install packages, or read anything else.
- The HTML files it produces are self-contained. They load no scripts, fonts, images, or data from the internet, set no cookies, store nothing in the browser, and make no network requests. Lettering uses fonts already on the viewer's device.
- The plugin has no connector, no hooks, and no background process.

## Files

```
.claude-plugin/plugin.json                  manifest
skills/stick-animation/SKILL.md             instructions Claude follows
skills/stick-animation/references/          storyboard format and style guide
skills/stick-animation/scripts/render.py    checker and builder
skills/stick-animation/assets/library.json  poses, styles, icons
skills/stick-animation/assets/runtime.js    the drawing code embedded in each animation
skills/stick-animation/assets/*.html        page templates
skills/stick-animation/assets/example-storyboard.json   a complete worked example
```

To add a pose, a style, or an icon, edit `library.json`. The checker and the drawing code both read it, so nothing else needs to change.

## License

MIT. See `LICENSE`.
