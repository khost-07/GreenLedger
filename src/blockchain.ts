/**
 * blockchain.ts — ethers.js v6 integration for Ethereum Sepolia testnet.
 * Handles MetaMask wallet connection, network switching, on-chain storage, and lookups.
 */
import { ethers } from 'ethers';

export const SEPOLIA_CHAIN_ID = '0xaa36a7'; // 11155111
export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000';

const SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';

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

export async function switchToSepolia(): Promise<void> {
  const eth = (window as any).ethereum;
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: SEPOLIA_CHAIN_ID }] });
  } catch (switchError: any) {
    if (switchError.code === 4902) {
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: SEPOLIA_CHAIN_ID,
          chainName: 'Ethereum Sepolia Testnet',
          nativeCurrency: { name: 'SepoliaETH', symbol: 'ETH', decimals: 18 },
          rpcUrls: [SEPOLIA_RPC],
          blockExplorerUrls: ['https://sepolia.etherscan.io'],
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
    throw new Error('Contract not deployed. Deploy GreenLedger.sol on Sepolia and add VITE_CONTRACT_ADDRESS to .env');
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
    txUrl: `https://sepolia.etherscan.io/tx/${receipt.hash}`,
  };
}

export async function getReportFromChain(hash: string): Promise<any | null> {
  if (CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') return null;
  try {
    const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
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
