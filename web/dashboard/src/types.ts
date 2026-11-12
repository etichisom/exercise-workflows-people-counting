/** One processed recording, as returned by the worker's GET /api/results. */
export type ResultRecord = {
  processedAt: string
  runId: string
  mediaKey: string
  /** Recording start in Unix seconds. */
  recordingStart: number
  delivery: 'submitted' | 'preview' | 'bypass' | 'offline' | 'callback-missing' | string
  personDetected: boolean
  peakCount: number
  /** Offsets are seconds from the start of the recording. */
  peakAtSeconds: number
  firstSeenSeconds: number
  lastSeenSeconds: number
  sampleSeconds: number
  framesAnalyzed: number
  maxConfidence: number
  hasSnapshot: boolean
}

export type ResultsResponse = { results: ResultRecord[] }

export type ConnectionState = 'connecting' | 'live' | 'offline'
