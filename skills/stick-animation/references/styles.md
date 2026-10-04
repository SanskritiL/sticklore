# Looks

Seven built-in styles. Offer four that suit the topic and differ clearly from each other.

| Style id | Name | Looks like | Suits | Think twice when |
| - | - | - | - | - |
| `whiteboard` | Whiteboard | Black marker on off-white, red and blue accents, slightly wobbly lines | Almost anything; the safe, clear default | The person wants something with more personality |
| `chalkboard` | Chalkboard | Chalky double lines on deep green, yellow and pink accents | School subjects, history, maths, anything with a classroom feel | The animation will be watched in bright light on a phone |
| `notebook` | Notebook doodle | Blue ballpoint on ruled paper, red and green pen accents, thin sketchy lines | Personal finance, study tips, "notes from a friend" explainers | The scene is dense; thin lines carry less weight |
| `blueprint` | Blueprint | Thin precise white lines on a blue grid, yellow and cyan accents, monospace lettering | Technology, engineering, how systems and mechanisms work | The topic is warm or emotional |
| `poster` | Bold poster | Thick clean black lines and solid heads on bright yellow, flat red and blue fills | Short social clips, punchy single-idea explainers | There is a lot of small detail; thick lines crowd quickly |
| `neon` | Night neon | Glowing cyan lines on near-black, magenta and lime accents | Science fiction, space, the internet, anything "future" | The audience is young children, or the topic is serious |
| `kraft` | Crayon on kraft | Chunky wobbly brown crayon on kraft paper, red and blue accents | Younger audiences, nature, playful topics | The topic needs precision |

## Choosing four

Pick for contrast, so the choice is real. A good set usually has:

- one light background and one dark background
- one hand-drawn look (`whiteboard`, `chalkboard`, `notebook`, `kraft`) and one clean look (`blueprint`, `poster`, `neon`)
- the look you would recommend, plus one that takes a risk

Then let the topic steer it:

- **How a system works** (DNS, an engine, a database): `blueprint`, `whiteboard`, `neon`, `notebook`
- **Money, habits, study**: `notebook`, `whiteboard`, `poster`, `chalkboard`
- **School science and history**: `chalkboard`, `whiteboard`, `kraft`, `blueprint`
- **For children**: `kraft`, `chalkboard`, `poster`, `whiteboard`
- **For social media**: `poster`, `neon`, `whiteboard`, `kraft`

When you present them, use each style's name and say in one line what mood it sets. Then say which you would choose and why, in terms of this topic and audience.

## Mixing

If the person likes one look but wants a change ("the chalkboard, but with blue instead of yellow", "whiteboard with thicker lines"), keep that style and adjust it with `style_overrides` in the storyboard. The fields are listed in `storyboard-schema.md`. Do not switch styles between scenes.

## Fonts

Each style names several typefaces in order of preference and uses the first one the viewer's device has, so lettering can differ slightly between devices. Nothing is downloaded.
