import Wallet from "@project-serum/sol-wallet-adapter";
import {
  Connection,
  SystemProgram,
  Transaction,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import { deserialize, serialize } from "borsh";

const cluster = "https://api.devnet.solana.com";
const connection = new Connection(cluster, "confirmed");
const wallet = new Wallet("https://www.sollet.io", cluster);
const programId = new PublicKey("5boAEVrqySfeTnERzGK1CjFoYTRRGVoUEF6yqQfSSG48");

export async function setPayerAndBlockhashTransaction(instructions) {
  const transaction = new Transaction();
  instructions.forEach((instruction) => {
    transaction.add(instruction);
  });
  transaction.feePayer = wallet.publicKey;
  const hash = await connection.getRecentBlockhash();
  transaction.recentBlockhash = hash.blockhash;
  return transaction;
}

export async function signAndSendTransaction(transaction) {
  try {
    console.log("start signAndSendTransaction");
    const signedTrans = await wallet.signTransaction(transaction);
    console.log("signed transaction");
    const signature = await connection.sendRawTransaction(signedTrans.serialize());
    console.log("end signAndSendTransaction");
    return signature;
  } catch (error) {
    console.log("signAndSendTransaction error", error);
    throw error;
  }
}

class CampaignDetails {
  constructor(properties) {
    Object.keys(properties).forEach((key) => {
      this[key] = properties[key];
    });
  }

  static schema = new Map([[CampaignDetails, {
    kind: "struct",
    fields: [
      ["admin", [32]],
      ["name", "string"],
      ["description", "string"],
      ["image_link", "string"],
      ["amount_donated", "u64"],
    ]
  }]]);
}

async function checkWallet() {
  if (!wallet.connected) {
    await wallet.connect();
  }
}

export async function createCampaign(name, description, image_link) {
  await checkWallet();

  const SEED = "abcdef" + Math.random().toString();
  const newAccount = await PublicKey.createWithSeed(
    wallet.publicKey,
    SEED,
    programId
  );

  const campaign = new CampaignDetails({
    admin: wallet.publicKey.toBuffer(),
    name,
    description,
    image_link,
    amount_donated: 0,
  });

  const data = serialize(CampaignDetails.schema, campaign);
  const data_to_send = new Uint8Array([0, ...data]);

  const lamports = await connection.getMinimumBalanceForRentExemption(data.length);
  console.log(data.length);

  const createProgramAccount = SystemProgram.createAccountWithSeed({
    fromPubkey: wallet.publicKey,
    basePubkey: wallet.publicKey,
    seed: SEED,
    newAccountPubkey: newAccount,
    lamports,
    space: data.length,
    programId,
  });

  const instructionToOurProgram = new TransactionInstruction({
    keys: [
      { pubkey: newAccount, isSigner: false, isWritable: true },
      { pubkey: wallet.publicKey, isSigner: true },
    ],
    programId,
    data: data_to_send,
  });

  const trans = await setPayerAndBlockhashTransaction([createProgramAccount, instructionToOurProgram]);
  const signature = await signAndSendTransaction(trans);

  const result = await connection.confirmTransaction(signature);
  console.log("end sendMessage", result);
}

export async function getAllCampaigns() {
  const accounts = await connection.getProgramAccounts(programId);
  const campaigns = [];
  accounts.forEach((e) => {
    try {
      const campaign = deserialize(CampaignDetails.schema, CampaignDetails, e.account.data);
      campaigns.push({
        pubId: e.pubkey,
        admin: campaign.admin,
        name: campaign.name,
        description: campaign.description,
        image_link: campaign.image_link,
        amount_donated: campaign.amount_donated,
      });
    } catch (error) {
      console.log("error", error);
    }
  });
  return campaigns;
}

export async function donateToCampaign(campaignPubKey, amount) {
  await checkWallet();

  const SEED = "abcdef" + Math.random().toString();
  const newAccount = await PublicKey.createWithSeed(
    wallet.publicKey,
    SEED,
    programId
  );

  const createProgramAccount = SystemProgram.createAccountWithSeed({
    fromPubkey: wallet.publicKey,
    basePubkey: wallet.publicKey,
    seed: SEED,
    newAccountPubkey: newAccount,
    lamports: amount,
    space: 1,
    programId,
  });

  const instructionToOurProgram = new TransactionInstruction({
    keys: [
      { pubkey: campaignPubKey, isSigner: false, isWritable: true },
      { pubkey: newAccount, isSigner: false },
      { pubkey: wallet.publicKey, isSigner: true },
    ],
    programId,
    data: new Uint8Array([2]),
  });

  const trans = await setPayerAndBlockhashTransaction([createProgramAccount, instructionToOurProgram]);
  const signature = await signAndSendTransaction(trans);

  const result = await connection.confirmTransaction(signature);
  console.log("end sendMessage", result);
}

class WithdrawRequest {
  constructor(properties) {
    Object.keys(properties).forEach((key) => {
      this[key] = properties[key];
    });
  }
  static schema = new Map([[WithdrawRequest, {
    kind: "struct",
    fields: [
      ["amount", "u64"]
    ],
  }]]);
}

export async function withdraw(campaignPubKey, amount) {
  await checkWallet();

  const withdrawRequest = new WithdrawRequest({ amount });
  const data = serialize(WithdrawRequest.schema, withdrawRequest);
  const data_to_send = new Uint8Array([1, ...data]);

  const instructionToOurProgram = new TransactionInstruction({
    keys: [
      { pubkey: campaignPubKey, isSigner: false, isWritable: true },
      { pubkey: wallet.publicKey, isSigner: true },
    ],
    programId,
    data: data_to_send,
  });

  const trans = await setPayerAndBlockhashTransaction([instructionToOurProgram]);
  const signature = await signAndSendTransaction(trans);

  const result = await connection.confirmTransaction(signature);
  console.log("end sendMessage", result);
}
