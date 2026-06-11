import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { PartyPopper } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { AnimalDetail } from '../../components/site/AnimalDetail'
import { Skeleton } from '../../components/ui/skeleton'

export const Route = createFileRoute('/animals/cat_/$id')({
  component: CatDetailPage,
})

function CatDetailPage() {
  const { id } = Route.useParams()

  const { data: animal, isLoading } = useQuery({
    queryKey: ['animal', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('animals')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      return data
    },
  })

  if (isLoading) return (
    <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <Skeleton className="h-4 w-24" />
      <div className="grid md:grid-cols-2 gap-8">
        <Skeleton className="aspect-square w-full rounded-2xl" />
        <div className="space-y-4">
          <Skeleton className="h-8 w-3/4" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-12 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-12 w-full rounded-full" />
        </div>
      </div>
    </main>
  )

  if (!animal || animal.status !== 'available') {
    return (
      <main className="max-w-4xl mx-auto px-4 py-12 text-center space-y-4">
        <PartyPopper className="h-12 w-12 text-[var(--color-primary)] mx-auto" />
        <p className="text-xl text-[var(--color-text-muted)]">此動物已被領養</p>
        <Link to="/animals/cat" className="text-[var(--color-primary)] hover:underline">← 返回貓貓列表</Link>
      </main>
    )
  }

  return <AnimalDetail animal={animal} backHref="/animals/cat" backLabel="返回貓貓列表" />
}
