"""Unit tests for the adaptive recommendation policy."""
from backend.app import adaptive


def _concept(cid, slug, prereqs, position=0):
    return {
        "id": cid,
        "slug": slug,
        "name": slug.title(),
        "description": "desc",
        "difficulty": "medium",
        "position": position,
        "prerequisites": prereqs,
    }


def _state(mastery, attempts=0):
    return {"mastery": mastery, "attempts": attempts, "correct": 0, "updated_at": None}


def test_prerequisites_lock_concepts():
    concepts = [_concept(1, "basics", []), _concept(2, "advanced", ["basics"], 1)]
    states = {1: _state(0.2), 2: _state(0.15)}
    annotated = adaptive.annotate_concepts(concepts, states)
    assert annotated[0]["unlocked"] is True
    assert annotated[1]["unlocked"] is False


def test_concept_unlocks_when_prereq_reaches_threshold():
    concepts = [_concept(1, "basics", []), _concept(2, "advanced", ["basics"], 1)]
    states = {1: _state(0.7), 2: _state(0.15)}
    annotated = adaptive.annotate_concepts(concepts, states)
    assert annotated[1]["unlocked"] is True


def test_recommends_weakest_unlocked_concept():
    concepts = [
        _concept(1, "a", [], 0),
        _concept(2, "b", [], 1),
        _concept(3, "c", ["a", "b"], 2),
    ]
    states = {1: _state(0.6, attempts=2), 2: _state(0.3, attempts=1), 3: _state(0.1)}
    annotated = adaptive.annotate_concepts(concepts, states)
    reco = adaptive.recommend_next(annotated)
    assert reco["concept"]["slug"] == "b"
    assert reco["action"] == "practice"


def test_recommends_learn_for_untouched_concept():
    concepts = [_concept(1, "a", [])]
    states = {1: _state(0.2, attempts=0)}
    reco = adaptive.recommend_next(adaptive.annotate_concepts(concepts, states))
    assert reco["action"] == "learn"


def test_recommends_review_when_all_mastered():
    concepts = [_concept(1, "a", []), _concept(2, "b", [], 1)]
    states = {1: _state(0.9, attempts=3), 2: _state(0.95, attempts=3)}
    reco = adaptive.recommend_next(adaptive.annotate_concepts(concepts, states))
    assert reco["action"] == "review"
    assert reco["concept"]["slug"] == "a"


def test_no_recommendation_for_empty_map():
    assert adaptive.recommend_next([]) is None


class TestPaceProfile:
    def _data(self, accuracy, response_time, attempts=6):
        return {
            "recent_accuracy": accuracy,
            "avg_response_time": response_time,
            "recent_attempts": attempts,
            "total_attempts": attempts,
        }

    def test_fast_accurate_is_sprinter(self):
        assert adaptive.pace_profile(self._data(0.9, 10))["pace"] == "sprinter"

    def test_accurate_deliberate_is_deep_diver(self):
        assert adaptive.pace_profile(self._data(0.7, 35))["pace"] == "deep-diver"

    def test_low_accuracy_is_warming_up(self):
        profile = adaptive.pace_profile(self._data(0.3, 15))
        assert profile["pace"] == "warming-up"
        assert "30%" in profile["description"]

    def test_insufficient_data_is_new(self):
        assert adaptive.pace_profile(self._data(1.0, 5, attempts=1))["pace"] == "new"
        assert adaptive.pace_profile(
            {"recent_accuracy": None, "avg_response_time": None, "recent_attempts": 0}
        )["pace"] == "new"


class TestDifficultyAdjustment:
    def test_high_accuracy_steps_up(self):
        assert adaptive.adjust_difficulty("easy", 0.9, attempts=4) == "medium"
        assert adaptive.adjust_difficulty("medium", 1.0, attempts=4) == "hard"

    def test_low_accuracy_steps_down(self):
        assert adaptive.adjust_difficulty("hard", 0.2, attempts=4) == "medium"
        assert adaptive.adjust_difficulty("medium", 0.0, attempts=4) == "easy"

    def test_clamped_at_bounds(self):
        assert adaptive.adjust_difficulty("hard", 1.0, attempts=4) == "hard"
        assert adaptive.adjust_difficulty("easy", 0.0, attempts=4) == "easy"

    def test_middling_accuracy_keeps_base(self):
        assert adaptive.adjust_difficulty("medium", 0.6, attempts=4) == "medium"

    def test_insufficient_evidence_keeps_base(self):
        assert adaptive.adjust_difficulty("easy", 1.0, attempts=2) == "easy"
        assert adaptive.adjust_difficulty("hard", None, attempts=0) == "hard"
