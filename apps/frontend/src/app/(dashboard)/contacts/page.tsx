'use client'

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Upload, Users, Search, Trash2, Download } from 'lucide-react'
import { useDropzone } from 'react-dropzone'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { formatNumber, timeAgo } from '@/lib/utils'

export default function ContactsPage() {
  const [selectedList, setSelectedList] = useState<string | null>(null)
  const [showNewList, setShowNewList] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [search, setSearch] = useState('')
  const qc = useQueryClient()

  const { data: lists = [], isLoading } = useQuery({
    queryKey: ['contact-lists'],
    queryFn: () => api.get('/contacts/lists').then(r => r.data),
  })

  const { data: contacts } = useQuery({
    queryKey: ['contacts', selectedList, search],
    queryFn: () => selectedList
      ? api.get(`/contacts/lists/${selectedList}/contacts?search=${search}`).then(r => r.data)
      : null,
    enabled: !!selectedList,
  })

  const createListMutation = useMutation({
    mutationFn: (name: string) => api.post('/contacts/lists', { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact-lists'] })
      setNewListName(''); setShowNewList(false)
      toast.success('Contact list created')
    },
  })

  const deleteListMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/contacts/lists/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact-lists'] })
      if (selectedList) setSelectedList(null)
      toast.success('List deleted')
    },
  })

  const importMutation = useMutation({
    mutationFn: ({ listId, file }: { listId: string; file: File }) => {
      const form = new FormData(); form.append('file', file)
      return api.post(`/contacts/lists/${listId}/import`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['contact-lists'] })
      qc.invalidateQueries({ queryKey: ['contacts'] })
      toast.success(`Imported ${res.data.valid} valid contacts (${res.data.duplicates} duplicates removed)`)
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Import failed'),
  })

  const onDrop = useCallback((files: File[]) => {
    if (!selectedList) { toast.error('Select a contact list first'); return }
    if (files[0]) importMutation.mutate({ listId: selectedList, file: files[0] })
  }, [selectedList, importMutation])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    maxFiles: 1,
    noClick: !selectedList,
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Contacts</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Manage your contact lists</p>
        </div>
        <button
          onClick={() => setShowNewList(true)}
          className="flex items-center gap-2 px-4 py-2 gradient-brand rounded-lg text-white text-sm font-medium hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> New List
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lists sidebar */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">LISTS</h3>

          {showNewList && (
            <div className="bg-card border border-brand-500/50 rounded-xl p-3">
              <input
                value={newListName}
                onChange={e => setNewListName(e.target.value)}
                placeholder="List name..."
                autoFocus
                className="w-full bg-transparent text-sm focus:outline-none mb-2"
                onKeyDown={e => e.key === 'Enter' && createListMutation.mutate(newListName)}
              />
              <div className="flex gap-2">
                <button onClick={() => createListMutation.mutate(newListName)}
                  className="flex-1 py-1 text-xs gradient-brand rounded-lg text-white">Create</button>
                <button onClick={() => setShowNewList(false)}
                  className="flex-1 py-1 text-xs border border-border rounded-lg">Cancel</button>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 bg-card border border-border rounded-xl animate-pulse" />
            ))}</div>
          ) : lists.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
              No lists yet
            </div>
          ) : lists.map((list: any) => (
            <div
              key={list.id}
              onClick={() => setSelectedList(list.id === selectedList ? null : list.id)}
              className={`p-3 rounded-xl border cursor-pointer transition-all ${
                selectedList === list.id
                  ? 'border-brand-500 bg-brand-500/10'
                  : 'border-border bg-card hover:border-border/80'
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="font-medium text-sm truncate">{list.name}</p>
                <button onClick={e => { e.stopPropagation(); deleteListMutation.mutate(list.id) }}
                  className="p-1 hover:text-red-400 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                <span>{formatNumber(list.totalCount)} total</span>
                <span>{formatNumber(list.validCount)} valid</span>
              </div>
            </div>
          ))}
        </div>

        {/* Contacts panel */}
        <div className="lg:col-span-2 space-y-4">
          {/* CSV import dropzone */}
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
              isDragActive ? 'border-brand-500 bg-brand-500/5' : 'border-border hover:border-brand-500/50'
            } ${!selectedList && 'opacity-50 cursor-not-allowed'}`}
          >
            <input {...getInputProps()} />
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium">
              {isDragActive ? 'Drop your CSV here' : 'Drop CSV file or click to upload'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {selectedList ? 'CSV with phone column. Auto-validates & deduplicates.' : 'Select a list first'}
            </p>
          </div>

          {selectedList && contacts && (
            <>
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search contacts..."
                    className="w-full pl-9 pr-4 py-2 rounded-lg bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <span className="text-sm text-muted-foreground">{formatNumber(contacts.total)} contacts</span>
              </div>

              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {['Phone', 'Name', 'Country', 'Valid', 'Opted Out'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.data?.map((c: any) => (
                      <tr key={c.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs">{c.formattedPhone || c.phone}</td>
                        <td className="px-4 py-3 text-muted-foreground">{[c.firstName, c.lastName].filter(Boolean).join(' ') || '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground">{c.countryCode || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${c.isValid ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                            {c.isValid ? '✓' : '✗'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs ${c.isOptedOut ? 'text-red-400' : 'text-muted-foreground'}`}>
                            {c.isOptedOut ? 'Yes' : 'No'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {!selectedList && (
            <div className="flex items-center justify-center h-48 text-center text-muted-foreground">
              <div>
                <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Select a list to view contacts</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
