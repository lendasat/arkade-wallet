import { useContext, useEffect, useState } from 'react'
import Padded from '../../../components/Padded'
import Header from '../../../components/Header'
import Content from '../../../components/Content'
import FlexCol from '../../../components/FlexCol'
import FlexRow from '../../../components/FlexRow'
import Text from '../../../components/Text'
import Button from '../../../components/Button'
import SheetModal from '../../../components/SheetModal'
import { NavigationContext, Pages } from '../../../providers/navigation'
import { WalletContext } from '../../../providers/wallet'
import Loading from '../../../components/Loading'
import WarningBox from '../../../components/Warning'
import { extractError } from '../../../lib/error'
import { prettyNumber } from '../../../lib/format'
import { getReceivingAddresses } from '../../../lib/asp'
import {
  Client as SdkClient,
  createDexieSwapStorage,
  createDexieWalletStorage,
  VtxoSwapResponse,
  VtxoSwapParams,
} from '@lendasat/lendaswap-sdk'

// Stored VTXO swap data
interface StoredVtxoSwap {
  id: string
  response: VtxoSwapResponse
  swapParams: VtxoSwapParams
  createdAt: number
  vtxoOutpoints: string[]
  amount: number
}

// Refundable statuses
const REFUNDABLE_STATUSES = ['clientfunded', 'serverfunded', 'clientfundedserverrefunded']

const API_BASE_URL = import.meta.env.VITE_LENDASWAP_API_URL || 'http://localhost:3333'
const ARK_SERVER_URL = import.meta.env.VITE_ARK_SERVER || ''

let sdkClientInstance: SdkClient | null = null

async function getSdkClient(): Promise<SdkClient> {
  if (!sdkClientInstance) {
    const walletStorage = createDexieWalletStorage('lendaswap-wallet-v1')
    const swapStorage = createDexieSwapStorage('lendaswap-v1')
    sdkClientInstance = await SdkClient.create(API_BASE_URL, walletStorage, swapStorage, 'mutinynet', ARK_SERVER_URL)
    await sdkClientInstance.init()
  }
  return sdkClientInstance
}

// Local storage key for VTXO swaps
const VTXO_SWAPS_STORAGE_KEY = 'lendavtxo-swaps'

