#!/bin/bash
cd /home/z/my-project
bun install
bun run db:push

# Start WebSocket service
cd /home/z/my-project/mini-services/analysis-ws
bun install
bun run dev &
WS_PID=$!
echo "WebSocket service started (PID: $WS_PID)"

# Start Next.js
cd /home/z/my-project
bun run dev &
NEXT_PID=$!
echo "Next.js started (PID: $NEXT_PID)"

# Wait for services
wait $NEXT_PID
