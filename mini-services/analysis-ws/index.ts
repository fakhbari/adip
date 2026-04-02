// Analysis WebSocket Service
// Provides real-time notifications for repository analysis progress

import { createServer } from 'http'
import { Server, Socket } from 'socket.io'

const httpServer = createServer()
const io = new Server(httpServer, {
  // DO NOT change the path, it is used by Caddy to forward the request to the correct port
  path: '/',
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

// Types for analysis events
interface AnalysisProgressEvent {
  analysisRunId: string
  repositoryId: string
  progress: {
    agentId: string
    agentType: string
    status: string
    progress: number
    message: string
    timestamp: string
  }
}

interface AnalysisCompleteEvent {
  analysisRunId: string
  repositoryId: string
  status: string
  results: any[]
  duration: number
  documentsGenerated: number
}

interface AnalysisErrorEvent {
  analysisRunId: string
  repositoryId: string
  error: string
  agentType?: string
}

// Room management - each analysis run gets its own room
const analysisRooms = new Map<string, Set<string>>()

// Helper to get or create a room
function getOrCreateRoom(analysisRunId: string): Set<string> {
  if (!analysisRooms.has(analysisRunId)) {
    analysisRooms.set(analysisRunId, new Set())
  }
  return analysisRooms.get(analysisRunId)!
}

io.on('connection', (socket: Socket) => {
  console.log(`Client connected: ${socket.id}`)

  // Join an analysis room to receive updates for a specific analysis run
  socket.on('join-analysis', (data: { analysisRunId: string; repositoryId: string }) => {
    const { analysisRunId, repositoryId } = data
    
    // Join the room
    socket.join(`analysis:${analysisRunId}`)
    
    // Track the socket in our room management
    const room = getOrCreateRoom(analysisRunId)
    room.add(socket.id)
    
    console.log(`Client ${socket.id} joined analysis room: ${analysisRunId}`)
    
    // Confirm join
    socket.emit('joined-analysis', {
      analysisRunId,
      repositoryId,
      message: `Joined analysis room for run ${analysisRunId}`
    })
  })

  // Leave an analysis room
  socket.on('leave-analysis', (data: { analysisRunId: string }) => {
    const { analysisRunId } = data
    
    socket.leave(`analysis:${analysisRunId}`)
    
    const room = analysisRooms.get(analysisRunId)
    if (room) {
      room.delete(socket.id)
      if (room.size === 0) {
        analysisRooms.delete(analysisRunId)
      }
    }
    
    console.log(`Client ${socket.id} left analysis room: ${analysisRunId}`)
  })

  // Subscribe to all analysis events for a repository
  socket.on('subscribe-repository', (data: { repositoryId: string }) => {
    socket.join(`repository:${data.repositoryId}`)
    console.log(`Client ${socket.id} subscribed to repository: ${data.repositoryId}`)
    
    socket.emit('subscribed-repository', {
      repositoryId: data.repositoryId,
      message: `Subscribed to repository ${data.repositoryId}`
    })
  })

  // Unsubscribe from repository events
  socket.on('unsubscribe-repository', (data: { repositoryId: string }) => {
    socket.leave(`repository:${data.repositoryId}`)
    console.log(`Client ${socket.id} unsubscribed from repository: ${data.repositoryId}`)
  })

  // Internal API: Emit progress update (called from orchestrator)
  socket.on('analysis-progress', (data: AnalysisProgressEvent) => {
    io.to(`analysis:${data.analysisRunId}`).emit('analysis-progress', data)
    io.to(`repository:${data.repositoryId}`).emit('analysis-progress', data)
    console.log(`Progress update for ${data.analysisRunId}: ${data.progress.progress}% - ${data.progress.message}`)
  })

  // Internal API: Emit completion event
  socket.on('analysis-complete', (data: AnalysisCompleteEvent) => {
    io.to(`analysis:${data.analysisRunId}`).emit('analysis-complete', data)
    io.to(`repository:${data.repositoryId}`).emit('analysis-complete', data)
    console.log(`Analysis ${data.analysisRunId} completed with status: ${data.status}`)
    
    // Clean up room after a delay
    setTimeout(() => {
      const room = analysisRooms.get(data.analysisRunId)
      if (room) {
        for (const socketId of room) {
          const s = io.sockets.sockets.get(socketId)
          if (s) {
            s.leave(`analysis:${data.analysisRunId}`)
          }
        }
        analysisRooms.delete(data.analysisRunId)
      }
    }, 30000) // Clean up after 30 seconds
  })

  // Internal API: Emit error event
  socket.on('analysis-error', (data: AnalysisErrorEvent) => {
    io.to(`analysis:${data.analysisRunId}`).emit('analysis-error', data)
    io.to(`repository:${data.repositoryId}`).emit('analysis-error', data)
    console.error(`Analysis ${data.analysisRunId} error: ${data.error}`)
  })

  // Ping/pong for connection health
  socket.on('ping', () => {
    socket.emit('pong', { timestamp: new Date().toISOString() })
  })

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`)
    
    // Clean up rooms
    for (const [analysisRunId, room] of analysisRooms.entries()) {
      if (room.has(socket.id)) {
        room.delete(socket.id)
        if (room.size === 0) {
          analysisRooms.delete(analysisRunId)
        }
      }
    }
  })

  socket.on('error', (error) => {
    console.error(`Socket error (${socket.id}):`, error)
  })
})

// REST endpoint for internal API to emit events
// This allows the orchestrator to send notifications via HTTP
import { createServer as createHttpServer, IncomingMessage, ServerResponse } from 'http'

// Handle REST API for internal notifications
httpServer.on('request', (req: IncomingMessage, res: ServerResponse) => {
  if (req.method === 'POST' && req.url?.startsWith('/notify/')) {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      try {
        const data = JSON.parse(body)
        const [, action] = req.url!.split('/').slice(2)
        
        switch (action) {
          case 'progress':
            io.to(`analysis:${data.analysisRunId}`).emit('analysis-progress', data)
            io.to(`repository:${data.repositoryId}`).emit('analysis-progress', data)
            break
          case 'complete':
            io.to(`analysis:${data.analysisRunId}`).emit('analysis-complete', data)
            io.to(`repository:${data.repositoryId}`).emit('analysis-complete', data)
            break
          case 'error':
            io.to(`analysis:${data.analysisRunId}`).emit('analysis-error', data)
            io.to(`repository:${data.repositoryId}`).emit('analysis-error', data)
            break
          default:
            console.warn(`Unknown notification action: ${action}`)
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true }))
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid JSON' }))
      }
    })
  } else {
    res.writeHead(404)
    res.end()
  }
})

const PORT = 3003
httpServer.listen(PORT, () => {
  console.log(`Analysis WebSocket service running on port ${PORT}`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM signal, shutting down server...')
  httpServer.close(() => {
    console.log('WebSocket server closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('Received SIGINT signal, shutting down server...')
  httpServer.close(() => {
    console.log('WebSocket server closed')
    process.exit(0)
  })
})
