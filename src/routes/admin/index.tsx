import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../../lib/supabase'
import { AdminLayout } from '../../components/admin/AdminLayout'
import { AnimalsTable } from '../../components/admin/AnimalsTable'

const searchSchema = z.object({
  section: z.enum(['cat', 'dog', 'sponsor', 'applications']).catch('cat'),
})

export const Route = createFileRoute('/admin/')({
  validateSearch: searchSchema,
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw redirect({ to: '/admin/login' })
  },
  component: AdminDashboard,
})

const sectionLabels: Record<string, string> = {
  cat: '貓貓',
  dog: '狗狗',
  sponsor: '助養動物',
  applications: '領養申請',
}

type ApplicationRow = {
  id: string
  applicant_name: string
  animal_name: string
  phone: string
  created_at: string
  status: string
}

function AdminDashboard() {
  const { section } = Route.useSearch()
  const queryClient = useQueryClient()

  const { data: animals = [], isLoading } = useQuery({
    queryKey: ['admin-animals', section],
    queryFn: async () => {
      if (section === 'applications') return []
      const { data, error } = await supabase
        .from('animals')
        .select('*')
        .eq('type', section)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: section !== 'applications',
  })

  const { data: applications = [] } = useQuery<ApplicationRow[]>({
    queryKey: ['admin-applications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('adoption_applications')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: section === 'applications',
  })

  return (
    <AdminLayout activeSection={section as 'cat' | 'dog' | 'sponsor' | 'applications'}>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">{sectionLabels[section]}</h1>
          {section !== 'applications' && (
            <Link
              to="/admin/animals/new"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
            >
              + 新增
            </Link>
          )}
        </div>

        {section === 'applications' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100 text-gray-600 text-xs uppercase">
                  <th className="text-left p-3">申請人</th>
                  <th className="text-left p-3">動物</th>
                  <th className="text-left p-3">電話</th>
                  <th className="text-left p-3">日期</th>
                  <th className="text-left p-3">狀態</th>
                </tr>
              </thead>
              <tbody>
                {applications.map(app => (
                  <tr key={app.id} className="border-b border-gray-100">
                    <td className="p-3">{app.applicant_name}</td>
                    <td className="p-3">{app.animal_name}</td>
                    <td className="p-3">{app.phone}</td>
                    <td className="p-3">{new Date(app.created_at).toLocaleDateString('zh-HK')}</td>
                    <td className="p-3">
                      <select
                        defaultValue={app.status}
                        onChange={async e => {
                          await supabase.from('adoption_applications').update({ status: e.target.value }).eq('id', app.id)
                          queryClient.invalidateQueries({ queryKey: ['admin-applications'] })
                        }}
                        className="border border-gray-300 rounded text-xs px-2 py-1"
                      >
                        <option value="pending">待處理</option>
                        <option value="approved">已批准</option>
                        <option value="rejected">已拒絕</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : isLoading ? (
          <div className="text-center py-12 text-gray-400">載入中…</div>
        ) : (
          <AnimalsTable
            animals={animals}
            onDeleted={() => queryClient.invalidateQueries({ queryKey: ['admin-animals', section] })}
          />
        )}
      </div>
    </AdminLayout>
  )
}
