import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { appLogger } from '@/lib/logger'

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      appLogger.error('react-query.query', 'Query failed', error, {
        queryHash: query.queryHash,
      })
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      appLogger.error('react-query.mutation', 'Mutation failed', error, {
        mutationKey: mutation.options.mutationKey,
      })
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
