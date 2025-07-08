from dataclasses import dataclass

from centralserver.internals.adapters.config import (
    GoogleOAuthAdapterConfig,
    FacebookOAuthAdapterConfig,
    MicrosoftOAuthAdapterConfig,
)


@dataclass
class OAuthConfigs:
    google: GoogleOAuthAdapterConfig | None = None
    microsoft: MicrosoftOAuthAdapterConfig | None = None
    facebook: FacebookOAuthAdapterConfig | None = None
