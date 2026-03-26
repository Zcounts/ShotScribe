import type { MobileDayPackage } from '@shotscribe/shared'
import type {
  ImportSummary,
  MobileTabKey,
  StoredDayEntry,
  StoredLastOpened,
  StoredLibrary,
  StoredProjectEntry,
  StoredSession,
} from '../types'

const LIBRARY_STORAGE_KEY = 'shotscribe.mobile.library.v1'
const SESSION_STORAGE_KEY = 'shotscribe.mobile.session.v1'

const EMPTY_LIBRARY: StoredLibrary = {
  version: 1,
  projects: {},
  shotStatusOverrides: {},
}

const EMPTY_SESSION: StoredSession = {
  version: 1,
  lastOpened: null,
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalizeStoredLibrary(raw: Partial<StoredLibrary>): StoredLibrary {
  const nextProjects: StoredLibrary['projects'] = {}

  for (const [projectId, unsafeProject] of Object.entries(raw.projects ?? {})) {
    if (!unsafeProject || typeof unsafeProject !== 'object') {
      continue
    }

    const projectRecord = unsafeProject as Partial<StoredProjectEntry>
    const nextDays: StoredProjectEntry['days'] = {}

    for (const [dayId, unsafeDay] of Object.entries(projectRecord.days ?? {})) {
      if (!unsafeDay || typeof unsafeDay !== 'object') {
        continue
      }

      const dayRecord = unsafeDay as Partial<StoredDayEntry>
      if (!dayRecord.dayPackage || typeof dayRecord.dayPackage !== 'object') {
        continue
      }

      nextDays[dayId] = {
        dayId: readString(dayRecord.dayId, dayId),
        packageId: readString(dayRecord.packageId, ''),
        packageVersion: readNumber(dayRecord.packageVersion, 0),
        shootDate: readString(dayRecord.shootDate, ''),
        updatedAt: readString(dayRecord.updatedAt, ''),
        importedAt: readString(dayRecord.importedAt, ''),
        scheduleItemCount: readNumber(dayRecord.scheduleItemCount, 0),
        dayPackage: dayRecord.dayPackage,
      }
    }

    nextProjects[projectId] = {
      projectId: readString(projectRecord.projectId, projectId),
      projectName: readString(projectRecord.projectName, 'Untitled project'),
      projectSlug: typeof projectRecord.projectSlug === 'string' ? projectRecord.projectSlug : undefined,
      timezone: typeof projectRecord.timezone === 'string' ? projectRecord.timezone : undefined,
      updatedAt: readString(projectRecord.updatedAt, ''),
      importedAt: readString(projectRecord.importedAt, ''),
      days: nextDays,
    }
  }

  return {
    version: 1,
    projects: nextProjects,
    shotStatusOverrides:
      typeof raw.shotStatusOverrides === 'object' && raw.shotStatusOverrides
        ? (raw.shotStatusOverrides as StoredLibrary['shotStatusOverrides'])
        : {},
  }
}

export function loadLibrary(): StoredLibrary {
  const raw = window.localStorage.getItem(LIBRARY_STORAGE_KEY)
  if (!raw) {
    return EMPTY_LIBRARY
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredLibrary>
    if (parsed.version !== 1 || typeof parsed.projects !== 'object' || !parsed.projects) {
      return EMPTY_LIBRARY
    }

    return normalizeStoredLibrary(parsed)
  } catch {
    return EMPTY_LIBRARY
  }
}

export function saveLibrary(library: StoredLibrary): void {
  window.localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(library))
}

export function loadSession(): StoredSession {
  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY)
  if (!raw) {
    return EMPTY_SESSION
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredSession>
    if (parsed.version !== 1) {
      return EMPTY_SESSION
    }

    const lastOpened = parsed.lastOpened
    if (!lastOpened) {
      return EMPTY_SESSION
    }

    if (
      typeof lastOpened.projectId !== 'string' ||
      typeof lastOpened.dayId !== 'string' ||
      typeof lastOpened.tab !== 'string'
    ) {
      return EMPTY_SESSION
    }

    return {
      version: 1,
      lastOpened: {
        projectId: lastOpened.projectId,
        dayId: lastOpened.dayId,
        tab: lastOpened.tab as MobileTabKey,
      },
    }
  } catch {
    return EMPTY_SESSION
  }
}

export function saveSession(session: StoredSession): void {
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
}

export function getLatestProject(library: StoredLibrary): StoredProjectEntry | null {
  const projects = Object.values(library.projects)
  if (projects.length === 0) {
    return null
  }

  return projects.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))[0]
}

export function getPreferredDayId(project: StoredProjectEntry, preferredDayId?: string): string | null {
  if (preferredDayId && project.days[preferredDayId]) {
    return preferredDayId
  }

  const days = Object.values(project.days)
  if (days.length === 0) {
    return null
  }

  days.sort(
    (a, b) =>
      (b.shootDate ?? '').localeCompare(a.shootDate ?? '') ||
      (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
  )
  return days[0].dayId
}

export function resolveLastOpened(library: StoredLibrary, session: StoredSession): StoredLastOpened | null {
  const stored = session.lastOpened
  if (stored) {
    const project = library.projects[stored.projectId]
    if (project && project.days[stored.dayId]) {
      return stored
    }
  }

  const latestProject = getLatestProject(library)
  if (!latestProject) {
    return null
  }

  const dayId = getPreferredDayId(latestProject)
  if (!dayId) {
    return null
  }

  return {
    projectId: latestProject.projectId,
    dayId,
    tab: 'overview',
  }
}

export function makeShotStatusOverrideKey(projectId: string, dayId: string, shotId: string): string {
  return `${projectId}::${dayId}::${shotId}`
}

export function setShotStatusOverride(
  library: StoredLibrary,
  projectId: string,
  dayId: string,
  shotId: string,
  status: 'todo' | 'in_progress' | 'done'
): StoredLibrary {
  const key = makeShotStatusOverrideKey(projectId, dayId, shotId)
  return {
    ...library,
    shotStatusOverrides: {
      ...library.shotStatusOverrides,
      [key]: status,
    },
  }
}

export function removeProject(library: StoredLibrary, projectId: string): StoredLibrary {
  const nextProjects = { ...library.projects }
  delete nextProjects[projectId]

  const nextOverrides: StoredLibrary['shotStatusOverrides'] = {}
  const prefix = `${projectId}::`

  for (const [key, value] of Object.entries(library.shotStatusOverrides)) {
    if (!key.startsWith(prefix)) {
      nextOverrides[key] = value
    }
  }

  return {
    ...library,
    projects: nextProjects,
    shotStatusOverrides: nextOverrides,
  }
}

export function importDayPackages(
  library: StoredLibrary,
  dayPackages: MobileDayPackage[],
  importedAtIso: string
): { library: StoredLibrary; summary: ImportSummary } {
  const nextLibrary: StoredLibrary = {
    ...library,
    projects: { ...library.projects },
    shotStatusOverrides: { ...library.shotStatusOverrides },
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
