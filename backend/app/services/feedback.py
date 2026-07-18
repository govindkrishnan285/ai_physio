"""Turn structured comparison errors into human corrective cues.

Produces the kind of instruction a physiotherapist would give, e.g.
"Increase knee flexion by approximately 10°" or "Keep your spine more upright".
"""

from __future__ import annotations

# For each joint: message when the user's angle is HIGHER than reference, and
# when it is LOWER. {side} and {deg} are filled in per error.
JOINT_TEMPLATES = {
    "knee": {
        "higher": "Bend your {side} knee more — increase knee flexion by approximately {deg}°.",
        "lower": "Ease off your {side} knee — reduce flexion by approximately {deg}°.",
    },
    "hip": {
        "higher": "Hinge more at your {side} hip by approximately {deg}°.",
        "lower": "Reduce your {side} hip bend by approximately {deg}°.",
    },
    "shoulder": {
        "higher": "Lower your {side} arm by approximately {deg}°.",
        "lower": "Raise your {side} arm by approximately {deg}° higher.",
    },
    "elbow": {
        "higher": "Straighten your {side} elbow by approximately {deg}°.",
        "lower": "Bend your {side} elbow by approximately {deg}° more.",
    },
    "ankle": {
        "higher": "Increase your {side} ankle dorsiflexion by approximately {deg}°.",
        "lower": "Reduce your {side} ankle angle by approximately {deg}°.",
    },
    "trunk_incline": {
        # Only "higher" (too much lean) is actionable.
        "higher": "Keep your spine more upright — reduce your forward lean by approximately {deg}°.",
        "lower": "",
    },
}


def _message_for(error: dict) -> str:
    joint = error["joint"]
    templates = JOINT_TEMPLATES.get(joint)
    if not templates:
        return ""
    tpl = templates.get(error["direction"], "")
    if not tpl:
        return ""
    side = error.get("side") or ""
    deg = abs(error["deviation"])
    return tpl.format(side=side, deg=round(deg)).replace("  ", " ").strip()


def build_feedback(result: dict) -> list[dict]:
    """Ordered list of {text, severity} cues from a comparison result.

    Major joint deviations first, then asymmetry, tempo, then ROM confirmation.
    """
    cues: list[dict] = []

    errors = sorted(
        result.get("errors", []),
        key=lambda e: (e["severity"] != "major", -abs(e["deviation"])),
    )
    for err in errors:
        msg = _message_for(err)
        if msg:
            cues.append({"text": msg, "severity": err["severity"]})

    for note in result.get("symmetry_notes", []):
        cues.append({"text": note, "severity": "major"})

    if result.get("tempo") == "fast":
        cues.append(
            {
                "text": "Slow down — control the movement, especially the lowering phase.",
                "severity": "minor",
            }
        )

    if not cues:
        cues.append(
            {"text": "Good form — movement closely matches the reference.", "severity": "ok"}
        )

    return cues[:5]
