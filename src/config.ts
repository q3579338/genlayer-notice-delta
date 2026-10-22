export const APP_VERSION = "notice-delta/0.1.0";
export const NETWORK = { id: 61999, name: "GenLayer Studio", rpc: "https://studio.genlayer.com/api" } as const;
export const DEPLOYMENT = {
  address: String(import.meta.env.VITE_CONTRACT_ADDRESS || "").trim(),
  transaction: String(import.meta.env.VITE_DEPLOYMENT_TX || "").trim(),
};
