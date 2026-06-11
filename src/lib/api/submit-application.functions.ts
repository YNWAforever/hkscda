import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

const applicationSchema = z.object({
  animal_id: z.string().uuid().optional(),
  animal_name: z.string().min(1),
  animal_type: z.string().min(1),
  applicant_name: z.string().min(1),
  phone: z.string().min(8),
  email: z.string().email(),
  address: z.string().min(5),
  housing_type: z.enum(['私人樓宇', '居屋', '公屋', '村屋', '其他']),
  family_size: z.number().int().positive().optional(),
  existing_pets: z.string().optional(),
  reason: z.string().min(10),
})

export const submitApplication = createServerFn({ method: 'POST' })
  .inputValidator(applicationSchema)
  .handler(async ({ data }) => {
    const { createClient } = await import('@supabase/supabase-js')
    const { Resend } = await import('resend')

    const supabase = createClient(
      import.meta.env.VITE_SUPABASE_URL!,
      import.meta.env.VITE_SUPABASE_ANON_KEY!
    )

    const { error: dbError } = await supabase
      .from('adoption_applications')
      .insert({
        animal_id: data.animal_id ?? null,
        animal_name: data.animal_name,
        animal_type: data.animal_type,
        applicant_name: data.applicant_name,
        phone: data.phone,
        email: data.email,
        address: data.address,
        housing_type: data.housing_type,
        family_size: data.family_size ?? null,
        existing_pets: data.existing_pets ?? null,
        reason: data.reason,
      })

    if (dbError) throw new Error('Failed to save application')

    const resend = new Resend(process.env.RESEND_API_KEY!)
    await resend.emails.send({
      from: 'HKSCDA <noreply@hkscda.com>',
      to: process.env.NOTIFICATION_EMAIL ?? 'adoption@hkscda.com',
      subject: `新領養申請：${data.animal_name}（${data.applicant_name}）`,
      html: `
        <h2>新領養申請</h2>
        <p><strong>動物：</strong>${data.animal_name}（${data.animal_type}）</p>
        <p><strong>申請人：</strong>${data.applicant_name}</p>
        <p><strong>電話：</strong>${data.phone}</p>
        <p><strong>電郵：</strong>${data.email}</p>
        <p><strong>住址：</strong>${data.address}</p>
        <p><strong>住宅類型：</strong>${data.housing_type}</p>
        <p><strong>家庭人數：</strong>${data.family_size ?? '未填寫'}</p>
        <p><strong>現有寵物：</strong>${data.existing_pets || '沒有'}</p>
        <p><strong>領養原因：</strong>${data.reason}</p>
      `,
    })

    return { success: true }
  })
