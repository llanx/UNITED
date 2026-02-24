# UNITED Coordination Server — Multi-stage Docker Build
# Uses cargo-chef for dependency caching (see 01-RESEARCH.md)
# Runtime: debian-slim with only the binary + data directory
# Port: 1984 (reclaiming Big Brother's IANA-registered port)

# ---------- Stage 1: Chef planner ----------
FROM rust:1-slim-bookworm AS chef
RUN cargo install cargo-chef
WORKDIR /app

# ---------- Stage 2: Prepare recipe ----------
FROM chef AS planner
# Copy full source for dependency analysis
COPY server/ server/
COPY shared/ shared/
WORKDIR /app/server
RUN cargo chef prepare --recipe-path recipe.json

# ---------- Stage 3: Build dependencies (cached) ----------
FROM chef AS builder

# Install protobuf compiler (required by prost-build)
RUN apt-get update && apt-get install -y protobuf-compiler && rm -rf /var/lib/apt/lists/*

# Copy recipe and cook dependencies (this layer is cached unless deps change)
COPY --from=planner /app/server/recipe.json /app/server/recipe.json
COPY shared/ /app/shared/
WORKDIR /app/server
RUN cargo chef cook --release --recipe-path recipe.json

# Copy actual source and build
COPY server/ /app/server/
RUN cargo build --release

# ---------- Stage 4: Runtime ----------
FROM debian:bookworm-slim AS runtime

# Install minimal runtime dependencies (OpenSSL, CA certs)
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN useradd --create-home --shell /bin/bash united

# Create data directory
RUN mkdir -p /data && chown united:united /data

# Copy the built binary
COPY --from=builder /app/server/target/release/united-server /usr/local/bin/united-server

# Switch to non-root user
USER united

# Set default data directory
ENV UNITED_DATA_DIR=/data
ENV UNITED_BIND_ADDRESS=0.0.0.0
ENV UNITED_PORT=1984

# Expose the UNITED port
EXPOSE 1984

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:1984/health || exit 1

# Entry point
ENTRYPOINT ["united-server"]
