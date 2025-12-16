import { useContext, useMemo, useState } from 'react'
import Content from '../../../components/Content'
import Padded from '../../../components/Padded'
import Header from '../../../components/Header'
import FlexCol from '../../../components/FlexCol'
import FlexRow from '../../../components/FlexRow'
import Text from '../../../components/Text'
import Button from '../../../components/Button'
import ButtonsOnBottom from '../../../components/ButtonsOnBottom'
import SheetModal from '../../../components/SheetModal'
import { NavigationContext, Pages } from '../../../providers/navigation'
import { WalletContext } from '../../../providers/wallet'
import { ConfigContext } from '../../../providers/config'
import { prettyNumber, prettyHide } from '../../../lib/format'
import { Vtxo } from '../../../lib/types'
import { EmptyCoinsList } from '../../../components/Empty'
import Loading from '../../../components/Loading'
import WarningBox from '../../../components/Warning'
import { extractError } from '../../../lib/error'
import SuccessIcon from '../../../icons/Success'

const formatRelativeExpiry = (timestamp: number): string => {
  const now = Math.floor(Date.now() / 1000)
  const delta = (timestamp / 1000)- now

  if (delta <= 0) return 'expired'

  const minutes = Math.floor(delta / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `in ${days}d ${hours % 24}h`
  if (hours > 0) return `in ${hours}h ${minutes % 60}m`
  return `in ${minutes}m`
}

interface VtxoLineProps {
  vtxo: Vtxo
  selected: boolean
  onToggle: () => void
  showBalance: boolean
}

const VtxoLine = ({ vtxo, selected, onToggle, showBalance }: VtxoLineProps) => {
  const amount = showBalance ? prettyNumber(vtxo.value) : prettyHide(vtxo.value)
  const expiry = vtxo.virtualStatus?.batchExpiry ? formatRelativeExpiry(vtxo.virtualStatus.batchExpiry) : 'Unknown'
  const isExpired = expiry === 'expired'
  const isExpiringSoon = vtxo.virtualStatus?.batchExpiry
    ? vtxo.virtualStatus.batchExpiry / 1000 - Date.now() / 1000 < 86400 * 3
    : false

  return (
    <div
      style={{
        backgroundColor: selected ? 'var(--purple10)' : 'var(--dark10)',
        border: selected ? '2px solid var(--purple)' : '1px solid var(--dark20)',
        borderRadius: '0.75rem',
        padding: '1rem',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        width: '100%',
      }}
      onClick={onToggle}
      role="button"
      tabIndex={0}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
          <Checkbox checked={selected} />
          <div>
            <Text bold>{amount} sats</Text>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem', flexShrink: 0 }}>
          <span
            style={{
              backgroundColor: isExpired ? 'var(--red10)' : isExpiringSoon ? 'var(--orange10)' : 'var(--dark20)',
              color: isExpired ? 'var(--red)' : isExpiringSoon ? 'var(--orange)' : 'var(--dark60)',
              padding: '0.25rem 0.5rem',
              borderRadius: '0.25rem',
              fontSize: '12px',
              fontWeight: 500,
            }}
          >
            {isExpired ? 'Expired' : expiry}
          </span>
        </div>
      </div>
    </div>
  )
}

const Checkbox = ({ checked }: { checked: boolean }) => (
  <div
    style={{
      width: '22px',
      height: '22px',
      borderRadius: '6px',
      border: checked ? 'none' : '2px solid var(--dark40)',
      backgroundColor: checked ? 'var(--purple)' : 'transparent',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      transition: 'all 0.15s ease',
      boxShadow: checked ? '0 2px 4px rgba(57, 25, 152, 0.3)' : 'none',
    }}
  >
    {checked ? (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M3 7L6 10L11 4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ) : null}
  </div>
)

interface RefreshDialogProps {
  isOpen: boolean
  onClose: () => void
  selectedCount: number
  totalAmount: number
  onConfirm: () => void
  isLoading: boolean
  error: string
}

const RefreshDialog = ({
  isOpen,
  onClose,
  selectedCount,
  totalAmount,
  onConfirm,
  isLoading,
  error,
}: RefreshDialogProps) => {
  const placeholderFee = 2 * selectedCount // placeholder fee in sats, 2 sats per vtxo

  return (
    <SheetModal isOpen={isOpen} onClose={onClose}>
      <FlexCol gap="1.5rem">
        <Text bold>Refresh VTXOs</Text>
        {error ? <WarningBox red text={error} /> : null}
        <FlexCol gap="0.5rem">
          <FlexRow between>
            <Text color="dark60">Selected VTXOs</Text>
            <Text>{selectedCount}</Text>
          </FlexRow>
          <FlexRow between>
            <Text color="dark60">Total Amount</Text>
            <Text>{prettyNumber(totalAmount)} sats</Text>
          </FlexRow>
          <FlexRow between>
            <Text color="dark60">Estimated Fee</Text>
            <Text>{prettyNumber(placeholderFee)} sats</Text>
          </FlexRow>
        </FlexCol>
        <Text color="dark60" smaller>
          This will atomically swap your selected VTXOs for new ones with a longer expiry period.
        </Text>
        <FlexCol gap="0.5rem">
          <Button label={isLoading ? 'Refreshing...' : 'Confirm Refresh'} onClick={onConfirm} disabled={isLoading} loading={isLoading} />
          <Button label="Cancel" onClick={onClose} secondary disabled={isLoading} />
        </FlexCol>
      </FlexCol>
    </SheetModal>
  )
}

interface SuccessDialogProps {
  isOpen: boolean
  onClose: () => void
  txid: string
  refreshedCount: number
}

const SuccessDialog = ({ isOpen, onClose, txid, refreshedCount }: SuccessDialogProps) => {
  const shortTxid = txid.length > 16 ? `${txid.slice(0, 8)}...${txid.slice(-8)}` : txid

  return (
    <SheetModal isOpen={isOpen} onClose={onClose}>
      <FlexCol gap="1.5rem" centered>
        <div style={{ color: 'var(--green)' }}>
          <SuccessIcon />
        </div>
        <Text bold>VTXOs Refreshed!</Text>
        <Text color="dark60" smaller wrap centered>
          Successfully refreshed {refreshedCount} VTXO{refreshedCount !== 1 ? 's' : ''} with extended expiry.
        </Text>
        <FlexCol gap="0.5rem">
          <Text color="dark50" smaller>
            Transaction ID
          </Text>
          <Text smaller copy={txid}>
            {shortTxid}
          </Text>
        </FlexCol>
        <Button label="Done" onClick={onClose} />
      </FlexCol>
    </SheetModal>
  )
}

export default function LendaVtxo() {
  const { navigate } = useContext(NavigationContext)
  const { vtxos, svcWallet, reloadWallet } = useContext(WalletContext)
  const { config } = useContext(ConfigContext)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [successOpen, setSuccessOpen] = useState(false)
  const [successTxid, setSuccessTxid] = useState('')
  const [refreshedCount, setRefreshedCount] = useState(0)

  // Filter for preconfirmed and settled VTXOs, sort by oldest expiry first
  const eligibleVtxos = useMemo(() => {
    const eligible = vtxos.spendable.filter(
      (vtxo) => vtxo.virtualStatus?.state === 'preconfirmed' || vtxo.virtualStatus?.state === 'settled',
    )

    return eligible.sort((a, b) => {
      const expiryA = a.virtualStatus?.batchExpiry ?? Infinity
      const expiryB = b.virtualStatus?.batchExpiry ?? Infinity
      return expiryA - expiryB
    })
  }, [vtxos.spendable])

  const toggleSelection = (txid: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(txid)) {
        next.delete(txid)
      } else {
        next.add(txid)
      }
      return next
    })
  }

  const selectAll = () => {
    if (selectedIds.size === eligibleVtxos.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(eligibleVtxos.map((v) => v.txid)))
    }
  }

  const selectedVtxos = eligibleVtxos.filter((v) => selectedIds.has(v.txid))
  const totalSelectedAmount = selectedVtxos.reduce((sum, v) => sum + v.value, 0)

  const handleRefresh = async () => {
    if (!svcWallet) {
      setError('Wallet not loaded')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const txid = await svcWallet.sendBitcoin({
        amount: totalSelectedAmount,
        address:
          'tark1qra883hysahlkt0ujcwhv0x2n278849c3m7t3a08l7fdc40f4f2nmqwxh7lh0hd4udw685jjm7f8vcuhz5nr05en0xgucqe7fvlnxf2fk4ugl0',
        selectedVtxos,
      })

      // Success
      setRefreshedCount(selectedIds.size)
      setSuccessTxid(txid)
      setDialogOpen(false)
      setSelectedIds(new Set())
      setSuccessOpen(true)

      // Reload wallet to get updated VTXOs
      await reloadWallet()
    } catch (err) {
      console.error('Error refreshing VTXOs:', err)
      setError(extractError(err))
    } finally {
      setIsLoading(false)
    }
  }

  const handleCloseDialog = () => {
    if (!isLoading) {
      setDialogOpen(false)
      setError('')
    }
  }

  const handleCloseSuccess = () => {
    setSuccessOpen(false)
    setSuccessTxid('')
    setRefreshedCount(0)
  }

  if (!svcWallet) return <Loading text="Loading..." />

  return (
    <>
      <Header text="Refresh VTXOs" back={() => navigate(Pages.Apps)} />
      <Content>
        <Padded>
          <FlexCol gap="1rem">
            <Text color="dark60" smaller wrap>
              VTXOs have an expiry. Swap them instantly for a newer VTXO using this service instead of joining a lengthy batch protocol.
            </Text>

            {eligibleVtxos.length === 0 ? (
              <EmptyCoinsList />
            ) : (
              <>
                <FlexRow between>
                  <Text color="dark50" smaller>
                    {eligibleVtxos.length} VTXO{eligibleVtxos.length !== 1 ? 's' : ''} available
                  </Text>
                  <span
                    onClick={selectAll}
                    style={{ cursor: 'pointer', textDecoration: 'underline' }}
                    role="button"
                    tabIndex={0}
                  >
                    <Text color="purple" smaller>
                      {selectedIds.size === eligibleVtxos.length ? 'Deselect all' : 'Select all'}
                    </Text>
                  </span>
                </FlexRow>

                <FlexCol gap="0.5rem">
                  {eligibleVtxos.map((vtxo) => (
                    <VtxoLine
                      key={vtxo.txid}
                      vtxo={vtxo}
                      selected={selectedIds.has(vtxo.txid)}
                      onToggle={() => toggleSelection(vtxo.txid)}
                      showBalance={config.showBalance}
                    />
                  ))}
                </FlexCol>
              </>
            )}
          </FlexCol>
        </Padded>
      </Content>

      {selectedIds.size > 0 && (
        <ButtonsOnBottom>
          <Button
            label={`Refresh ${selectedIds.size} VTXO${selectedIds.size !== 1 ? 's' : ''}`}
            onClick={() => setDialogOpen(true)}
          />
        </ButtonsOnBottom>
      )}

      <RefreshDialog
        isOpen={dialogOpen}
        onClose={handleCloseDialog}
        selectedCount={selectedIds.size}
        totalAmount={totalSelectedAmount}
        onConfirm={handleRefresh}
        isLoading={isLoading}
        error={error}
      />

      <SuccessDialog
        isOpen={successOpen}
        onClose={handleCloseSuccess}
        txid={successTxid}
        refreshedCount={refreshedCount}
      />
    </>
  )
}
