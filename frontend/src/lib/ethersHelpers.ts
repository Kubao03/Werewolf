import { ethers } from "ethers";


export function getBrowserProvider(): ethers.BrowserProvider | null {
if (typeof window === 'undefined') return null;
const eth = (window as any).ethereum;
return eth ? new ethers.BrowserProvider(eth) : null;
}


export async function getSignerRequired(): Promise<ethers.Signer> {
const provider = getBrowserProvider();
if (!provider) throw new Error('请先安装并连接 MetaMask');
await provider.send('eth_requestAccounts', []);
return provider.getSigner();
}


export function short(addr?: string, len = 4) {
if (!addr) return '';
return addr.slice(0, 2+len) + '…' + addr.slice(-len);
}