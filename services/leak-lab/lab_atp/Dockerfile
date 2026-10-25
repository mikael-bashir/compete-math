# Leak Lab ATP: Vampire built from a pinned source commit, plus Z3 (python wheel). Build context is services/leak-lab.
# Vampire is built WITHOUT its own Z3 integration (that needs a second source build); Z3 is offered separately by smt_check and sat_check.
ARG VAMPIRE_REF=v5.1.0
ARG VAMPIRE_COMMIT=7b2f410ec4430c26217a85db62cf0c4a97042f8d

FROM debian:bookworm-slim AS vampire-build
ARG VAMPIRE_REF
ARG VAMPIRE_COMMIT
RUN apt-get update && apt-get install -y --no-install-recommends build-essential cmake git ca-certificates zlib1g-dev \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN git clone --branch "${VAMPIRE_REF}" https://github.com/vprover/vampire.git vampire \
 && cd vampire && test "$(git rev-parse HEAD)" = "${VAMPIRE_COMMIT}" \
 || (echo "Vampire ${VAMPIRE_REF} is not commit ${VAMPIRE_COMMIT}: refusing to build an unpinned source" && exit 1)
WORKDIR /src/vampire
RUN cmake -S . -B build -DCMAKE_BUILD_TYPE=Release \
 && cmake --build build -j"$(nproc)"
# The binary: CMake leaves it as build/vampire (found, not assumed, so a different layout fails here with a clear message).
RUN exe="$(find build -maxdepth 2 -type f -name vampire -perm -u+x | head -n 1)" \
 && test -n "$exe" || (echo "no vampire executable under build/" && find build -maxdepth 2 -type f -perm -u+x | head && exit 1) \
 && mkdir -p /out && cp "$exe" /out/vampire && strip /out/vampire \
 && /out/vampire --version

# Debian 13 (glibc 2.41), not 12: the z3-solver wheel for linux/arm64 is tagged manylinux_2_38 and bookworm's glibc is 2.36, so on bookworm pip
# falls back to compiling Z3 and fails. Vampire is built on bookworm (older glibc and libstdc++) and runs here, since a newer libc runs older binaries.
FROM python:3.12-slim-trixie
ENV HOME=/tmp PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1 VAMPIRE_BIN=/opt/vampire/bin/vampire
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 zlib1g && rm -rf /var/lib/apt/lists/*
COPY --from=vampire-build /out/vampire /opt/vampire/bin/vampire
COPY lab_atp/requirements.txt /tmp/requirements.txt
RUN pip install -r /tmp/requirements.txt && rm /tmp/requirements.txt \
 && useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin lab
COPY lab_common /app/lab_common
COPY lab_atp /app/lab_atp
# The image refuses to build if the real Vampire does not accept the options we allow, or does not answer the documented examples.
RUN python -m lab_atp.selftest
USER 10001:10001
ENV LAB_HOST=0.0.0.0 LAB_PORT=8022
EXPOSE 8022
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
  CMD python -c "import socket; socket.create_connection(('127.0.0.1', 8022), 3).close()"
CMD ["python", "-m", "lab_atp.server"]
