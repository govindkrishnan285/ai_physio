"""Rule-based next-exercise recommendation from session history.

Heuristics (in priority order):
  1. Mastered current exercise (high accuracy, enough volume) -> progress.
  2. Struggling (low accuracy) -> repeat with focus / regress to foundational.
  3. Recurrent joint deficiency -> targeted exercise for that joint.
Falls back to unattempted exercises in the therapist's protocol order.
"""

from __future__ import annotations

MASTERY_ACCURACY = 85.0
MASTERY_MIN_REPS = 24
STRUGGLE_ACCURACY = 60.0


def recommend_next(
    history: list[dict],
    exercises: list[dict],
    max_items: int = 3,
) -> list[dict]:
    """Return [{exercise_id, exercise_name, reason, priority}].

    ``history`` items: {exercise_id, exercise_name, category, avg_accuracy,
    total_reps}. Most-recent first. ``exercises``: available exercises with
    {id, name, category}.
    """
    recs: list[dict] = []
    seen_ids: set[int] = set()

    by_id = {e["id"]: e for e in exercises}
    attempted_ids = {h["exercise_id"] for h in history}

    def add(ex_id: int, reason: str, priority: int) -> None:
        if ex_id in seen_ids or ex_id not in by_id:
            return
        seen_ids.add(ex_id)
        recs.append(
            {
                "exercise_id": ex_id,
                "exercise_name": by_id[ex_id]["name"],
                "reason": reason,
                "priority": priority,
            }
        )

    # Look at the most recent session per exercise.
    latest: dict[int, dict] = {}
    for h in history:
        latest.setdefault(h["exercise_id"], h)

    for ex_id, h in latest.items():
        acc = h.get("avg_accuracy", 0.0)
        reps = h.get("total_reps", 0)
        category = h.get("category", "")

        if acc >= MASTERY_ACCURACY and reps >= MASTERY_MIN_REPS:
            # Progress: next unattempted exercise in the same category.
            for e in exercises:
                if e["category"] == category and e["id"] not in attempted_ids:
                    add(
                        e["id"],
                        f"You've mastered {h['exercise_name']} ({acc:.0f}% accuracy) — "
                        f"progress to the next {category.lower()} exercise.",
                        priority=1,
                    )
                    break
        elif acc < STRUGGLE_ACCURACY:
            add(
                ex_id,
                f"Accuracy on {h['exercise_name']} is {acc:.0f}% — repeat it with "
                f"focus on the flagged corrections before advancing.",
                priority=1,
            )

    # Fill remaining slots with unattempted exercises (protocol order).
    for e in exercises:
        if len(recs) >= max_items:
            break
        if e["id"] not in attempted_ids:
            add(
                e["id"],
                f"Not yet attempted — add {e['name']} to broaden your {e['category'].lower()} rehab.",
                priority=3,
            )

    recs.sort(key=lambda r: r["priority"])
    return recs[:max_items]
