"""DATABASE_URL checks. No database needed: these run without Docker."""
import pytest

from app.db import describe_url_problem

GOOD = "postgresql://postgres.abcdefghijklmnopqrst:s3cret@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require"


def test_a_correct_pooler_url_passes():
    assert describe_url_problem(GOOD, serverless=True) is None


@pytest.mark.parametrize("value, phrase", [
    ("", "empty"),
    (GOOD + " ", "start or end"),
    (f'"{GOOD}"', "quotes"),
    (GOOD.replace("s3cret", "[YOUR-PASSWORD]"), "placeholder"),
    (GOOD.replace("s3cret", "YOURPASSWORD"), "placeholder"),
    (GOOD.replace("postgres.abcdefghijklmnopqrst", "postgres"), "including the dot"),
    (GOOD.replace(":6543", ":5432"), "6543"),
    ("postgresql://postgres:s3cret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres", "direct"),
    (GOOD.replace("postgresql://", "https://"), "postgresql://"),
    (GOOD.replace(":s3cret", ""), "no password"),
])
def test_common_mistakes_are_explained_without_repeating_the_value(value, phrase):
    problem = describe_url_problem(value, serverless=True)
    assert problem and phrase in problem
    assert "s3cret" not in problem and "abcdefghijklmnopqrst" not in problem


def test_session_pooler_port_is_fine_locally():
    assert describe_url_problem(GOOD.replace(":6543", ":5432"), serverless=False) is None


def test_settings_trim_pasted_whitespace(monkeypatch):
    from app.config import Settings
    monkeypatch.setenv("DATABASE_URL", "\n" + GOOD + " \n")
    monkeypatch.setenv("SUPABASE_URL", " https://abcdefghijklmnopqrst.supabase.co\n")
    settings = Settings(_env_file=None)
    assert settings.database_url == GOOD
    assert settings.supabase_url == "https://abcdefghijklmnopqrst.supabase.co"
    assert describe_url_problem(settings.database_url, serverless=True) is None
