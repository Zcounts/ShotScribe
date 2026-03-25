import {
  hostedFeedManifestSchema,
  limitedMobileUpdatePayloadSchema,
  mobileDayPackageSchema,
  mobileSnapshotSchema,
} from '../schemas/mobileContracts.js'
import type {
  HostedFeedManifest,
  LimitedMobileUpdatePayload,
  MobileDayPackage,
  MobileSnapshot,
} from '../contracts/mobileContracts.js'

function serialize<T>(value: T): string {
  return JSON.stringify(value, null, 2)
}

function parse<T>(raw: string): T {
  return JSON.parse(raw) as T
}

export function serializeMobileSnapshot(value: MobileSnapshot): string {
  return serialize(mobileSnapshotSchema.parse(value))
}

export function parseMobileSnapshot(raw: string): MobileSnapshot {
  return mobileSnapshotSchema.parse(parse<unknown>(raw))
}

export function serializeMobileDayPackage(value: MobileDayPackage): string {
  return serialize(mobileDayPackageSchema.parse(value))
}

export function parseMobileDayPackage(raw: string): MobileDayPackage {
  return mobileDayPackageSchema.parse(parse<unknown>(raw))
}

export function serializeHostedFeedManifest(value: HostedFeedManifest): string {
  return serialize(hostedFeedManifestSchema.parse(value))
}

export function parseHostedFeedManifest(raw: string): HostedFeedManifest {
  return hostedFeedManifestSchema.parse(parse<unknown>(raw))
}

export function serializeLimitedMobileUpdatePayload(value: LimitedMobileUpdatePayload): string {
  return serialize(limitedMobileUpdatePayloadSchema.parse(value))
}

export function parseLimitedMobileUpdatePayload(raw: string): LimitedMobileUpdatePayload {
  return limitedMobileUpdatePayloadSchema.parse(parse<unknown>(raw))
}
