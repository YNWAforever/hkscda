import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../../lib/supabase'
import { AnimalGrid } from '../../components/site/AnimalGrid'
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
    <div className="max-w-6xl mx-auto px-4 py-12 text-center text-[var(--color-text-muted)]">載入中…</div>
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
