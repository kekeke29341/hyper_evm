export function MetaMaskIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M36.5 4.5L22.5 14.5L25 8.5L36.5 4.5Z" fill="#E2761B" />
      <path d="M3.5 4.5L17.2 14.6L15 8.5L3.5 4.5Z" fill="#E4761B" />
      <path d="M31.5 27.5L27.5 33.5L35.5 35.5L37.5 27.7L31.5 27.5Z" fill="#E4761B" />
      <path d="M2.5 27.7L4.5 35.5L12.5 33.5L8.5 27.5L2.5 27.7Z" fill="#E4761B" />
      <path d="M12 18.5L10 22.5L18 23L17.7 14.8L12 18.5Z" fill="#E4761B" />
      <path d="M28 18.5L22.1 14.6L22 23L30 22.5L28 18.5Z" fill="#E4761B" />
      <path d="M12.5 33.5L17 31L13 27.5L12.5 33.5Z" fill="#D7C1B3" />
      <path d="M23 31L27.5 33.5L27 27.5L23 31Z" fill="#D7C1B3" />
      <path d="M30 22.5L22 23L23 31L27 27.5L30 22.5Z" fill="#233447" />
      <path d="M10 22.5L13 27.5L17 31L18 23L10 22.5Z" fill="#233447" />
      <path d="M18 23L17 31L23 31L22 23L18 23Z" fill="#CD6116" />
      <path d="M22 14.6L28 18.5L25 8.5L22 14.6Z" fill="#763D16" />
      <path d="M12 18.5L17.7 14.8L15 8.5L12 18.5Z" fill="#763D16" />
    </svg>
  );
}

export function WalletConnectIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="10" fill="#3B99FC" />
      <path
        d="M12.5 15.5C17.2 10.8 24.8 10.8 29.5 15.5L30.2 16.2C30.5 16.5 30.5 17 30.2 17.3L28.5 19C28.3 19.2 28 19.2 27.8 19L26.8 18.1C23.5 15.3 18.5 15.3 15.2 18.1L14.1 19C13.9 19.2 13.6 19.2 13.4 19L11.7 17.3C11.4 17 11.4 16.5 11.7 16.2L12.5 15.5Z"
        fill="white"
      />
      <path
        d="M32.5 19.5L34.1 21C34.4 21.3 34.4 21.8 34.1 22.1C30.5 25.2 25.5 28 20 28C14.5 28 9.5 25.2 5.9 22.1C5.6 21.8 5.6 21.3 5.9 21L7.5 19.5C7.8 19.2 8.3 19.2 8.6 19.5C11.6 22 15.6 24.2 20 24.2C24.4 24.2 28.4 22 31.4 19.5C31.7 19.2 32.2 19.2 32.5 19.5Z"
        fill="white"
      />
    </svg>
  );
}

export function BrowserWalletIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="10" fill="#27272a" />
      <rect x="8" y="12" width="24" height="16" rx="2" stroke="#a1a1aa" strokeWidth="1.5" />
      <circle cx="20" cy="20" r="3" fill="#22d3ee" />
    </svg>
  );
}
