# catalog / JSON envelope

| Name | Kind | Description |
|------|------|-------------|
| `SuccessEnvelope` | type | `{ ok: true, command, data, meta }` |
| `ErrorEnvelope` | type | `{ ok: false, command, error: { code, message, details }, meta }` |
| `EnvelopeMeta` | type | version, cwd, duration_ms, optional adapters/truncated/total |
| `withEnvelope` | function | Runs body; always returns Envelope; maps throws via toLetError |
| `LetError` | type | code: usage\|validation\|not_found\|conflict\|unsafe\|dependency\|internal |
| CLI exit mapping | contract | usage/validation→1, not_found→2, conflict/unsafe→3, dependency→4, internal→10 |

## Notes

- Library API throws `LetError`; CLI/MCP wrap into envelopes.
- DEFAULT_LIMIT=100, MAX_LIMIT=500 for list responses (enforced in find PR1b).
