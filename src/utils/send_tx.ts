// import { SolanaAgentKit } from "../agent";
import {
  Connection,
  Keypair,
  Signer,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { ComputeBudgetProgram } from '@solana/web3.js';

const feeTiers = {
  min: 0.01,
  mid: 0.5,
  max: 0.95,
};

/**
 * Get priority fees for the current block
 * @param connection - Solana RPC connection
 * @returns Priority fees statistics and instructions for different fee levels
 */
// const connection =
export async function getComputeBudgetInstructions(
  // agent: SolanaAgentKit,
  connection: Connection,
  walletKeypair: Keypair,
  instructions: TransactionInstruction[],
  feeTier: keyof typeof feeTiers,
): Promise<{
  blockhash: string;
  computeBudgetLimitInstruction: TransactionInstruction;
  computeBudgetPriorityFeeInstructions: TransactionInstruction;
}> {
  const blockhash = (await connection.getLatestBlockhash()).blockhash;
  const messageV0 = new TransactionMessage({
    payerKey: walletKeypair.publicKey,
    recentBlockhash: blockhash,
    instructions: instructions,
  }).compileToV0Message();
  const transaction = new VersionedTransaction(messageV0);
  const simulatedTx = connection.simulateTransaction(transaction);
  const estimatedComputeUnits = (await simulatedTx).value.unitsConsumed;
  const safeComputeUnits = Math.ceil(
    estimatedComputeUnits
      ? Math.max(estimatedComputeUnits + 100000, estimatedComputeUnits * 1.2)
      : 200000,
  );
  const computeBudgetLimitInstruction =
    ComputeBudgetProgram.setComputeUnitLimit({
      units: safeComputeUnits,
    });

  const priorityFee = await connection
    .getRecentPrioritizationFees()
    .then(
      (fees) =>
        fees.sort((a, b) => a.prioritizationFee - b.prioritizationFee)[
          Math.floor(fees.length * feeTiers[feeTier])
        ].prioritizationFee,
    );

  const computeBudgetPriorityFeeInstructions =
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: priorityFee,
    });

  return {
    blockhash,
    computeBudgetLimitInstruction,
    computeBudgetPriorityFeeInstructions,
  };
}

/**
 * Send a transaction with priority fees
 * @param agent - SolanaAgentKit instance
 * @param tx - Transaction to send
 * @returns Transaction ID
 */
export async function sendTx(
  connection: Connection,
  walletKeypair: Keypair,
  instructions: TransactionInstruction[],
  otherKeypairs?: Keypair[],
) {
  const ixComputeBudget = await getComputeBudgetInstructions(
    connection,
    walletKeypair,
    instructions,
    'mid',
  );
  const allInstructions = [
    ixComputeBudget.computeBudgetLimitInstruction,
    ixComputeBudget.computeBudgetPriorityFeeInstructions,
    ...instructions,
  ];
  const messageV0 = new TransactionMessage({
    payerKey: walletKeypair.publicKey,
    recentBlockhash: ixComputeBudget.blockhash,
    instructions: allInstructions,
  }).compileToV0Message();
  const transaction = new VersionedTransaction(messageV0);
  transaction.sign([walletKeypair, ...(otherKeypairs ?? [])] as Signer[]);

  const timeoutMs = 90000;
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const transactionStartTime = Date.now();

    const signature = await connection.sendTransaction(transaction, {
      maxRetries: 0,
      skipPreflight: false,
    });

    const statuses = await connection.getSignatureStatuses([signature]);
    if (statuses.value[0]) {
      if (!statuses.value[0].err) {
        return signature;
      } else {
        throw new Error(
          `Transaction failed: ${statuses.value[0].err.toString()}`,
        );
      }
    }

    const elapsedTime = Date.now() - transactionStartTime;
    const remainingTime = Math.max(0, 1000 - elapsedTime);
    if (remainingTime > 0) {
      await new Promise((resolve) => setTimeout(resolve, remainingTime));
    }
  }
  throw new Error('Transaction timeout');
}