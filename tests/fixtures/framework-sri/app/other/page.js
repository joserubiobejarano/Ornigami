import { connection } from 'next/server';
export default async function Other() { await connection(); return <p id="other-route">Navigation complete</p>; }
