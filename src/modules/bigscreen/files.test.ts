import { describe, it, expect } from 'vitest'
import { fileKind, fmtSize, breadcrumbs, parentPath, filterEntries, type FileEntry } from './files'

const entry = (p: Partial<FileEntry>): FileEntry =>
  ({ name: 'x', path: 'C:\\x', is_dir: false, size: 0, ext: '', ...p })

describe('fileKind', () => {
  it('always calls a folder a folder', () => {
    expect(fileKind({ is_dir: true, ext: 'mp4' }).label).toBe('Folder')
  })
  it('maps extensions to kinds', () => {
    expect(fileKind({ is_dir: false, ext: 'png' }).label).toBe('Image')
    expect(fileKind({ is_dir: false, ext: 'mkv' }).label).toBe('Video')
    expect(fileKind({ is_dir: false, ext: 'pdf' }).label).toBe('PDF')
    expect(fileKind({ is_dir: false, ext: 'exe' }).label).toBe('Program')
  })
  it('falls back for anything unknown', () => {
    expect(fileKind({ is_dir: false, ext: 'qqq' }).label).toBe('File')
    expect(fileKind({ is_dir: false, ext: '' }).label).toBe('File')
  })
})

describe('fmtSize', () => {
  it('scales into human units', () => {
    expect(fmtSize(512)).toBe('512 B')
    expect(fmtSize(2048)).toBe('2.0 KB')
    expect(fmtSize(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(fmtSize(3 * 1024 * 1024 * 1024)).toBe('3.0 GB')
  })
  it('stays blank for folders and empties', () => {
    expect(fmtSize(4096, true)).toBe('')
    expect(fmtSize(0)).toBe('')
  })
})

describe('breadcrumbs', () => {
  it('keeps the drive root usable', () => {
    expect(breadcrumbs('C:\\Users\\Seikichi\\Documents')).toEqual([
      { name: 'C:\\',       path: 'C:\\' },
      { name: 'Users',      path: 'C:\\Users' },
      { name: 'Seikichi',   path: 'C:\\Users\\Seikichi' },
      { name: 'Documents',  path: 'C:\\Users\\Seikichi\\Documents' },
    ])
  })
  it('handles a bare drive and an empty path', () => {
    expect(breadcrumbs('C:\\')).toEqual([{ name: 'C:\\', path: 'C:\\' }])
    expect(breadcrumbs('')).toEqual([])
  })
})

describe('parentPath', () => {
  it('walks one level up', () => {
    expect(parentPath('C:\\Users\\Seikichi')).toBe('C:\\Users')
    expect(parentPath('C:\\Users')).toBe('C:\\')
  })
  it('stops at the drive root', () => {
    expect(parentPath('C:\\')).toBeNull()
  })
})

describe('filterEntries', () => {
  const list = [entry({ name: 'Photos', is_dir: true }), entry({ name: 'report.pdf', ext: 'pdf' })]
  it('matches case-insensitively', () => {
    expect(filterEntries(list, 'PHOT').map(e => e.name)).toEqual(['Photos'])
  })
  it('returns everything for a blank query', () => {
    expect(filterEntries(list, '  ')).toHaveLength(2)
  })
})
