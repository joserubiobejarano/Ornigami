import { connection } from 'next/server';
export default async function Fail() { await connection(); throw new Error('Fictional route regression'); }
