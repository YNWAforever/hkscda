import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Animal } from '../../types/animal'

const animalSchema = z.object({
  name: z.string().min(1, '請填寫名字'),
  name_en: z.string().optional(),
  type: z.enum(['cat', 'dog', 'sponsor']),
  gender: z.enum(['male', 'female']),
  age: z.string().min(1, '請填寫年齡'),
  notes: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(['available', 'adopted', 'fostered']),
})

type FormValues = z.infer<typeof animalSchema>

interface AnimalFormProps {
  existing?: Animal
}

export function AnimalForm({ existing }: AnimalFormProps) {
  const navigate = useNavigate()
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(animalSchema),
    defaultValues: existing
      ? {
          name: existing.name,
          name_en: existing.name_en ?? '',
          type: existing.type,
          gender: existing.gender,
          age: existing.age,
          notes: existing.notes ?? '',
          description: existing.description ?? '',
          status: existing.status,
        }
      : { type: 'cat', gender: 'female', status: 'available' },
  })

  async function onSubmit(values: FormValues) {
    setSaving(true)
    setError(null)

    let image_url = existing?.image_url ?? null

    if (imageFile) {
      const animalId = existing?.id ?? crypto.randomUUID()
      const { error: uploadError } = await supabase.storage
        .from('animal-images')
        .upload(`${animalId}.jpg`, imageFile, { upsert: true })
      if (uploadError) {
        setError('圖片上載失敗')
        setSaving(false)
        return
      }
      const { data: urlData } = supabase.storage.from('animal-images').getPublicUrl(`${animalId}.jpg`)
      image_url = urlData.publicUrl
    }

    if (existing) {
      const { error: updateError } = await supabase
        .from('animals')
        .update({ ...values, image_url, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
      if (updateError) {
        setError('儲存失敗')
        setSaving(false)
        return
      }
    } else {
      const { error: insertError } = await supabase
        .from('animals')
        .insert({ ...values, image_url })
      if (insertError) {
        setError('儲存失敗')
        setSaving(false)
        return
      }
    }

    navigate({ to: '/admin' })
  }

  const field = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500'

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-lg space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">名字 *</label>
          <input {...register('name')} className={field} />
          {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">英文名</label>
          <input {...register('name_en')} className={field} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">類別 *</label>
          <select {...register('type')} className={field}>
            <option value="cat">貓</option>
            <option value="dog">狗</option>
            <option value="sponsor">助養</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">性別 *</label>
          <select {...register('gender')} className={field}>
            <option value="female">母</option>
            <option value="male">公</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">狀態 *</label>
          <select {...register('status')} className={field}>
            <option value="available">可領養</option>
            <option value="adopted">已領養</option>
            <option value="fostered">暫托中</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">年齡 *</label>
          <input {...register('age')} placeholder="如：6歲 / 4個月" className={field} />
          {errors.age && <p className="text-red-500 text-xs mt-1">{errors.age.message}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">備注標籤</label>
          <input {...register('notes')} placeholder="如：親人、BB一對" className={field} />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">描述</label>
        <textarea {...register('description')} rows={4} className={field} />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">照片</label>
        <input
          type="file"
          accept="image/*"
          onChange={e => setImageFile(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
        {existing?.image_url && !imageFile && (
          <img src={existing.image_url} alt="" className="w-20 h-20 object-cover rounded mt-2" />
        )}
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="px-6 py-2.5 bg-slate-800 text-white rounded-lg font-medium hover:bg-slate-700 transition-colors disabled:opacity-60"
        >
          {saving ? '儲存中…' : '儲存'}
        </button>
        <button
          type="button"
          onClick={() => navigate({ to: '/admin' })}
          className="px-6 py-2.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
        >
          取消
        </button>
      </div>
    </form>
  )
}
