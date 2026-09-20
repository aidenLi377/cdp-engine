"""Gunicorn production configuration.

Usage:
    gunicorn -c gunicorn.conf.py app:app

For Windows, use waitress instead:
    waitress-serve --port=5000 app:app
"""

bind = "127.0.0.1:5000"

# SQLite serialises writes — keep worker count low
workers = 2
worker_class = "gthread"
threads = 4
keepalive = 5

# batch_generate can take a while
timeout = 120

# Gunicorn 26 enables a per-user control socket by default. The production
# systemd service has no login runtime directory and does not use that socket,
# so disable it instead of emitting a harmless permission error at every boot.
control_socket_disable = True

# Logging
accesslog = "-"
errorlog = "-"
loglevel = "info"
