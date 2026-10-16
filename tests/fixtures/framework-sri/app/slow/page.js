import { connection } from 'next/server';
export default async function Slow() { await connection(); await new Promise(resolve => setTimeout(resolve, 200)); return <p>Fictional slow route</p>; }
