import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Animal } from '../../types/animal'

interface AnimalsTableProps {
  animals: Animal[]
  onDeleted: () => void
}

const statusLabels: Record<string, { label: string; className: string }> = {
  available: { label: '可領養', className: 'bg-green-100 text-green-700' },
  adopted: { label: '已領養', className: 'bg-orange-100 text-orange-700' },
  fostered: { label: '暫托中', className: 'bg-blue-100 text-blue-700' },
}

export function AnimalsTable({ animals, onDeleted }: AnimalsTableProps) {
  const [search, setSearch] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const filtered = animals.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    (a.name_en ?? '').toLowerCase().includes(search.toLowerCase())
  )

  async function handleDelete(id: string) {
    await supabase.from('animals').delete().eq('id', id)
    setConfirmDelete(null)
    onDeleted()
  }

  return (
    <div className="space-y-4">
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="搜尋名字…"
        className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full max-w-xs"
      />

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-100 text-gray-600 text-xs uppercase">
              <th className="text-left p-3">照片</th>
              <th className="text-left p-3">名字</th>
              <th className="text-left p-3">性別</th>
              <th className="text-left p-3">年齡</th>
              <th className="text-left p-3">狀態</th>
              <th className="text-left p-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(animal => {
              const status = statusLabels[animal.status]
              return (
                <tr key={animal.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="p-3">
                    {animal.image_url ? (
                      <img src={animal.image_url} alt="" className="w-10 h-10 rounded object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center text-lg">
                        {animal.type === 'dog' ? '🐶' : '🐱'}
                      </div>
                    )}
                  </td>
                  <td className="p-3 font-medium">
                    {animal.name}
                    {animal.name_en && <span className="text-gray-400 ml-1 font-normal">{animal.name_en}</span>}
                  </td>
                  <td className="p-3">{animal.gender === 'male' ? '公' : '母'}</td>
                  <td className="p-3">{animal.age}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.className}`}>
                      {status.label}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-3">
                      <Link to={`/admin/animals/${animal.id}/edit`} className="text-blue-600 hover:underline text-xs">編輯</Link>
                      {confirmDelete === animal.id ? (
                        <span className="flex gap-2 text-xs">
                          <button onClick={() => handleDelete(animal.id)} className="text-red-600 hover:underline">確認</button>
                          <button onClick={() => setConfirmDelete(null)} className="text-gray-500 hover:underline">取消</button>
                        </span>
                      ) : (
                        <button onClick={() => setConfirmDelete(animal.id)} className="text-red-500 hover:underline text-xs">刪除</button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-gray-400">沒有結果</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
