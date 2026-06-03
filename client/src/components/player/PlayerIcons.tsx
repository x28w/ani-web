import React from 'react'

interface IconProps {
  size?: number
}

export const PlayIcon: React.FC<IconProps> = ({ size = 22 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="white">
    <polygon points="5 3 19 12 5 21" />
  </svg>
)

export const Rewind10Icon: React.FC<IconProps> = ({ size = 22 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 1 0 2.636-6.364" />
    <polyline points="3 4 3 8 7 8" strokeWidth="2" />
    <text x="12" y="14" fontSize="6" textAnchor="middle" fill="white" stroke="none" fontFamily="sans-serif" fontWeight="bold">10</text>
  </svg>
)

export const Forward10Icon: React.FC<IconProps> = ({ size = 22 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a9 9 0 1 1-2.636-6.364" />
    <polyline points="21 4 21 8 17 8" strokeWidth="2" />
    <text x="12" y="14" fontSize="6" textAnchor="middle" fill="white" stroke="none" fontFamily="sans-serif" fontWeight="bold">10</text>
  </svg>
)

export const VolumeIcon: React.FC<IconProps> = ({ size = 22 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
  </svg>
)

export const VolumeMutedIcon: React.FC<IconProps> = ({ size = 22 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19" />
    <line x1="22" y1="9" x2="16" y2="15" />
    <line x1="16" y1="9" x2="22" y2="15" />
  </svg>
)

export const SkipNextIcon: React.FC<IconProps> = ({ size = 22 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="white">
    <polygon points="5 3 17 12 5 21" />
    <rect x="18" y="3" width="2.5" height="18" rx="0.5" />
  </svg>
)

export const CastIcon: React.FC<IconProps> = ({ size = 22 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <path d="M2 14h4a4 4 0 0 1 4 4v1" />
    <path d="M2 10h7a7 7 0 0 1 7 7v1" />
  </svg>
)

export const SubtitlesIcon: React.FC<IconProps> = ({ size = 22 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <line x1="6" y1="10" x2="10" y2="10" />
    <line x1="12" y1="10" x2="18" y2="10" />
    <line x1="6" y1="14" x2="14" y2="14" />
    <line x1="16" y1="14" x2="18" y2="14" />
  </svg>
)

export const SpeedIcon: React.FC<IconProps> = ({ size = 22 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20a8 8 0 0 1-8-8 8 8 0 0 1 8-8 8 8 0 0 1 8 8 8 8 0 0 1-8 8Z" />
    <path d="M12 4v2" />
    <path d="M4.93 7.07l1.41 1.41" />
    <path d="M4 12H2" />
    <line x1="12" y1="12" x2="16.5" y2="8" strokeWidth="2.5" />
    <circle cx="12" cy="12" r="1.5" fill="white" stroke="none" />
  </svg>
)

export const FullscreenIcon: React.FC<IconProps> = ({ size = 22 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 9 4 4 9 4" />
    <polyline points="15 4 20 4 20 9" />
    <polyline points="4 15 4 20 9 20" />
    <polyline points="20 15 20 20 15 20" />
  </svg>
)

export const BackArrowIcon: React.FC<IconProps> = ({ size = 22 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
)

export const FlagIcon: React.FC<IconProps> = ({ size = 22 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
    <line x1="4" y1="22" x2="4" y2="15" />
  </svg>
)

export const PauseIcon: React.FC<IconProps> = ({ size = 22 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="white">
    <rect x="6" y="3" width="4" height="18" rx="1" />
    <rect x="14" y="3" width="4" height="18" rx="1" />
  </svg>
)
