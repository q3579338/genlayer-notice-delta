"""Contract state and failure tests with an explicit, non-GenVM host stub.

These do not establish real model quality, independent validators or finality.
The separate Studio deployment evidence records those checks when available.
"""
import copy
import importlib.util
import json
from pathlib import Path
import sys
import types
import unittest


class Address(str):
    @property
    def as_hex(self):
        return str(self).lower()


def identity(fn):
    return fn


host = types.SimpleNamespace(sender_address=Address("0x" + "11" * 20))
page = {"text": "Applications close on 30 October 2026. Everyone may enter the public event."}
model = {"findings": [{"index": 0, "status": "CHANGED", "baseline_unit": 0, "current_unit": 0}]}
calls = []


def render(url, mode):
    calls.append((url, mode))
    if "error" in page:
        raise RuntimeError(page["error"])
    return page["text"]


def prompt(value):
    calls.append(("model", value))
    if value.startswith("Find baseline evidence"):
        return json.dumps({"units": page.get("baseline_units", [0])})
    return model["raw"] if "raw" in model else json.dumps(model)


gl = types.SimpleNamespace(Contract=object, message=host,
    public=types.SimpleNamespace(write=identity, view=identity),
    vm=types.SimpleNamespace(UserError=ValueError),
    nondet=types.SimpleNamespace(web=types.SimpleNamespace(render=render,
        get=lambda url: types.SimpleNamespace(status=page.get("http_status", 200),
            body=page["text"].encode(), headers={"content-type": b"text/html"})), exec_prompt=prompt),
    eq_principle=types.SimpleNamespace(strict_eq=lambda fn: fn()))
sdk = types.ModuleType("genlayer")
sdk.gl, sdk.TreeMap, sdk.u256, sdk.Address = gl, dict, int, Address
sys.modules["genlayer"] = sdk
spec = importlib.util.spec_from_file_location("notice_delta", Path(__file__).parents[1] / "contracts/NoticeDelta.py")
contract_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(contract_module)


