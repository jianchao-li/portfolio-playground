"""Rate-limit budgets: background prefetches can't use up a visitor's /compare budget."""
import pytest

from app.limiter import limiter

VOO = {"name": "VOO", "assets": [{"symbol": "VOO", "weight": 1.0}]}
BODY = {"portfolios": [VOO], "start_date": "2024-01-01", "end_date": "2024-06-30", "currency": "USD"}


@pytest.fixture
def limited(client):
    """The real limits (the autouse fixture disables them), with fresh counters."""
    limiter.reset()
    limiter.enabled = True
    yield client
    limiter.enabled = False
    limiter.reset()


def post(client, path):
    return client.post(f"/api/portfolio/{path}", json=BODY)


def test_prefetch_has_its_own_budget_and_spares_compare(limited):
    # The prefetch budget (10/minute) is limited...
    assert [post(limited, "prefetch").status_code for _ in range(10)] == [200] * 10
    blocked = post(limited, "prefetch")
    assert blocked.status_code == 429
    assert 1 <= int(blocked.headers["Retry-After"]) <= 61
    assert "Retry-After" in blocked.headers["Access-Control-Expose-Headers"]
    # ...and using it up leaves the visitor's whole /compare budget (20/minute)
    assert [post(limited, "compare").status_code for _ in range(20)] == [200] * 20
    assert post(limited, "compare").status_code == 429


def test_compare_traffic_does_not_drain_prefetch(limited):
    for _ in range(20):
        assert post(limited, "compare").status_code == 200
    assert post(limited, "compare").status_code == 429
    assert post(limited, "prefetch").status_code == 200


def test_prefetch_matches_compare(client):
    assert post(client, "prefetch").json() == post(client, "compare").json()


def test_successful_responses_are_unaffected_by_the_429_header_hook(limited):
    resp = post(limited, "compare")
    assert resp.status_code == 200 and "Retry-After" not in resp.headers
