import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { AnimalDetail } from '../../components/site/AnimalDetail'

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
    <div className="max-w-4xl mx-auto px-4 py-12 text-center text-[var(--color-text-muted)]">載入中…</div>
  )

  if (!animal || animal.status !== 'available') {
    return (
      <main className="max-w-4xl mx-auto px-4 py-12 text-center space-y-4">
        <p className="text-xl text-[var(--color-text-muted)]">此動物已被領養 🎉</p>
        <Link to="/animals/cat" className="text-[var(--color-primary)] hover:underline">← 返回貓貓列表</Link>
      </main>
    )
  }

  return <AnimalDetail animal={animal} backHref="/animals/cat" backLabel="返回貓貓列表" />
}
