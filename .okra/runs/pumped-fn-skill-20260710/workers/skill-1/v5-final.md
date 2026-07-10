Added only under `skills/pumped-fn/`.

`SKILL.md` — **+488 bytes**

```md
Decide by where the value comes FROM: an atom's factory CONSTRUCTS its value inside the graph; a value SUPPLIED from outside (composition root, deployment, request) is a tag — an injected foreign client/capability is always a tag (or port flow), never an atom.
```

```md
- Injected client as atom: if the composition root hands you the implementation, wrapping it in an atom hides the injection point — declare a `tag<ClientType>()` and bind it at the root; deps take `tags.required(client)`.
```

`references/review.md` — **+203 bytes**

```md
| Injected capability is a tag | Reviewer checks that a foreign client/capability supplied by the composition root, deployment, or request is a tag (or port flow), never an atom; lint cannot see this. |
```

Zero deletions confirmed: 4 added lines, 0 deleted. No verification runs or npm commands were used.