# Fix: S3 Upload Intent — Missing Explicit Credentials

## Date
2026-04-02

## Symptom
`createAssetUploadIntent` failed in production with:

```
Credential is missing at credentialDefaultProvider
```

Stack pointed to `convex/storage/s3.ts:66` (inside `createPresignedUploadUrl`) and `convex/assets.ts:86`.

## Root Cause
`getS3Client()` in `convex/storage/s3.ts` was constructing `new S3Client({ region })` without supplying explicit credentials. The AWS SDK's default credential discovery chain (`credentialDefaultProvider`) ran as a fallback and found nothing — Convex's serverless runtime has no EC2 instance metadata, no `~/.aws/credentials` file, and no `AWS_*` environment variables visible to the default chain at the time the client initialises.

The Convex dashboard env vars (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) were correctly set, but because they were never read and forwarded to `S3Client`, the SDK fell through all its provider candidates and threw.

## Fix
`convex/storage/s3.ts` — `getS3Client()`:

- Explicitly read `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` via the existing `requireEnv()` helper (which already throws a human-readable error for missing vars).
- Pass them directly as the `credentials` object to `new S3Client(...)`, bypassing the default provider chain entirely.
- Added a diagnostic `console.log` that records key length and secret presence (never the values) so the Convex log stream can confirm the client is constructed with real data.

## Files Changed
- `convex/storage/s3.ts` — `getS3Client()` function

## Required Convex Environment Variables
| Variable | Purpose |
|---|---|
| `AWS_ACCESS_KEY_ID` | IAM access key for S3 |
| `AWS_SECRET_ACCESS_KEY` | IAM secret key for S3 |
| `S3_REGION` | AWS region (e.g. `us-east-1`) |
| `S3_BUCKET` | Target S3 bucket name |
| `S3_UPLOAD_PREFIX` | Object key prefix (default: `storyboard`) |

## Redeploy Steps
```bash
npx convex deploy
```

That's it. No schema changes, no new env vars, no migration needed — only the code wiring changed.

After deploy, trigger a test upload in the app and check Convex production logs for the `[s3] S3Client init:` line confirming `accessKeyId.length > 0` and `secretAccessKey.present=true`. If either shows `0` or `false`, the env var is blank or missing in the Convex dashboard.
