# NoticeDelta

A GenLayer Studionet prototype for reviewing changes to a nominated public notice against an immutable baseline. It addresses a specific trust problem: a publisher or dashboard may silently change a deadline or participation condition after someone has relied on an earlier announcement.

NoticeDelta records the nominated URL, explicit criteria, owner and request ID. GenLayer validators independently fetch the source and agree on canonical evidence. The baseline is frozen only when every tracked criterion has an evidence anchor. Later reviews preserve the original baseline, new source snapshot, per-criterion quotations and a hash-linked history. A model cannot author arbitrary quotations: deterministic code selects bounded source units.

## What the application does

- Register a notice with one to four explicit criteria.
- Capture an evidenced baseline through the Intelligent Contract.
- Compare later content with the original baseline and report `CHANGED`, `UNCHANGED` or `UNKNOWN`.
- Inspect exact before/after evidence, source commitments and prior revisions.
- Read public records without a wallet; connect a wallet only after a user action.
- Track accepted and finalized transactions separately, bind recovered hashes to the original account/contract/call, and verify the resulting stored record before showing completion.
- Export local records without requiring an account or a new cloud storage service.

The offline example is explicitly marked and never written to the real transaction journal or mixed into chain records.

## Deployment and evidence

- Network: **GenLayer Studionet**, chain ID **61999**.
- RPC: `https://studio.genlayer.com/api`.
- Contract: `0x3B821AaD4Fc693f5518f74E2DD0eB9deC3A4B394`.
- Final deployment: `0x0f99e5b2c44bcb5e322f4d56241c77eff1836272a9b5b0dcfcff40eb55a2b197`.
- Version: `notice-delta/0.1.0`.

`evidence/deployment.json` records finality, execution success and exact deployed-source matching. `register-receipt.json`, `baseline-receipt.json` and `baseline-state.json` record real Studio calls and the evidence anchor. The controlled example in `fixtures/announcement.md` is **synthetic test data, not an actual event or reward**.

The complete [live validation record](evidence/LIVE_VALIDATION.md) includes an unchanged-source review and a finalized semantic change review from 30 October to 6 November. It also preserves a prior stale-cache observation instead of counting it as change-detection success. Source freshness depends on the upstream/host caches; the app does not promise immediate propagation.

The live public application is [NoticeDelta](https://notice-delta-genlayer-q3579338.q3579338.chatgpt.site); this repository and the Portal project contribution were published/submitted on 2026-10-22. Acceptance and awarded points require separate Portal confirmation. The controlled fixture's mutable branch was intentionally changed for the documented live change test; its baseline text is retained in the contract and in the fixed snapshots below.

### Fixed snapshots for evidence review

The source bodies used in the recorded comparison are available through immutable Git commit URLs:

| Snapshot | Public source body | Raw-body SHA-256 | NoticeDelta canonical-text SHA-256 |
| --- | --- | --- | --- |
| Baseline: 30 October | [450-byte baseline](https://raw.githubusercontent.com/q3579338/genlayer-notice-delta/f2e77496d31cd2e92a60906e6f02d9256700f14b/fixtures/announcement.md) | `9b7ef32ce39692d42629c0f5f45f24a11b0f1c5a8efe63088300f85b2f256e8d` | `f1940854ce85f2827c30dfc824b25778079bea8f41414606545fd24334e9e104` |
| Changed: 6 November | [506-byte comparison](https://raw.githubusercontent.com/q3579338/genlayer-notice-delta/e0924adc558bb819ff609b06d8fe78b584a69c7e/fixtures/announcement.md) | `8d0572dcd116956e41f43eac19d2c7a71b6bdad0eb6bfef01cb77f9c493de540` | `a44a266f9cffc7e75f949a547cb4d94b6d7a2de4677faf712c654adf8c040843` |

The canonical-text hashes match `baseline-state.json` and `changed-retry-state.json`; they identify the contract's normalized source text and are distinct from hashes of the raw HTTP response bytes. The original registered `main` URL and chain receipts remain unchanged. These snapshots let reviewers inspect the historical bytes even after the mutable branch changes; they do not assert a new contract call. Links, sizes and hashes were rechecked on 2026-10-26.

## Development

```text
npm ci
npm run dev
npm test
python -m unittest discover -s tests -p test_notice_contract.py -v
npm run build
```

The production configuration contains only public deployment metadata in `.env.production`; no private key, seed phrase, service credential or testing signer is included. `genlayer-js` is pinned to **1.1.8**. The public methods and storage layout were checked against the exact declared GenVM SDK with `genvm-linter==0.11.0`.

Contract tests explicitly use a host stub: they test state transitions and fail-closed boundaries, not independent model quality or GenVM execution. Separate sanitized Studio receipts are the evidence for real network operations. Browser checks use a muted headless browser and report emulated viewports separately from physical-device testing.

## Contract flow and limits

`register_notice(request_id, source_url, title, criteria)` creates an immutable notice. Reusing the same owner/request ID with the same input returns its existing ID; different input is refused. `capture_baseline(id)` freezes the first valid, evidenced source and cannot replace it. `compare_notice(id, request_id)` appends a review; reusing its request ID does not append another review.

Only the owner can write. Other users may inspect records. The prototype allows 20 notices per owner, 20 reviews per notice, canonical source text of 40–16,000 characters, and quotations of 12–360 characters. Unavailable sources produce retryable failures or `UNKNOWN`, never a claim that the conditions did not change.

Allowed initial hosts are the exact public GenLayer hosts and GitHub hosts listed in `contracts/NoticeDelta.py`. URLs must use HTTPS with no credentials, custom ports or fragments. The underlying web API does not expose final redirect provenance, so this is **not** a guarantee against every redirect or a verification of publisher identity.

## Scope and limitations

This tool compares the text of a **nominated source**, not whether an organization is legitimate or whether a person qualifies for a benefit. A hash identifies canonical rendered text, not the truth of its claims. GitHub fixture ownership and consensus do not make the fixture an official Foundation statement. Model consensus can be wrong. Dynamic pages may fail strict agreement. Missing conditions, conflicting evidence, inaccessible sources and unsupported output must remain inconclusive.

No money, deposits, prizes, claims, automatic subscriptions or external notifications are implemented. No new general-purpose cloud database was added. The app's local transaction journal is separate from the labelled example.

## Mobile acceptance

The viewport uses `viewport-fit=cover`; page, primary controls and dialogs share CSS safe-area insets. Keep these rules when adding tutorials, overlays or new actions. Acceptance includes small widths, common phone/tablet layouts, portrait/landscape and varied device pixel ratios. Headless emulation does not establish physical iPhone/Android host-capsule compatibility; that remains a separate manual device check.

## Contribution classification

This is a **Projects** submission: an application with its own Intelligent Contract, front-end workflow, historical review and transaction recovery. It is separate from the standalone AnchorReceipt primitive and the previously submitted Event Duels project. The same application is not also claimed as a standalone-contract contribution or milestone.
