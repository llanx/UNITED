import { QRCodeSVG } from 'qrcode.react'

interface ProvisioningQRProps {
  /** QR payload JSON string containing ip, port, and pk */
  qrPayload: string
  /** Called when user cancels provisioning */
  onCancel: () => void
}

/**
 * QR code display for device provisioning (sender side).
 * Shows a large QR code with the provisioning payload,
 * plus a copiable text fallback for manual entry.
 */
export default function ProvisioningQR({ qrPayload, onCancel }: ProvisioningQRProps) {
  return (
    <div className="flex flex-col items-center gap-6">
      {/* QR code on white background for scannability */}
      <div className="rounded-xl bg-white p-6">
        <QRCodeSVG value={qrPayload} size={240} level="M" />
      </div>

      <p className="text-sm text-[var(--color-text-muted)] text-center">
        Scan this QR code with your new device
      </p>

      {/* Status indicator */}
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 rounded-full bg-yellow-400 animate-pulse" />
        <span className="text-xs text-[var(--color-text-muted)]">
          Waiting for new device to connect...
        </span>
      </div>

      {/* Copiable text fallback */}
      <div className="w-full">
        <label className="mb-1 block text-xs text-[var(--color-text-muted)]">
          Or share this code manually:
        </label>
        <div
          className="w-full cursor-pointer rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-mono text-[var(--color-text-muted)] break-all select-all hover:bg-white/10 transition-colors"
          onClick={() => {
            navigator.clipboard.writeText(qrPayload).catch(() => {
              // Clipboard API may not be available, selection is the fallback
            })
          }}
          title="Click to copy"
        >
          {qrPayload}
        </div>
        <p className="mt-1 text-xs text-[var(--color-text-muted)] opacity-60">
          Click to copy
        </p>
      </div>

      {/* Cancel button */}
      <button
        onClick={onCancel}
        className="rounded-lg border border-white/10 px-6 py-2 text-sm text-[var(--color-text-muted)] transition-colors hover:bg-white/5"
      >
        Cancel Transfer
      </button>
    </div>
  )
}
