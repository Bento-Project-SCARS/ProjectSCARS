from slowapi import Limiter
from slowapi.util import get_remote_address

# give this variable its own module
# so that it is globally accessible.
limiter = Limiter(key_func=get_remote_address)
