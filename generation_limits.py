from datetime import datetime
from zoneinfo import ZoneInfo

DAILY_LIMIT = 2
TORONTO = ZoneInfo("America/Toronto")

RESERVE_SLOT = """
local used = tonumber(redis.call("GET", KEYS[1]) or "0")
if used >= tonumber(ARGV[1]) then
    return 0
end

redis.call("INCR", KEYS[1])
redis.call("EXPIRE", KEYS[1], 172800)
return 1
"""


def reserve_generation(db, browser_id):
    today = datetime.now(TORONTO).date().isoformat()
    key = f"pixefy:generations:{browser_id}:{today}"
    return db.eval(RESERVE_SLOT, keys=[key], args=[str(DAILY_LIMIT)]) == 1
