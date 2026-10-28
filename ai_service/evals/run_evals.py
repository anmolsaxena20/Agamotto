"""
run_evals.py – Evaluation script for Natural-Language Search (Feature 20).

Specifications:
- Evaluates dataset sentences from evals/datasets/nl_search.jsonl
- Requires at least 18 of 20 prepared sentences produce the expected filter
- Validates that dangerous/injection inputs ('drop table logs', etc.) yield safe plain text search without error
"""

import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# Add project root to sys.path so app modules import cleanly
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.schemas import ParseFilterRequest
from app.nl_search import parse_natural_language_search


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

async def run_evaluation():
    dataset_path = Path(__file__).resolve().parent / "datasets" / "nl_search.jsonl"
    if not dataset_path.exists():
        print(f"Error: dataset file not found at {dataset_path}")
        sys.exit(1)

    with open(dataset_path, "r", encoding="utf-8") as f:
        records = [json.loads(line) for line in f if line.strip()]

    fixed_now = "2026-10-27T12:00:00Z"
    known_services = ["payment", "checkout", "auth", "api-gateway", "inventory", "notification", "order"]
    org_id = "org_demo"

    passed_count = 0
    total = len(records)
    results = []

    print(f"\nEvaluating {total} Natural-Language Search scenarios...")
    print("=" * 80)
    print(f"{'ID':<4} | {'Sentence':<40} | {'Status':<6} | {'Details'}")
    print("-" * 80)

    for item in records:
        req = ParseFilterRequest(
            sentence=item["sentence"],
            current_time=fixed_now,
            services=known_services,
            limit=100,
        )

        resp = await parse_natural_language_search(
            req=req,
            org_id=org_id,
            visible_services=None,
        )

        f_dump = resp.filter.model_dump(by_alias=True)
        expected = item.get("expected", {})
        expected_fallback = item.get("expected_fallback", False)

        test_passed = True
        failure_reasons = []

        if expected_fallback:
            if not resp.is_fallback:
                test_passed = False
                failure_reasons.append("Expected is_fallback=True")

        for k, v in expected.items():
            actual_val = f_dump.get(k)
            if isinstance(v, list):
                if not actual_val or not all(elem in actual_val for elem in v):
                    test_passed = False
                    failure_reasons.append(f"{k}: expected {v}, got {actual_val}")
            else:
                if actual_val != v:
                    test_passed = False
                    failure_reasons.append(f"{k}: expected {v}, got {actual_val}")

        if test_passed:
            passed_count += 1
            status_str = "PASS"
            detail_str = f"{len(resp.chips)} chips: " + ", ".join([c.label for c in resp.chips[:2]])
        else:
            status_str = "FAIL"
            detail_str = "; ".join(failure_reasons)

        trunc_sentence = (item["sentence"][:37] + "...") if len(item["sentence"]) > 40 else item["sentence"]
        print(f"{item['id']:<4} | {trunc_sentence:<40} | {status_str:<6} | {detail_str}")
        results.append({
            "id": item["id"],
            "sentence": item["sentence"],
            "passed": test_passed,
            "filter": f_dump,
            "chips": [c.model_dump() for c in resp.chips],
            "explanation": resp.explanation,
        })

    pass_rate = (passed_count / total) * 100
    print("=" * 80)
    print(f"Evaluation Summary: {passed_count}/{total} Passed ({pass_rate:.1f}%)")
    print(f"Requirement: At least 18 of 20 passed -> {'PASSED' if passed_count >= 18 else 'FAILED'}")

    # Save results to evals/results/nl_search_results.json
    results_dir = Path(__file__).resolve().parent / "results"
    results_dir.mkdir(exist_ok=True)
    results_file = results_dir / "nl_search_results.json"
    with open(results_file, "w", encoding="utf-8") as rf:
        json.dump({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "total": total,
            "passed": passed_count,
            "pass_rate": pass_rate,
            "benchmark_met": passed_count >= 18,
            "results": results,
        }, rf, indent=2)

    print(f"Results report saved to {results_file}\n")
    if passed_count < 18:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(run_evaluation())
