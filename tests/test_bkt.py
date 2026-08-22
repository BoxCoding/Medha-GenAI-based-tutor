"""Unit tests for the Bayesian Knowledge Tracing engine."""
import pytest
from backend.app import bkt


class TestUpdate:
    def test_correct_answer_raises_mastery(self):
        result = bkt.update(0.3, is_correct=True)
        assert result.posterior > 0.3

    def test_wrong_answer_lowers_mastery_when_transit_is_small(self):
        # A wrong hard answer at a high prior should reduce belief.
        result = bkt.update(0.8, is_correct=False, difficulty="hard")
        assert result.posterior < 0.8

    def test_repeated_correct_answers_converge_to_mastery(self):
        mastery = bkt.initial_mastery("beginner")
        for _ in range(10):
            mastery = bkt.update(mastery, is_correct=True, difficulty="medium").posterior
        assert mastery >= bkt.MASTERY_THRESHOLD

    def test_repeated_wrong_answers_stay_low(self):
        mastery = 0.5
        for _ in range(10):
            mastery = bkt.update(mastery, is_correct=False, difficulty="medium").posterior
        assert mastery < 0.5

    def test_hard_correct_teaches_more_than_easy_correct(self):
        easy = bkt.update(0.4, is_correct=True, difficulty="easy").posterior
        hard = bkt.update(0.4, is_correct=True, difficulty="hard").posterior
        assert hard > easy

    def test_posterior_is_a_probability(self):
        for prior in (0.01, 0.3, 0.7, 0.99):
            for correct in (True, False):
                posterior = bkt.update(prior, correct).posterior
                assert 0.0 < posterior < 1.0

    def test_unknown_difficulty_falls_back_to_medium(self):
        assert (
            bkt.update(0.4, True, "bogus").posterior
            == bkt.update(0.4, True, "medium").posterior
        )


class TestDecay:
    def test_no_time_no_decay(self):
        assert bkt.decayed_mastery(0.9, 0.0) == pytest.approx(0.9)

    def test_high_mastery_decays_toward_half(self):
        decayed = bkt.decayed_mastery(0.95, days_since_update=30)
        assert 0.5 < decayed < 0.95

    def test_low_mastery_rises_toward_half(self):
        decayed = bkt.decayed_mastery(0.1, days_since_update=30)
        assert 0.1 < decayed < 0.5

    def test_half_life(self):
        decayed = bkt.decayed_mastery(0.9, bkt.DECAY_HALF_LIFE_DAYS)
        assert decayed == pytest.approx(0.5 + 0.4 / 2, abs=1e-6)


class TestDifficultyPolicy:
    @pytest.mark.parametrize(
        "mastery,expected",
        [(0.1, "easy"), (0.39, "easy"), (0.5, "medium"), (0.69, "medium"), (0.9, "hard")],
    )
    def test_difficulty_bands(self, mastery, expected):
        assert bkt.difficulty_for(mastery) == expected

    def test_initial_mastery_by_level(self):
        assert (
            bkt.initial_mastery("beginner")
            < bkt.initial_mastery("intermediate")
            < bkt.initial_mastery("advanced")
        )
