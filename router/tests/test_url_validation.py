import pytest

from app.routes.projects import derive_project_name, validate_source_url

VALID_URLS = [
    "https://twitch.tv/somechannel",
    "https://www.twitch.tv/somechannel",
    "https://m.twitch.tv/somechannel",
    "https://youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ",
    # `&` is literal inside the double-quoted bash string and shows up in
    # ordinary copied YouTube URLs (tracking/playlist params).
    "https://www.youtube.com/watch?v=iApx5HpjjLk&pp=ygUGbWJhcHBl",
]

INVALID_URLS = [
    # Wrong scheme.
    "http://twitch.tv/somechannel",
    "ftp://twitch.tv/somechannel",
    "twitch.tv/somechannel",
    "",
    # Host not on the allowlist.
    "https://evil.com/watch?v=x",
    "https://twitch.tv.evil.com/somechannel",
    "https://nottwitch.tv/somechannel",
    "https://youtu.be.evil.com/x",
    # Allowlisted host reached via userinfo trickery — hostname is evil.com.
    "https://twitch.tv@evil.com/somechannel",
    # Shell-dangerous characters (this string lands in double-quoted bash).
    'https://twitch.tv/a"; rm -rf /',
    "https://twitch.tv/$(reboot)",
    "https://twitch.tv/`whoami`",
    "https://twitch.tv/a;b",
    "https://twitch.tv/a|b",
    "https://twitch.tv/a b",
    "https://twitch.tv/a'b",
    "https://twitch.tv/a\\b",
    "https://twitch.tv/a<b",
    "https://twitch.tv/a>b",
    'https://twitch.tv/a"b',
    "https://twitch.tv/$HOME",
]


@pytest.mark.parametrize("url", VALID_URLS)
def test_valid_urls_pass(url):
    validate_source_url(url)  # must not raise


@pytest.mark.parametrize("url", INVALID_URLS)
def test_invalid_urls_rejected(url):
    with pytest.raises(ValueError):
        validate_source_url(url)


def test_derive_project_name():
    assert derive_project_name("https://www.twitch.tv/somechannel") == "Twitch: somechannel"
    assert derive_project_name("https://twitch.tv/chan/videos") == "Twitch: chan"
    assert derive_project_name("https://twitch.tv/") == "Twitch stream"
    assert derive_project_name("https://www.youtube.com/watch?v=abc") == "YouTube video"
    assert derive_project_name("https://youtu.be/abc") == "YouTube video"
