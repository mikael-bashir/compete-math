# Leak Lab CAS. Build context is services/leak-lab (see docker-compose.yml).
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1 HOME=/tmp
WORKDIR /app
COPY lab_cas/requirements.txt /tmp/requirements.txt
RUN pip install -r /tmp/requirements.txt && rm /tmp/requirements.txt \
 && useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin lab
COPY lab_common /app/lab_common
COPY lab_cas /app/lab_cas
# The image refuses to build if the tools do not do what their descriptions say.
RUN python -m lab_cas.selftest
USER 10001:10001
ENV LAB_HOST=0.0.0.0 LAB_PORT=8021
EXPOSE 8021
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
  CMD python -c "import socket; socket.create_connection(('127.0.0.1', 8021), 3).close()"
CMD ["python", "-m", "lab_cas.server"]
