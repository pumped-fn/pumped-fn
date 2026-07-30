# DKR-SESSION-1 revised probe validation

Observed at `2026-07-14T08:07:49Z` by the independent validator.

## Accepted

The validator replayed the revised probe twice with byte-identical output and accepted:

- pinned probe hash;
- protected record load, authority bind, resume mismatch, and fork narrowing before protected effects;
- finish during active work with abort observation and settlement before checkpoint;
- steering abort, join, late-output quarantine, and restart at a new epoch;
- missing binding, unavailable backend, and validation failure before any model call;
- fail-fast sibling cancellation and join;
- scalar and stream result parity plus consumer-break settlement;
- multi-round and cross-epoch snapshot immutability;
- commit failure leaving the runtime unfinished;
- artifact publication before reference and checkpoint;
- memory candidate promotion only through explicit acceptance;
- scheduler wake creating a new attempt;
- assertions occurring before case result construction;
- zero changed paths under `pkg/core/lite` and `pkg/sdk`.

## Rejected

`REVISED-PROBE-CASE-COUNT` expected 30 emitted cases but the JSON has 29. All named assignment invariants were separately accepted. The packet and worker report miscounted the keys.

Result: `15 accepted, 1 rejected`.
