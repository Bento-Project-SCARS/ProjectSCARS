from localserver.internals import db_handler


def test_db_repopulation() -> None:
    """Check the behavior of populate_db() when database is already populated."""

    # The database should be populated already
    assert db_handler.populate_db() is False
