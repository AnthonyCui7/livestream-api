import logging
import sys


def configure_logging(level: str = "INFO") -> None:
    """Send structured-ish logs to stdout so they land in CloudWatch / container logs.

    force=True lets this win over uvicorn's default handlers when called at startup.
    """
    logging.basicConfig(
        level=level.upper(),
        format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S%z",
        stream=sys.stdout,
        force=True,
    )
