# OKRA run archives

Completed, consolidated runs are stored as self-contained deterministic `tar.zst`
archives. Active runs stay unpacked under `.okra/runs`.

Verify an archive before extraction:

```sh
jq -r '.archives[] | "\(.sha256)  .okra/archive/\(.file)"' \
  .okra/archive/index.v1.json | sha256sum --check
```

Extract one archive:

```sh
mkdir -p /tmp/okra-restore
tar --zstd -xf .okra/archive/<run-id>.tar.zst -C /tmp/okra-restore
```

The extracted tree includes the run and every content-addressed blob it references.
