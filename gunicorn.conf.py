"""Gunicorn production configuration.

Usage:
    gunicorn -c gunicorn.conf.py app:app

For Windows, use waitress instead:
    waitress-serve --port=5000 app:app
"""

bind = "127.0.0.1:5000"

# SQLite serialises writes — keep worker count low
workers = 2
worker_class = "sync"

# batch_generate can take a while
timeout = 120

# Logging
accesslog = "-"
errorlog = "-"
loglevel = "info"
