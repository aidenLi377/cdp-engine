from __future__ import annotations

from cdp_backend.app_factory import create_app, is_production

app, engine = create_app()
IS_PRODUCTION = is_production()


if __name__ == "__main__":
    app.run(
        debug=not IS_PRODUCTION,
        host="127.0.0.1",
        port=5000,
    )
