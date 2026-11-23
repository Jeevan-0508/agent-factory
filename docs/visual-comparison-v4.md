# V4 visual comparison

The Playwright visual matrix retains desktop, tablet, mobile, and wide captures for all eight experiences under [`tests/e2e/visual.spec.mjs-snapshots`](../tests/e2e/visual.spec.mjs-snapshots). The table below links the desktop and mobile evidence used by the V4 review.

| Experience | Desktop | Mobile | Visual language |
| --- | --- | --- | --- |
| Command Center | [desktop](../tests/e2e/visual.spec.mjs-snapshots/command-center-visual-desktop.png) | [mobile](../tests/e2e/visual.spec.mjs-snapshots/command-center-visual-mobile.png) | Dark operational shell, metric cards, coverage map, explicit truth model. |
| Minimal Studio | [desktop](../tests/e2e/visual.spec.mjs-snapshots/minimal-studio-visual-desktop.png) | [mobile](../tests/e2e/visual.spec.mjs-snapshots/minimal-studio-visual-mobile.png) | Editorial whitespace, typographic hierarchy, restrained role index. |
| Cyberpunk Neon | [desktop](../tests/e2e/visual.spec.mjs-snapshots/cyberpunk-neon-visual-desktop.png) | [mobile](../tests/e2e/visual.spec.mjs-snapshots/cyberpunk-neon-visual-mobile.png) | Grid console, neon signal language, typed-surface scan. |
| Glass Universe | [desktop](../tests/e2e/visual.spec.mjs-snapshots/glass-universe-visual-desktop.png) | [mobile](../tests/e2e/visual.spec.mjs-snapshots/glass-universe-visual-mobile.png) | Layered observatory, translucent decks, constellation framing. |
| Agent Galaxy | [desktop](../tests/e2e/visual.spec.mjs-snapshots/agent-galaxy-visual-desktop.png) | [mobile](../tests/e2e/visual.spec.mjs-snapshots/agent-galaxy-visual-mobile.png) | Capability network, node index, evidence-backed relationships. |
| Mythology Atlas | [desktop](../tests/e2e/visual.spec.mjs-snapshots/mythology-atlas-visual-desktop.png) | [mobile](../tests/e2e/visual.spec.mjs-snapshots/mythology-atlas-visual-mobile.png) | Encyclopedia layout, culture grouping, codename ≠ capability rule. |
| Retro Terminal | [desktop](../tests/e2e/visual.spec.mjs-snapshots/retro-terminal-visual-desktop.png) | [mobile](../tests/e2e/visual.spec.mjs-snapshots/retro-terminal-visual-mobile.png) | Keyboard-oriented terminal rows, monospace prompts, command cues. |
| Neo-Brutalist Lab | [desktop](../tests/e2e/visual.spec.mjs-snapshots/neo-brutalist-lab-visual-desktop.png) | [mobile](../tests/e2e/visual.spec.mjs-snapshots/neo-brutalist-lab-visual-mobile.png) | Bold blocks, hard edges, high-contrast experimental catalog. |

The experiences are not color themes: they use different composition, density, navigation emphasis, typography, component grouping, and agent-discovery metaphors while reading the same registry and state. Visual tests passed for desktop, tablet, mobile, and wide projects after the V4 Execution Console navigation change.
