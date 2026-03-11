/**
 * blockchain.ts — ethers.js v6 integration for Polygon Amoy.
 * Handles MetaMask wallet connection, network switching, on-chain storage, and lookups.
 */
import { ethers } from 'ethers';

export const AMOY_CHAIN_ID = '0x13882'; // 80002
export const CONTRACT_ADDRESS = process.env.VITE_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000';

const AMOY_RPC = 'https://rpc-amoy.polygon.technology/';

const CONTRACT_ABI = [
  'function storeReport(bytes32 docHash, string company, uint256 greenScore, string grade) external',
  'function getReport(bytes32 docHash) external view returns (tuple(string company, uint256 greenScore, string grade, uint256 timestamp, address submitter))',
  'function isStored(bytes32 docHash) external view returns (bool)',
  'event ReportStored(bytes32 indexed docHash, string company, uint256 score, string grade, address submitter)',
];

export function isMetaMaskInstalled(): boolean {
  return typeof window !== 'undefined' && !!(window as any).ethereum?.isMetaMask;
}

export async function connectWallet(): Promise<string> {
  const eth = (window as any).ethereum;
  if (!eth) throw new Error('MetaMask not found. Please install MetaMask.');
  const accounts = await eth.request({ method: 'eth_requestAccounts' });
  if (!accounts || accounts.length === 0) throw new Error('No account selected in MetaMask.');
  return accounts[0];
}

export async function getCurrentChainId(): Promise<string> {
  const eth = (window as any).ethereum;
  return eth.request({ method: 'eth_chainId' });
}

export async function switchToAmoy(): Promise<void> {
  const eth = (window as any).ethereum;
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: AMOY_CHAIN_ID }] });
  } catch (switchError: any) {
    if (switchError.code === 4902) {
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: AMOY_CHAIN_ID,
          chainName: 'Polygon Amoy Testnet',
          nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
          rpcUrls: [AMOY_RPC],
          blockExplorerUrls: ['https://amoy.polygonscan.com'],
        }],
      });
    } else {
      throw switchError;
    }
  }
}

function hexToBytes32(hex: string): string {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  return '0x' + clean.padStart(64, '0');
}

export async function hashBuffer(buffer: ArrayBuffer): Promise<string> {
  const hashBuf = await crypto.subtle.digest('SHA-256', buffer);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  return hashArr.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function storeReportOnChain(
  hash: string, company: string, score: number, grade: string
): Promise<{ txHash: string; txUrl: string }> {
  if (CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') {
    throw new Error('Contract not deployed. Add VITE_CONTRACT_ADDRESS to your .env file.');
  }
  const eth = (window as any).ethereum;
  const provider = new ethers.BrowserProvider(eth);
  const signer = await provider.getSigner();
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
  const bytes32Hash = hexToBytes32(hash);
  const tx = await contract.storeReport(bytes32Hash, company, BigInt(Math.round(score)), grade);
  const receipt = await tx.wait();
  return {
    txHash: receipt.hash,
    txUrl: `https://amoy.polygonscan.com/tx/${receipt.hash}`,
  };
}

export async function getReportFromChain(hash: string): Promise<any | null> {
  if (CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') return null;
  try {
    const provider = new ethers.JsonRpcProvider(AMOY_RPC);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    const bytes32Hash = hexToBytes32(hash);
    const stored = await contract.isStored(bytes32Hash);
    if (!stored) return null;
    const report = await contract.getReport(bytes32Hash);
    return {
      company: report.company,
      greenScore: Number(report.greenScore),
      grade: report.grade,
      timestamp: Number(report.timestamp),
      submitter: report.submitter,
    };
  } catch {
    return null;
  }
}
