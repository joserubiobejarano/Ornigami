import { createBrandUrlHandler } from "@/lib/campaign-lab/brand-url-api";
import { registeredSourceBridge } from '@/lib/campaign-lab/brand-source-bridge';
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = createBrandUrlHandler({ sourceBridge: registeredSourceBridge });
