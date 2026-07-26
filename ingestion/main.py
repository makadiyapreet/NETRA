"""
CLI entry point for manual runs of the ingestion layer.

Usage:
    python -m ingestion.main simulate --count 200
    python -m ingestion.main crawl --all
    python -m ingestion.main crawl --platform twitter
    python -m ingestion.main trending --geo "Ahmedabad, Gujarat"
"""

from __future__ import annotations

import argparse
import logging
import sys

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s │ %(levelname)-8s │ %(name)s │ %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("ingestion.main")


def cmd_simulate(args: argparse.Namespace) -> None:
    """Run the simulator connector and push synthetic data to Kafka."""
    from ingestion.config import get_settings
    from ingestion.connectors.simulator import SimulatorConnector
    from ingestion.db.watchlist_crud import ActiveWatchlist
    from ingestion.monitoring.metrics import start_metrics_server
    from ingestion.trending import trending_hashtags

    settings = get_settings()

    # Start metrics server
    try:
        start_metrics_server(settings.metrics_port)
    except Exception:
        pass  # may fail if port is in use

    sim = SimulatorConnector(count=args.count)
    watchlist = ActiveWatchlist()  # empty — simulator doesn't need it

    logger.info("🚀 Starting simulator: generating %d posts...", args.count)
    result = sim.run(watchlist, settings)

    logger.info(
        "✅ Simulation complete: fetched=%d published=%d deduped=%d errors=%d",
        result.posts_fetched,
        result.posts_published,
        result.posts_deduped,
        result.errors,
    )


def cmd_crawl(args: argparse.Namespace) -> None:
    """Run connectors against real APIs or simulator."""
    from ingestion.scheduler.tasks import crawl_all, crawl_platform

    if args.platform:
        logger.info("🕷  Crawling platform: %s", args.platform)
        result = crawl_platform(args.platform)
    else:
        logger.info("🕷  Crawling all platforms...")
        result = crawl_all()

    logger.info("Result: %s", result)


def cmd_trending(args: argparse.Namespace) -> None:
    """Show current trending hashtags for a geo area."""
    from ingestion.trending.trending_hashtags import print_trending

    print_trending(geo_area=args.geo, top_k=args.top)


def cmd_spike(args: argparse.Namespace) -> None:
    """Run spike detection manually."""
    from ingestion.scheduler.tasks import run_spike_detection

    logger.info("🔍 Running spike detection...")
    result = run_spike_detection()
    logger.info("Result: %s", result)


def main() -> None:
    """Parse CLI arguments and dispatch."""
    parser = argparse.ArgumentParser(
        prog="ingestion",
        description="NETRA — Ingestion Layer CLI",
    )
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # simulate
    sim_parser = subparsers.add_parser("simulate", help="Generate synthetic data")
    sim_parser.add_argument(
        "--count", type=int, default=100, help="Number of posts to generate"
    )

    # crawl
    crawl_parser = subparsers.add_parser("crawl", help="Run platform connectors")
    crawl_parser.add_argument("--platform", type=str, help="Specific platform to crawl")
    crawl_parser.add_argument("--all", action="store_true", help="Crawl all platforms")

    # trending
    trend_parser = subparsers.add_parser("trending", help="Show trending hashtags")
    trend_parser.add_argument(
        "--geo", type=str, default="Ahmedabad, Gujarat", help="Geo area"
    )
    trend_parser.add_argument("--top", type=int, default=20, help="Top K results")

    # spike
    spike_parser = subparsers.add_parser("spike", help="Run spike detection")

    args = parser.parse_args()

    if args.command == "simulate":
        cmd_simulate(args)
    elif args.command == "crawl":
        cmd_crawl(args)
    elif args.command == "trending":
        cmd_trending(args)
    elif args.command == "spike":
        cmd_spike(args)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
