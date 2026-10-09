import type { Role } from '../../../types'
import type {
  Escrow,
  EscrowListParams,
  TopUpResponse,
  WalletBalance,
  WalletTransaction,
  WalletTransactionListResponse,
} from './types'

/**
 * In-memory wallet/escrow store for `EXPO_PUBLIC_USE_MOCK=1`, mirroring the
 * API contract so screens keep working without a backend. Balances seed from
 * the old demo numbers (seeker 1.42M / tasker 2.85M) per signed-in user.
 */

const ROLE_SEED_BALANCE: Record<Role, number> = {
  seeker: 0,
  tasker: 0,
}

type MockWallet = {
  balance: number
  transactions: WalletTransaction[]
}

const wallets = new Map<string, MockWallet>()
const escrows = new Map<string, Escrow>()

let nextTxId = 1
let nextEscrowId = 1

function ensureWallet(userId: string, role: Role): MockWallet {
  const existing = wallets.get(userId)
  if (existing) return existing
  const wallet: MockWallet = { balance: ROLE_SEED_BALANCE[role], transactions: [] }
  wallets.set(userId, wallet)
  return wallet
}

function addTransaction(
  userId: string,
  role: Role,
  type: WalletTransaction['type'],
  amount: number,
  refJobId: string | null,
): void {
  const wallet = ensureWallet(userId, role)
  wallet.transactions.unshift({
    id: `mock-tx-${nextTxId++}`,
    type,
    amount,
    refJobId,
    createdAt: new Date().toISOString(),
  })
}

/** Current balance of a wallet, lazily seeded (payer -> seeker seed). */
export function mockBalanceOf(userId: string): number {
  return ensureWallet(userId, 'seeker').balance
}

export function mockGetBalance(userId: string, role: Role): WalletBalance {
  const wallet = ensureWallet(userId, role)
  const heldJobs = [...escrows.values()]
    .filter((escrow) => escrow.payerId === userId && escrow.status === 'Held')
    .sort((a, b) => b.heldAt.localeCompare(a.heldAt))
    .map((escrow) => ({ jobId: escrow.jobId, amount: escrow.amount }))
  return {
    balance: wallet.balance,
    escrowHeld: heldJobs.reduce((sum, job) => sum + job.amount, 0),
    escrowHeldJobs: heldJobs,
  }
}

export function mockListTransactions(
  userId: string,
  role: Role,
): WalletTransactionListResponse {
  const wallet = ensureWallet(userId, role)
  return { transactions: [...wallet.transactions], nextCursor: null }
}

export function mockTopUp(userId: string, role: Role, amount: number): TopUpResponse {
  const wallet = ensureWallet(userId, role)
  wallet.balance += amount
  addTransaction(userId, role, 'TopUp', amount, null)
  return { balance: wallet.balance }
}

export function mockGetEscrow(jobId: string): Escrow | null {
  return escrows.get(jobId) ?? null
}

export function mockListEscrows(userId: string, params: EscrowListParams = {}): Escrow[] {
  return [...escrows.values()]
    .filter((escrow) => escrow.payerId === userId || escrow.payeeId === userId)
    .filter((escrow) => (params.status ? escrow.status === params.status : true))
    .filter((escrow) => (params.jobId ? escrow.jobId === params.jobId : true))
    .sort((a, b) => b.heldAt.localeCompare(a.heldAt))
}

/** Mirrors `POST /api/jobs/{id}/accept`: debit payer, Hold tx, Held escrow. */
export function mockHoldEscrow(
  jobId: string,
  payerId: string,
  payeeId: string,
  amount: number,
): Escrow {
  const existing = escrows.get(jobId)
  if (existing && existing.status === 'Held') {
    throw new Error('Công việc đã có người nhận.')
  }

  const payerWallet = ensureWallet(payerId, 'seeker')
  if (payerWallet.balance < amount) {
    throw new Error('Số dư ví của người đăng không đủ để ký quỹ.')
  }

  const now = new Date().toISOString()
  const escrow: Escrow = existing
    ? { ...existing, payerId, payeeId, amount, status: 'Held', heldAt: now, releasedAt: null }
    : {
        id: `mock-escrow-${nextEscrowId++}`,
        jobId,
        payerId,
        payeeId,
        amount,
        status: 'Held',
        heldAt: now,
        releasedAt: null,
      }

  payerWallet.balance -= amount
  addTransaction(payerId, 'seeker', 'Hold', -amount, jobId)
  escrows.set(jobId, escrow)
  return escrow
}

/** Mirrors release: payer Held -> Released and payee credited. */
export function mockReleaseEscrow(jobId: string, payerId: string): Escrow {
  const escrow = escrows.get(jobId)
  if (!escrow || escrow.status !== 'Held' || escrow.payerId !== payerId) {
    throw new Error('Khoản ký quỹ không còn đang được giữ.')
  }

  ensureWallet(escrow.payeeId, 'tasker').balance += escrow.amount
  addTransaction(escrow.payeeId, 'tasker', 'Release', escrow.amount, jobId)
  const released: Escrow = { ...escrow, status: 'Released', releasedAt: new Date().toISOString() }
  escrows.set(jobId, released)
  return released
}

/** Mirrors cancel/refund: Held -> Refunded and payer credited. */
export function mockRefundEscrow(jobId: string): Escrow {
  const escrow = escrows.get(jobId)
  if (!escrow || escrow.status !== 'Held') {
    throw new Error('Khoản ký quỹ không còn đang được giữ.')
  }

  ensureWallet(escrow.payerId, 'seeker').balance += escrow.amount
  addTransaction(escrow.payerId, 'seeker', 'Refund', escrow.amount, jobId)
  const refunded: Escrow = { ...escrow, status: 'Refunded', releasedAt: new Date().toISOString() }
  escrows.set(jobId, refunded)
  return refunded
}
