import {
  parseMobileDayPackage,
  parseMobileSnapshot,
  type MobileDayPackage,
  type MobileSnapshot,
} from '@shotscribe/shared'

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return 'Unknown import error'
}

function parseAsSnapshot(text: string): MobileSnapshot | null {
  try {
    return parseMobileSnapshot(text)
  } catch {
    return null
  }
}

function parseAsDayPackage(text: string): MobileDayPackage | null {
  try {
    return parseMobileDayPackage(text)
  } catch {
    return null
  }
}

export async function importDayPackagesFromFile(file: File): Promise<MobileDayPackage[]> {
  const text = await file.text()

  const snapshot = parseAsSnapshot(text)
  if (snapshot) {
    return snapshot.dayPackages
  }

  const singleDayPackage = parseAsDayPackage(text)
  if (singleDayPackage) {
    return [singleDayPackage]
  }

  throw new Error(
    `File “${file.name}” is not a valid ShotScribe mobile package. ${toErrorMessage(
      new Error('Expected mobile-snapshot or mobile-day-package schema.')
    )}`
  )
}
