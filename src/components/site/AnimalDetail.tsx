import { Link } from '@tanstack/react-router'
import type { Animal } from '../../types/animal'

interface AnimalDetailProps {
  animal: Animal
  backHref: string
  backLabel: string
}

export function AnimalDetail({ animal, backHref, backLabel }: AnimalDetailProps) {
  const ctaLabel = animal.type === 'sponsor' ? '立即助養' : '申請領養'
  const applyHref = `/adoption/apply?animalId=${animal.id}&animalName=${encodeURIComponent(animal.name)}&type=${animal.type}`
  const placeholder = animal.type === 'dog' ? '🐶' : '🐱'
  const placeholderBg = animal.type === 'dog' ? 'var(--color-dog-bg)' : 'var(--color-cat-bg)'

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <Link to={backHref} className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)] flex items-center gap-1">
        ← {backLabel}
      </Link>

      <div className="grid md:grid-cols-2 gap-8 items-start">
        {/* Photo */}
        <div className="rounded-2xl overflow-hidden">
          {animal.image_url ? (
            <img
              src={animal.image_url}
              alt={animal.name}
              className="w-full aspect-square object-cover"
            />
          ) : (
            <div
              className="w-full aspect-square flex items-center justify-center text-[100px]"
              style={{ background: placeholderBg }}
            >
              {placeholder}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="space-y-4">
          <h1 className="font-display text-3xl font-bold">{animal.name}</h1>
          {animal.name_en && (
            <p className="text-[var(--color-text-muted)]">{animal.name_en}</p>
          )}

          <div className="flex flex-wrap gap-2">
            <span className="px-3 py-1 rounded-full text-sm bg-[var(--color-surface-offset)]">
              {animal.gender === 'male' ? '公' : '母'}
            </span>
            <span className="px-3 py-1 rounded-full text-sm bg-[var(--color-surface-offset)]">
              {animal.age}
            </span>
            {animal.notes && (
              <span className="px-3 py-1 rounded-full text-sm bg-[var(--color-primary-highlight)] text-[var(--color-primary)]">
                {animal.notes}
              </span>
            )}
          </div>

          {animal.description && (
            <p className="text-[var(--color-text-muted)] leading-relaxed">{animal.description}</p>
          )}

          <div className="flex flex-col gap-2 pt-2">
            <Link
              to={applyHref}
              className="text-center py-3 rounded-full bg-[var(--color-primary)] text-white font-semibold hover:bg-[var(--color-primary-hover)] transition-colors"
            >
              📩 {ctaLabel}
            </Link>
            <Link
              to={backHref}
              className="text-center py-3 rounded-full border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary-highlight)] transition-colors"
            >
              ← {backLabel}
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
