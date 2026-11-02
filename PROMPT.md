# The prompt

This is the first prompt, word for word. I dictated it, so the typos stayed in ("3GS" is Three.js, "AI slab" is AI slop). It went into Google Antigravity with Gemini 4 Argon set to High.

Notice what it doesn't say: no topic. I never asked for a car.

```text
I want you to create 5 creative landing pages. Get inspired from what we built together from all the project. So one landing page in each separate own chat session. So 5 chat sessions. Try to be creative and think outside the box. Don't be generic. No AI slop. Don't use always the same colors and font. Make sure it looks like awards winnings website. You include 3GS or 3D model, and for the 5 landing page, make sure that each idea explore a new concept. So 5 creative ideas. Maybe one can be about an exploding object where we focus on the real product with respect spec that you can reveal and showcase it like in a website. A second one can be more futuristic. Third one can be more artistic. Fourth one can be dreamy. And fourth one can be scrolling, cinematic scrolling, 3D inspired. I want you to think like a world-class designer and coders. for your first iteration at the one AI slab, and this is non-negotiable. No serif font, as default. Don't make it boring. I want to open it tomorrow morning and say, wow, this is awesome. So take the time that you need to build that. And make sure everything each concept feels realistic and not too abstract or conceptual. And this is a hard task. I'm giving you usually I ask you for an iteration and I let you go, and usually you reach a 5 on the first try. But now I push it harder, so you need to work harder, do some research, think what is trending, what is creative, think outside the box, so each iteration must reach a minimum of 8.5. so that is the minimum required. So get to work.

use /boost
```

`/boost` is a command from my Antigravity setup. If your tool doesn't have it, leave that line out.

## What to change for your own run

- **"Get inspired from what we built together"** only works if the agent can read your past projects. That line is how it found the car model on my Mac. Without past work, name a folder of 3D models or ask it to find CC-licensed ones.
- **The five directions** are the part worth rewriting. Exploded product, futuristic, artistic, dreamy, cinematic scroll. Use your own, and keep the topics open.
- **The bans** are what I care about most: no AI slop, no serif as default, no repeated colours and fonts. Swap in your own.
- **The 8.5 minimum** makes the agent look at its own screenshots and go another round before it shows you anything. Its scores run high though. It gave this page 9.7. Judge the result yourself.
