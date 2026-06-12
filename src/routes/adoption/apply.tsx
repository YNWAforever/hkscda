import { createFileRoute, Link } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useState } from 'react'
import { PartyPopper } from 'lucide-react'
import { submitApplication } from '../../lib/api/submit-application.functions'

const formSchema = z.object({
  applicant_name: z.string().min(1, '請填寫姓名'),
  phone: z.string().min(8, '請填寫有效電話號碼'),
  email: z.string().email('請填寫有效電郵'),
  address: z.string().min(5, '請填寫完整住址'),
  housing_type: z.enum(['私人樓宇', '居屋', '公屋', '村屋', '其他']),
  family_size: z.number().int().positive().optional(),
  existing_pets: z.string().optional(),
  reason: z.string().min(10, '請填寫至少10個字的領養原因'),
  agree_terms: z.literal(true, { errorMap: () => ({ message: '請同意條款' }) }),
})

type FormValues = z.infer<typeof formSchema>

const searchSchema = z.object({
  animalId: z.string().optional(),
  animalName: z.string().optional(),
  type: z.string().optional(),
})

export const Route = createFileRoute('/adoption/apply')({
  validateSearch: searchSchema,
  component: ApplyPage,
})

function ApplyPage() {
  const { animalId, animalName, type } = Route.useSearch()
  const [success, setSuccess] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
  })

  async function onSubmit(values: FormValues) {
    setServerError(null)
    try {
      await submitApplication({
        data: {
          animal_id: animalId,
          animal_name: animalName ?? '未指定',
          animal_type: type ?? 'unknown',
          applicant_name: values.applicant_name,
          phone: values.phone,
          email: values.email,
          address: values.address,
          housing_type: values.housing_type,
          family_size: values.family_size,
          existing_pets: values.existing_pets,
          reason: values.reason,
        },
      })
      setSuccess(true)
    } catch {
      setServerError('提交失敗，請檢查網絡連接後再試，或直接 WhatsApp 9864 1089 聯絡我們。')
    }
  }

  if (success) {
    return (
      <main className="max-w-lg mx-auto px-4 py-16 text-center space-y-6">
        <PartyPopper className="h-16 w-16 text-[var(--color-primary)] mx-auto" />
        <h1 className="font-display text-2xl font-bold">申請已提交！</h1>
        <p className="text-[var(--color-text-muted)]">
          感謝您的申請，我們將盡快與您聯絡安排面見及家訪。
        </p>
        <Link
          to={type === 'sponsor' ? '/sponsors' : type === 'dog' ? '/animals/dog' : '/animals/cat'}
          className="inline-block px-6 py-3 bg-[var(--color-primary)] text-white rounded-full hover:bg-[var(--color-primary-hover)] transition-colors"
        >
          返回列表
        </Link>
      </main>
    )
  }

  const inputClass = "w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm bg-[var(--color-surface)] focus:outline-none focus:border-[var(--color-primary)]"

  return (
    <main className="max-w-lg mx-auto px-4 py-8">
      <h1 className="font-display text-2xl font-bold mb-2">
        {type === 'sponsor' ? '助養申請' : '領養申請'}
      </h1>
      {animalName && (
        <p className="text-[var(--color-text-muted)] mb-6">申請動物：{animalName}</p>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">申請人姓名 *</label>
          <input {...register('applicant_name')} className={inputClass} />
          {errors.applicant_name && <p className="text-[var(--color-error)] text-xs mt-1" role="alert">{errors.applicant_name.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">聯絡電話 *</label>
          <input {...register('phone')} type="tel" className={inputClass} />
          {errors.phone && <p className="text-[var(--color-error)] text-xs mt-1" role="alert">{errors.phone.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">電郵地址 *</label>
          <input {...register('email')} type="email" className={inputClass} />
          {errors.email && <p className="text-[var(--color-error)] text-xs mt-1" role="alert">{errors.email.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">住址 *</label>
          <input {...register('address')} className={inputClass} />
          {errors.address && <p className="text-[var(--color-error)] text-xs mt-1" role="alert">{errors.address.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">住宅類型 *</label>
          <select {...register('housing_type')} className={inputClass}>
            <option value="">請選擇</option>
            {(['私人樓宇', '居屋', '公屋', '村屋', '其他'] as const).map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          {errors.housing_type && <p className="text-[var(--color-error)] text-xs mt-1" role="alert">{errors.housing_type.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">家庭成員人數</label>
          <input {...register('family_size', { valueAsNumber: true })} type="number" min={1} className={inputClass} />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">家中現有寵物</label>
          <input {...register('existing_pets')} placeholder="如沒有請留空" className={inputClass} />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">領養原因 *</label>
          <textarea {...register('reason')} rows={4} className={inputClass} />
          {errors.reason && <p className="text-[var(--color-error)] text-xs mt-1" role="alert">{errors.reason.message}</p>}
        </div>

        <div className="flex items-start gap-2">
          <input {...register('agree_terms')} type="checkbox" id="agree_terms" className="mt-1 cursor-pointer" />
          <label htmlFor="agree_terms" className="text-sm text-[var(--color-text-muted)] cursor-pointer">
            我已閱讀並同意{' '}
            <Link to="/adoption/instructions" className="text-[var(--color-primary)] hover:underline" target="_blank">領養條款</Link>
          </label>
        </div>
        {errors.agree_terms && <p className="text-[var(--color-error)] text-xs" role="alert">{errors.agree_terms.message}</p>}

        {serverError && <p className="text-[var(--color-error)] text-sm" role="alert">{serverError}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 bg-[var(--color-primary)] text-white rounded-full font-semibold hover:bg-[var(--color-primary-hover)] transition-colors disabled:opacity-60"
        >
          {isSubmitting ? '提交中…' : '提交申請'}
        </button>
      </form>
    </main>
  )
}
