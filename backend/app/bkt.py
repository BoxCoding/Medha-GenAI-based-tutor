"""Bayesian Knowledge Tracing (BKT) — the mathematical core of Medhā.

Each (learner, concept) pair carries a probability P(mastered). Every
answer updates that belief with Bayes' rule, then applies a learning
transition. Mastery also decays over time toward uncertainty, which is
what drives spaced review recommendations.

Classic BKT parameters:
  p_slip    — P(wrong answer | concept mastered)
  p_guess   — P(correct answer | concept not mastered)
  p_transit — P(learning the concept from one practice opportunity)
"""
from __future__ import annotations

import math
from dataclasses import dataclass

MASTERY_THRESHOLD = 0.85
UNLOCK_THRESHOLD = 0.55
DECAY_HALF_LIFE_DAYS = 14.0

# Harder questions are stronger evidence and stronger learning opportunities,
# but also easier to slip on. Guess stays near 1/4 for four-option MCQs.
_PARAMS_BY_DIFFICULTY: dict[str, dict[str, float]] = {
    "easy": {"p_slip": 0.08, "p_guess": 0.30, "p_transit": 0.10},
    "medium": {"p_slip": 0.10, "p_guess": 0.25, "p_transit": 0.16},
    "hard": {"p_slip": 0.14, "p_guess": 0.20, "p_transit": 0.22},
}

_INITIAL_MASTERY_BY_LEVEL = {"beginner": 0.15, "intermediate": 0.35, "advanced": 0.55}


@dataclass(frozen=True)
class BKTUpdate:
    """Result of one knowledge-state update."""

    prior: float
    posterior: float
    mastered: bool


def initial_mastery(level: str) -> float:
    """Starting P(mastered) from the learner's self-reported level."""
    return _INITIAL_MASTERY_BY_LEVEL.get(level, 0.15)


def update(mastery: float, is_correct: bool, difficulty: str = "medium") -> BKTUpdate:
    """Apply one Bayesian update + learning transition to a mastery estimate."""
    params = _PARAMS_BY_DIFFICULTY.get(difficulty, _PARAMS_BY_DIFFICULTY["medium"])
    p_slip, p_guess, p_transit = params["p_slip"], params["p_guess"], params["p_transit"]
    prior = _clamp(mastery)

    if is_correct:
        evidence = prior * (1 - p_slip) + (1 - prior) * p_guess
        conditional = prior * (1 - p_slip) / evidence
    else:
        evidence = prior * p_slip + (1 - prior) * (1 - p_guess)
        conditional = prior * p_slip / evidence

    posterior = _clamp(conditional + (1 - conditional) * p_transit)
    return BKTUpdate(prior=prior, posterior=posterior, mastered=posterior >= MASTERY_THRESHOLD)


def decayed_mastery(mastery: float, days_since_update: float) -> float:
    """Drift mastery toward 0.5 (uncertainty) as memory fades.

    Exponential decay with a two-week half-life: a mastered concept left
    untouched gradually becomes a review candidate rather than staying
    'done' forever.
    """
    if days_since_update <= 0:
        return _clamp(mastery)
    decay = math.exp(-math.log(2) * days_since_update / DECAY_HALF_LIFE_DAYS)
    return _clamp(0.5 + (mastery - 0.5) * decay)


def difficulty_for(mastery: float) -> str:
    """Map current mastery to the question difficulty that teaches best."""
    if mastery < 0.40:
        return "easy"
    if mastery < 0.70:
        return "medium"
    return "hard"


def mastery_band(mastery: float) -> str:
    """Coarse band used for lesson personalization and caching."""
    if mastery < 0.40:
        return "novice"
    if mastery < 0.70:
        return "developing"
    return "proficient"


def _clamp(value: float, low: float = 0.01, high: float = 0.99) -> float:
    return max(low, min(high, value))
