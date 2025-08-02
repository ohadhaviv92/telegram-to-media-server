# Multi-stage build for production optimization
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++ pkgconfig pixman-dev cairo-dev pango-dev

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./
COPY nest-cli.json ./

# Install all dependencies (including devDependencies for building)
RUN npm i

# Copy source code
COPY src ./src
COPY package-lock.json ./

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Install runtime dependencies including Python and pip for guessit
RUN apk add --no-cache dumb-init python3 py3-pip make g++

# Install guessit Python package (using --break-system-packages for Alpine)
RUN pip3 install --break-system-packages guessit

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nestjs -u 1001

# Set working directory
WORKDIR /app

# Copy package files and npm config
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev || npm ci --omit=dev --legacy-peer-deps

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Switch to non-root user
USER nestjs

# Expose the port the app runs on
EXPOSE 4545

# Set environment to production
ENV NODE_ENV=production

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/main"]