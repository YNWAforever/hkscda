import { Link } from '@tanstack/react-router'
import type { Animal } from '../../types/animal'

interface AnimalCardProps {
  animal: Animal
}

export function AnimalCard({ animal }: AnimalCardProps) {
  const detailHref =
    animal.type === 'sponsor'
      ? `/sponsors/${animal.id}`
      : `/animals/${animal.type}/${animal.id}`

  const ctaLabel = animal.type === 'sponsor' ? '立即助養' : '申請領養'

  const placeholder = animal.type === 'dog' ? '🐶' : '🐱'
  const placeholderBg = animal.type === 'dog' ? 'var(--color-dog-bg)' : 'var(--color-cat-bg)'

  return (
    <div className="bg-[var(--color-surface)] rounded-xl overflow-hidden border border-[var(--color-border)] flex flex-col hover:shadow-md transition-shadow">
      <Link to={detailHref} className="block">
        {animal.image_url ? (
          <img
            src={animal.image_url}
            alt={animal.name}
            className="w-full aspect-square object-cover"
          />
        ) : (
          <div
            className="w-full aspect-square flex items-center justify-center text-5xl"
            style={{ background: placeholderBg }}
          >
            {placeholder}
          </div>
        )}
      </Link>

      <div className="p-3 flex flex-col gap-2 flex-1">
        <div className="font-semibold text-[var(--color-text)]">{animal.name}</div>

        <div className="flex flex-wrap gap-1">
          <span className="px-2 py-0.5 rounded-full text-xs bg-[var(--color-surface-offset)] text-[var(--color-text-muted)]">
            {animal.gender === 'male' ? '公' : '母'}
          </span>
          <span className="px-2 py-0.5 rounded-full text-xs bg-[var(--color-surface-offset)] text-[var(--color-text-muted)]">
            {animal.age}
          </span>
          {animal.notes && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-[var(--color-primary-highlight)] text-[var(--color-primary)]">
              {animal.notes}
            </span>
          )}
        </div>

        <Link
          to={detailHref}
          className="mt-auto text-center text-xs py-1.5 px-3 rounded-full border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white transition-colors"
        >
          {ctaLabel} →
        </Link>
      </div>
    </div>
  )
}
