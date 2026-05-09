'use client'

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Upload, Users, Search, Trash2, X, Phone, User,
  Mail, FileText, Download, CheckCircle2, AlertCircle,
  ChevronLeft, ChevronRight, Info, HelpCircle,
} from 'lucide-react'
import { useDropzone } from 'react-dropzone'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { formatNumber, timeAgo } from '@/lib/utils'
import { cn } from '@/lib/utils'

// ── CSV template download ────────────────────────────────────────
function downloadTemplate() {
  const csv = `phone,first_name,last_name,email,notes
+12025551234,John,Doe,john@example.com,VIP customer
+12025555678,Jane,Smith,,Follow up Q2
+14155551000,,,, 
5551234567,Bob,Jones,,Phone-only is fine`
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = 'voxora_contacts_template.csv'; a.click()
  URL.revokeObjectURL(url)
}

// ── Single contact form ──────────────────────────────────────────
function AddSingleContact({ listId, onDone }: { listId: string; onDone: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ phone: '', firstName: '', lastName: '', email: '', notes: '' })
  const [err, setErr] = useState('')

  const mut = useMutation({
    mutationFn: () => api.post(`/contacts/lists/${listId}/add`, form),
    onSuccess: (res) => {
      const c = res.data
      qc.invalidateQueries({ queryKey: ['contact-lists'] })
      qc.invalidateQueries({ queryKey: ['contacts', listId] })
      toast.success(`Added ${c.formattedPhone || form.phone}${c.isValid ? '' : ' (invalid number — saved anyway)'}`)
      setForm({ phone: '', firstName: '', lastName: '', email: '', notes: '' })
      setErr('')
    },
    onError: (e: any) => setErr(e.response?.data?.message || 'Failed to add contact'),
  })

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <div className="space-y-3">
      {err && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          {err}
        </div>
      )}

      {/* Phone — required */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          <Phone className="h-3 w-3" /> Phone Number <span className="text-red-400">*</span>
        </label>
        <input
          value={form.phone}
          onChange={set('phone')}
          placeholder="+1 202 555 1234  or  2025551234"
          className="w-full px-3 py-2.5 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder:text-muted-foreground"
          onKeyDown={e => e.key === 'Enter' && form.phone && mut.mutate()}
        />
        <p className="text-[11px] text-muted-foreground">
          E.164 format (+1XXXXXXXXXX) preferred. US 10-digit numbers auto-detected.
        </p>
      </div>

      {/* Name row */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <User className="h-3 w-3" /> First Name
          </label>
          <input value={form.firstName} onChange={set('firstName')} placeholder="John"
            className="w-full px-3 py-2.5 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder:text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Last Name</label>
          <input value={form.lastName} onChange={set('lastName')} placeholder="Doe"
            className="w-full px-3 py-2.5 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder:text-muted-foreground" />
        </div>
      </div>

      {/* Email + Notes */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          <Mail className="h-3 w-3" /> Email <span className="font-normal">(optional)</span>
        </label>
        <input value={form.email} onChange={set('email')} type="email" placeholder="john@example.com"
          className="w-full px-3 py-2.5 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder:text-muted-foreground" />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          <FileText className="h-3 w-3" /> Notes <span className="font-normal">(optional)</span>
        </label>
        <input value={form.notes} onChange={set('notes')} placeholder="VIP customer, follow-up Q2..."
          className="w-full px-3 py-2.5 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder:text-muted-foreground" />
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => mut.mutate()}
          disabled={!form.phone || mut.isPending}
          className="flex-1 py-2.5 gradient-brand rounded-lg text-white text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-all"
        >
          {mut.isPending ? 'Adding…' : 'Add Contact'}
        </button>
        <button onClick={onDone} className="px-3 py-2.5 border border-border rounded-lg text-sm hover:bg-accent transition-all">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── CSV upload dropzone ─────────────────────────────────────────
function CsvUploader({ listId }: { listId: string }) {
  const qc = useQueryClient()
  const [result, setResult] = useState<{ valid: number; total: number; duplicates: number } | null>(null)

  const mut = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData(); form.append('file', file)
      return api.post(`/contacts/lists/${listId}/import`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['contact-lists'] })
      qc.invalidateQueries({ queryKey: ['contacts', listId] })
      setResult(res.data)
      toast.success(`Imported ${res.data.valid} contacts`)
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Import failed'),
  })

  const onDrop = useCallback((files: File[]) => {
    if (files[0]) { setResult(null); mut.mutate(files[0]) }
  }, [mut])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'text/csv': ['.csv'], 'text/plain': ['.txt'] }, maxFiles: 1,
  })

  return (
    <div className="space-y-3">
      {/* Column guide */}
      <div className="bg-brand-500/5 border border-brand-500/20 rounded-xl p-4">
        <div className="flex items-start gap-2">
          <Info className="h-4 w-4 text-brand-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-2 flex-1">
            <p className="text-xs font-semibold text-brand-300">Supported CSV columns</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground">
              <div><code className="text-brand-400">phone</code> — required (any format)</div>
              <div><code className="text-brand-400">first_name</code> — optional</div>
              <div><code className="text-brand-400">last_name</code> — optional</div>
              <div><code className="text-brand-400">email</code> — optional</div>
              <div><code className="text-brand-400">company</code> — optional</div>
              <div>Any extra columns — saved as custom fields</div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Only <strong className="text-foreground">phone</strong> is required. You can upload a single-column file with just numbers.
              US numbers like <code className="text-xs bg-muted px-1 rounded">2025551234</code> are auto-formatted to E.164.
            </p>
          </div>
        </div>
      </div>

      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={cn(
          'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all',
          isDragActive ? 'border-brand-500 bg-brand-500/5' : 'border-border hover:border-brand-500/50 hover:bg-accent/20',
          mut.isPending && 'opacity-50 pointer-events-none',
        )}
      >
        <input {...getInputProps()} />
        <Upload className={cn('h-9 w-9 mx-auto mb-3', isDragActive ? 'text-brand-400' : 'text-muted-foreground')} />
        <p className="font-medium text-sm">
          {mut.isPending ? 'Importing…' : isDragActive ? 'Drop it here!' : 'Drop CSV file here'}
        </p>
        <p className="text-xs text-muted-foreground mt-1">or click to browse your files</p>
        <p className="text-xs text-muted-foreground/60 mt-3">
          Supports .csv and .txt • Auto-validates numbers • Deduplicates automatically
        </p>
      </div>

      {/* Result */}
      {result && (
        <div className="flex items-start gap-3 px-4 py-3 bg-green-500/10 border border-green-500/20 rounded-xl">
          <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-green-300">Import successful</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {result.valid} valid contacts imported out of {result.total} rows
              {result.duplicates > 0 && ` · ${result.duplicates} duplicates removed`}
            </p>
          </div>
        </div>
      )}

      {/* Download template */}
      <button
        onClick={downloadTemplate}
        className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-border rounded-lg text-sm text-muted-foreground hover:text-foreground hover:border-brand-500/50 transition-all"
      >
        <Download className="h-4 w-4" />
        Download CSV template with examples
      </button>
    </div>
  )
}

