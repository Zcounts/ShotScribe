import type { MobileDayPackage } from '@shotscribe/shared'
import type { ImportSummary, StoredDayEntry, StoredLibrary, StoredProjectEntry } from '../types'

const STORAGE_KEY = 'shotscribe.mobile.library.v1'

const EMPTY_LIBRARY: StoredLibrary = {
  version: 1,
  projects: {},
}

export function loadLibrary(): StoredLibrary {
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return EMPTY_LIBRARY
  }

  try {
    const parsed = JSON.parse(raw) as StoredLibrary
    if (parsed.version !== 1 || typeof parsed.projects !== 'object' || !parsed.projects) {
      return EMPTY_LIBRARY
    }
    return parsed
  } catch {
    return EMPTY_LIBRARY
  }
}

export function saveLibrary(library: StoredLibrary): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(library))
}

export function importDayPackages(
  library: StoredLibrary,
  dayPackages: MobileDayPackage[],
  importedAtIso: string
): { library: StoredLibrary; summary: ImportSummary } {
  const nextLibrary: StoredLibrary = {
    ...library,
    projects: { ...library.projects },
  }

  if (dayPackages.length === 0) {
    throw new Error('No day packages found in file.')
  }

  const firstPackage = dayPackages[0]
  const projectId = firstPackage.project.projectId

  let project: StoredProjectEntry = nextLibrary.projects[projectId] ?? {
    projectId,
    projectName: firstPackage.project.projectName,
    projectSlug: firstPackage.project.projectSlug,
    timezone: firstPackage.project.timezone,
    updatedAt: firstPackage.updatedAt,
    importedAt: importedAtIso,
    days: {},
  }

  project = {
    ...project,
    projectName: firstPackage.project.projectName,
    projectSlug: firstPackage.project.projectSlug,
    timezone: firstPackage.project.timezone,
    updatedAt: firstPackage.updatedAt,
    days: { ...project.days },
  }

  const importedDayIds: string[] = []

  for (const dayPackage of dayPackages) {
    if (dayPackage.project.projectId !== projectId) {
      throw new Error('A single import file cannot mix multiple projects.')
    }

    const currentDay = project.days[dayPackage.dayId]
    if (currentDay && currentDay.packageVersion > dayPackage.packageVersion) {
      continue
    }

    const dayEntry: StoredDayEntry = {
      dayId: dayPackage.dayId,
      packageId: dayPackage.packageId,
      packageVersion: dayPackage.packageVersion,
      shootDate: dayPackage.shootDate,
      updatedAt: dayPackage.updatedAt,
      importedAt: importedAtIso,
      scheduleItemCount: dayPackage.scheduleItems.length,
      dayPackage,
    }

    project.days[dayPackage.dayId] = dayEntry
    importedDayIds.push(dayPackage.dayId)

    if (dayPackage.updatedAt > project.updatedAt) {
      project.updatedAt = dayPackage.updatedAt
    }
  }

  nextLibrary.projects[projectId] = project

  return {
    library: nextLibrary,
    summary: {
      projectId,
      projectName: project.projectName,
      importedDayIds,
    },
  }
}
