# SRS regression fixture

`broadcom.srs` is a published **SRS v2** domain ruleset retrieved on 2026-10-23 from [MetaCubeX/meta-rules-dat, sing branch](https://github.com/MetaCubeX/meta-rules-dat/blob/sing/geo/geosite/broadcom.srs).

SHA-256: `d6f88b27140b99c339df2dde71be1a0ff63ac473c1393c82211364ba062dd895`.

The file exercises a real succinct domain matcher. Synthetic geofile tests additionally cover SRS versions 1–4, logical rules, IP ranges, prefixes and malformed/truncated records. This fixture is test input, not a default ruleset installed for subscribers.

Keep the published bytes and checksum together when updating the fixture. Geofile formats and delivery are documented in [GEOFILES.md](../../../../../docs/GEOFILES.md); test commands are in the [backend README](../../../README.md).