class NoticeTests(unittest.TestCase):
    def setUp(self):
        self.contract = contract_module.NoticeDelta()
        for field in ("notices", "registrations", "histories", "review_requests", "owner_counts"):
            setattr(self.contract, field, {})
        self.contract._now = lambda: 1792627200
        host.sender_address = Address("0x" + "11" * 20)
        page.clear()
        page["text"] = "Applications close on 30 October 2026. Everyone may enter the public event."
        model.clear()
        model["findings"] = [{"index": 0, "status": "CHANGED", "baseline_unit": 0, "current_unit": 0}]
        calls.clear()

    def register(self, request="register_001", **overrides):
        values = {"request_id": request, "source_url": "https://genlayer.com/notice", "title": "Event rules",
                  "criteria": ["The application closing date for this event"]}
        values.update(overrides)
        return self.contract.register_notice(**values)

    def baseline(self):
        notice_id = self.register()
        self.contract.capture_baseline(notice_id)
        return notice_id

    def test_registration_does_not_fetch_or_invent_a_baseline(self):
        notice_id = self.register()
        self.assertFalse(self.contract.get_notice(notice_id)["baseline_ready"])
        self.assertEqual(calls, [])

    def test_registration_retry_is_idempotent(self):
        self.assertEqual(self.register(), self.register())
        self.assertEqual(self.contract.get_stats()["count"], 1)

    def test_request_id_cannot_be_reused_for_different_input(self):
        self.register()
        with self.assertRaisesRegex(ValueError, "different input"):
            self.register(title="A different event")

    def test_different_owners_may_use_same_request_id(self):
        self.register()
        host.sender_address = Address("0x" + "22" * 20)
        self.assertEqual(self.register(), 2)

    def test_private_credentialed_port_fragment_and_lookalike_urls_rejected(self):
        for url in ("http://genlayer.com/x", "https://127.0.0.1/x", "https://localhost/x",
                    "https://genlayer.com.evil.test/x", "https://user@genlayer.com/x",
                    "https://genlayer.com:443/x", "https://genlayer.com/x#fragment"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                self.register(source_url=url)

    def test_duplicate_or_empty_criteria_rejected(self):
        for criteria in ([], ["too short"] * 2, [""], ["one valid criterion"] * 5):
            with self.subTest(criteria=criteria), self.assertRaises(ValueError):
                self.register(criteria=criteria)

    def test_unknown_owner_cannot_capture_or_compare(self):
        notice_id = self.baseline()
        host.sender_address = Address("0x" + "22" * 20)
        with self.assertRaisesRegex(ValueError, "owner"):
            self.contract.capture_baseline(notice_id)
        with self.assertRaisesRegex(ValueError, "owner"):
            self.contract.compare_notice(notice_id, "review_001")

    def test_capture_freezes_canonical_text_and_cannot_overwrite(self):
        page["text"] = "  Applications close on 30 October 2026.\r\nEveryone may enter the event.  "
        notice_id = self.baseline()
        frozen = copy.deepcopy(self.contract.get_notice(notice_id)["baseline"])
        self.assertNotIn("\r", frozen["text"])
        page["text"] = "Applications now close on 10 November 2026. Everyone may enter the event."
        self.contract.capture_baseline(notice_id)
        self.assertEqual(self.contract.get_notice(notice_id)["baseline"], frozen)

    def test_baseline_fetch_failure_can_retry(self):
        notice_id = self.register()
        page["error"] = "upstream unavailable"
        with self.assertRaises(ValueError):
            self.contract.capture_baseline(notice_id)
        self.assertFalse(self.contract.get_notice(notice_id)["baseline_ready"])
        del page["error"]
        self.contract.capture_baseline(notice_id)
        self.assertTrue(self.contract.get_notice(notice_id)["baseline_ready"])

    def test_overlong_source_not_silently_truncated(self):
        notice_id = self.register()
        page["text"] = "x" * 16001
        with self.assertRaises(ValueError):
            self.contract.capture_baseline(notice_id)

    def test_compare_requires_a_real_baseline(self):
        notice_id = self.register()
        with self.assertRaisesRegex(ValueError, "baseline"):
            self.contract.compare_notice(notice_id, "review_001")

    def test_identical_text_uses_deterministic_unchanged_path(self):
        notice_id = self.baseline()
        calls.clear()
        self.contract.compare_notice(notice_id, "review_001")
        notice = self.contract.get_notice(notice_id)
        self.assertEqual(notice["last_status"], "UNCHANGED")
        self.assertFalse(any(call[0] == "model" for call in calls))

    def test_error_pages_and_unsupported_baseline_criteria_are_not_frozen(self):
        notice_id = self.register()
        page["text"] = "Access denied. This request was blocked by the security service. Please sign in."
        with self.assertRaises(ValueError):
            self.contract.capture_baseline(notice_id)
        self.assertFalse(self.contract.get_notice(notice_id)["baseline_ready"])
        page["text"] = "This is a general project page without the event's application closing date."
        page["baseline_units"] = [None]
        with self.assertRaisesRegex(ValueError, "evidence"):
            self.contract.capture_baseline(notice_id)
        self.assertFalse(self.contract.get_notice(notice_id)["baseline_ready"])

    def test_http_error_page_is_not_a_baseline(self):
        notice_id = self.register()
        page["http_status"] = 404
        with self.assertRaises(ValueError):
            self.contract.capture_baseline(notice_id)
        self.assertFalse(self.contract.get_notice(notice_id)["baseline_ready"])

    def test_change_has_exact_bounded_quotes_and_preserves_baseline(self):
        notice_id = self.baseline()
        original = self.contract.get_notice(notice_id)["baseline"]
        page["text"] = "Applications close on 10 November 2026. Everyone may enter the public event."
        self.contract.compare_notice(notice_id, "review_001")
        notice = self.contract.get_notice(notice_id)
        row = notice["latest"]["findings"][0]
        self.assertEqual(notice["last_status"], "CHANGED")
        self.assertIn(row["baseline_quote"], original["text"])
        self.assertIn(row["current_quote"], page["text"])
        self.assertLessEqual(len(row["current_quote"]), 360)
        self.assertEqual(notice["baseline"], original)

    def test_review_retry_does_not_fetch_or_append_again(self):
        notice_id = self.baseline()
        self.contract.compare_notice(notice_id, "review_001")
        calls.clear()
        self.contract.compare_notice(notice_id, "review_001")
        self.assertEqual(self.contract.get_notice(notice_id)["revision"], 1)
        self.assertEqual(calls, [])

    def test_current_source_failure_is_unknown_and_recoverable(self):
        notice_id = self.baseline()
        page["error"] = "upstream unavailable"
        self.contract.compare_notice(notice_id, "review_001")
        self.assertEqual(self.contract.get_notice(notice_id)["last_status"], "UNKNOWN")
        del page["error"]
        self.contract.compare_notice(notice_id, "review_002")
        self.assertEqual(self.contract.get_notice(notice_id)["last_status"], "UNCHANGED")

    def test_model_cannot_write_fabricated_quote_or_out_of_range_index(self):
        notice_id = self.baseline()
        page["text"] += " New version."
        model["findings"][0].update(current_unit=999, quote="Invented promise")
        self.contract.compare_notice(notice_id, "review_001")
        row = self.contract.get_notice(notice_id)["latest"]["findings"][0]
        self.assertEqual(row["status"], "UNKNOWN")
        self.assertEqual(row["current_quote"], "")

    def test_invalid_model_shapes_and_boolean_indexes_fail_closed(self):
        notice_id = self.baseline()
        page["text"] += " New version."
        for i, raw in enumerate(("YES", "```json\n{}\n```", "[]", '{"findings":[]}',
                                '{"findings":[{"index":0,"status":"CHANGED","baseline_unit":true,"current_unit":0}]}')):
            model["raw"] = raw
            self.contract.compare_notice(notice_id, "review_" + str(i).zfill(3))
            self.assertEqual(self.contract.get_notice(notice_id)["last_status"], "UNKNOWN")

    def test_record_history_is_append_only_and_hash_linked(self):
        notice_id = self.baseline()
        self.contract.compare_notice(notice_id, "review_001")
        first = copy.deepcopy(self.contract.get_history(notice_id)[0])
        page["text"] += " New version."
        self.contract.compare_notice(notice_id, "review_002")
        history = self.contract.get_history(notice_id)
        self.assertEqual(history[1], first)
        self.assertEqual(history[0]["previous_hash"], first["record_hash"])
        record = history[0].copy()
        digest = record.pop("record_hash")
        self.assertEqual(digest, self.contract._hash(self.contract._json(record)))

    def test_validator_disagreement_does_not_save_a_fake_success(self):
        notice_id = self.baseline()
        previous = gl.eq_principle.strict_eq
        gl.eq_principle.strict_eq = lambda fn: (_ for _ in ()).throw(ValueError("validator disagreement"))
        try:
            with self.assertRaises(ValueError):
                self.contract.compare_notice(notice_id, "review_001")
            self.assertEqual(self.contract.get_notice(notice_id)["revision"], 0)
        finally:
            gl.eq_principle.strict_eq = previous

    def test_pagination_rejects_invalid_and_boolean_values(self):
        notice_id = self.baseline()
        for args in ((-1, 20), (0, 0), (0, 21), (True, 20)):
            with self.assertRaises(ValueError):
                self.contract.list_notices(*args)
            with self.assertRaises(ValueError):
                self.contract.get_history(notice_id, *args)
        with self.assertRaises(ValueError):
            self.contract.get_notice(True)

    def test_prototype_owner_and_revision_limits(self):
        for i in range(20):
            self.register(request="register_" + str(i).zfill(3))
        with self.assertRaisesRegex(ValueError, "20 notices"):
            self.register(request="register_overflow")
        self.contract.capture_baseline(1)
        for i in range(20):
            self.contract.compare_notice(1, "review_" + str(i).zfill(3))
        with self.assertRaisesRegex(ValueError, "20 reviews"):
            self.contract.compare_notice(1, "review_overflow")


if __name__ == "__main__":
    unittest.main()
