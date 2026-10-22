# Studionet live validation — 2026-10-22

These are real calls on GenLayer Studionet 61999 using a dedicated, ephemeral test identity. No real player's wallet or funds were used. The workshop announcement is project-controlled synthetic data, not a Foundation campaign.

The exact deployed source matches `contracts/NoticeDelta.py`. Contract address: `0x3B821AaD4Fc693f5518f74E2DD0eB9deC3A4B394`.

| Operation | Transaction | Actual result |
| --- | --- | --- |
| Final deployment | `0x0f99e5b2c44bcb5e322f4d56241c77eff1836272a9b5b0dcfcff40eb55a2b197` | FINALIZED, leader SUCCESS, MAJORITY_AGREE, source match |
| Register notice #1 | `0xaec2681188121e23b0623ee602a67956dd1a6886665115925e6cc16a6cfe5a1c` | FINALIZED; owner/request/input stored and read back |
| Capture baseline | `0x53e5c8e67574154efb62756fef4322a159d1f3ed2b14e69ecf3bbf6075531b89` | FINALIZED; source retrieved, criterion evidence anchor frozen |
| Compare unchanged source | `0xcc81036ed3a7e73f864f59e63c7f7d0d97e62a07043ec5eef784c5adb446ebc0` | FINALIZED; revision 1 UNCHANGED, exact baseline quotations |
| First compare after fixture update | `0x2c0b528cddca80c64af46c79a41ace631558c0e97b1ffc2277f7e716f258b58c` | FINALIZED; revision 2 UNCHANGED because the retrieved snapshot was still v1; not counted as changed-source success |
| Compare after cache propagation, new request ID | `0x1424510cb65dd97828bc5f1d9229f399b597de55d60b8327ea14b7b864e4dc26` | FINALIZED, leader SUCCESS, MAJORITY_AGREE; revision 3 CHANGED; actual current snapshot contains 6 November |

Baseline wording: “Applications for the example workshop close on 30 October 2026 at 18:00 UTC.”

Current wording: “Applications for the example workshop close on 6 November 2026 at 18:00 UTC.”

The baseline remains immutable. All three comparison records are retained; the stale-content attempt was not deleted or relabelled as a successful change detection. A new request ID was used for the retry so it performed a new observation rather than replaying the old idempotent result.

## Limits established by this run

The GitHub raw response advertises `Cache-Control: max-age=300`. Different network paths may observe different cached responses. The app reports what validators retrieved, not a guarantee of immediate source freshness. GenLayer Host's production cache TTL was not independently established. Observed source text/hash and the frozen baseline should be inspected when freshness matters.

The quorum may complete before every selected validator finishes. Some returned validator rows say “Validator execution cancelled after quorum”; this does not mean every validator completed, nor does it override a successful finalized leader result and aggregate majority agreement.

This run establishes one synthetic deadline-change scenario and the normal state/receipt flow. It does not establish general semantic accuracy, physical-device compatibility, a complete adversarial prompt corpus, source-publisher identity, source truth or behavior on every dynamic website. Separate local host-stub tests cover failure and recovery boundaries; those are not presented as real network cases.

Frontend checks cover 7 tests, four emulated viewport widths, DPR 2/3 with portrait/landscape and simulated safe areas, storage isolation and no wallet calls on load. Real browser-wallet signing and physical phone/host-capsule checks remain manual follow-ups.
