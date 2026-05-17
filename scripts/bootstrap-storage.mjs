import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  console.error('Run: npm run bootstrap (which loads .env.local via --env-file).')
  process.exit(1)
}

const supabase = createClient(url, key)

async function ensureBucket(name) {
  const { data: buckets, error } = await supabase.storage.listBuckets()
  if (error) throw error
  if (buckets?.find((b) => b.name === name)) {
    console.log(`bucket '${name}' already exists`)
    return
  }
  const { error: createError } = await supabase.storage.createBucket(name, {
    public: false,
    fileSizeLimit: 10 * 1024 * 1024,
    // PDFs from /upload, images from /upload (image path) + /upload-jd-image,
    // and text/plain from /upload (URL ingest synth) + /api/builder (rebuild).
    allowedMimeTypes: [
      'application/pdf',
      'text/plain',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
    ],
  })
  if (createError) throw createError
  console.log(`created bucket '${name}'`)
}

ensureBucket('resumes').catch((err) => {
  console.error('bootstrap failed:', err)
  process.exit(1)
})