export function getStoredVtxoSwaps(): StoredVtxoSwap[] {
  try {
    const stored = localStorage.getItem(VTXO_SWAPS_STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

export function storeVtxoSwap(swap: StoredVtxoSwap): void {
  const swaps = getStoredVtxoSwaps()
  const existing = swaps.findIndex((s) => s.id === swap.id)
  if (existing >= 0) {
    swaps[existing] = swap
  } else {
    swaps.unshift(swap)
  }
  localStorage.setItem(VTXO_SWAPS_STORAGE_KEY, JSON.stringify(swaps))
}

export function updateStoredVtxoSwap(id: string, response: VtxoSwapResponse): void {
  const swaps = getStoredVtxoSwaps()
  const index = swaps.findIndex((s) => s.id === id)
  if (index >= 0) {
    swaps[index].response = response
    localStorage.setItem(VTXO_SWAPS_STORAGE_KEY, JSON.stringify(swaps))
  }
}

export function removeStoredVtxoSwap(id: string): void {
  const swaps = getStoredVtxoSwaps().filter((s) => s.id !== id)
  localStorage.setItem(VTXO_SWAPS_STORAGE_KEY, JSON.stringify(swaps))
}

const formatStatus = (status: string): string => {
  const statusMap: Record<string, string> = {
    pending: 'Pending',
    clientfunded: 'Client Funded',
    serverfunded: 'Server Funded',
    clientredeemed: 'Completed',
    serverredeemed: 'Server Redeemed',
    clientrefunded: 'Refunded',
    clientfundedserverrefunded: 'Server Refunded',
    expired: 'Expired',
  }
  return statusMap[status] || status
}

const getStatusColor = (status: string): string => {
  if (status === 'clientredeemed') return 'green'
  if (status === 'clientrefunded') return 'orange'
  if (REFUNDABLE_STATUSES.includes(status)) return 'orange'
  if (status === 'expired' || status === 'serverredeemed') return 'red'
  return 'dark60'
}

interface SwapLineProps {
  swap: StoredVtxoSwap
  onRefund: () => void
  isRefunding: boolean
}

const SwapLine = ({ swap, onRefund, isRefunding }: SwapLineProps) => {
  const isRefundable = REFUNDABLE_STATUSES.includes(swap.response.status)
  const date = new Date(swap.createdAt).toLocaleDateString()

  return (
    <div
      style={{
        backgroundColor: 'var(--dark10)',
        border: '1px solid var(--dark20)',
        borderRadius: '0.75rem',
        padding: '1rem',
        width: '100%',
      }}
    >
      <FlexCol gap="0.75rem">
        <FlexRow between>
          <Text bold>{prettyNumber(swap.amount)} sats</Text>
          <span
            style={{
              backgroundColor: isRefundable ? 'var(--orange10)' : 'var(--dark20)',
              color: `var(--${getStatusColor(swap.response.status)})`,
              padding: '0.25rem 0.5rem',
              borderRadius: '0.25rem',
              fontSize: '12px',
              fontWeight: 500,
            }}
          >
            {formatStatus(swap.response.status)}
          </span>
        </FlexRow>
        <FlexRow between>
          <Text color="dark50" smaller>
            {date}
          </Text>
          <Text color="dark50" smaller copy={swap.id}>
            {swap.id.slice(0, 8)}...
          </Text>
        </FlexRow>
        {isRefundable ? <Button label={isRefunding ? 'Refunding...' : 'Refund'} onClick={onRefund} disabled={isRefunding} small red /> : null}
      </FlexCol>
    </div>
  )
}

interface RefundDialogProps {
  isOpen: boolean
  onClose: () => void
  swap: StoredVtxoSwap | null
  onConfirm: () => void
  isLoading: boolean
  error: string
}

const RefundDialog = ({ isOpen, onClose, swap, onConfirm, isLoading, error }: RefundDialogProps) => {
  if (!swap) return null

  return (
    <SheetModal isOpen={isOpen} onClose={onClose}>
      <FlexCol gap="1.5rem">
        <Text bold>Refund Swap</Text>
        {error ? <WarningBox red text={error} /> : null}
        <FlexCol gap="0.5rem">
          <FlexRow between>
            <Text color="dark60">Amount</Text>
            <Text>{prettyNumber(swap.amount)} sats</Text>
          </FlexRow>
          <FlexRow between>
            <Text color="dark60">Status</Text>
            <Text color={getStatusColor(swap.response.status)}>{formatStatus(swap.response.status)}</Text>
          </FlexRow>
          <FlexRow between>
            <Text color="dark60">Swap ID</Text>
            <Text smaller copy={swap.id}>
              {swap.id.slice(0, 12)}...
            </Text>
          </FlexRow>
        </FlexCol>
        <Text color="dark60" smaller wrap>
          This will refund the swap back to your wallet. The funds will be returned to your Arkade address.
        </Text>
        <FlexCol gap="0.5rem">
          <Button
            label={isLoading ? 'Refunding...' : 'Confirm Refund'}
            onClick={onConfirm}
            disabled={isLoading}
            loading={isLoading}
            red
          />
          <Button label="Cancel" onClick={onClose} secondary disabled={isLoading} />
        </FlexCol>
      </FlexCol>
    </SheetModal>
  )
}

export default function LendaVtxoSettings() {
  const { navigate } = useContext(NavigationContext)
  const { svcWallet, reloadWallet } = useContext(WalletContext)

  const [swaps, setSwaps] = useState<StoredVtxoSwap[]>([])
  const [loading, setLoading] = useState(true)
  const [sdkClient, setSdkClient] = useState<SdkClient | null>(null)
  const [refundingId, setRefundingId] = useState<string | null>(null)
  const [refundDialogOpen, setRefundDialogOpen] = useState(false)
  const [selectedSwap, setSelectedSwap] = useState<StoredVtxoSwap | null>(null)
  const [refundError, setRefundError] = useState('')
  const [isRefunding, setIsRefunding] = useState(false)

  useEffect(() => {
    const setup = async () => {
      try {
        const sdk = await getSdkClient()
        setSdkClient(sdk)

        // Load stored swaps and refresh their status
        const storedSwaps = getStoredVtxoSwaps()
        const updatedSwaps = await Promise.all(
          storedSwaps.map(async (swap) => {
            try {
              const freshResponse = await sdk.getVtxoSwap(swap.id)
              updateStoredVtxoSwap(swap.id, freshResponse)
              return { ...swap, response: freshResponse }
            } catch {
              return swap
            }
          }),
        )
        setSwaps(updatedSwaps)
      } catch (err) {
        console.error('Error loading swaps:', err)
        setSwaps(getStoredVtxoSwaps())
      } finally {
        setLoading(false)
      }
    }
    setup()
  }, [])

  const handleRefundClick = (swap: StoredVtxoSwap) => {
    setSelectedSwap(swap)
    setRefundError('')
    setRefundDialogOpen(true)
  }

  const handleRefund = async () => {
    if (!sdkClient || !selectedSwap || !svcWallet) return

    setIsRefunding(true)
    setRefundError('')

    try {
      const addresses = await getReceivingAddresses(svcWallet)
      const refundAddress = addresses.offchainAddr

      await sdkClient.refundVtxoSwap(selectedSwap.response, selectedSwap.swapParams, refundAddress)

      // Refresh the swap status
      const freshResponse = await sdkClient.getVtxoSwap(selectedSwap.id)
      updateStoredVtxoSwap(selectedSwap.id, freshResponse)

      // Update local state
      setSwaps((prev) => prev.map((s) => (s.id === selectedSwap.id ? { ...s, response: freshResponse } : s)))

      setRefundDialogOpen(false)
      setSelectedSwap(null)

      // Reload wallet
      await reloadWallet()
    } catch (err) {
      console.error('Error refunding swap:', err)
      setRefundError(extractError(err))
    } finally {
      setIsRefunding(false)
    }
  }

  if (loading) return <Loading text="Loading swap history..." />

  const refundableSwaps = swaps.filter((s) => REFUNDABLE_STATUSES.includes(s.response.status))
  const completedSwaps = swaps.filter((s) => !REFUNDABLE_STATUSES.includes(s.response.status))

  return (
    <>
      <Header text="VTXO Refresh History" back={() => navigate(Pages.AppLendaVtxo)} />
      <Content>
        <Padded>
          <FlexCol gap="1.5rem">
            {swaps.length === 0 ? (
              <FlexCol centered gap="1rem">
                <Text color="dark50">No swap history yet</Text>
                <Text color="dark60" smaller wrap centered>
                  Your VTXO refresh swaps will appear here.
                </Text>
              </FlexCol>
            ) : (
              <>
                {refundableSwaps.length > 0 && (
                  <FlexCol gap="0.75rem">
                    <Text color="orange" smaller bold>
                      Needs Attention ({refundableSwaps.length})
                    </Text>
                    {refundableSwaps.map((swap) => (
                      <SwapLine
                        key={swap.id}
                        swap={swap}
                        onRefund={() => handleRefundClick(swap)}
                        isRefunding={refundingId === swap.id}
                      />
                    ))}
                  </FlexCol>
                )}

                {completedSwaps.length > 0 && (
                  <FlexCol gap="0.75rem">
                    <Text color="dark50" smaller bold>
                      History ({completedSwaps.length})
                    </Text>
                    {completedSwaps.map((swap) => (
                      <SwapLine
                        key={swap.id}
                        swap={swap}
                        onRefund={() => handleRefundClick(swap)}
                        isRefunding={refundingId === swap.id}
                      />
                    ))}
                  </FlexCol>
                )}
              </>
            )}
          </FlexCol>
        </Padded>
      </Content>

      <RefundDialog
        isOpen={refundDialogOpen}
        onClose={() => {
          if (!isRefunding) {
            setRefundDialogOpen(false)
            setSelectedSwap(null)
            setRefundError('')
          }
        }}
        swap={selectedSwap}
        onConfirm={handleRefund}
        isLoading={isRefunding}
        error={refundError}
      />
    </>
  )
}
