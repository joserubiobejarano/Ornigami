import { connection } from 'next/server';
import Link from 'next/link';
import Controls from './controls';
export default async function Page() {
  await connection();
  return <main><p>Fictional SRI fixture</p><Controls /><Link href="/other" prefetch={false}>Other route</Link></main>;
}
