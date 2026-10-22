# Draft: NoticeDelta — evidence-bound notice change reviews

**Category:** Projects

NoticeDelta freezes an evidenced public-notice baseline and reviews later versions against explicit conditions. A publisher can change a deadline or requirement after users have relied on a previous announcement; a screenshot or a single chatbot answer provides a weak shared record of what changed. NoticeDelta preserves source snapshots, criterion-specific quotations and a hash-linked review history on GenLayer.

GenLayer is central to the workflow. Validators independently retrieve the nominated source and agree on its canonical text. The baseline is accepted only with an evidence anchor for each criterion. For changed source text, independent semantic classification identifies a substantive change, equivalent condition or insufficient evidence. Deterministic code validates unit indexes and generates exact bounded quotations. Inaccessible or ambiguous evidence is UNKNOWN. An unchanged-text shortcut is available only after an evidenced baseline exists.

The frontend supports source inspection, wallet-initiated registration/baseline/review calls, accepted versus finalized transaction states, receipt-to-request binding, stored-state confirmation and recovery from ambiguous wallet responses. Reading and the clearly labelled offline example do not require a wallet. The prototype holds no funds and does not determine real-world eligibility.

Studionet deployment: `0x3B821AaD4Fc693f5518f74E2DD0eB9deC3A4B394`, chain ID 61999. Deployment transaction: `0x0f99e5b2c44bcb5e322f4d56241c77eff1836272a9b5b0dcfcff40eb55a2b197`.

Validation: contract state/failure tests, frontend receipt/recovery tests, exact-SDK semantic checking, muted headless responsive checks, plus sanitized real Studionet deployment, registration and baseline receipts. The sample workshop announcement is synthetic, project-controlled data. Claims of physical-device coverage or untested semantic branches must not be added.

**Before submitting:** finish the controlled changed-source live test, record final validation results, obtain explicit approval for the concrete public source/demo release, publish the source, and include the verified source/demo URLs. Points and acceptance are determined by stewards; no score is guaranteed.
