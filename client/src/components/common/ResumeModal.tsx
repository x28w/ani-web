import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button'
import styles from './ResumeModal.module.css'

interface ResumeModalProps {
  show: boolean
  resumeTime: string
  onResume: () => void
  onStartOver: () => void
  onNextEpisode?: () => void
  hasNextEpisode?: boolean
  isCompleted?: boolean
}

export default function ResumeModal({
  show,
  resumeTime,
  onResume,
  onStartOver,
  onNextEpisode,
  hasNextEpisode,
  isCompleted,
}: ResumeModalProps) {
  useEffect(() => {
    if (!show) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onStartOver()
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [show, onStartOver])

  if (!show) return null

  const modal = isCompleted ? (
    <div className={styles.modalOverlay} onClick={onStartOver}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <h3>Episode Completed!</h3>
        <p>
          {hasNextEpisode
            ? 'You finished this episode. Ready for the next one?'
            : 'You finished this episode. Want to watch again?'}
        </p>
        <div className={styles.modalActions}>
          <Button variant="secondary" onClick={onStartOver}>
            {hasNextEpisode ? 'Replay' : 'Start Over'}
          </Button>
          {hasNextEpisode && <Button onClick={onNextEpisode}>Next Episode</Button>}
        </div>
      </div>
    </div>
  ) : (
    <div className={styles.modalOverlay} onClick={onStartOver}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <h3>Resume Playback?</h3>
        <p>
          You were watching at <strong>{resumeTime}</strong>. Would you like to continue?
        </p>
        <div className={styles.modalActions}>
          <Button variant="secondary" onClick={onStartOver}>
            Start Over
          </Button>
          <Button onClick={onResume}>Resume</Button>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