// ── Main contacts page ────────────────────────────────────────────
export default function ContactsPage() {
  const [selectedList, setSelectedList]   = useState<string | null>(null)
  const [showNewList, setShowNewList]     = useState(false)
  const [newListName, setNewListName]     = useState('')
  const [newListDesc, setNewListDesc]     = useState('')
  const [search, setSearch]               = useState('')
  const [page, setPage]                   = useState(1)
  const [tab, setTab]                     = useState<'single' | 'bulk'>('single')
  const [showAdd, setShowAdd]             = useState(false)
  const qc = useQueryClient()

  const { data: lists = [], isLoading } = useQuery({
    queryKey: ['contact-lists'],
    queryFn: () => api.get('/contacts/lists').then(r => {
      const d = r.data
      return Array.isArray(d) ? d : d?.data ?? []
    }),
  })

  const { data: contacts, isLoading: loadingContacts } = useQuery({
    queryKey: ['contacts', selectedList, search, page],
    queryFn: () => selectedList
      ? api.get(`/contacts/lists/${selectedList}/contacts`, { params: { search, page, limit: 50 } }).then(r => r.data)
      : null,
    enabled: !!selectedList,
  })

  const createListMut = useMutation({
    mutationFn: () => api.post('/contacts/lists', { name: newListName, description: newListDesc }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['contact-lists'] })
      setNewListName(''); setNewListDesc(''); setShowNewList(false)
      setSelectedList(res.data.id)
      toast.success('Contact list created')
    },
  })

  const deleteListMut = useMutation({
    mutationFn: (id: string) => api.delete(`/contacts/lists/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact-lists'] })
      if (selectedList) setSelectedList(null)
      toast.success('List deleted')
    },
  })

  const removeContactMut = useMutation({
    mutationFn: ({ listId, contactId }: { listId: string; contactId: string }) =>
      api.delete(`/contacts/lists/${listId}/contacts/${contactId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts', selectedList] })
      qc.invalidateQueries({ queryKey: ['contact-lists'] })
      toast.success('Contact removed')
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to remove'),
  })

  const activeList = lists.find((l: any) => l.id === selectedList)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Contacts</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage your contact lists. Add contacts one-by-one or import thousands from a CSV file.
          </p>
        </div>
        <button
          onClick={() => setShowNewList(true)}
          className="flex items-center gap-2 px-4 py-2 gradient-brand rounded-lg text-white text-sm font-medium hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> New List
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Lists sidebar ─────────────────────────────── */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Your Lists
          </p>

          {/* Create list form */}
          {showNewList && (
            <div className="bg-card border border-brand-500/50 rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold">New Contact List</p>
              <input
                value={newListName}
                onChange={e => setNewListName(e.target.value)}
                placeholder="List name (e.g. Q2 Leads)"
                autoFocus
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <input
                value={newListDesc}
                onChange={e => setNewListDesc(e.target.value)}
                placeholder="Description (optional)"
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => newListName && createListMut.mutate()}
                  disabled={!newListName || createListMut.isPending}
                  className="flex-1 py-2 text-xs gradient-brand rounded-lg text-white disabled:opacity-50"
                >
                  Create
                </button>
                <button onClick={() => { setShowNewList(false); setNewListName(''); setNewListDesc('') }}
                  className="flex-1 py-2 text-xs border border-border rounded-lg hover:bg-accent transition-all">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* List items */}
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-20 bg-card border border-border rounded-xl animate-pulse" />
              ))}
            </div>
          ) : lists.length === 0 ? (
            <div className="bg-card border border-dashed border-border rounded-xl p-8 text-center">
              <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">No lists yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1 max-w-40 mx-auto">
                Create a list to start organizing your contacts
              </p>
              <button
                onClick={() => setShowNewList(true)}
                className="mt-3 px-3 py-1.5 text-xs gradient-brand rounded-lg text-white"
              >
                Create First List
              </button>
            </div>
          ) : (
            lists.map((list: any) => (
              <div
                key={list.id}
                onClick={() => { setSelectedList(list.id === selectedList ? null : list.id); setPage(1); setSearch('') }}
                className={cn(
                  'p-4 rounded-xl border cursor-pointer transition-all',
                  selectedList === list.id
                    ? 'border-brand-500 bg-brand-500/10'
                    : 'border-border bg-card hover:border-brand-500/30 hover:bg-accent/20',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{list.name}</p>
                    {list.description && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{list.description}</p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {formatNumber(list.totalCount ?? 0)} contacts
                      </span>
                      <span className="flex items-center gap-1 text-green-400">
                        <CheckCircle2 className="h-3 w-3" />
                        {formatNumber(list.validCount ?? 0)} valid
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      if (confirm('Delete this list and all its contacts?')) {
                        deleteListMut.mutate(list.id)
                      }
                    }}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-all flex-shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* ── Right panel ────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">
          {!selectedList ? (
            /* No list selected — show guide */
            <div className="bg-card border border-dashed border-border rounded-2xl p-10 text-center space-y-4">
              <div className="h-16 w-16 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center mx-auto">
                <Users className="h-8 w-8 text-brand-400" />
              </div>
              <div>
                <p className="text-lg font-semibold">Select or create a list</p>
                <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
                  Contact lists group your numbers for campaigns. You can add contacts one-by-one or import thousands from a CSV file.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto text-left">
                {[
                  { icon: Phone, label: 'Add one contact', desc: 'Fill a quick form with phone + name' },
                  { icon: Upload, label: 'Bulk CSV import', desc: 'Upload thousands at once' },
                ].map(item => (
                  <div key={item.label} className="p-3 rounded-xl bg-muted/30 border border-border">
                    <item.icon className="h-5 w-5 text-brand-400 mb-2" />
                    <p className="text-xs font-semibold">{item.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setShowNewList(true)}
                className="px-5 py-2.5 gradient-brand rounded-lg text-white text-sm font-medium"
              >
                <Plus className="h-4 w-4 inline mr-1.5" />
                Create Your First List
              </button>
            </div>
          ) : (
            <>
              {/* List header */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="font-semibold text-lg">{activeList?.name}</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatNumber(activeList?.totalCount ?? 0)} contacts ·{' '}
                    {formatNumber(activeList?.validCount ?? 0)} valid numbers
                  </p>
                </div>
                <button
                  onClick={() => setShowAdd(!showAdd)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                    showAdd
                      ? 'bg-accent text-foreground'
                      : 'gradient-brand text-white hover:opacity-90',
                  )}
                >
                  {showAdd ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {showAdd ? 'Close' : 'Add Contacts'}
                </button>
              </div>

              {/* Add contacts panel */}
              {showAdd && (
                <div className="bg-card border border-border rounded-2xl overflow-hidden">
                  {/* Tabs */}
                  <div className="flex border-b border-border">
                    {(['single', 'bulk'] as const).map(t => (
                      <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={cn(
                          'flex-1 py-3 text-sm font-medium transition-all',
                          tab === t
                            ? 'border-b-2 border-brand-500 text-brand-300'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {t === 'single' ? '➕ Add Single Contact' : '📋 Bulk CSV Import'}
                      </button>
                    ))}
                  </div>
                  <div className="p-5">
                    {tab === 'single'
                      ? <AddSingleContact listId={selectedList} onDone={() => setShowAdd(false)} />
                      : <CsvUploader listId={selectedList} />
                    }
                  </div>
                </div>
              )}

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <input
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1) }}
                  placeholder="Search by phone, name or email…"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {/* Contacts table */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                {loadingContacts ? (
                  <div className="divide-y divide-border/50">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="h-12 px-4 flex items-center gap-3">
                        <div className="h-3 w-28 bg-muted rounded animate-pulse" />
                        <div className="h-3 w-20 bg-muted rounded animate-pulse" />
                      </div>
                    ))}
                  </div>
                ) : !contacts?.data?.length ? (
                  <div className="py-12 text-center">
                    <Users className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {search ? 'No contacts match your search' : 'No contacts yet — add some above'}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border bg-muted/20">
                            {['Phone', 'Name', 'Email', 'Valid', 'Added'].map(h => (
                              <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">{h}</th>
                            ))}
                            <th className="w-10" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                          {contacts.data.map((c: any) => (
                            <tr key={c.id} className="hover:bg-accent/20 transition-colors">
                              <td className="px-4 py-3">
                                <span className="font-mono text-sm">{c.formattedPhone || c.phone}</span>
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">
                                {[c.firstName, c.lastName].filter(Boolean).join(' ') || '—'}
                              </td>
                              <td className="px-4 py-3 text-muted-foreground text-xs truncate max-w-[140px]">
                                {c.email || '—'}
                              </td>
                              <td className="px-4 py-3">
                                <span className={cn(
                                  'inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full',
                                  c.isValid
                                    ? 'bg-green-500/10 text-green-400'
                                    : 'bg-red-500/10 text-red-400',
                                )}>
                                  {c.isValid ? '✓ Valid' : '✗ Invalid'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                                {timeAgo(c.createdAt)}
                              </td>
                              <td className="px-4 py-3">
                                <button
                                  onClick={() => removeContactMut.mutate({ listId: selectedList!, contactId: c.id })}
                                  className="p-1.5 rounded text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-all"
                                  title="Remove contact"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    {contacts.pages > 1 && (
                      <div className="flex items-center justify-between px-4 py-3 border-t border-border/50 text-xs text-muted-foreground">
                        <span>
                          Showing {((page - 1) * 50) + 1}–{Math.min(page * 50, contacts.total)} of {formatNumber(contacts.total)}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="p-1.5 rounded hover:bg-accent disabled:opacity-30 transition-all"
                          >
                            <ChevronLeft className="h-3.5 w-3.5" />
                          </button>
                          <span className="px-2">Page {page} of {contacts.pages}</span>
                          <button
                            onClick={() => setPage(p => Math.min(contacts.pages, p + 1))}
                            disabled={page === contacts.pages}
                            className="p-1.5 rounded hover:bg-accent disabled:opacity-30 transition-all"
                          >
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Hint */}
              <div className="flex items-start gap-2 px-3 py-2.5 bg-muted/30 border border-border rounded-xl text-xs text-muted-foreground">
                <HelpCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-brand-400" />
                <span>
                  <strong className="text-foreground">Tip:</strong> Click a contact row to expand details.
                  Numbers marked <span className="text-red-400 font-semibold">Invalid</span> will be skipped in campaigns — they can still be dialed manually.
                  Opt-outs are automatically excluded.
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
