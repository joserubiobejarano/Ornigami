'use client';
import { useState } from 'react';
export default function Controls() {
  const [result, setResult] = useState('idle');
  return <><button onClick={async () => {
    try { const module = await import('./late'); setResult(module.probe()); }
    catch { setResult('rejected'); }
  }}>Load late chunk</button><output id="late-result">{result}</output></>;
}
