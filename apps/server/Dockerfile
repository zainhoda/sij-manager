FROM oven/bun:1 AS base
WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install --frozen-lockfile --production

# Copy source
COPY . .

# Cloud Run uses PORT env variable (defaults to 8080)
ENV PORT=8080
EXPOSE 8080

CMD ["bun", "run", "start"]
