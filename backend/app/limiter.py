import time

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.responses import Response

# Requests a visitor's own actions may make per IP (each endpoint has its own budget)
INTERACTIVE_LIMIT = "20/minute"
# Background preset prefetch (/prefetch): a separate, smaller budget
PREFETCH_LIMIT = "10/minute"


class AppLimiter(Limiter):
    """slowapi Limiter that adds Retry-After to 429 responses only.

    slowapi's headers_enabled would also inject X-RateLimit-* headers into
    successful responses, which requires every endpoint to take a `response`
    argument. Here only the 429 built by the RateLimitExceeded handler gets a
    Retry-After (seconds until the window resets), exposed to browsers so the
    frontend can say how long to wait.
    """

    def _inject_headers(self, response, current_limit):
        if (not self.enabled or current_limit is None or not isinstance(response, Response)
                or response.status_code != 429):
            return response
        try:
            reset_at, _remaining = self.limiter.get_window_stats(current_limit[0], *current_limit[1])
            response.headers["Retry-After"] = str(max(1, int(reset_at - time.time()) + 1))
            response.headers["Access-Control-Expose-Headers"] = "Retry-After"
        except Exception:  # never fail the 429 itself because of a header
            pass
        return response


limiter = AppLimiter(key_func=get_remote_address)
