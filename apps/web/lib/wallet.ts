/**
 * Wallet helpers — re-exported from @watool/processing so the web app and the
 * worker share one implementation. Import from here in server actions / server
 * components.
 */
export {
  getOrCreateWallet,
  getBalancePaise,
  creditWallet,
  debitWallet,
  listTransactions,
  isWalletBillingEnabled,
  getMessageCostPaise,
  type WalletTxnKind,
  type LedgerMeta,
  type MessageCategory,
} from "@watool/processing";
