"""Deterministic fallback content used when Gemini is unavailable.

The learner's flow never breaks: concept maps, lessons, quizzes, mind maps,
grading, and tutor replies all have offline equivalents. Fallback content is
clearly generic, but it keeps every workflow demonstrable end-to-end.
"""
from __future__ import annotations

import hashlib
import json
from typing import Any

_CONCEPT_TEMPLATE: list[tuple[str, str, str, str, list[str]]] = [
    (
        "foundations",
        "Foundations of {topic}",
        "Key terminology, motivation, and the mental model behind {topic}.",
        "easy",
        [],
    ),
    (
        "core-principles",
        "Core Principles",
        "The central rules and ideas that everything else in {topic} builds on.",
        "easy",
        ["foundations"],
    ),
    (
        "techniques",
        "Essential Techniques",
        "The standard methods and procedures used when working with {topic}.",
        "medium",
        ["core-principles"],
    ),
    (
        "applications",
        "Practical Applications",
        "Applying {topic} to realistic problems and interpreting results.",
        "medium",
        ["techniques"],
    ),
    (
        "pitfalls",
        "Common Pitfalls & Misconceptions",
        "Frequent mistakes, edge cases, and how experts avoid them in {topic}.",
        "medium",
        ["techniques"],
    ),
    (
        "advanced",
        "Advanced Topics",
        "Deeper extensions and open questions that build on all of {topic}.",
        "hard",
        ["applications", "pitfalls"],
    ),
]

_BAND_FOCUS = {
    "novice": "Start with the big picture: why this matters and where it fits.",
    "developing": "You know the basics — focus on the mechanics and worked examples.",
    "proficient": "Push into edge cases, trade-offs, and teaching it back in your own words.",
}


def concept_map(topic: str) -> list[dict[str, Any]]:
    """A sensible generic learning path for any topic."""
    return [
        {
            "slug": slug,
            "name": name.format(topic=topic),
            "description": desc.format(topic=topic),
            "difficulty": difficulty,
            "prerequisites": prereqs,
        }
        for slug, name, desc, difficulty, prereqs in _CONCEPT_TEMPLATE
    ]


def _lesson_flow_block(concept_name: str, topic: str) -> str:
    spec = {
        "title": f"The Medhā mastery loop for {concept_name}",
        "steps": [
            "Define it in your own words",
            f"Connect it to two other ideas in {topic}",
            "Apply it to one concrete example",
            "Take the adaptive quiz",
            "Review what you missed",
        ],
        "note": (
            "Follow this loop top to bottom; each pass through it raises "
            "your mastery estimate."
        ),
    }
    return f"```flow\n{json.dumps(spec)}\n```"


def _lesson_chart_block() -> str:
    spec = {
        "type": "line",
        "title": "How practice builds mastery",
        "x_label": "Practice sessions",
        "y_label": "Mastery estimate (%)",
        "labels": ["1", "2", "3", "4", "5"],
        "series": [
            {"name": "Steady practice", "values": [15, 40, 62, 78, 88]},
            {"name": "Cramming once", "values": [15, 55, 50, 45, 41]},
        ],
        "note": (
            "Read left to right: repeated spaced practice keeps climbing, while a "
            "single cram session fades. This is the forgetting curve Medhā's "
            "review scheduler works against."
        ),
    }
    return f"```chart\n{json.dumps(spec)}\n```"


def lesson(concept_name: str, description: str, band: str, topic: str) -> str:
    """A structured self-study lesson scaffold following the same
    Concept → Visual → Example → Story → Takeaway progression as live lessons."""
    focus = _BAND_FOCUS.get(band, "Work through this step by step.")
    return f"""## Why this matters

> Offline study guide (Gemini unavailable — add `GEMINI_API_KEY` to `.env` for \
fully personalized lessons).

**{concept_name}** — {description} Understanding it unlocks the concepts that \
build on it in *{topic}*.

## The core idea

**Your focus right now:** {focus}

{_lesson_flow_block(concept_name, topic)}

{_lesson_chart_block()}

## Practical example

Take one real situation from your own life or work and force *{concept_name}* \
onto it: if you can explain how the concept applies (or why it doesn't), you \
understand it.

## Learn Through Storytelling

Meera runs a small tea stall near the railway station. Every morning she adjusts
how much milk and tea she brews — not by memorizing yesterday's numbers, but by
watching the queue: longer queue, bigger batch; rainy day, extra ginger. One day
her nephew asks how she always gets it right. "I don't," she laughs. "I get it
slightly less wrong every single day."

**The connection:** Meera treats every day as one pass through a learning loop —
observe, adjust, retry — exactly how you should treat *{concept_name}*: not as a
definition to memorize, but as a judgment you refine with each attempt.

**Takeaway:** Mastery is not getting it right once; it is getting it less wrong
every time you practice.

## Key takeaways

- {description}
- Practice in small, spaced passes — the loop above beats one long cram.
- If you can teach *{concept_name}* through a story of your own, you own it.
"""


