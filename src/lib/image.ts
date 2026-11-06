const MAX_EDGE = 1200
const TARGET_BYTES = 300 * 1024

/**
 * Phone photos are 3-8 MB, which would eat the free storage tier in a month.
 * Resize to 1200px on the long edge and step the JPEG quality down until the
 * file is under ~300 KB — still perfectly readable for a leaking pipe.
 */
export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.')

  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not process that image.')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  let blob: Blob | null = null
  for (const quality of [0.82, 0.7, 0.6, 0.45]) {
    blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    )
    if (blob && blob.size <= TARGET_BYTES) break
  }
  if (!blob) throw new Error('Could not process that image.')

  return new File([blob], 'photo.jpg', { type: 'image/jpeg' })
}
