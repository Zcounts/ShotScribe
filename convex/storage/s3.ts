import { DeleteObjectCommand, S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const DEFAULT_PRESIGN_UPLOAD_TTL_SECONDS = 5 * 60
const DEFAULT_PRESIGN_READ_TTL_SECONDS = 10 * 60

function requireEnv(name: string) {
  const value = String(process.env[name] || '').trim()
  if (!value) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value
}

export function getS3Config() {
  const region = requireEnv('S3_REGION')
  const bucket = requireEnv('S3_BUCKET')
  const rawPrefix = String(process.env.S3_UPLOAD_PREFIX || 'storyboard').trim()
  const prefix = rawPrefix.replace(/^\/+|\/+$/g, '') || 'storyboard'
  return { region, bucket, prefix }
}

function getS3Client() {
  const { region } = getS3Config()
  const accessKeyId = requireEnv('AWS_ACCESS_KEY_ID')
  const secretAccessKey = requireEnv('AWS_SECRET_ACCESS_KEY')
  console.log(
    '[s3] S3Client init:',
    'region=' + region,
    'accessKeyId.length=' + accessKeyId.length,
    'secretAccessKey.present=' + (secretAccessKey.length > 0),
  )
  return new S3Client({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  })
}

function sanitizeObjectKeyPart(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'file'
}

export function buildStoryboardObjectKey({
  projectId,
  sourceName,
}: {
  projectId: string,
  sourceName?: string | null,
}) {
  const { prefix } = getS3Config()
  const safeSourceName = sanitizeObjectKeyPart(sourceName || 'storyboard-image')
  const random = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`).replace(/[^a-zA-Z0-9-]/g, '')
  return `${prefix}/project-${sanitizeObjectKeyPart(projectId)}/${Date.now()}-${random}-${safeSourceName}.webp`
}

export async function createPresignedUploadUrl({
  objectKey,
  mime,
  expiresInSeconds = DEFAULT_PRESIGN_UPLOAD_TTL_SECONDS,
}: {
  objectKey: string,
  mime: string,
  expiresInSeconds?: number,
}) {
  const { bucket } = getS3Config()
  const s3 = getS3Client()
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ContentType: mime,
  })
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: expiresInSeconds })
  return { uploadUrl, bucket, objectKey }
}

export async function createPresignedReadUrl({
  objectKey,
  expiresInSeconds = DEFAULT_PRESIGN_READ_TTL_SECONDS,
}: {
  objectKey: string,
  expiresInSeconds?: number,
}) {
  const { bucket } = getS3Config()
  const s3 = getS3Client()
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: objectKey,
  })
  const readUrl = await getSignedUrl(s3, command, { expiresIn: expiresInSeconds })
  return { readUrl, bucket, objectKey }
}

export async function deleteObjectFromS3({ objectKey }: { objectKey: string }) {
  const { bucket } = getS3Config()
  const s3 = getS3Client()
  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: objectKey,
  })
  await s3.send(command)
  return { bucket, objectKey }
}