def _question_bank(concept_name: str, description: str) -> list[dict[str, Any]]:
    return [
        {
            "question": f"Which statement best captures the purpose of '{concept_name}'?",
            "options": [
                description,
                "It is unrelated trivia with no bearing on the subject.",
                "It only matters for memorizing definitions, never for practice.",
                "It replaces the need to understand any other concept.",
            ],
            "correct_index": 0,
            "explanation": f"'{concept_name}' is about: {description}",
        },
        {
            "question": (
                f"You keep making mistakes while practicing '{concept_name}'. "
                "What is the most effective next step?"
            ),
            "options": [
                "Review the underlying idea, then retry slightly easier problems.",
                "Skip ahead to the hardest material immediately.",
                "Repeat the same wrong approach faster.",
                "Stop practicing this concept permanently.",
            ],
            "correct_index": 0,
            "explanation": (
                "Deliberate practice means stepping down difficulty to rebuild the "
                "shaky foundation, then climbing back up."
            ),
        },
        {
            "question": (
                f"What is the strongest evidence that you have truly mastered '{concept_name}'?"
            ),
            "options": [
                "You can apply it to a new problem and explain your reasoning.",
                "You re-read the notes once without falling asleep.",
                "You recognize the term when you see it.",
                "You memorized the definition word-for-word.",
            ],
            "correct_index": 0,
            "explanation": (
                "Transfer to novel problems plus articulate reasoning is the gold "
                "standard of mastery — recognition and recall are weaker signals."
            ),
        },
        {
            "question": (
                f"When is the best time to review '{concept_name}' after first learning it?"
            ),
            "options": [
                "At increasing intervals, just before you would naturally forget it.",
                "Never — one exposure is enough.",
                "Only the night before an exam.",
                "Every hour forever, regardless of how well you know it.",
            ],
            "correct_index": 0,
            "explanation": (
                "Spaced repetition — reviewing near the edge of forgetting — is "
                "what Medhā's decay model schedules for you."
            ),
        },
        {
            "question": (
                f"A peer asks you to explain '{concept_name}'. Which explanation "
                "style helps BOTH of you learn most?"
            ),
            "options": [
                "A simple analogy plus one concrete worked example.",
                "Reciting the textbook paragraph verbatim.",
                "Telling them it is too advanced to explain.",
                "Listing every technical term with no context.",
            ],
            "correct_index": 0,
            "explanation": (
                "Explaining with analogy and example (the Feynman technique) exposes "
                "gaps in your own understanding while teaching them."
            ),
        },
    ]


def quiz(
    concept_name: str, description: str, difficulty: str, count: int
) -> list[dict[str, Any]]:
    """Deterministic comprehension questions built from the concept metadata."""
    bank = _question_bank(concept_name, description)
    # Deterministic but varied ordering per concept, so repeat quizzes differ.
    seed = int(hashlib.sha256(concept_name.encode()).hexdigest(), 16)
    picked = []
    for i in range(min(count, len(bank))):
        item = dict(bank[(seed + i) % len(bank)])
        item["difficulty"] = difficulty
        picked.append(item)
    return picked


def mindmap(concept_name: str, description: str, topic: str) -> dict[str, Any]:
    """A generic but well-structured mind map when Gemini is unavailable."""
    return {
        "center": concept_name[:50],
        "branches": [
            {
                "label": "What it is",
                "kind": "intuition",
                "children": [description[:70], f"A building block of {topic}"[:70]],
            },
            {
                "label": "Practical example",
                "kind": "example",
                "children": [
                    "Apply it to one real problem you know",
                    "Explain it with a daily-life analogy",
                ],
            },
            {
                "label": "How to use it",
                "kind": "steps",
                "children": [
                    "Define it in your own words",
                    "Work one small example by hand",
                    "Check the result makes sense",
                ],
            },
            {
                "label": "Common pitfalls",
                "kind": "pitfall",
                "children": [
                    "Memorizing without understanding",
                    "Skipping the prerequisites",
                ],
            },
            {
                "label": "Connects to",
                "kind": "connection",
                "children": [
                    f"Other concepts in {topic}"[:70],
                    "Your next unlocked concept",
                ],
            },
        ],
    }


def teachback_grade(explanation: str, description: str) -> dict[str, Any]:
    """Heuristic offline grade: rewards overlap with the concept description
    and penalizes very short answers."""
    explanation_words = {w.lower().strip(".,!?") for w in explanation.split() if len(w) > 3}
    description_words = {w.lower().strip(".,!?") for w in description.split() if len(w) > 3}
    overlap = len(explanation_words & description_words) / max(1, len(description_words))
    length_factor = min(1.0, len(explanation) / 300)
    score = int(30 + 40 * overlap + 30 * length_factor)
    return {
        "score": min(95, score),
        "strengths": ["You attempted a full explanation in your own words"],
        "gaps": ["Offline mode: add GEMINI_API_KEY for a real conceptual review"],
        "tip": "Try the Feynman test: could a 12-year-old follow your explanation?",
    }


def tutor_reply(message: str, topic: str) -> str:
    return (
        f"I'm in offline mode right now (no Gemini key configured), so I can't give a "
        f'personalized answer to: "{message[:120]}".\n\n'
        f"Here is a general strategy for questions about {topic}: break the question "
        f"into what you know and what's missing, review the weakest concept on your "
        f"dashboard, then retry the adaptive quiz — my mastery model will adjust to "
        f"your answers. Add GEMINI_API_KEY to .env for full tutoring."
    )
