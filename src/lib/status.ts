export type StatusTone = 'neutral' | 'progress' | 'success' | 'error'

export interface StatusMeta {
  label: string
  tone: StatusTone
}

export function statusMeta(status: string): StatusMeta {
  switch (status) {
    case 'PUBLISH_COMPLETE':
      return { label: 'Published', tone: 'success' }
    case 'SEND_TO_USER_INBOX':
      return { label: 'In TikTok inbox', tone: 'success' }
    case 'PROCESSING_UPLOAD':
    case 'PROCESSING_DOWNLOAD':
      return { label: 'Processing', tone: 'progress' }
    case 'FAILED':
      return { label: 'Failed', tone: 'error' }
    case 'DRAFT':
      return { label: 'Draft', tone: 'neutral' }
    default:
      return { label: status, tone: 'neutral' }
  }
}

export function isPending(status: string): boolean {
  return status === 'PROCESSING_UPLOAD' || status === 'PROCESSING_DOWNLOAD'
}
