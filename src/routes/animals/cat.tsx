import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../../lib/supabase'
import { AnimalGrid } from '../../components/site/AnimalGrid'
import { Skeleton } from '../../components/ui/skeleton'
import type { AgeFilter } from '../../types/animal'

const PAGE_SIZE = 16

const searchSchema = z.object({
  page: z.number().int().positive().catch(1),
  filter: z.enum(['all', 'bb', 'adult', 'senior']).catch('all'),
})

export const Route = createFileRoute('/animals/cat')({
  validateSearch: searchSchema,
  component: CatListingPage,
})

function CatListingPage() {
  const { page, filter } = Route.useSearch()

  const { data, isLoading } = useQuery({
    queryKey: ['animals', 'cat', page, filter],
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE
      const to = from + PAGE_SIZE - 1
      const { data, count, error } = await supabase
        .from('animals')
        .select('*', { count: 'exact' })
        .eq('type', 'cat')
        .eq('status', 'available')
        .range(from, to)
      if (error) throw error
      return { animals: data ?? [], total: count ?? 0 }
    },
  })

  if (isLoading) return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="font-display text-3xl font-bold mb-8">待領養貓貓</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-xl overflow-hidden border border-[var(--color-border)]">
            <Skeleton className="aspect-square w-full rounded-none" />
            <div className="p-3 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <div className="flex gap-1">
                <Skeleton className="h-5 w-10 rounded-full" />
                <Skeleton className="h-5 w-12 rounded-full" />
              </div>
              <Skeleton className="h-8 w-full rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </main>
  )

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="font-display text-3xl font-bold mb-8">待領養貓貓</h1>
      <AnimalGrid
        animals={data?.animals ?? []}
        total={data?.total ?? 0}
        page={page}
        ageFilter={filter as AgeFilter}
        pageSize={PAGE_SIZE}
        animalLabel="貓"
      />
    </main>
  )
}
