import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Note: 'query' logging is intentionally disabled — it leaks SQL arg values
// (including secrets we write into RepositoryConnection / AIProvider) to stdout.
// Use ['warn', 'error'] in dev only.
const logLevels: ('query' | 'info' | 'warn' | 'error')[] =
  process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error']

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: logLevels,
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db