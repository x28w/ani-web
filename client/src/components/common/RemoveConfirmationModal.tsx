import React, { useState, useEffect } from 'react'
import { Button } from './Button'
import { Modal as ModalUI } from './Modal'
import styles from './RemoveConfirmationModal.module.css'

interface RemoveConfirmationModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (options: { removeFromWatchlist?: boolean; rememberPreference?: boolean }) => void
  animeName: string
  scenario: 'continueWatching' | 'watchlist'
}

export default function RemoveConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  animeName,
  scenario,
}: RemoveConfirmationModalProps) {
  const [rememberPreference, setRememberPreference] = useState(false)
  const [removeFromWatchlist, setRemoveFromWatchlist] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setRememberPreference(false)
      setRemoveFromWatchlist(false)
    }
  }, [isOpen])

  const handleConfirm = () => {
    onConfirm({
      removeFromWatchlist: scenario === 'continueWatching' ? removeFromWatchlist : true,
      rememberPreference: scenario === 'watchlist' ? rememberPreference : undefined,
    })
  }

  const title = scenario === 'continueWatching' ? 'Remove from queue' : 'Remove from watchlist'
  const message =
    scenario === 'continueWatching'
      ? `Remove "${animeName}" from Continue Watching?`
      : `Are you sure you want to remove "${animeName}" from your watchlist?`

  return (
    <ModalUI
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      width="sm"
      footer={
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleConfirm}>
            Remove
          </Button>
        </div>
      }
    >
      <div className={styles.body}>
        <p className={styles.message}>{message}</p>
        {scenario === 'continueWatching' && (
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={removeFromWatchlist}
              onChange={(e) => setRemoveFromWatchlist(e.target.checked)}
            />
            Also remove from my watchlist
          </label>
        )}
        {scenario === 'watchlist' && (
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={rememberPreference}
              onChange={(e) => setRememberPreference(e.target.checked)}
            />
            Remember my choice
          </label>
        )}
      </div>
    </ModalUI>
  )
}
